# Phase 7 — Onboarding, QR, Attendance & Geolocation

## Inspection Summary

Confirmed against the unified schema (`updated_volunteer_coordination_system_Database.sql`) and current models:

**SQL functions this phase calls:**

| Function | Signature | Returns |
|---|---|---|
| `qr_token_status(p_token_hash)` | TEXT | TABLE `(token_id, token_event_id, token_purpose, is_valid, reason)` |
| `consume_qr_token(p_token, p_purpose)` | BIGINT, TEXT | VOID (raises `qr_token_invalid`) |
| `qr_check_in(p_token_hash, p_user)` | TEXT, BIGINT | BIGINT (attendance id, idempotent) |
| `qr_walkin_apply(p_token_hash, p_user)` | TEXT, BIGINT | BIGINT (application id) |
| `geo_check_in(p_event, p_user, p_lat, p_lon, p_accuracy_m, p_captured_at, p_is_mocked)` | … | TABLE `(out_result, out_attendance_id, out_distance_m, out_confirmation)` |
| `confirm_attendance(p_attendance, p_actor, p_note)` | BIGINT, BIGINT, TEXT | VOID |
| `reject_attendance(p_attendance, p_actor, p_reason)` | BIGINT, BIGINT, TEXT | VOID |

**Key behaviors confirmed:**
- QR consumption happens inside triggers (`trg_attendance_guard` for `checkin`, `trg_applications_before_insert` for `qr_walkin`), so `qr_check_in` is idempotent — a repeat scan spends no use.
- `geo_check_in()` returns 13 result codes instead of raising (so `attendance_geo_attempts` telemetry commits). The service must **let the transaction commit** and return the code; the BFF maps it to 200/400.
- `confirm_attendance`/`reject_attendance` call `assert_actor()`, which requires `app.user_id` to match the actor (set by `BlockedAwareTokenAuthentication`).
- Onboarding is append-only; version must equal `events.onboarding_version`.

**Models note:** `Attendance.assignment` is required (`assignment_id NOT NULL`), and geo check-in requires an existing `expected` attendance row (created by the assignment trigger). Events use integer IDs (no `uuid`), so routes use `{event_id}` / `{attendance_id}`.

---

## 1. Read-Only View Models — append to `apps/attendance/models.py`

```python
# --- Read-only models bound to operational views (managed = False) ----------

class VEventCheckinBoard(models.Model):
    assignment_id = models.BigIntegerField(primary_key=True)
    event_id = models.BigIntegerField()
    user_id = models.BigIntegerField()
    display_name = models.TextField()
    post_id = models.BigIntegerField(blank=True, null=True)
    post_title = models.TextField(blank=True, null=True)
    group_code = models.TextField(blank=True, null=True)
    is_group_leader = models.BooleanField()
    assignment_status = models.TextField()
    attendance_id = models.BigIntegerField(blank=True, null=True)
    attendance_status = models.TextField(blank=True, null=True)
    method = models.TextField(blank=True, null=True)
    walk_in_flag = models.BooleanField(blank=True, null=True)
    checkin_at = models.DateTimeField(blank=True, null=True)
    checkin_distance_m = models.DecimalField(max_digits=10, decimal_places=1, blank=True, null=True)
    confirmation_status = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "v_event_checkin_board"


class VEventCheckinStatus(models.Model):
    """Alias view of v_event_checkin_board; always query scoped by event_id."""
    user_id = models.BigIntegerField(primary_key=True)
    event_id = models.BigIntegerField()
    display_name = models.TextField()
    post_id = models.BigIntegerField(blank=True, null=True)
    post_title = models.TextField(blank=True, null=True)
    group_code = models.TextField(blank=True, null=True)
    is_group_leader = models.BooleanField()
    attendance_status = models.TextField()
    checkin_at = models.DateTimeField(blank=True, null=True)
    checkin_method = models.TextField(blank=True, null=True)
    walk_in_flag = models.BooleanField(blank=True, null=True)
    confirmation_status = models.TextField(blank=True, null=True)
    checkin_distance_m = models.DecimalField(max_digits=10, decimal_places=1, blank=True, null=True)

    class Meta:
        managed = False
        db_table = "v_event_checkin_status"


class VPendingConfirmations(models.Model):
    attendance_id = models.BigIntegerField(primary_key=True)
    event_id = models.BigIntegerField()
    event_title = models.TextField()
    owner_id = models.BigIntegerField()
    current_coordinator_id = models.BigIntegerField()
    user_id = models.BigIntegerField()
    volunteer_name = models.TextField()
    checkin_at = models.DateTimeField(blank=True, null=True)
    checkin_latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    checkin_longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    checkin_accuracy_m = models.DecimalField(max_digits=7, decimal_places=1, blank=True, null=True)
    checkin_distance_m = models.DecimalField(max_digits=10, decimal_places=1, blank=True, null=True)

    class Meta:
        managed = False
        db_table = "v_pending_confirmations"


class VGeoAttemptsReview(models.Model):
    id = models.BigIntegerField(primary_key=True)
    event_id = models.BigIntegerField()
    event_title = models.TextField()
    user_id = models.BigIntegerField()
    display_name = models.TextField()
    attempted_at = models.DateTimeField()
    result = models.TextField()
    distance_m = models.DecimalField(max_digits=10, decimal_places=1, blank=True, null=True)
    radius_m = models.IntegerField(blank=True, null=True)
    accuracy_m = models.DecimalField(max_digits=7, decimal_places=1, blank=True, null=True)
    device_mocked = models.BooleanField()
    review_status = models.TextField()
    reviewed_by_user_id = models.BigIntegerField(blank=True, null=True)
    reviewed_at = models.DateTimeField(blank=True, null=True)
    review_note = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "v_geo_attempts_review"
```

---

## 2. `backend/services/onboarding_service.py` (new file)

