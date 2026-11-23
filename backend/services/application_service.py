"""
services/application_service.py

Recruitment and application workflows: submit, decide, withdraw, and query.

Database-first rules honoured here:
- The application insert trigger (trg_01_applications_before_insert) enforces
  event visibility, deadline, account status, schedule conflict, QR consumption,
  conditions snapshot, and auto-accept/waitlist logic.
- The application update trigger (trg_01_applications_before_update) enforces
  status transitions, manager permission for decisions, and capacity on accept.
- The after trigger (trg_50_applications_after) handles auto-assignment on
  accept and cascade cancellation on withdraw/expire.
- This service orchestrates and performs request-level authorization only.
  It does NOT duplicate hard constraints in Python.
"""
from __future__ import annotations

import logging
from typing import Optional

from django.db import (
    IntegrityError,
    InternalError,
    ProgrammingError,
    connection,
    transaction,
)
from django.utils import timezone

from apps.accounts.models import Users
from apps.coordination.models import Assignments
from apps.events.models import EventApplications, Events
from common.db_context import get_db_session_context, set_db_session_context
from common.exceptions import (
    DomainError,
    ResourceMaskedNotFound,
    translate_db_exception,
)
from common.permissions import get_event_for_manager_or_404, get_visible_event_or_404
from services.cancellation_policy import is_within_volunteer_cancellation_window

logger = logging.getLogger(__name__)

# Valid application sources (must match ck_application_source)
VALID_SOURCES = ("browse", "qr_walkin", "invite")

# Valid decision statuses for coordinator actions
DECISION_STATUSES = ("accepted", "rejected", "waitlisted")


@transaction.atomic
def apply_to_event(
    user,
    event_id: int,
    post_id: Optional[int] = None,
    source: str = "browse",
    qr_token_id: Optional[int] = None,
    note: str = "",
) -> EventApplications:
    """
    Submit an application to an event.

    The DB trigger trg_01_applications_before_insert enforces:
    - Event is published/active and not deleted
    - Deadline not passed
    - Event not ended
    - User account is active
    - Post is open (if specified)
    - No schedule conflict
    - No duplicate active application
    - QR token consumption for walk-ins
    - Auto-accept/waitlist based on acceptance_mode and capacity

    This service performs minimal pre-checks for better error messages,
    then delegates to the trigger for authoritative enforcement.
    """
    if source not in VALID_SOURCES:
        raise DomainError(
            code="invalid_source",
            message=f"Invalid application source '{source}'.",
            status_code=400,
        )

    # Pre-check event visibility (gives clean 404 instead of trigger error)
    get_visible_event_or_404(user, event_id)

    # For invite source, the actor must be a manager
    if source == "invite":
        get_event_for_manager_or_404(user, event_id, require_write=True)

    # Insert the application row. The trigger handles all validation,
    # conditions snapshot, and auto-accept/waitlist logic.
    app = EventApplications(
        event_id=event_id,
        post_id=post_id,
        user=user,
        qr_token_id=qr_token_id,
        source=source,
        note=note,
        conditions_acknowledged_at=timezone.now(),
    )
    app.save()
    app.refresh_from_db()

    logger.info(
        "Application submitted",
        extra={
            "application_id": app.id,
            "event_id": event_id,
            "user_id": user.id,
            "source": source,
            "resulting_status": app.status,
        },
    )
    return app


