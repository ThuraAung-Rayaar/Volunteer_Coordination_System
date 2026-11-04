"""
services/assignment_service.py

Smart assignment orchestration: auto-assign, manual assign, confirm, cancel.

Database-first rules honoured here:
- The assignment algorithm lives entirely in PostgreSQL
  (create_assignment_from_application, run_auto_assignment, assign_manually).
- This service NEVER reimplements the matching/grouping/capacity logic.
- All hard constraints (capacity, schedule overlap, accepted-only) are
  enforced by triggers and the EXCLUDE constraint.
- Concurrency is handled by PostgreSQL FOR UPDATE locks in triggers.
"""
from __future__ import annotations

import logging
from typing import Optional

from django.db import connection

from apps.coordination.models import Assignments
from apps.events.models import EventApplications, VEventPostCapacity
from common.exceptions import DomainError, ResourceMaskedNotFound
from common.permissions import get_event_for_manager_or_404

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Automatic Assignment
# ---------------------------------------------------------------------------

def run_event_auto_assignment(actor, event_id: int) -> dict:
    """
    Run the automatic assignment algorithm for an event.

    Delegates entirely to the PostgreSQL run_auto_assignment() function,
    which iterates accepted-but-unassigned applications and calls
    create_assignment_from_application() for each.

    Returns a structured result with counts.
    """
    # Verify actor is event manager with write access
    get_event_for_manager_or_404(actor, event_id, require_write=True)

    # Call the SQL function
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT run_auto_assignment(%s, %s)",
            [event_id, actor.id],
        )
        row = cursor.fetchone()
        assigned_count = int(row[0]) if row else 0

    # Gather result statistics
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM event_applications
                 WHERE event_id = %s AND status = 'accepted') AS accepted_total,
                (SELECT COUNT(*) FROM assignments
                 WHERE event_id = %s AND status <> 'cancelled') AS assigned_total,
                (SELECT COUNT(*) FROM v_accepted_unassigned
                 WHERE event_id = %s) AS remaining_unassigned
            """,
            [event_id, event_id, event_id],
        )
        stats = cursor.fetchone()

    result = {
        "event_id": event_id,
        "newly_assigned": assigned_count,
        "total_accepted": int(stats[0]) if stats else 0,
        "total_assigned": int(stats[1]) if stats else 0,
        "remaining_unassigned": int(stats[2]) if stats else 0,
    }

    logger.info(
        "Auto-assignment completed",
        extra={"event_id": event_id, "actor_id": actor.id, **result},
    )
    return result


# ---------------------------------------------------------------------------
# Manual Assignment
# ---------------------------------------------------------------------------

def assign_volunteer_manually(
    actor,
    application_id: int,
    post_id: Optional[int] = None,
    group_code: Optional[str] = None,
    is_group_leader: bool = False,
) -> dict:
    """
    Manually assign an accepted volunteer to a post/group.

    Delegates to the PostgreSQL assign_manually() function, which:
    - Verifies the application is accepted
    - Checks event manager permission
    - Validates post capacity
    - Creates or updates the assignment

    Returns the assignment ID.
    """
    # Load the application to get event_id for permission check
    try:
        app = EventApplications.objects.get(id=application_id)
    except EventApplications.DoesNotExist:
        raise ResourceMaskedNotFound(message="Application not found.")

    # Verify actor is event manager with write access
    get_event_for_manager_or_404(actor, app.event_id, require_write=True)

    # Call the SQL function
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT assign_manually(%s, %s, %s, %s, %s)",
            [application_id, post_id, actor.id, group_code, is_group_leader],
        )
        row = cursor.fetchone()
        assignment_id = int(row[0]) if row and row[0] else None

    if assignment_id is None:
        raise DomainError(
            code="assignment_failed",
            message="Manual assignment could not be completed.",
            status_code=400,
        )

    logger.info(
        "Manual assignment created",
        extra={
            "assignment_id": assignment_id,
            "application_id": application_id,
            "actor_id": actor.id,
        },
    )
    return {"assignment_id": assignment_id, "application_id": application_id}


# ---------------------------------------------------------------------------
# Assignment from Accepted Application
# ---------------------------------------------------------------------------

def create_assignment_from_accepted(actor, application_id: int) -> dict:
    """
    Create an assignment from an accepted application using the
    PostgreSQL create_assignment_from_application() function.

    This is the same function called automatically by the trigger when
    auto_assign_enabled is true. Calling it explicitly allows a coordinator
    to trigger assignment for a specific application.

    Returns the assignment ID or None if no suitable post was found.
    """
    try:
        app = EventApplications.objects.get(id=application_id)
    except EventApplications.DoesNotExist:
        raise ResourceMaskedNotFound(message="Application not found.")

    # Verify actor is event manager
    get_event_for_manager_or_404(actor, app.event_id, require_write=True)

    if app.status != "accepted":
        raise DomainError(
            code="invalid_state",
            message="Only accepted applications can be assigned.",
            status_code=400,
        )

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT create_assignment_from_application(%s, %s)",
            [application_id, actor.id],
        )
        row = cursor.fetchone()
        assignment_id = int(row[0]) if row and row[0] else None

    if assignment_id is None:
        return {
            "assignment_id": None,
            "application_id": application_id,
            "reason": "No suitable open post found or schedule conflict exists.",
        }

    return {"assignment_id": assignment_id, "application_id": application_id}


# ---------------------------------------------------------------------------
# Assignment Lifecycle
# ---------------------------------------------------------------------------

def confirm_assignment(user, assignment_id: int) -> Assignments:
    """
    Volunteer confirms their own assigned shift.
    The DB trigger validates that only the volunteer can confirm.
    """
    try:
        assignment = Assignments.objects.get(id=assignment_id)
    except Assignments.DoesNotExist:
        raise ResourceMaskedNotFound(message="Assignment not found.")

    # Only the assigned volunteer can confirm
    if assignment.user_id != user.id:
        raise DomainError(
            code="permission_denied",
            message="You can only confirm your own assignment.",
            status_code=403,
        )

    if assignment.status != "assigned":
        raise DomainError(
            code="invalid_state",
            message=f"Cannot confirm an assignment with status '{assignment.status}'.",
            status_code=400,
        )

    assignment.status = "confirmed"
    assignment.save()
    assignment.refresh_from_db()

    logger.info(
        "Assignment confirmed",
        extra={"assignment_id": assignment_id, "user_id": user.id},
    )
    return assignment


def cancel_assignment(
    actor,
    assignment_id: int,
    reason: str = "",
) -> Assignments:
    """
    Cancel an assignment. The volunteer can cancel their own,
    or an event manager can cancel any assignment on their event.
    The DB trigger blocks cancellation of completed assignments.
    """
    try:
        assignment = Assignments.objects.get(id=assignment_id)
    except Assignments.DoesNotExist:
        raise ResourceMaskedNotFound(message="Assignment not found.")

    # Permission: self or event manager
    if actor.id != assignment.user_id:
        get_event_for_manager_or_404(actor, assignment.event_id, require_write=True)

    if assignment.status == "completed":
        raise DomainError(
            code="invalid_state",
            message="Completed assignments cannot be cancelled.",
            status_code=400,
        )

    if assignment.status == "cancelled":
        return assignment  # Idempotent

    assignment.status = "cancelled"
    assignment.cancel_reason = reason
    assignment.save()
    assignment.refresh_from_db()

    logger.info(
        "Assignment cancelled",
        extra={
            "assignment_id": assignment_id,
            "actor_id": actor.id,
            "reason": reason,
        },
    )
    return assignment


# ---------------------------------------------------------------------------
# Assignment Queries
# ---------------------------------------------------------------------------

def get_event_assignments(actor, event_id: int) -> list[dict]:
    """
    Retrieve all active assignments for an event (coordinator view).
    Includes volunteer name, post, group, and status.
    """
    get_event_for_manager_or_404(actor, event_id, require_write=False)

    assignments = (
        Assignments.objects.filter(event_id=event_id)
        .exclude(status="cancelled")
        .select_related("user", "post", "application")
        .order_by("group_code", "id")
    )

    results = []
    for a in assignments:
        results.append({
            "id": a.id,
            "user_id": a.user_id,
            "display_name": a.user.display_name,
            "post_id": a.post_id,
            "post_title": a.post.title if a.post else None,
            "group_code": a.group_code,
            "is_group_leader": a.is_group_leader,
            "status": a.status,
            "assigned_by": a.assigned_by,
            "schedule_start": a.schedule_start,
            "schedule_end": a.schedule_end,
            "confirmed_at": a.confirmed_at,
        })
    return results


def get_own_assignments(user, event_id: Optional[int] = None) -> list[dict]:
    """
    Retrieve the authenticated user's assignments.
    Optionally filter by event.
    """
    qs = (
        Assignments.objects.filter(user=user)
        .exclude(status="cancelled")
        .select_related("event", "post")
        .order_by("schedule_start")
    )

    if event_id is not None:
        qs = qs.filter(event_id=event_id)

    results = []
    for a in qs:
        results.append({
            "id": a.id,
            "event_id": a.event_id,
            "event_title": a.event.title,
            "event_status": a.event.status,
            "post_id": a.post_id,
            "post_title": a.post.title if a.post else None,
            "group_code": a.group_code,
            "is_group_leader": a.is_group_leader,
            "status": a.status,
            "schedule_start": a.schedule_start,
            "schedule_end": a.schedule_end,
            "confirmed_at": a.confirmed_at,
        })
    return results


def get_post_capacity_summary(event_id: int) -> list[dict]:
    """
    Retrieve capacity summary for all posts in an event.
    Uses the v_event_post_capacity view (database-authoritative).
    """
    rows = VEventPostCapacity.objects.filter(event_id=event_id).order_by("post_id")
    return [
        {
            "post_id": row.post_id,
            "title": row.title,
            "status": row.status,
            "required_headcount": row.required_headcount,
            "assigned_count": int(row.assigned_count),
            "remaining": int(row.remaining),
        }
        for row in rows
    ]


def get_unassigned_accepted(actor, event_id: int) -> list[dict]:
    """
    Retrieve accepted applications that don't have an assignment yet.
    Uses the v_accepted_unassigned view.
    """
    get_event_for_manager_or_404(actor, event_id, require_write=False)

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT application_id, event_id, user_id, display_name,
                   skills, physical_ok, can_lift_heavy,
                   has_leader_experience, new_to_volunteer
            FROM v_accepted_unassigned
            WHERE event_id = %s
            ORDER BY user_id
            """,
            [event_id],
        )
        columns = [col[0] for col in cursor.description]
        rows = cursor.fetchall()

    return [dict(zip(columns, row)) for row in rows]
