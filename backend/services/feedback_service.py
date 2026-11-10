"""
services/feedback_service.py

Two-way verifiable feedback: submit, retrieve, and hide (via moderation).

Database-first rules honoured here:
- trg_01_feedback_guard enforces event-completed, participation, direction/target
  rules, self-rating prohibition, and immutability.
- Feedback can only be hidden through moderation_actions (feedback_hide), which
  sets app.privileged_write so the trigger permits the status change.
- This service never writes feedback.status = 'hidden' directly.
"""
from __future__ import annotations

import logging

from django.db import IntegrityError, InternalError, ProgrammingError, connection, transaction
from apps.audit.models import Feedback
from apps.events.models import Events
from common.db_context import get_db_session_context, set_db_session_context
from common.exceptions import DomainError, ResourceMaskedNotFound, translate_db_exception
from common.permissions import get_event_for_manager_or_404, get_visible_event_or_404
from common.utils import normalize_tags

logger = logging.getLogger(__name__)

VALID_DIRECTIONS = ("coordinator_to_volunteer", "volunteer_to_event", "volunteer_to_coordinator")


@transaction.atomic
def submit_event_feedback(
    rater,
    event_id: int,
    direction: str,
    score: int,
    tags: list[str] | None = None,
    comment: str = "",
    target_user_id: int | None = None,
) -> Feedback:
    """
    Submit feedback. The DB trigger validates participation and direction rules.

    Direction handling:
      - volunteer_to_event: target is forced to None.
      - volunteer_to_coordinator: target defaults to event.current_coordinator_id.
      - coordinator_to_volunteer: target is required (the volunteer being rated).
    """
    if direction not in VALID_DIRECTIONS:
        raise DomainError(
            code="invalid_feedback_direction",
            message=f"Invalid feedback direction '{direction}'.",
            status_code=400,
        )

    if not (1 <= score <= 5):
        raise DomainError(
            code="invalid_feedback_score",
            message="Feedback score must be between 1 and 5.",
            status_code=400,
        )

    event = get_visible_event_or_404(rater, event_id)

    # Resolve target per direction rules
    if direction == "volunteer_to_event":
        target_user_id = None
    elif direction == "volunteer_to_coordinator" and target_user_id is None:
        target_user_id = event.current_coordinator_id

    clean_tags = normalize_tags(tags)

    prev_user_id, prev_ip = get_db_session_context()
    set_db_session_context(rater.id)
    try:
        feedback = Feedback.objects.create(
            event_id=event_id,
            rater_user=rater,
            target_user_id=target_user_id,
            direction=direction,
            score=score,
            tags=clean_tags,
            comment=comment,
        )
    except (ProgrammingError, IntegrityError, InternalError) as exc:
        raise translate_db_exception(exc) from exc
    finally:
        set_db_session_context(prev_user_id, prev_ip)

    logger.info(
        "Feedback submitted",
        extra={"feedback_id": feedback.id, "event_id": event_id, "direction": direction},
    )
    return feedback


def get_event_feedback(actor, event_id: int) -> list[dict]:
    """
    Retrieve feedback for an event.
    Strict anonymity & privacy rule: Neither volunteers nor coordinators may view other
    users' individual feedback rows or comments. Only admins (is_admin=True) can view all
    event feedback rows for moderation, while non-admin users (both volunteers and coordinators)
    only receive the rows they authored themselves.
    """
    event = get_visible_event_or_404(actor, event_id)
    is_admin = bool(
        getattr(actor, "is_admin", False)
        or getattr(actor, "is_staff", False)
        or getattr(actor, "is_superuser", False)
        or getattr(actor, "role", "") == "admin"
    )

    qs = Feedback.objects.filter(event_id=event_id).select_related("rater_user", "target_user")

    if not is_admin:
        qs = qs.filter(rater_user=actor, status="active")

    results = []
    for fb in qs.order_by("-created_at"):
        item = {
            "id": fb.id,
            "event_id": fb.event_id,
            "target_user_id": fb.target_user_id,
            "direction": fb.direction,
            "score": fb.score,
            "tags": list(fb.tags or []),
            "comment": fb.comment,
            "status": fb.status,
            "created_at": fb.created_at,
        }
        # Only admins or the author themselves see the rater info
        if is_admin or fb.rater_user_id == actor.id:
            item["rater_user_id"] = fb.rater_user_id
            item["from_user_id"] = fb.rater_user_id
            item["rater_display_name"] = fb.rater_user.display_name if fb.rater_user else None
        else:
            item["rater_user_id"] = None
            item["from_user_id"] = None
            item["rater_display_name"] = None
        results.append(item)
    return results