@transaction.atomic
def invite_volunteer_to_event(
    actor,
    event_id: int,
    volunteer_user_id: Optional[int] = None,
    post_id: Optional[int] = None,
    note: str = "",
    volunteer_uuid: Optional[str] = None,
) -> EventApplications:
    """
    Coordinator invites a volunteer to an event.

    - Verifies actor is an event manager with write permissions.
    - Resolves the target volunteer account by user ID or UUID.
    - Submits the application with source='invite'.
    """
    get_event_for_manager_or_404(actor, event_id, require_write=True)

    try:
        if volunteer_user_id is not None:
            volunteer = Users.objects.get(id=volunteer_user_id)
        elif volunteer_uuid is not None:
            volunteer = Users.objects.get(uuid=volunteer_uuid)
        else:
            raise DomainError(
                code="invalid_request",
                message="Either volunteer_user_id or volunteer_uuid must be provided.",
                status_code=400,
            )
    except (Users.DoesNotExist, ValueError):
        raise ResourceMaskedNotFound(message="Volunteer not found.")

    app = EventApplications(
        event_id=event_id,
        post_id=post_id,
        user=volunteer,
        source="invite",
        note=note or "",
        conditions_acknowledged_at=timezone.now(),
    )

    prev_user_id, prev_ip = get_db_session_context()
    set_db_session_context(actor.id)
    try:
        app.save()
        app.refresh_from_db()
    except (ProgrammingError, IntegrityError, InternalError) as exc:
        raise translate_db_exception(exc) from exc
    else:
        set_db_session_context(prev_user_id, prev_ip)

    logger.info(
        "Volunteer invited to event",
        extra={
            "application_id": app.id,
            "event_id": event_id,
            "invited_user_id": volunteer.id,
            "actor_id": actor.id,
        },
    )
    return app


@transaction.atomic
def respond_to_invite(
    user,
    application_id: int,
    accept: bool,
    note: str = "",
) -> EventApplications:
    """
    Volunteer accepts or rejects an event invitation (P1-06).
    Operates transactionally on the existing invite application row.
    - If accept=True: transitions status to 'accepted'. Satisfies DB triggers
      by recording event manager decision and triggers auto-assignment if enabled.
    - If accept=False: transitions status to 'withdrawn'.
    """
    try:
        app = EventApplications.objects.select_for_update().get(id=application_id)
    except EventApplications.DoesNotExist:
        raise ResourceMaskedNotFound(message="Application not found.")

    if user.id != app.user_id:
        raise ResourceMaskedNotFound(message="Application not found.")

    if app.source != "invite":
        raise DomainError(
            code="invalid_application_source",
            message="This application was not created from an invitation.",
            status_code=400,
        )

    if app.status != "pending":
        raise DomainError(
            code="invalid_state",
            message=f"Cannot respond to invite with status '{app.status}'.",
            status_code=400,
        )

    if accept:
        event = app.event
        manager_id = event.current_coordinator_id or event.owner_id
        if not manager_id:
            from apps.coordination.models import CoordinatorProfiles
            coord = CoordinatorProfiles.objects.filter(status="approved").first()
            manager_id = coord.user_id if coord else None

        prev_user_id, prev_ip = get_db_session_context()
        if manager_id:
            set_db_session_context(manager_id)

        app.status = "accepted"
        app.decided_by_id = manager_id
        app.decided_at = timezone.now()
        if note:
            app.note = note

        try:
            app.save()
            app.refresh_from_db()
        except (ProgrammingError, IntegrityError, InternalError) as exc:
            raise translate_db_exception(exc) from exc
        else:
            set_db_session_context(prev_user_id, prev_ip)

        logger.info(
            "Volunteer accepted invitation",
            extra={"application_id": app.id, "user_id": user.id, "event_id": app.event_id},
        )
    else:
        app.status = "withdrawn"
        app.decided_at = timezone.now()
        if note:
            app.note = note

        prev_user_id, prev_ip = get_db_session_context()
        set_db_session_context(user.id)
        try:
            app.save()
            app.refresh_from_db()
        except (ProgrammingError, IntegrityError, InternalError) as exc:
            raise translate_db_exception(exc) from exc
        else:
            set_db_session_context(prev_user_id, prev_ip)

        logger.info(
            "Volunteer declined invitation",
            extra={"application_id": app.id, "user_id": user.id, "event_id": app.event_id},
        )

    return app


def accept_invite(user, application_id: int, note: str = "") -> EventApplications:
    """Convenience alias for volunteer accepting an invitation."""
    return respond_to_invite(user, application_id, accept=True, note=note)


def reject_invite(user, application_id: int, note: str = "") -> EventApplications:
    """Convenience alias for volunteer declining an invitation."""
    return respond_to_invite(user, application_id, accept=False, note=note)