```python
"""
services/onboarding_service.py

Pre-work digital onboarding: retrieve requirements and record acknowledgments.

Database-first rules honoured here:
- trg_01_onboarding_before_insert enforces event open, version match, self-only,
  and applicant-only acknowledgment.
- onboarding_acknowledgments is append-only; existing acknowledgments are never
  overwritten. Re-acknowledging the current version is idempotent.
"""
from __future__ import annotations

import logging

from apps.accounts.models import OnboardingAcknowledgments
from apps.events.models import EventApplications, Events
from common.exceptions import DomainError
from common.permissions import get_visible_event_or_404

logger = logging.getLogger(__name__)

ACTIVE_APPLICATION_STATUSES = ("pending", "accepted", "waitlisted")


def get_event_onboarding(user, event_id: int) -> dict:
    """Return onboarding requirements and the user's acknowledgment status."""
    event = get_visible_event_or_404(user, event_id)

    acknowledged = OnboardingAcknowledgments.objects.filter(
        user=user, event_id=event_id, onboarding_version=event.onboarding_version
    ).exists()

    return {
        "event_id": event_id,
        "onboarding_text": event.onboarding_text,
        "onboarding_version": event.onboarding_version,
        "require_onboarding_ack": event.require_onboarding_ack,
        "acknowledged": acknowledged,
    }


def acknowledge_event_onboarding(user, event_id: int) -> OnboardingAcknowledgments:
    """
    Record an app_tick acknowledgment for the event's current onboarding version.

    Idempotent: if the user already acknowledged the current version, the
    existing row is returned and no new row is written (append-only preserved).
    """
    event = get_visible_event_or_404(user, event_id)

    # Service-level pre-check mirroring trg_01_onboarding_before_insert.
    has_application = EventApplications.objects.filter(
        event_id=event_id, user=user, status__in=ACTIVE_APPLICATION_STATUSES
    ).exists()
    if not has_application:
        raise DomainError(
            code="not_applicant",
            message="Only applicants of this event can acknowledge its onboarding.",
            status_code=400,
        )

    existing = OnboardingAcknowledgments.objects.filter(
        user=user, event_id=event_id, onboarding_version=event.onboarding_version
    ).first()
    if existing is not None:
        return existing  # idempotent; never overwrite

    ack = OnboardingAcknowledgments.objects.create(
        user=user,
        event=event,
        onboarding_version=event.onboarding_version,
        method="app_tick",
    )
    logger.info(
        "Onboarding acknowledged",
        extra={"user_id": user.id, "event_id": event_id, "version": event.onboarding_version},
    )
    return ack
```

---

## 3. `backend/services/qr_service.py` (complete)

```python
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

from django.db import connection
from django.utils import timezone

from apps.attendance.models import QrTokens
from apps.events.models import EventApplications
from common.exceptions import DomainError, ResourceMaskedNotFound
from common.permissions import get_event_for_manager_or_404, get_visible_event_or_404

logger = logging.getLogger(__name__)

VALID_PURPOSES = ("walkin_registration", "checkin", "join_event")


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Creation & Revocation
# ---------------------------------------------------------------------------

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

    qr = QrTokens.objects.create(
        event_id=event_id,
        created_by=actor,
        purpose=purpose,
        token_hash=token_hash,
        max_uses=max_uses,
        expires_at=timezone.now() + timedelta(minutes=ttl_minutes),
    )

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


def revoke_event_qr_token(actor, qr_token_id: int) -> QrTokens:
    """Revoke an active QR token. Idempotent if already revoked."""
    qr = QrTokens.objects.filter(id=qr_token_id).first()
    if qr is None:
        raise ResourceMaskedNotFound(message="QR token not found.")

    get_event_for_manager_or_404(actor, qr.event_id, require_write=True)

    if qr.revoked_at is not None:
        return qr

    qr.revoked_at = timezone.now()
    qr.save(update_fields=["revoked_at"])
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
        with connection.cursor() as cursor:
            cursor.execute("SELECT qr_check_in(%s, %s)", [token_hash, user.id])
            attendance_id = cursor.fetchone()[0]
        return {
            "result": "checked_in",
            "purpose": purpose,
            "event_id": status["event_id"],
            "attendance_id": attendance_id,
        }

    if purpose == "walkin_registration":
        with connection.cursor() as cursor:
            cursor.execute("SELECT qr_walkin_apply(%s, %s)", [token_hash, user.id])
            application_id = cursor.fetchone()[0]
        return {
            "result": "walkin_applied",
            "purpose": purpose,
            "event_id": status["event_id"],
            "application_id": application_id,
        }

    # join_event: consume the token, then create a browse application.
    with connection.cursor() as cursor:
        cursor.execute("SELECT consume_qr_token(%s, %s)", [status["token_id"], "join_event"])
    event = get_visible_event_or_404(user, status["event_id"])
    application = EventApplications.objects.create(
        event_id=event.id,
        user=user,
        source="browse",
        conditions_acknowledged_at=timezone.now(),
    )
    return {
        "result": "joined",
        "purpose": purpose,
        "event_id": event.id,
        "application_id": application.id,
    }


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
    with connection.cursor() as cursor:
        cursor.execute("SELECT qr_check_in(%s, %s)", [token_hash, user.id])
        attendance_id = cursor.fetchone()[0]

    return {
        "result": "checked_in",
        "event_id": status["event_id"],
        "attendance_id": attendance_id,
    }
```

---

## 4. `backend/services/attendance_service.py` (new file)

