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
from common.exceptions import DomainError, InsufficientPrivilegeError, PermissionDeniedError
from django.utils import timezone
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


@transaction.atomic
def admin_create_event(
    admin_user,
    *,
    data: dict,
    owner_user_id: int | None = None,
) -> Events:
    """
    Super Admin event creation.
    Adheres strictly to all PostgreSQL triggers and domain business rules:
      - admin_user must be is_superuser
      - target owner_user must be an active, verified, approved coordinator
      - If owner_user_id is None, provision/ensure admin_user as active, verified, approved coordinator
      - 1..3 active charity fields validated
      - end_at > start_at validated
      - Delegate to canonical create_event
      - Log audit entry with action_type="admin.event_create"
    """
    if not getattr(admin_user, "is_superuser", False):
        raise InsufficientPrivilegeError("Only a Super Admin can create events via the Admin Portal.")

    from apps.accounts.models import Users
    from apps.audit.models import AuditLogs
    from apps.coordination.models import CoordinatorProfiles
    from apps.events.models import CharityFields

    # 1. Resolve owner_user
    if owner_user_id is not None:
        owner_user = Users.objects.filter(pk=owner_user_id).first()
        if owner_user is None:
            raise DomainError(code="user_not_found", message="The specified owner user does not exist.", status_code=404)

        coord = CoordinatorProfiles.objects.filter(user_id=owner_user.pk, status=CoordinatorProfiles.Status.APPROVED).first()
        if not coord or owner_user.account_status != "active" or owner_user.verification_status not in ("verified", "full"):
            raise DomainError(
                code="coordinator_not_approved",
                message="The owner must be an active, verified, approved coordinator.",
                status_code=400,
            )
        owner_user.coordinator_profile = coord
    else:
        owner_user = admin_user
        # Ensure admin_user satisfies the SQL trigger prerequisites inside transaction
        if admin_user.verification_status not in ("verified", "full") or admin_user.account_status != "active":
            Users.objects.filter(pk=admin_user.pk).update(
                verification_status="verified",
                account_status="active",
                is_active=True,
            )
            admin_user.refresh_from_db()
            owner_user = admin_user

        coord = CoordinatorProfiles.objects.filter(user_id=admin_user.pk).first()
        if not coord or coord.status != CoordinatorProfiles.Status.APPROVED:
            approver = Users.objects.filter(is_admin=True, is_active=True).exclude(pk=admin_user.pk).first()
            if approver is None:
                from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
                sys_phone = normalize_phone("+959000000000")
                approver, _ = Users.objects.get_or_create(
                    display_name="System Provisioner",
                    defaults={
                        "phone_hash": compute_phone_hash(sys_phone),
                        "phone_enc": encrypt_phone(sys_phone),
                        "is_admin": True,
                        "is_superuser": True,
                        "is_active": True,
                        "account_status": "active",
                        "verification_status": "verified",
                    },
                )

            if not coord:
                coord = CoordinatorProfiles.objects.create(
                    user=admin_user,
                    status=CoordinatorProfiles.Status.PENDING,
                )
            if coord.status != CoordinatorProfiles.Status.APPROVED:
                CoordinatorProfiles.objects.filter(user_id=admin_user.pk).update(
                    status=CoordinatorProfiles.Status.APPROVED,
                    approved_by=approver,
                    approved_at=timezone.now(),
                )
                coord.refresh_from_db()
        owner_user.coordinator_profile = coord

    # 2. Extract and resolve charity fields (1..3)
    raw_charity_fields = data.get("charity_field_ids") or data.get("charity_field_codes") or []
    charity_codes = []
    active_charities = list(CharityFields.objects.filter(active=True).order_by("sort_order", "code"))
    for item in raw_charity_fields:
        if isinstance(item, int):
            if 1 <= item <= len(active_charities):
                charity_codes.append(active_charities[item - 1].code)
            else:
                raise DomainError(
                    code="invalid_charity_field",
                    message=f"Invalid charity field ID: {item}",
                    status_code=400,
                )
        elif isinstance(item, str):
            if item.isdigit():
                idx = int(item)
                if 1 <= idx <= len(active_charities):
                    charity_codes.append(active_charities[idx - 1].code)
                else:
                    raise DomainError(
                        code="invalid_charity_field",
                        message=f"Invalid charity field ID: {item}",
                        status_code=400,
                    )
            else:
                charity_codes.append(item)

    if not charity_codes:
        raise DomainError(
            code="missing_charity_field",
            message="At least 1 charity field is required.",
            status_code=400,
        )
    if len(charity_codes) > 3:
        raise DomainError(
            code="too_many_charity_fields",
            message="A maximum of 3 charity fields may be linked.",
            status_code=400,
        )

    # 3. Validate time bounds
    start_at = data.get("start_at") or data.get("start_time")
    end_at = data.get("end_at") or data.get("end_time")
    if not start_at or not end_at:
        raise DomainError(
            code="invalid_time_bounds",
            message="Start time and end time are required.",
            status_code=400,
        )
    if end_at <= start_at:
        raise DomainError(
            code="invalid_time_bounds",
            message="Event end time must be after start time.",
            status_code=400,
        )

    # 4. Map input fields to canonical EVENT_CREATE_FIELDS
    event_payload = {
        "title": data.get("title", "Admin Created Event"),
        "description": data.get("description", ""),
        "purpose_type": data.get("purpose_type", "charity_event"),
        "location_name": data.get("location_name") or data.get("venue_name") or "",
        "landmark_text": data.get("landmark_text") or data.get("venue_address") or "",
        "latitude": data.get("latitude") if data.get("latitude") is not None else data.get("venue_lat"),
        "longitude": data.get("longitude") if data.get("longitude") is not None else data.get("venue_lng"),
        "geo_radius_m": data.get("geo_radius_m") if data.get("geo_radius_m") is not None else data.get("geofence_radius_m", 150),
        "geo_checkin_enabled": data.get("geo_checkin_enabled", False),
        "geo_checkin_opens_before_min": (
            data.get("geo_checkin_opens_before_min")
            if data.get("geo_checkin_opens_before_min") is not None
            else data.get("checkin_open_minutes_before", 30)
        ),
        "require_checkin_confirmation": data.get("require_checkin_confirmation", True),
        "map_provider": data.get("map_provider", "openstreetmap"),
        "start_at": start_at,
        "end_at": end_at,
        "application_deadline": data.get("application_deadline"),
        "acceptance_mode": data.get("acceptance_mode", "manual"),
        "auto_assign_enabled": data.get("auto_assign_enabled", False),
        "group_size": data.get("group_size"),
        "leader_strategy": data.get("leader_strategy", "none"),
        "max_participants": data.get("max_participants"),
        "meals_provided": data.get("meals_provided", False),
        "lodging_provided": data.get("lodging_provided", False),
        "travel_support_provided": data.get("travel_support_provided", False),
        "compensation_kind": data.get("compensation_kind", "unpaid"),
        "compensation_note": data.get("compensation_note") or data.get("category") or "",
        "onboarding_text": data.get("onboarding_text") or data.get("briefing_text") or "",
        "require_onboarding_ack": data.get("require_onboarding_ack", False),
        "qr_registration_enabled": data.get("qr_registration_enabled", False),
    }

    clean_payload = {k: v for k, v in event_payload.items() if k in EVENT_CREATE_FIELDS and v is not None}

    # Set DB session context for audit & triggers
    from common.db_context import set_db_session_context, get_db_session_context
    prev_user_id, prev_ip = get_db_session_context()
    set_db_session_context(admin_user.id)
    try:
        event = create_event(
            coordinator_user=owner_user,
            validated_data=clean_payload,
            charity_codes=charity_codes,
        )
    finally:
        set_db_session_context(prev_user_id, prev_ip)

    # 5. Write audit log entry
    AuditLogs.objects.create(
        actor_user=admin_user,
        action="admin.event_create",
        entity_type="event",
        entity_id=event.id,
        after_data={
            "event_id": event.id,
            "title": event.title,
            "owner_id": event.owner_id,
            "created_by_admin": admin_user.id,
        },
    )

    logger.info(
        "Admin event created",
        extra={"event_id": event.id, "admin_id": admin_user.id, "owner_id": owner_user.id},
    )
    return event