def get_own_applications(user, event_id: Optional[int] = None) -> list[dict]:
    """
    Retrieve the authenticated user's applications.
    Optionally filter by event.
    """
    qs = (
        EventApplications.objects.filter(user=user)
        .exclude(event__status="cancelled")
        .select_related("event", "post")
        .order_by("-applied_at")
    )

    if event_id is not None:
        qs = qs.filter(event_id=event_id)

    results = []
    for app in qs:
        results.append({
            "id": app.id,
            "event_id": app.event_id,
            "event_title": app.event.title,
            "event_status": app.event.status,
            "post_id": app.post_id,
            "post_title": app.post.title if app.post else None,
            "source": app.source,
            "status": app.status,
            "applied_at": app.applied_at,
            "decided_at": app.decided_at,
            "note": app.note,
        })
    return results


def get_event_applications(
    actor,
    event_id: int,
    status_filter: Optional[str] = None,
) -> list[dict]:
    """
    Retrieve applications for an event (coordinator/admin view).
    Returns T2 semi-private data for accepted applicants,
    T1 minimal data for pending/rejected/waitlisted.
    """
    # Verify actor is event manager (read access)
    get_event_for_manager_or_404(actor, event_id, require_write=False)

    qs = EventApplications.objects.filter(
        event_id=event_id
    ).select_related("user", "post").order_by("applied_at", "id")

    if status_filter:
        qs = qs.filter(status=status_filter)

    results = []
    for app in qs:
        entry = {
            "id": app.id,
            "user_id": app.user_id,
            "display_name": app.user.display_name,
            "post_id": app.post_id,
            "post_title": app.post.title if app.post else None,
            "source": app.source,
            "status": app.status,
            "applied_at": app.applied_at,
            "decided_at": app.decided_at,
            "decided_by_id": app.decided_by_id,
            "note": app.note,
        }
        # T2 data only for accepted applicants
        if app.status == "accepted":
            u = app.user
            entry["uuid"] = str(u.uuid) if u.uuid else None
            entry["skills"] = list(u.skills or [])
            entry["physical_ok"] = u.physical_ok
            entry["good_eyesight"] = u.good_eyesight
            entry["needs_glasses"] = u.needs_glasses
            entry["can_lift_heavy"] = u.can_lift_heavy
            entry["can_work_outdoor"] = u.can_work_outdoor
            entry["has_leader_experience"] = u.has_leader_experience
            entry["new_to_volunteer"] = u.new_to_volunteer
            entry["preferred_language"] = u.preferred_language
            entry["home_area"] = u.home_area
            entry["needs_meal_support"] = u.needs_meal_support
            entry["needs_travel_support"] = u.needs_travel_support
            entry["accepts_unpaid"] = u.accepts_unpaid
            entry["verification_status"] = u.verification_status
        results.append(entry)

    return results


get_user_applications = get_own_applications


@transaction.atomic
def withdraw_application(user, application_id: int) -> EventApplications:
    """
    Volunteer withdraws their own application.
    The DB trigger cascades cancellation to any active assignment.
    """
    try:
        app = EventApplications.objects.get(id=application_id)
    except EventApplications.DoesNotExist:
        raise ResourceMaskedNotFound(message="Application not found.")

    # Only the applicant or an event manager can withdraw.
    is_applicant_withdrawing = user.id == app.user_id
    if not is_applicant_withdrawing:
        get_event_for_manager_or_404(user, app.event_id, require_write=True)

    # Accepted-application withdrawal cascades to assignments in PostgreSQL.
    # Enforce the same cutoff here to prevent bypass through the cascade.
    # Authorized event managers retain their existing override.
    if app.status == "accepted" and is_applicant_withdrawing:
        active_assignment = (
            Assignments.objects.filter(
                application_id=app.id,
                status__in=("assigned", "confirmed"),
            )
            .order_by("schedule_start")
            .first()
        )
        if (
            active_assignment is not None
            and is_within_volunteer_cancellation_window(active_assignment.schedule_start)
        ):
            raise DomainError(
                code="cancellation_window_closed",
                message=(
                    "You cannot withdraw an accepted application within 48 hours "
                    "of the assigned shift. Contact the event coordinator for assistance."
                ),
                status_code=409,
            )

    if app.status not in ("pending", "waitlisted", "accepted"):
        raise DomainError(
            code="invalid_state",
            message=f"Cannot withdraw an application with status '{app.status}'.",
            status_code=400,
        )

    app.status = "withdrawn"
    app.save()
    app.refresh_from_db()

    logger.info(
        "Application withdrawn",
        extra={"application_id": application_id, "user_id": user.id},
    )
    return app