```python
"""
services/attendance_service.py

Attendance orchestration: manual check-in, check-out, geo confirmation,
and coordinator operational boards.

Database-first rules honoured here:
- Attendance state transitions are enforced by trg_01_attendance_guard.
- Geo confirmation/rejection delegate to confirm_attendance()/reject_attendance().
- Boards read from v_event_checkin_board / v_pending_confirmations.
"""
from __future__ import annotations

import logging

from django.db import connection
from django.utils import timezone

from apps.attendance.models import (
    Attendance,
    VEventCheckinBoard,
    VGeoAttemptsReview,
    VPendingConfirmations,
)
from common.exceptions import DomainError, ResourceMaskedNotFound
from common.permissions import get_event_for_manager_or_404

logger = logging.getLogger(__name__)

BOARD_FIELDS = [
    "assignment_id", "event_id", "user_id", "display_name", "post_id",
    "post_title", "group_code", "is_group_leader", "assignment_status",
    "attendance_id", "attendance_status", "method", "walk_in_flag",
    "checkin_at", "checkin_distance_m", "confirmation_status",
]

PENDING_FIELDS = [
    "attendance_id", "event_id", "event_title", "user_id", "volunteer_name",
    "checkin_at", "checkin_latitude", "checkin_longitude",
    "checkin_accuracy_m", "checkin_distance_m",
]

GEO_ATTEMPT_FIELDS = [
    "id", "event_id", "event_title", "user_id", "display_name", "attempted_at",
    "result", "distance_m", "radius_m", "accuracy_m", "device_mocked",
    "review_status", "reviewed_by_user_id", "reviewed_at", "review_note",
]


# ---------------------------------------------------------------------------
# Operational Boards (event-scoped)
# ---------------------------------------------------------------------------

def get_event_attendance_board(actor, event_id: int) -> list[dict]:
    """Coordinator check-in board from v_event_checkin_board."""
    get_event_for_manager_or_404(actor, event_id, require_write=False)
    rows = (
        VEventCheckinBoard.objects.filter(event_id=event_id)
        .order_by("group_code", "assignment_id")
    )
    return list(rows.values(*BOARD_FIELDS))


def get_pending_confirmations(actor, event_id: int) -> list[dict]:
    """Coordinator queue of geo check-ins awaiting a decision."""
    get_event_for_manager_or_404(actor, event_id, require_write=False)
    rows = VPendingConfirmations.objects.filter(event_id=event_id).order_by("checkin_at")
    return list(rows.values(*PENDING_FIELDS))


def get_geo_attempts_review(actor, event_id: int) -> list[dict]:
    """Event-scoped geo attempt telemetry for fraud review."""
    get_event_for_manager_or_404(actor, event_id, require_write=False)
    rows = (
        VGeoAttemptsReview.objects.filter(event_id=event_id)
        .order_by("-attempted_at")
    )
    return list(rows.values(*GEO_ATTEMPT_FIELDS))


# ---------------------------------------------------------------------------
# Manual Check-In / Check-Out
# ---------------------------------------------------------------------------

def manual_check_in(actor, event_id: int, volunteer_user_id: int, note: str = "") -> Attendance:
    """
    Coordinator checks in a volunteer in person.
    The DB trigger validates event active, active assignment, and onboarding.
    """
    get_event_for_manager_or_404(actor, event_id, require_write=True)

    att = (
        Attendance.objects.select_for_update()
        .filter(event_id=event_id, user_id=volunteer_user_id)
        .first()
    )
    if att is None:
        raise DomainError(
            code="not_assigned",
            message="This volunteer has no attendance record for the event.",
            status_code=400,
        )

    if att.status in ("checked_in", "completed"):
        return att  # idempotent

    att.status = "checked_in"
    att.method = "coordinator_manual"
    att.recorded_by_user = actor
    att.checkin_at = timezone.now()
    if note:
        att.note = note
    att.save()
    att.refresh_from_db()

    logger.info(
        "Manual check-in",
        extra={"event_id": event_id, "volunteer_id": volunteer_user_id, "actor_id": actor.id},
    )
    return att


def check_out(actor, attendance_id: int) -> Attendance:
    """Record checkout for a checked-in attendance row (self or manager)."""
    att = Attendance.objects.filter(id=attendance_id).first()
    if att is None:
        raise ResourceMaskedNotFound(message="Attendance not found.")

    if actor.id != att.user_id:
        get_event_for_manager_or_404(actor, att.event_id, require_write=True)

    if att.status != "checked_in":
        raise DomainError(
            code="invalid_state",
            message="Only a checked-in volunteer can check out.",
            status_code=400,
        )

    att.checkout_at = timezone.now()
    att.save(update_fields=["checkout_at"])
    att.refresh_from_db()
    return att


# ---------------------------------------------------------------------------
# Geo Confirmation / Rejection (delegate to SQL)
# ---------------------------------------------------------------------------

def confirm_attendance(actor, attendance_id: int, note: str | None = None) -> None:
    """Confirm a pending geo check-in via the SQL confirm_attendance()."""
    att = Attendance.objects.filter(id=attendance_id).first()
    if att is None:
        raise ResourceMaskedNotFound(message="Attendance not found.")

    get_event_for_manager_or_404(actor, att.event_id, require_write=True)

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT confirm_attendance(%s, %s, %s)",
            [attendance_id, actor.id, note],
        )
    logger.info("Attendance confirmed", extra={"attendance_id": attendance_id, "actor_id": actor.id})


def reject_attendance(actor, attendance_id: int, reason: str) -> None:
    """Reject a pending geo check-in via the SQL reject_attendance()."""
    att = Attendance.objects.filter(id=attendance_id).first()
    if att is None:
        raise ResourceMaskedNotFound(message="Attendance not found.")

    get_event_for_manager_or_404(actor, att.event_id, require_write=True)

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT reject_attendance(%s, %s, %s)",
            [attendance_id, actor.id, reason],
        )
    logger.info("Attendance rejected", extra={"attendance_id": attendance_id, "actor_id": actor.id})
```

---

## 5. `backend/services/geo_service.py` (complete)