def get_user_feedback_summary(target_user_id: int | None = None, to_user_id: int | None = None) -> dict:
    """
    Compute aggregate feedback summary metrics for a user across visible (active) feedback.
    Neither coordinators nor volunteers may see who gave feedback (from_user_id) or view
    individual feedback rows/comments about themselves.
    Ensures NO from_user_id, NO event_id, and NO individual comment strings are included.
    """
    from django.db.models import Avg, Count

    user_id = target_user_id if target_user_id is not None else to_user_id
    if user_id is None:
        raise DomainError(
            code="missing_target_user",
            message="target_user_id is required for feedback summary.",
            status_code=400,
        )

    qs = Feedback.objects.filter(target_user_id=user_id, status="active")
    total_count = qs.count()

    overall_agg = qs.aggregate(avg=Avg("score"))
    overall_avg = overall_agg["avg"]
    overall_avg_rating = round(overall_avg, 2) if overall_avg is not None else None

    # as_volunteer (feedback_type / direction="coordinator_to_volunteer")
    vol_qs = qs.filter(direction="coordinator_to_volunteer")
    vol_count = vol_qs.count()
    vol_avg = vol_qs.aggregate(avg=Avg("score"))["avg"]
    vol_avg_rounded = round(vol_avg, 2) if vol_avg is not None else None
    as_volunteer = {
        "count": vol_count,
        "avg_overall": vol_avg_rounded,
        "avg_punctuality": vol_avg_rounded,
        "avg_attitude": vol_avg_rounded,
        "avg_task_completion": vol_avg_rounded,
    }

    # as_coordinator (feedback_type / direction="volunteer_to_coordinator")
    coord_qs = qs.filter(direction="volunteer_to_coordinator")
    coord_count = coord_qs.count()
    coord_avg = coord_qs.aggregate(avg=Avg("score"))["avg"]
    coord_avg_rounded = round(coord_avg, 2) if coord_avg is not None else None
    as_coordinator = {
        "count": coord_count,
        "avg_overall": coord_avg_rounded,
        "avg_communication": coord_avg_rounded,
        "avg_support": coord_avg_rounded,
        "avg_organization": coord_avg_rounded,
    }

    # rating_distribution: counts for ratings 1 through 5
    rating_distribution = {
        str(score): qs.filter(score=score).count()
        for score in range(1, 6)
    }

    return {
        "user_id": user_id,
        "total_count": total_count,
        "overall_avg_rating": overall_avg_rating,
        "as_volunteer": as_volunteer,
        "as_coordinator": as_coordinator,
        "rating_distribution": rating_distribution,
    }


def list_feedback_for_user(viewer, target_user_id: int, event_id: int | None = None) -> list[dict]:
    """
    Retrieve feedback for target_user_id.
    - If viewer is not staff/superuser:
      Never expose from_user_id or individual Feedback rows/comments.
      Returns [get_user_feedback_summary(target_user_id)].
    - If viewer is staff/superuser:
      Returns individual Feedback rows including from_user_id.
    """
    is_admin = bool(
        getattr(viewer, "is_admin", False)
        or getattr(viewer, "is_staff", False)
        or getattr(viewer, "is_superuser", False)
        or getattr(viewer, "role", "") == "admin"
    )

    if not is_admin:
        return [get_user_feedback_summary(target_user_id)]

    qs = Feedback.objects.filter(target_user_id=target_user_id)
    if event_id is not None:
        qs = qs.filter(event_id=event_id)

    results = []
    for fb in qs.order_by("-created_at"):
        results.append({
            "id": fb.id,
            "event_id": fb.event_id,
            "from_user_id": fb.rater_user_id,
            "rater_user_id": fb.rater_user_id,
            "target_user_id": fb.target_user_id,
            "direction": fb.direction,
            "score": fb.score,
            "tags": list(fb.tags or []),
            "comment": fb.comment,
            "status": fb.status,
            "created_at": fb.created_at,
        })
    return results


def get_own_feedback(user) -> list[dict]:
    """Retrieve feedback the user has given."""
    rows = (
        Feedback.objects.filter(rater_user=user, status="active")
        .select_related("event")
        .order_by("-created_at")
    )
    return [
        {
            "id": fb.id,
            "event_id": fb.event_id,
            "event_title": fb.event.title,
            "direction": fb.direction,
            "score": fb.score,
            "status": fb.status,
            "created_at": fb.created_at,
        }
        for fb in rows
    ]


def hide_feedback_via_moderation(admin_user, feedback_id: int, reason: str) -> None:
    """
    Hide feedback by inserting a moderation_actions row. The trigger applies the
    hide. This is the ONLY supported path (never update feedback.status directly).
    Delegates to moderation_service to keep the insert-to-apply mechanism central.
    """
    from services import moderation_service
    moderation_service.record_moderation_action(
        admin_user, action_type="feedback_hide", feedback_id=feedback_id, reason=reason
    )


# Function aliases for specification compatibility
list_event_feedback = get_event_feedback
hide_feedback = hide_feedback_via_moderation
get_user_feedback_history = get_own_feedback

