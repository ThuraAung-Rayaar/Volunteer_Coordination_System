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

from django.db import IntegrityError, InternalError, ProgrammingError, connection
from apps.audit.models import Feedback
from apps.events.models import Events
from common.exceptions import DomainError, ResourceMaskedNotFound, translate_db_exception
from common.permissions import get_event_for_manager_or_404, get_visible_event_or_404
from common.utils import normalize_tags

logger = logging.getLogger(__name__)

VALID_DIRECTIONS = ("coordinator_to_volunteer", "volunteer_to_event", "volunteer_to_coordinator")


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

    with connection.cursor() as cursor:
        cursor.execute("SELECT set_config('app.user_id', %s, true)", [str(rater.id)])

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

    logger.info(
        "Feedback submitted",
        extra={"feedback_id": feedback.id, "event_id": event_id, "direction": direction},
    )
    return feedback


def get_event_feedback(actor, event_id: int) -> list[dict]:
    """
    Retrieve feedback for an event. Managers see all; volunteers see only their own.
    Hidden feedback is excluded from non-admin views.
    """
    event = get_visible_event_or_404(actor, event_id)
    is_manager = False
    try:
        get_event_for_manager_or_404(actor, event_id, require_write=False)
        is_manager = True
    except (ResourceMaskedNotFound, DomainError):
        is_manager = False

    qs = Feedback.objects.filter(event_id=event_id).select_related("rater_user", "target_user")

    if not is_manager:
        qs = qs.filter(rater_user=actor, status="active")
    else:
        # Managers see active and hidden; only admins act on hidden
        pass

    results = []
    for fb in qs.order_by("-created_at"):
        results.append({
            "id": fb.id,
            "event_id": fb.event_id,
            "rater_user_id": fb.rater_user_id,
            "rater_display_name": fb.rater_user.display_name if fb.rater_user else None,
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