```python
"""
services/geo_service.py

GPS geolocation check-in orchestration around the SQL geo_check_in() function.

Database-first rules honoured here:
- The server (PostgreSQL) computes the authoritative distance via Haversine.
  The client's claimed distance is NEVER trusted or used.
- geo_check_in() returns one of 13 result codes and logs every attempt to
  attendance_geo_attempts. This service returns the code without raising so
  the telemetry row commits; the BFF maps it to an HTTP status.
- No independent geofence algorithm is implemented in Python.
"""
from __future__ import annotations

import logging

from django.db import connection

logger = logging.getLogger(__name__)

# Result codes considered successful (HTTP 200); all others map to HTTP 400.
SUCCESS_RESULTS = ("accepted", "already_checked_in")

GEO_RESULT_MESSAGES = {
    "accepted": "Check-in successful.",
    "already_checked_in": "You are already checked in.",
    "invalid_fix": "The GPS coordinates are invalid.",
    "low_accuracy": "Your location signal is not accurate enough. Move to open sky and retry.",
    "stale_fix": "Your location fix is too old. Refresh your GPS and retry.",
    "mock_location": "Mock location detected. Check-in rejected.",
    "outside_geofence": "You are outside the event check-in area.",
    "window_closed": "Geo check-in is not open yet or has closed.",
    "event_not_active": "This event is not currently active.",
    "geo_disabled": "Geo check-in is not enabled for this event.",
    "not_assigned": "You do not have an active shift for this event.",
    "not_eligible": "Walk-in volunteers must check in by QR or with the coordinator.",
    "onboarding_required": "Please acknowledge the pre-shift briefing before checking in.",
}


def submit_geo_check_in(
    user,
    event_id: int,
    latitude: float,
    longitude: float,
    accuracy_m: float | None = None,
    captured_at=None,
    is_mocked: bool = False,
) -> dict:
    """
    Call the SQL geo_check_in() and return its result code, distance, and
    confirmation status. Does NOT raise on geofence/accuracy failures so the
    attempt telemetry commits.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT * FROM geo_check_in(%s, %s, %s, %s, %s, %s, %s)",
            [event_id, user.id, latitude, longitude, accuracy_m, captured_at, is_mocked],
        )
        row = cursor.fetchone()

    out_result, out_attendance_id, out_distance_m, out_confirmation = row

    result = {
        "result": out_result,
        "attendance_id": out_attendance_id,
        "distance_m": float(out_distance_m) if out_distance_m is not None else None,
        "confirmation_status": out_confirmation,
        "message": GEO_RESULT_MESSAGES.get(out_result, "Geo check-in processed."),
        "success": out_result in SUCCESS_RESULTS,
    }

    logger.info(
        "Geo check-in attempt",
        extra={"event_id": event_id, "user_id": user.id, "result": out_result},
    )
    return result
```

---

## 6. BFF Serializers — `backend/bff/checkin/serializers.py`

```python
from rest_framework import serializers


class OnboardingStatusSerializer(serializers.Serializer):
    event_id = serializers.IntegerField(read_only=True)
    onboarding_text = serializers.CharField(read_only=True, allow_null=True)
    onboarding_version = serializers.IntegerField(read_only=True)
    require_onboarding_ack = serializers.BooleanField(read_only=True)
    acknowledged = serializers.BooleanField(read_only=True)


class QrTokenCreateSerializer(serializers.Serializer):
    purpose = serializers.ChoiceField(choices=["walkin_registration", "checkin", "join_event"])
    max_uses = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    ttl_minutes = serializers.IntegerField(required=False, default=240, min_value=1, max_value=10080)


class QrTokenSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    raw_token = serializers.CharField(read_only=True)
    purpose = serializers.CharField(read_only=True)
    max_uses = serializers.IntegerField(read_only=True, allow_null=True)
    expires_at = serializers.DateTimeField(read_only=True)


class QrResolveSerializer(serializers.Serializer):
    token = serializers.CharField()


class QrRedeemSerializer(serializers.Serializer):
    token = serializers.CharField()


class ManualCheckinSerializer(serializers.Serializer):
    event_id = serializers.IntegerField()
    user_id = serializers.IntegerField()
    note = serializers.CharField(required=False, allow_blank=True, default="")


class GeoCheckinSerializer(serializers.Serializer):
    event_id = serializers.IntegerField()
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    accuracy_m = serializers.FloatField(required=False, allow_null=True, min_value=0)
    captured_at = serializers.DateTimeField(required=False, allow_null=True)
    is_mocked = serializers.BooleanField(required=False, default=False)


class ConfirmAttendanceSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class RejectAttendanceSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=False)
```

---

## 7. BFF Views — `backend/bff/checkin/views.py`

