"""
services/event_service.py

Event lifecycle management: creation, editing, status transitions,
coordinator handover, and owner retake.

Database-first rules honoured here:
- The event status state machine, publish gates, freeze, and cascades are
  enforced by trg_01_events_before_update and trg_50_events_after_update.
  This service orchestrates and performs request-level authorization only.
- Owner immutability and onboarding_version auto-bump are trigger-enforced.
- Coordinator handover delegates to the SQL change_event_coordinator() function.
"""
from __future__ import annotations

import logging
from typing import Optional

from django.db import connection, transaction
from django.db.models import Q

from apps.events.models import EventCharityFields, Events, CharityFields
from common.exceptions import DomainError, PermissionDeniedError
from common.permissions import (
    ensure_approved_coordinator,
    get_event_for_manager_or_404,
)

logger = logging.getLogger(__name__)

# Valid lifecycle transitions (mirrors trg_01_events_before_update)
VALID_TRANSITIONS = {
    "draft": {"published", "cancelled"},
    "published": {"active", "cancelled"},
    "active": {"completed", "cancelled"},
    "completed": set(),   # terminal
    "cancelled": set(),   # terminal
}

# Fields allowed on event creation (owner/coordinator/status/version are set by service/trigger)
EVENT_CREATE_FIELDS = frozenset({
    "title", "description", "purpose_type", "location_name", "landmark_text",
    "latitude", "longitude", "geo_radius_m", "geo_checkin_enabled",
    "geo_checkin_opens_before_min", "require_checkin_confirmation", "map_provider",
    "start_at", "end_at", "application_deadline",
    "acceptance_mode", "auto_assign_enabled", "group_size", "leader_strategy",
    "max_participants",
    "meals_provided", "lodging_provided", "travel_support_provided",
    "compensation_kind", "compensation_note",
    "onboarding_text", "require_onboarding_ack", "qr_registration_enabled",
})

# Fields allowed on event update (status/owner/coordinator/version/timestamps excluded)
EVENT_UPDATE_FIELDS = frozenset({
    "title", "description", "purpose_type", "location_name", "landmark_text",
    "latitude", "longitude", "geo_radius_m", "geo_checkin_enabled",
    "geo_checkin_opens_before_min", "require_checkin_confirmation", "map_provider",
    "start_at", "end_at", "application_deadline",
    "acceptance_mode", "auto_assign_enabled", "group_size", "leader_strategy",
    "max_participants",
    "meals_provided", "lodging_provided", "travel_support_provided",
    "compensation_kind", "compensation_note",
    "onboarding_text", "require_onboarding_ack", "qr_registration_enabled",
})


def _is_approved_coordinator(user_id: int) -> bool:
    """Delegate to the SQL is_approved_coordinator() function."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT is_approved_coordinator(%s)", [user_id])
        row = cursor.fetchone()
    return bool(row and row[0])


def _replace_charity_fields(event: Events, charity_codes: list[str]) -> None:
    """Atomically replace an event's charity field associations."""
    unique_codes = sorted(set(charity_codes or []))
    if unique_codes:
        valid = set(
            CharityFields.objects.filter(active=True, code__in=unique_codes)
            .values_list("code", flat=True)
        )
        invalid = set(unique_codes) - valid
        if invalid:
            raise DomainError(
                code="invalid_charity_field",
                message=f"Unknown or inactive charity fields: {', '.join(sorted(invalid))}",
                status_code=400,
            )
    EventCharityFields.objects.filter(event=event).delete()
    for code in unique_codes:
        EventCharityFields.objects.create(event=event, field_code_id=code)


# ---------------------------------------------------------------------------
# Event Creation
# ---------------------------------------------------------------------------

@transaction.atomic
def create_event(
    coordinator_user,
    validated_data: dict,
    charity_codes: Optional[list[str]] = None,
) -> Events:
    """
    Create a new event owned by the requesting approved coordinator.

    The DB trigger trg_01_events_before_insert forces status='draft',
    onboarding_version=1, and current_coordinator_id=owner_id.
    """
    ensure_approved_coordinator(coordinator_user)

    unknown = set(validated_data.keys()) - EVENT_CREATE_FIELDS
    if unknown:
        raise DomainError(
            code="field_not_allowed",
            message=f"Unknown event fields: {', '.join(sorted(unknown))}",
            status_code=400,
        )

    event = Events.objects.create(
        owner_id=coordinator_user.id,
        current_coordinator_id=coordinator_user.id,
        **validated_data,
    )
    event.refresh_from_db()

    if charity_codes is not None:
        _replace_charity_fields(event, charity_codes)

    logger.info("Event created", extra={"event_id": event.id, "owner_id": coordinator_user.id})
    return event


# ---------------------------------------------------------------------------
# Event Editing
# ---------------------------------------------------------------------------

@transaction.atomic
def update_event(
    actor,
    event_id: int,
    validated_data: dict,
    charity_codes: Optional[list[str]] = None,
) -> Events:
    """
    Update editable event fields. Enforces Owner-as-Monitor read-only block
    via get_event_for_manager_or_404(require_write=True).

    Status changes, owner/coordinator changes, and onboarding_version are
    NOT permitted here (handled by transitions and handover).
    """
    event = get_event_for_manager_or_404(actor, event_id, require_write=True)

    unknown = set(validated_data.keys()) - EVENT_UPDATE_FIELDS
    if unknown:
        raise DomainError(
            code="field_not_allowed",
            message=f"Unknown or non-editable event fields: {', '.join(sorted(unknown))}",
            status_code=400,
        )

    for field, value in validated_data.items():
        setattr(event, field, value)
    event.save()
    event.refresh_from_db()

    if charity_codes is not None:
        _replace_charity_fields(event, charity_codes)

    return event


