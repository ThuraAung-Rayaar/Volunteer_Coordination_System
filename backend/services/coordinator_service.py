"""
services/coordinator_service.py

Coordinator application and lifecycle management.

Database-first rules honoured here:
- The coordinator status state machine is enforced by trg_01_coordinator_guard.
  This service orchestrates and performs request-level authorization only.
- Approval prerequisites (admin approver + verified active user) are enforced
  by the trigger and ck_coordinator_approval / ck_coordinator_no_self_approval.
- Authorization uses the SQL helpers is_admin_user / is_approved_coordinator.
"""
from __future__ import annotations

import logging
from typing import Optional

from django.db import connection, transaction

from apps.accounts.models import Users
from apps.coordination.models import CoordinatorProfiles
from common.exceptions import (
    DomainError,
    PermissionDeniedError,
    ResourceMaskedNotFound,
)

logger = logging.getLogger(__name__)

# Must match ck_coordinator_status
COORDINATOR_STATES = ("pending", "approved", "suspended", "revoked")

# Admin-driven decisions (transitions validated by the trigger)
ALLOWED_DECISIONS = ("approved", "suspended", "revoked")


def _require_admin(actor: Users) -> None:
    """Mirror of SQL is_admin_user(): active admin only."""
    if not (actor and getattr(actor, "is_authenticated", False)
            and actor.is_admin and actor.is_active):
        raise PermissionDeniedError(
            message="Only administrators can manage coordinators.",
            code="permission_denied",
        )


# --- Authorization helpers (delegate to SQL) --------------------------------

def is_approved_coordinator(user: Users) -> bool:
    """Delegates to the PostgreSQL is_approved_coordinator() function."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    with connection.cursor() as cursor:
        cursor.execute("SELECT is_approved_coordinator(%s)", [user.id])
        row = cursor.fetchone()
    return bool(row and row[0])


# --- Volunteer-facing operations -------------------------------------------

@transaction.atomic
def apply_for_coordinator(user: Users, notes: str = "") -> CoordinatorProfiles:
    """
    Create a pending coordinator application.

    Business rule W34: only verified users may apply. The DB re-checks the
    verified + active requirement at approval time via the trigger.
    """
    if user.verification_status != "verified":
        raise DomainError(
            message="Identity verification must be approved before applying as a coordinator.",
            code="not_verified",
            status_code=400,
        )

    existing = CoordinatorProfiles.objects.filter(user_id=user.id).first()
    if existing is not None:
        if existing.status == "pending":
            if notes:
                existing.notes = notes
                existing.save(update_fields=["notes"])
            return existing
        raise DomainError(
            message="A coordinator application already exists for this account.",
            code="duplicate_application",
            status_code=409,
        )

    # Trigger forces status='pending' on insert
    profile = CoordinatorProfiles.objects.create(
        user_id=user.id, status="pending", notes=notes
    )
    logger.info("Coordinator application created", extra={"user_id": user.id})
    return profile


def get_coordinator_profile(user: Users) -> Optional[dict]:
    profile = CoordinatorProfiles.objects.filter(user_id=user.id).first()
    if profile is None:
        return None
    return {
        "user_id": profile.user_id,
        "status": profile.status,
        "approved_by_id": profile.approved_by_id,
        "approved_at": profile.approved_at,
        "notes": profile.notes,
        "created_at": profile.created_at,
        "updated_at": profile.updated_at,
    }


@transaction.atomic
def update_coordinator_application(user: Users, notes: str) -> CoordinatorProfiles:
    """A user may edit notes only while their application is still pending."""
    profile = CoordinatorProfiles.objects.filter(user_id=user.id).first()
    if profile is None:
        raise ResourceMaskedNotFound(message="No coordinator application found.")
    if profile.status != "pending":
        raise DomainError(
            message="Only pending applications can be updated.",
            code="invalid_state",
            status_code=400,
        )
    profile.notes = notes
    profile.save(update_fields=["notes"])
    return profile


# --- Admin lifecycle operations --------------------------------------------

def get_pending_coordinator_applications(actor: Users) -> list[dict]:
    _require_admin(actor)
    return list(
        CoordinatorProfiles.objects.filter(status="pending")
        .select_related("user")
        .order_by("created_at")
        .values(
            "user_id", "user__display_name", "user__verification_status",
            "notes", "created_at",
        )
    )


def list_coordinator_applications(status_filter: str = "pending") -> list[dict]:
    qs = CoordinatorProfiles.objects.all().select_related("user")
    if status_filter:
        qs = qs.filter(status=status_filter)
    return list(
        qs.order_by("-created_at").values(
            "user_id", "user__display_name", "user__verification_status",
            "status", "notes", "created_at", "approved_at", "approved_by_id",
        )
    )


@transaction.atomic
def decide_coordinator_profile(
    actor: Users,
    target_user_id: int,
    new_status: str,
    notes: str = "",
) -> CoordinatorProfiles:
    """
    Admin approves, suspends, or revokes a coordinator profile.

    Guards (service-level, mirrored by DB):
      - actor must be an active admin
      - actor cannot change their own coordinator status
      - target profile must exist
      - the transition itself is validated by trg_01_coordinator_guard
    """
    _require_admin(actor)

    if new_status not in ALLOWED_DECISIONS:
        raise DomainError(
            message=f"Invalid coordinator decision '{new_status}'.",
            code="invalid_decision",
            status_code=400,
        )

    if target_user_id == actor.id:
        raise PermissionDeniedError(
            message="You cannot change your own coordinator status.",
            code="no_self_approval",
        )

    profile = CoordinatorProfiles.objects.filter(user_id=target_user_id).first()
    if profile is None:
        raise ResourceMaskedNotFound(message="Coordinator profile not found.")

    update_fields = {"status": new_status}
    if new_status == "approved":
        # approved_at is set by the trigger; approved_by identifies the approver
        update_fields["approved_by_id"] = actor.id
    if notes:
        update_fields["notes"] = notes

    # queryset.update() fires trg_01_coordinator_guard which validates the
    # transition and the verified+active approval prerequisites
    CoordinatorProfiles.objects.filter(user_id=target_user_id).update(**update_fields)
    profile.refresh_from_db()

    logger.info(
        "Coordinator status changed",
        extra={
            "target_user_id": target_user_id,
            "new_status": new_status,
            "admin_id": actor.id,
        },
    )
    return profile


def approve_coordinator(actor: Users, target_user_id: int, notes: str = "") -> CoordinatorProfiles:
    return decide_coordinator_profile(actor, target_user_id, "approved", notes)


def suspend_coordinator(actor: Users, target_user_id: int, notes: str = "") -> CoordinatorProfiles:
    return decide_coordinator_profile(actor, target_user_id, "suspended", notes)


def revoke_coordinator(actor: Users, target_user_id: int, notes: str = "") -> CoordinatorProfiles:
    return decide_coordinator_profile(actor, target_user_id, "revoked", notes)