```python
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from services import attendance_service, geo_service, onboarding_service, qr_service

from .serializers import (
    ConfirmAttendanceSerializer,
    GeoCheckinSerializer,
    ManualCheckinSerializer,
    OnboardingStatusSerializer,
    QrRedeemSerializer,
    QrResolveSerializer,
    QrTokenCreateSerializer,
    QrTokenSerializer,
    RejectAttendanceSerializer,
)


# --- Onboarding (volunteer) -------------------------------------------------

class EventOnboardingView(APIView):
    """GET /api/v1/events/{event_id}/onboarding/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, event_id):
        data = onboarding_service.get_event_onboarding(request.user, event_id)
        return Response(OnboardingStatusSerializer(data).data)


class EventOnboardingAcknowledgeView(APIView):
    """POST /api/v1/events/{event_id}/onboarding/acknowledge/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, event_id):
        ack = onboarding_service.acknowledge_event_onboarding(request.user, event_id)
        return Response(
            {"event_id": event_id, "onboarding_version": ack.onboarding_version, "acknowledged": True},
            status=status.HTTP_200_OK,
        )


# --- QR (resolve is public; redeem requires auth) ---------------------------

class QrResolveView(APIView):
    """POST /api/v1/qr/resolve/ — read-only preview, consumes nothing."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = QrResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = qr_service.preview_qr_token(serializer.validated_data["token"])
        # Never expose token_id internals beyond validity; keep it minimal.
        return Response({
            "event_id": data["event_id"],
            "purpose": data["purpose"],
            "is_valid": data["is_valid"],
            "reason": data["reason"],
        })


class QrRedeemView(APIView):
    """POST /api/v1/qr/redeem/ — dispatches by purpose."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = QrRedeemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = qr_service.redeem_qr_token(request.user, serializer.validated_data["token"])
        return Response(result)


class QrTokenCreateView(APIView):
    """POST /api/v1/coordinator/events/{event_id}/qr-tokens/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, event_id):
        serializer = QrTokenCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = qr_service.create_event_qr_token(
            request.user, event_id,
            purpose=data["purpose"],
            max_uses=data.get("max_uses"),
            ttl_minutes=data.get("ttl_minutes", 240),
        )
        return Response(QrTokenSerializer(result).data, status=status.HTTP_201_CREATED)


class QrTokenRevokeView(APIView):
    """POST /api/v1/coordinator/qr-tokens/{qr_id}/revoke/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, qr_id):
        qr = qr_service.revoke_event_qr_token(request.user, qr_id)
        return Response({"id": qr.id, "revoked_at": qr.revoked_at})


# --- Check-in (QR / Manual / Geo) -------------------------------------------

class AttendanceQrCheckinView(APIView):
    """POST /api/v1/attendance/qr-checkin/"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = QrRedeemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = qr_service.qr_check_in(request.user, serializer.validated_data["token"])
        return Response(result)


class AttendanceManualCheckinView(APIView):
    """POST /api/v1/attendance/manual-checkin/ (coordinator only)"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ManualCheckinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        att = attendance_service.manual_check_in(
            request.user, data["event_id"], data["user_id"], data.get("note", "")
        )
        return Response({"id": att.id, "status": att.status, "method": att.method})


class AttendanceGeoCheckinView(APIView):
    """POST /api/v1/attendance/geo-checkin/"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = GeoCheckinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = geo_service.submit_geo_check_in(
            request.user,
            data["event_id"],
            data["latitude"],
            data["longitude"],
            accuracy_m=data.get("accuracy_m"),
            captured_at=data.get("captured_at"),
            is_mocked=data.get("is_mocked", False),
        )
        http_status = status.HTTP_200_OK if result["success"] else status.HTTP_400_BAD_REQUEST
        return Response(result, status=http_status)


class AttendanceCheckoutView(APIView):
    """POST /api/v1/attendance/{attendance_id}/checkout/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, attendance_id):
        att = attendance_service.check_out(request.user, attendance_id)
        return Response({"id": att.id, "status": att.status, "checkout_at": att.checkout_at})


# --- Coordinator confirmation & boards --------------------------------------

class CoordinatorAttendanceBoardView(APIView):
    """GET /api/v1/coordinator/events/{event_id}/attendance/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, event_id):
        rows = attendance_service.get_event_attendance_board(request.user, event_id)
        return Response({"results": rows})


class CoordinatorPendingConfirmationsView(APIView):
    """GET /api/v1/coordinator/events/{event_id}/attendance/pending/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, event_id):
        rows = attendance_service.get_pending_confirmations(request.user, event_id)
        return Response({"results": rows})


class CoordinatorGeoAttemptsView(APIView):
    """GET /api/v1/coordinator/events/{event_id}/geo-attempts/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, event_id):
        rows = attendance_service.get_geo_attempts_review(request.user, event_id)
        return Response({"results": rows})


class CoordinatorConfirmAttendanceView(APIView):
    """POST /api/v1/coordinator/attendance/{attendance_id}/confirm/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, attendance_id):
        serializer = ConfirmAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        attendance_service.confirm_attendance(
            request.user, attendance_id, serializer.validated_data.get("note")
        )
        return Response({"id": attendance_id, "confirmation_status": "confirmed"})


class CoordinatorRejectAttendanceView(APIView):
    """POST /api/v1/coordinator/attendance/{attendance_id}/reject/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, attendance_id):
        serializer = RejectAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        attendance_service.reject_attendance(
            request.user, attendance_id, serializer.validated_data["reason"]
        )
        return Response({"id": attendance_id, "confirmation_status": "rejected"})
```

---

## 8. BFF URLs — `backend/bff/checkin/urls.py`

```python
from django.urls import path

from .views import (
    AttendanceCheckoutView,
    AttendanceGeoCheckinView,
    AttendanceManualCheckinView,
    AttendanceQrCheckinView,
    CoordinatorAttendanceBoardView,
    CoordinatorConfirmAttendanceView,
    CoordinatorGeoAttemptsView,
    CoordinatorPendingConfirmationsView,
    CoordinatorRejectAttendanceView,
    EventOnboardingAcknowledgeView,
    EventOnboardingView,
    QrRedeemView,
    QrResolveView,
    QrTokenCreateView,
    QrTokenRevokeView,
)

urlpatterns = [
    # Onboarding
    path("events/<int:event_id>/onboarding/", EventOnboardingView.as_view(), name="event-onboarding"),
    path("events/<int:event_id>/onboarding/acknowledge/", EventOnboardingAcknowledgeView.as_view(), name="event-onboarding-ack"),
    # QR
    path("qr/resolve/", QrResolveView.as_view(), name="qr-resolve"),
    path("qr/redeem/", QrRedeemView.as_view(), name="qr-redeem"),
    path("coordinator/events/<int:event_id>/qr-tokens/", QrTokenCreateView.as_view(), name="qr-token-create"),
    path("coordinator/qr-tokens/<int:qr_id>/revoke/", QrTokenRevokeView.as_view(), name="qr-token-revoke"),
    # Check-in
    path("attendance/qr-checkin/", AttendanceQrCheckinView.as_view(), name="attendance-qr-checkin"),
    path("attendance/manual-checkin/", AttendanceManualCheckinView.as_view(), name="attendance-manual-checkin"),
    path("attendance/geo-checkin/", AttendanceGeoCheckinView.as_view(), name="attendance-geo-checkin"),
    path("attendance/<int:attendance_id>/checkout/", AttendanceCheckoutView.as_view(), name="attendance-checkout"),
    # Coordinator boards & confirmation
    path("coordinator/events/<int:event_id>/attendance/", CoordinatorAttendanceBoardView.as_view(), name="coordinator-attendance-board"),
    path("coordinator/events/<int:event_id>/attendance/pending/", CoordinatorPendingConfirmationsView.as_view(), name="coordinator-attendance-pending"),
    path("coordinator/events/<int:event_id>/geo-attempts/", CoordinatorGeoAttemptsView.as_view(), name="coordinator-geo-attempts"),
    path("coordinator/attendance/<int:attendance_id>/confirm/", CoordinatorConfirmAttendanceView.as_view(), name="coordinator-attendance-confirm"),
    path("coordinator/attendance/<int:attendance_id>/reject/", CoordinatorRejectAttendanceView.as_view(), name="coordinator-attendance-reject"),
]
```

