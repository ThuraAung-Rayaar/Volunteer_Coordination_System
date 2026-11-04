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

from django.db import IntegrityError, InternalError, ProgrammingError, connection
from django.utils import timezone

from apps.attendance.models import (
    Attendance,
    VEventCheckinBoard,
    VGeoAttemptsReview,
    VPendingConfirmations,
)
from common.exceptions import DomainError, ResourceMaskedNotFound, translate_db_exception
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
    try:
        att.save()
        att.refresh_from_db()
    except (ProgrammingError, IntegrityError, InternalError) as exc:
        raise translate_db_exception(exc) from exc

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
    try:
        att.save(update_fields=["checkout_at"])
        att.refresh_from_db()
    except (ProgrammingError, IntegrityError, InternalError) as exc:
        raise translate_db_exception(exc) from exc
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

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config('app.user_id', %s, true)", [str(actor.id)])
            cursor.execute(
                "SELECT confirm_attendance(%s, %s, %s)",
                [attendance_id, actor.id, note],
            )
    except (ProgrammingError, IntegrityError, InternalError) as exc:
        raise translate_db_exception(exc) from exc
    logger.info("Attendance confirmed", extra={"attendance_id": attendance_id, "actor_id": actor.id})


def reject_attendance(actor, attendance_id: int, reason: str) -> None:
    """Reject a pending geo check-in via the SQL reject_attendance()."""
    att = Attendance.objects.filter(id=attendance_id).first()
    if att is None:
        raise ResourceMaskedNotFound(message="Attendance not found.")

    get_event_for_manager_or_404(actor, att.event_id, require_write=True)

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config('app.user_id', %s, true)", [str(actor.id)])
            cursor.execute(
                "SELECT reject_attendance(%s, %s, %s)",
                [attendance_id, actor.id, reason],
            )
    except (ProgrammingError, IntegrityError, InternalError) as exc:
        raise translate_db_exception(exc) from exc
    logger.info("Attendance rejected", extra={"attendance_id": attendance_id, "actor_id": actor.id})