# ---------------------------------------------------------------------------
# Event Lifecycle Transitions
# ---------------------------------------------------------------------------

@transaction.atomic
def transition_event_status(
    actor,
    event_id: int,
    target_status: str,
    cancel_reason: Optional[str] = None,
) -> Events:
    """
    Transition an event to a new lifecycle status.

    The DB trigger validates the transition, enforces publish gates, sets
    lifecycle timestamps, and runs completion/cancellation cascades.
    """
    if target_status not in ("published", "active", "completed", "cancelled"):
        raise DomainError(
            code="invalid_transition",
            message=f"Cannot transition event to '{target_status}'.",
            status_code=400,
        )

    event = get_event_for_manager_or_404(actor, event_id, require_write=True)

    # Pre-check transition validity for a clean 400 (trigger also enforces)
    if target_status not in VALID_TRANSITIONS.get(event.status, set()):
        raise DomainError(
            code="invalid_transition",
            message=f"Cannot transition event from '{event.status}' to '{target_status}'.",
            status_code=400,
        )

    event.status = target_status
    if target_status == "cancelled" and cancel_reason:
        event.cancel_reason = cancel_reason
    event.save()
    event.refresh_from_db()

    logger.info(
        "Event status changed",
        extra={"event_id": event_id, "new_status": target_status, "actor_id": actor.id},
    )
    return event


def publish_event(actor, event_id: int) -> Events:
    return transition_event_status(actor, event_id, "published")


def activate_event(actor, event_id: int) -> Events:
    return transition_event_status(actor, event_id, "active")


def complete_event(actor, event_id: int) -> Events:
    return transition_event_status(actor, event_id, "completed")


def cancel_event(actor, event_id: int, reason: Optional[str] = None) -> Events:
    return transition_event_status(actor, event_id, "cancelled", cancel_reason=reason)


# ---------------------------------------------------------------------------
# Coordinator Handover & Owner Retake
# ---------------------------------------------------------------------------

@transaction.atomic
def handover_event_coordinator(
    actor,
    event_id: int,
    new_coordinator_user_id: int,
    reason: str = "",
) -> Events:
    """
    Hand over event coordination to another approved coordinator.

    Delegates to the SQL change_event_coordinator() function, which validates
    permissions, checks the target is an approved coordinator, updates
    current_coordinator_id, and writes to event_coordinator_history via trigger.
    """
    # require_write=True enforces Owner-as-Monitor block (owner must retake first)
    event = get_event_for_manager_or_404(actor, event_id, require_write=True)

    if not _is_approved_coordinator(new_coordinator_user_id):
        raise DomainError(
            code="coordinator_not_approved",
            message="The target user is not an approved coordinator.",
            status_code=400,
        )

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT change_event_coordinator(%s, %s, %s, %s)",
            [event_id, new_coordinator_user_id, actor.id, reason],
        )

    event.refresh_from_db()
    logger.info(
        "Event coordinator handed over",
        extra={"event_id": event_id, "new_coordinator_id": new_coordinator_user_id, "actor_id": actor.id},
    )
    return event


@transaction.atomic
def retake_event_coordinator(
    owner_user,
    event_id: int,
    reason: str = "Owner retook coordination",
) -> Events:
    """
    Owner retakes coordination authority from the delegated current coordinator.

    Only the event owner may retake. This is the exit path from
    Owner-as-Monitor read-only mode (C12).
    """
    # require_write=False because the owner is in read-only monitor mode
    event = get_event_for_manager_or_404(owner_user, event_id, require_write=False)

    if owner_user.id != event.owner_id:
        raise PermissionDeniedError(
            message="Only the event owner can retake coordination.",
            code="not_owner",
        )

    if owner_user.id == event.current_coordinator_id:
        return event  # already the coordinator, no-op

    if not _is_approved_coordinator(owner_user.id):
        raise DomainError(
            code="coordinator_not_approved",
            message="The owner must be an approved coordinator to retake.",
            status_code=400,
        )

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT change_event_coordinator(%s, %s, %s, %s)",
            [event_id, owner_user.id, owner_user.id, reason],
        )

    event.refresh_from_db()
    logger.info("Event coordination retaken by owner", extra={"event_id": event_id, "owner_id": owner_user.id})
    return event


handover_event = handover_event_coordinator
retake_event = retake_event_coordinator


# ---------------------------------------------------------------------------
# Coordinator Event Listing
# ---------------------------------------------------------------------------

def list_coordinator_events(user) -> list[dict]:
    """
    List events where the user is owner or current coordinator.
    Includes an is_read_only_monitor flag for Owner-as-Monitor state.
    """
    events = (
        Events.objects.filter(
            Q(owner_id=user.id) | Q(current_coordinator_id=user.id),
            deleted_at__isnull=True,
        )
        .order_by("-created_at")
    )
    results = []
    for event in events:
        results.append({
            "id": event.id,
            "title": event.title,
            "status": event.status,
            "start_at": event.start_at,
            "end_at": event.end_at,
            "owner_id": event.owner_id,
            "current_coordinator_id": event.current_coordinator_id,
            "is_owner": event.owner_id == user.id,
            "is_current_coordinator": event.current_coordinator_id == user.id,
            "is_read_only_monitor": (
                event.owner_id == user.id
                and event.owner_id != event.current_coordinator_id
            ),
            "created_at": event.created_at,
        })
    return results