Ensure `bff/urls.py` includes `bff.checkin.urls` under the `/api/v1/` mount.

---

## 9. Tests — `backend/apps/attendance/tests/test_phase7.py`

```python
import hashlib
from datetime import timedelta

from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import OnboardingAcknowledgments, Users
from apps.attendance.models import Attendance, AttendanceGeoAttempts, QrTokens
from apps.coordination.models import Assignments, CoordinatorProfiles
from apps.events.models import EventApplications, EventPosts, Events
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import attendance_service, geo_service, onboarding_service, qr_service

_phone_seq = 0


def _phone():
    global _phone_seq
    _phone_seq += 1
    return f"+959{_phone_seq:08d}"


def _make_user(name, is_admin=False, verified=False, **kwargs):
    phone = normalize_phone(_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
        **kwargs,
    )


def _make_approved_coordinator(admin, name="Coordinator"):
    user = _make_user(name, verified=True)
    CoordinatorProfiles(user_id=user.id, status="pending").save()
    CoordinatorProfiles.objects.filter(user_id=user.id).update(
        status="approved", approved_by_id=admin.id, approved_at=timezone.now()
    )
    user.refresh_from_db()
    return user


def _make_event(coord, **overrides):
    start = timezone.now() + timedelta(hours=2)
    end = start + timedelta(hours=4)
    defaults = dict(
        owner_id=coord.id,
        current_coordinator_id=coord.id,
        title="Check-in Event",
        start_at=start,
        end_at=end,
        acceptance_mode="auto",
        auto_assign_enabled=True,
        require_onboarding_ack=False,
    )
    defaults.update(overrides)
    return Events.objects.create(**defaults)


def _publish_activate(event):
    Events.objects.filter(id=event.id).update(status="published")
    Events.objects.filter(id=event.id).update(status="active")
    event.refresh_from_db()
    return event


def _enable_geo(event, require_confirmation=False, radius=300):
    Events.objects.filter(id=event.id).update(
        latitude=1.3521, longitude=103.8198,
        geo_radius_m=radius, geo_checkin_enabled=True,
        require_checkin_confirmation=require_confirmation,
    )
    event.refresh_from_db()
    return event


def _apply_and_assign(vol, event):
    """Apply to an auto-accept event; returns the created application."""
    return EventApplications.objects.create(
        event=event, user=vol, source="browse",
        conditions_acknowledged_at=timezone.now(),
    )


class Phase7Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin", is_admin=True)
        cls.coord = _make_approved_coordinator(cls.admin, "Coordinator")
        cls.vol1 = _make_user("Volunteer One")
        cls.vol2 = _make_user("Volunteer Two")


class OnboardingTests(Phase7Base):
    def setUp(self):
        self.event = _make_event(
            self.coord, require_onboarding_ack=True, onboarding_text="Be kind",
            acceptance_mode="manual",
        )
        EventPosts.objects.create(event=self.event, title="Helper", required_headcount=5)
        _publish_activate(self.event)
        EventApplications.objects.create(
            event=self.event, user=self.vol1, source="browse",
            conditions_acknowledged_at=timezone.now(),
        )

    def test_acknowledge_onboarding(self):
        ack = onboarding_service.acknowledge_event_onboarding(self.vol1, self.event.id)
        self.assertEqual(ack.onboarding_version, self.event.onboarding_version)
        self.assertEqual(ack.method, "app_tick")

    def test_acknowledgment_idempotent_no_overwrite(self):
        first = onboarding_service.acknowledge_event_onboarding(self.vol1, self.event.id)
        second = onboarding_service.acknowledge_event_onboarding(self.vol1, self.event.id)
        self.assertEqual(first.id, second.id)
        self.assertEqual(
            OnboardingAcknowledgments.objects.filter(user=self.vol1, event=self.event).count(), 1
        )

    def test_version_bump_requires_reacknowledgment(self):
        onboarding_service.acknowledge_event_onboarding(self.vol1, self.event.id)
        # Change onboarding text -> trigger bumps version to 2
        Events.objects.filter(id=self.event.id).update(onboarding_text="Updated briefing")
        self.event.refresh_from_db()
        self.assertEqual(self.event.onboarding_version, 2)
        status = onboarding_service.get_event_onboarding(self.vol1, self.event.id)
        self.assertFalse(status["acknowledged"])
        # Re-acknowledge creates a new row for version 2
        onboarding_service.acknowledge_event_onboarding(self.vol1, self.event.id)
        self.assertEqual(
            OnboardingAcknowledgments.objects.filter(user=self.vol1, event=self.event).count(), 2
        )

    def test_non_applicant_cannot_acknowledge(self):
        from common.exceptions import DomainError
        with self.assertRaises(DomainError):
            onboarding_service.acknowledge_event_onboarding(self.vol2, self.event.id)


class QrTokenTests(Phase7Base):
    def setUp(self):
        self.event = _make_event(self.coord)
        EventPosts.objects.create(event=self.event, title="Helper", required_headcount=5)
        _publish_activate(self.event)
        _apply_and_assign(self.vol1, self.event)

    def test_generate_token_returns_raw_and_stores_hash(self):
        result = qr_service.create_event_qr_token(self.coord, self.event.id, "checkin")
        self.assertIn("raw_token", result)
        qr = QrTokens.objects.get(id=result["id"])
        expected_hash = hashlib.sha256(result["raw_token"].encode()).hexdigest()
        self.assertEqual(qr.token_hash, expected_hash)
        self.assertNotEqual(qr.token_hash, result["raw_token"])

    def test_expired_token_is_invalid(self):
        # Insert a token whose validity window is entirely in the past.
        past_created = timezone.now() - timedelta(hours=2)
        past_expires = timezone.now() - timedelta(hours=1)
        qr = QrTokens.objects.create(
            event=self.event, created_by=self.coord, purpose="checkin",
            token_hash="f" * 64, expires_at=past_expires,
        )
        QrTokens.objects.filter(id=qr.id).update(created_at=past_created)
        # Re-fetch to bypass trigger; validate via preview using a matching raw token.
        import secrets
        raw = secrets.token_urlsafe(32)
        QrTokens.objects.filter(id=qr.id).update(
            token_hash=hashlib.sha256(raw.encode()).hexdigest()
        )
        status = qr_service.preview_qr_token(raw)
        self.assertFalse(status["is_valid"])
        self.assertEqual(status["reason"], "expired")

    def test_max_usage_enforced(self):
        result = qr_service.create_event_qr_token(self.coord, self.event.id, "checkin", max_uses=1)
        raw = result["raw_token"]
        # vol1 checks in, consuming the single use
        qr_service.qr_check_in(self.vol1, raw)
        qr = QrTokens.objects.get(id=result["id"])
        self.assertEqual(qr.used_count, 1)
        # vol2 has an assignment but the token is exhausted
        _apply_and_assign(self.vol2, self.event)
        from common.exceptions import DomainError
        with self.assertRaises(DomainError):
            qr_service.qr_check_in(self.vol2, raw)

    def test_revocation(self):
        result = qr_service.create_event_qr_token(self.coord, self.event.id, "checkin")
        qr_service.revoke_event_qr_token(self.coord, result["id"])
        status = qr_service.preview_qr_token(result["raw_token"])
        self.assertFalse(status["is_valid"])
        self.assertEqual(status["reason"], "revoked")

    def test_duplicate_redemption_idempotent(self):
        result = qr_service.create_event_qr_token(self.coord, self.event.id, "checkin")
        raw = result["raw_token"]
        first = qr_service.qr_check_in(self.vol1, raw)
        second = qr_service.qr_check_in(self.vol1, raw)
        self.assertEqual(first["attendance_id"], second["attendance_id"])
        qr = QrTokens.objects.get(id=result["id"])
        self.assertEqual(qr.used_count, 1)

    def test_qr_checkin_sets_attendance(self):
        result = qr_service.create_event_qr_token(self.coord, self.event.id, "checkin")
        qr_service.qr_check_in(self.vol1, result["raw_token"])
        att = Attendance.objects.get(event=self.event, user=self.vol1)
        self.assertEqual(att.status, "checked_in")
        self.assertEqual(att.method, "qr_scan")
        self.assertIsNotNone(att.checkin_at)

    def test_walkin_application(self):
        result = qr_service.create_event_qr_token(self.coord, self.event.id, "walkin_registration")
        outcome = qr_service.redeem_qr_token(self.vol2, result["raw_token"])
        self.assertEqual(outcome["result"], "walkin_applied")
        app = EventApplications.objects.get(id=outcome["application_id"])
        self.assertEqual(app.source, "qr_walkin")
        self.assertEqual(app.status, "pending")


class AttendanceTransitionTests(Phase7Base):
    def setUp(self):
        self.event = _make_event(self.coord)
        EventPosts.objects.create(event=self.event, title="Helper", required_headcount=5)
        _publish_activate(self.event)
        _apply_and_assign(self.vol1, self.event)

    def test_manual_checkin_by_coordinator(self):
        att = attendance_service.manual_check_in(self.coord, self.event.id, self.vol1.id)
        self.assertEqual(att.status, "checked_in")
        self.assertEqual(att.method, "coordinator_manual")
        self.assertEqual(att.recorded_by_user_id, self.coord.id)

    def test_manual_checkin_by_non_manager_rejected(self):
        from common.exceptions import ResourceMaskedNotFound
        with self.assertRaises(ResourceMaskedNotFound):
            attendance_service.manual_check_in(self.vol2, self.event.id, self.vol1.id)

    def test_checkout_requires_checked_in(self):
        att = Attendance.objects.get(event=self.event, user=self.vol1)
        from common.exceptions import DomainError
        with self.assertRaises(DomainError):
            attendance_service.check_out(self.vol1, att.id)

    def test_checkout_after_checkin(self):
        attendance_service.manual_check_in(self.coord, self.event.id, self.vol1.id)
        att = Attendance.objects.get(event=self.event, user=self.vol1)
        result = attendance_service.check_out(self.vol1, att.id)
        self.assertIsNotNone(result.checkout_at)

    def test_confirm_non_pending_rejected(self):
        # No geo check-in done, so no pending confirmation.
        att = Attendance.objects.get(event=self.event, user=self.vol1)
        from common.exceptions import DomainError
        with self.assertRaises(DomainError):
            attendance_service.confirm_attendance(self.coord, att.id)


class GeoCheckinTests(Phase7Base):
    def setUp(self):
        self.event = _make_event(self.coord, require_checkin_confirmation=False)
        EventPosts.objects.create(event=self.event, title="Helper", required_headcount=5)
        _publish_activate(self.event)
        _enable_geo(self.event, require_confirmation=False)
        _apply_and_assign(self.vol1, self.event)

    def test_geo_checkin_success(self):
        result = geo_service.submit_geo_check_in(
            self.vol1, self.event.id, 1.3521, 103.8198, accuracy_m=10,
            captured_at=timezone.now(),
        )
        self.assertEqual(result["result"], "accepted")
        self.assertTrue(result["success"])
        att = Attendance.objects.get(event=self.event, user=self.vol1)
        self.assertEqual(att.status, "checked_in")
        self.assertEqual(att.method, "geo")
        self.assertTrue(att.geo_verified)

    def test_geo_outside_geofence(self):
        result = geo_service.submit_geo_check_in(
            self.vol1, self.event.id, 1.4500, 103.9000, accuracy_m=10,
            captured_at=timezone.now(),
        )
        self.assertEqual(result["result"], "outside_geofence")
        self.assertFalse(result["success"])
        self.assertTrue(
            AttendanceGeoAttempts.objects.filter(event=self.event, user=self.vol1, result="outside_geofence").exists()
        )

    def test_geo_low_accuracy(self):
        result = geo_service.submit_geo_check_in(
            self.vol1, self.event.id, 1.3521, 103.8198, accuracy_m=500,
            captured_at=timezone.now(),
        )
        self.assertEqual(result["result"], "low_accuracy")
        self.assertFalse(result["success"])

    def test_geo_stale_fix(self):
        result = geo_service.submit_geo_check_in(
            self.vol1, self.event.id, 1.3521, 103.8198, accuracy_m=10,
            captured_at=timezone.now() - timedelta(minutes=10),
        )
        self.assertEqual(result["result"], "stale_fix")
        self.assertFalse(result["success"])

    def test_geo_attempt_logged_for_all_outcomes(self):
        geo_service.submit_geo_check_in(self.vol1, self.event.id, 1.3521, 103.8198, accuracy_m=10, captured_at=timezone.now())
        geo_service.submit_geo_check_in(self.vol1, self.event.id, 1.9999, 103.9999, accuracy_m=10, captured_at=timezone.now())
        self.assertGreaterEqual(
            AttendanceGeoAttempts.objects.filter(event=self.event, user=self.vol1).count(), 2
        )


class GeoConfirmationTests(Phase7Base):
    def setUp(self):
        self.event = _make_event(self.coord, require_checkin_confirmation=True)
        EventPosts.objects.create(event=self.event, title="Helper", required_headcount=5)
        _publish_activate(self.event)
        _enable_geo(self.event, require_confirmation=True)
        _apply_and_assign(self.vol1, self.event)

    def _geo_checkin(self):
        return geo_service.submit_geo_check_in(
            self.vol1, self.event.id, 1.3521, 103.8198, accuracy_m=10,
            captured_at=timezone.now(),
        )

    def test_confirmation_flow(self):
        result = self._geo_checkin()
        self.assertEqual(result["confirmation_status"], "pending")
        att = Attendance.objects.get(event=self.event, user=self.vol1)
        attendance_service.confirm_attendance(self.coord, att.id, "seen")
        att.refresh_from_db()
        self.assertEqual(att.confirmation_status, "confirmed")
        self.assertEqual(att.confirmed_by_user_id, self.coord.id)

    def test_rejection_flow(self):
        self._geo_checkin()
        att = Attendance.objects.get(event=self.event, user=self.vol1)
        attendance_service.reject_attendance(self.coord, att.id, "not at gate")
        att.refresh_from_db()
        self.assertEqual(att.status, "expected")
        self.assertEqual(att.confirmation_status, "rejected")
        self.assertIsNone(att.checkin_latitude)
        self.assertFalse(att.geo_verified)

    def test_volunteer_cannot_confirm_own(self):
        self._geo_checkin()
        att = Attendance.objects.get(event=self.event, user=self.vol1)
        from common.exceptions import ResourceMaskedNotFound
        with self.assertRaises(ResourceMaskedNotFound):
            attendance_service.confirm_attendance(self.vol1, att.id)


class CoordinatorBoardTests(Phase7Base):
    def setUp(self):
        self.event = _make_event(self.coord)
        EventPosts.objects.create(event=self.event, title="Helper", required_headcount=5)
        _publish_activate(self.event)
        _apply_and_assign(self.vol1, self.event)

    def test_attendance_board_for_manager(self):
        rows = attendance_service.get_event_attendance_board(self.coord, self.event.id)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["user_id"], self.vol1.id)
        self.assertEqual(rows[0]["attendance_status"], "expected")

    def test_attendance_board_denied_for_non_manager(self):
        from common.exceptions import ResourceMaskedNotFound
        with self.assertRaises(ResourceMaskedNotFound):
            attendance_service.get_event_attendance_board(self.vol2, self.event.id)
```

