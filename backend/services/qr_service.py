"""
services/qr_service.py

QR token lifecycle: creation, read-only preview, redemption, and revocation.

Database-first rules honoured here:
- Only token hashes are stored (token_hash); raw tokens are returned once.
- qr_token_status() previews validity without consuming a use.
- qr_check_in() / qr_walkin_apply() execute the workflow; consumption is
  enforced by triggers only when the guarded action really happens.
- Raw token values are never logged.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import timedelta

from django.db import IntegrityError, InternalError, ProgrammingError, connection, transaction
from django.utils import timezone

from apps.attendance.models import QrTokens
from apps.events.models import EventApplications
from common.exceptions import DomainError, ResourceMaskedNotFound, translate_db_exception
from common.permissions import get_event_for_manager_or_404, get_visible_event_or_404

logger = logging.getLogger(__name__)

VALID_PURPOSES = ("walkin_registration", "checkin", "join_event")


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Creation & Revocation
# ---------------------------------------------------------------------------

@transaction.atomic
def create_event_qr_token(
    actor,
    event_id: int,
    purpose: str,
    max_uses: int | None = None,
    ttl_minutes: int = 240,
) -> dict:
    """
    Generate a QR token for an event. Returns the raw token ONCE.
    Only the SHA-256 hash is persisted.
    """
    get_event_for_manager_or_404(actor, event_id, require_write=True)

    if purpose not in VALID_PURPOSES:
        raise DomainError(
            code="invalid_purpose",
            message=f"Invalid QR purpose '{purpose}'.",
            status_code=400,
        )

    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)

    try:
        qr = QrTokens.objects.create(
            event_id=event_id,
            created_by=actor,
            purpose=purpose,
            token_hash=token_hash,
            max_uses=max_uses,
            expires_at=timezone.now() + timedelta(minutes=ttl_minutes),
        )
    except (ProgrammingError, IntegrityError, InternalError) as exc:
        raise translate_db_exception(exc) from exc

    # Never log raw_token.
    logger.info(
        "QR token created",
        extra={"qr_id": qr.id, "event_id": event_id, "purpose": purpose},
    )
    return {
        "id": qr.id,
        "raw_token": raw_token,
        "purpose": qr.purpose,
        "max_uses": qr.max_uses,
        "expires_at": qr.expires_at,
    }


@transaction.atomic
def revoke_event_qr_token(actor, qr_token_id: int) -> QrTokens:
    """Revoke an active QR token. Idempotent if already revoked."""
    qr = QrTokens.objects.filter(id=qr_token_id).first()
    if qr is None:
        raise ResourceMaskedNotFound(message="QR token not found.")

    get_event_for_manager_or_404(actor, qr.event_id, require_write=True)

    if qr.revoked_at is not None:
        return qr

    qr.revoked_at = timezone.now()
    try:
        qr.save(update_fields=["revoked_at"])
    except (ProgrammingError, IntegrityError, InternalError) as exc:
        raise translate_db_exception(exc) from exc
    logger.info("QR token revoked", extra={"qr_id": qr.id, "event_id": qr.event_id})
    return qr


# ---------------------------------------------------------------------------
# Preview & Redemption
# ---------------------------------------------------------------------------

def preview_qr_token(raw_token: str) -> dict:
    """Read-only validity preview via qr_token_status(). Consumes nothing."""
    token_hash = _hash_token(raw_token)
    with connection.cursor() as cursor:
        cursor.execute("SELECT * FROM qr_token_status(%s)", [token_hash])
        row = cursor.fetchone()

    if row is None:
        raise DomainError(
            code="qr_token_invalid",
            message="Unknown QR token.",
            status_code=400,
        )

    return {
        "token_id": row[0],
        "event_id": row[1],
        "purpose": row[2],
        "is_valid": row[3],
        "reason": row[4],
    }


@transaction.atomic
def consume_qr_token(user, token_id: int, purpose: str) -> None:
    """Consume a QR token by calling SQL consume_qr_token()."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT consume_qr_token(%s, %s)", [token_id, purpose])
    except (ProgrammingError, IntegrityError, InternalError) as exc:
        raise translate_db_exception(exc) from exc


@transaction.atomic
def redeem_qr_token(user, raw_token: str) -> dict:
    """
    Redeem a QR token, dispatching by purpose:
      - checkin            -> qr_check_in()
      - walkin_registration -> qr_walkin_apply()
      - join_event          -> consume_qr_token() + browse application
    """
    status = preview_qr_token(raw_token)
    if not status["is_valid"]:
        raise DomainError(
            code="qr_token_invalid",
            message=f"This QR code is not valid ({status['reason']}).",
            status_code=400,
        )

    token_hash = _hash_token(raw_token)
    purpose = status["purpose"]

    if purpose == "checkin":
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT qr_check_in(%s, %s)", [token_hash, user.id])
                attendance_id = cursor.fetchone()[0]
        except (ProgrammingError, IntegrityError, InternalError) as exc:
            raise translate_db_exception(exc) from exc
        return {
            "result": "checked_in",
            "purpose": purpose,
            "event_id": status["event_id"],
            "attendance_id": attendance_id,
        }

    if purpose == "walkin_registration":
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT qr_walkin_apply(%s, %s)", [token_hash, user.id])
                application_id = cursor.fetchone()[0]
        except (ProgrammingError, IntegrityError, InternalError) as exc:
            raise translate_db_exception(exc) from exc
        return {
            "result": "walkin_applied",
            "purpose": purpose,
            "event_id": status["event_id"],
            "application_id": application_id,
        }

    # join_event: consume the token, then create a browse application.
    consume_qr_token(user, status["token_id"], "join_event")
    event = get_visible_event_or_404(user, status["event_id"])
    try:
        application = EventApplications.objects.create(
            event_id=event.id,
            user=user,
            source="browse",
            conditions_acknowledged_at=timezone.now(),
        )
    except (ProgrammingError, IntegrityError, InternalError) as exc:
        raise translate_db_exception(exc) from exc
    return {
        "result": "joined",
        "purpose": purpose,
        "event_id": event.id,
        "application_id": application.id,
    }


@transaction.atomic
def qr_check_in(user, raw_token: str) -> dict:
    """Check-in-only redemption. Rejects tokens whose purpose is not 'checkin'."""
    status = preview_qr_token(raw_token)
    if status["purpose"] != "checkin":
        raise DomainError(
            code="invalid_purpose",
            message="This token is not a check-in token.",
            status_code=400,
        )
    if not status["is_valid"]:
        raise DomainError(
            code="qr_token_invalid",
            message=f"This QR code is not valid ({status['reason']}).",
            status_code=400,
        )

    token_hash = _hash_token(raw_token)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT qr_check_in(%s, %s)", [token_hash, user.id])
            attendance_id = cursor.fetchone()[0]
    except (ProgrammingError, IntegrityError, InternalError) as exc:
        raise translate_db_exception(exc) from exc

    return {
        "result": "checked_in",
        "event_id": status["event_id"],
        "attendance_id": attendance_id,
    }