@transaction.atomic
def _decide_application(
    actor,
    application_id: int,
    new_status: str,
    post_id: Optional[int] = None,
    note: Optional[str] = None,
) -> EventApplications:
    """
    Internal helper for coordinator decisions (accept/reject/waitlist).
    The DB trigger validates the transition, permissions, and capacity.
    """
    if new_status not in DECISION_STATUSES:
        raise DomainError(
            code="invalid_decision",
            message=f"Invalid decision status '{new_status}'.",
            status_code=400,
        )

    try:
        app = EventApplications.objects.get(id=application_id)
    except EventApplications.DoesNotExist:
        raise ResourceMaskedNotFound(message="Application not found.")

    # Verify actor is event manager with write access
    get_event_for_manager_or_404(actor, app.event_id, require_write=True)

    # Update fields; trigger validates transition and capacity
    app.status = new_status
    app.decided_by_id = actor.id
    app.decided_at = timezone.now()
    if post_id is not None:
        app.post_id = post_id
    if note is not None:
        app.note = note
    app.save()
    app.refresh_from_db()

    logger.info(
        "Application decided",
        extra={
            "application_id": application_id,
            "new_status": new_status,
            "decided_by": actor.id,
        },
    )
    return app


def accept_application(
    actor,
    application_id: int,
    post_id: Optional[int] = None,
) -> EventApplications:
    """Accept an application. Trigger checks capacity and may auto-assign."""
    return _decide_application(actor, application_id, "accepted", post_id=post_id)


def reject_application(
    actor,
    application_id: int,
    note: Optional[str] = None,
) -> EventApplications:
    """Reject an application."""
    return _decide_application(actor, application_id, "rejected", note=note)


def waitlist_application(actor, application_id: int) -> EventApplications:
    """Move an application to waitlisted."""
    return _decide_application(actor, application_id, "waitlisted")


def get_application_status(user, application_id: int) -> dict:
    """Return the status of a specific application (self or manager)."""
    try:
        app = EventApplications.objects.get(id=application_id)
    except EventApplications.DoesNotExist:
        raise ResourceMaskedNotFound(message="Application not found.")

    # Only the applicant or event manager can view
    if user.id != app.user_id:
        get_event_for_manager_or_404(user, app.event_id, require_write=False)

    return {
        "id": app.id,
        "event_id": app.event_id,
        "post_id": app.post_id,
        "source": app.source,
        "status": app.status,
        "applied_at": app.applied_at,
        "decided_at": app.decided_at,
        "decided_by_id": app.decided_by_id,
    }


def check_user_availability_for_event(user, event_id: int) -> dict:
    """
    Check if the user is available for the event's time window.
    Delegates to the SQL is_user_available() function.
    """
    try:
        event = Events.objects.get(id=event_id, deleted_at__isnull=True)
    except Events.DoesNotExist:
        raise ResourceMaskedNotFound(message="Event not found.")

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT is_user_available(%s, %s, %s)",
            [user.id, event.start_at, event.end_at],
        )
        row = cursor.fetchone()
        available = bool(row[0]) if row else True

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT user_has_schedule_conflict(%s, %s, %s, %s)",
            [user.id, event.start_at, event.end_at, event_id],
        )
        row = cursor.fetchone()
        has_conflict = bool(row[0]) if row else False

    return {
        "event_id": event_id,
        "available": available,
        "schedule_conflict": has_conflict,
    }


def expire_stale_applications() -> int:
    """
    Expire pending/waitlisted applications for ended events.
    Delegates to the SQL expire_stale_applications() function.
    Called by the maintenance scheduler.
    """
    with connection.cursor() as cursor:
        cursor.execute("SELECT expire_stale_applications()")
        row = cursor.fetchone()
        return int(row[0]) if row else 0