---

## 10. Commands

```powershell
cd backend
python manage.py makemigrations attendance --check --dry-run
python manage.py test apps.attendance.tests.test_phase7 --noinput
python manage.py test apps --noinput
```

---

## 11. Completion Report

| Acceptance Criterion | Status | Evidence |
|---|---|---|
| QR token handling is secure | ✅ | Raw token returned once; only SHA-256 hash stored; raw never logged |
| Existing DB functions used | ✅ | `qr_token_status`, `qr_check_in`, `qr_walkin_apply`, `consume_qr_token`, `geo_check_in`, `confirm_attendance`, `reject_attendance` all called via SQL |
| Attendance transitions respected | ✅ | All transitions go through ORM save → `trg_01_attendance_guard` |
| GPS enforcement DB-authoritative | ✅ | Distance computed by `geo_distance_m()` in SQL; no Python geofence |
| Onboarding consistency | ✅ | Append-only, idempotent, version-checked |
| Operational views permission-filtered | ✅ | Boards gated by `get_event_for_manager_or_404` |
| Tests pass | ⏳ | Run commands above |

**Test coverage vs. your 20 requirements:**
1. Onboarding ack ✅ 2. Version handling ✅ 3. QR generation ✅ 4. Hash storage ✅ 5. QR expiration ✅ 6. Max usage ✅ 7. Revocation ✅ 8. QR check-in ✅ 9. Walk-in application ✅ 10. Duplicate redemption ✅ 11. Manual attendance ✅ 12. Confirmation ✅ 13. Rejection ✅ 14. Invalid transitions ✅ 15. GPS success ✅ 16. Outside geofence ✅ 17. Poor accuracy ✅ 18. Stale fix ✅ 19. Unauthorized access ✅ 20. Coordinator board ✅

**Files created:** `services/onboarding_service.py`, `services/attendance_service.py`, `apps/attendance/tests/test_phase7.py`
**Files updated:** `services/qr_service.py`, `services/geo_service.py`, `apps/attendance/models.py`, `bff/checkin/serializers.py`, `bff/checkin/views.py`, `bff/checkin/urls.py`

**Note on route convention:** The prompt proposed `GET /api/qr/{token}/`, but passing raw tokens in a URL path risks them appearing in server access logs. I used `POST /api/v1/qr/resolve/` and `POST /api/v1/qr/redeem/` with the token in the request body to honour "never log raw token values." Events and attendance use integer IDs (no `uuid` column exists on those tables).

Phase 7 is complete. Awaiting your approval before Phase 8.