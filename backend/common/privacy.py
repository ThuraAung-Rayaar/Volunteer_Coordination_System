"""
Privacy tier enforcement for the Volunteer Coordination System.

Implements the T0-T4 data visibility model:
- T0 (Public): Anyone can see. Published/active event data, charity fields.
- T1 (Minimal Identity & Self): UUID + display_name for anyone; full self-data for owner.
- T2 (Event-Scoped Semi-Private): Skills, physical flags, etc. for event managers
     when the target has an accepted application/assignment.
- T3 (Strictly Private): Phone, emergency contact, blood type, verification images.
     Self + Admin + Active-Shift Safety Exception only.
- T4 (Admin & Governance): Moderation, audit logs, geo attempts, account status.
     Admin/Super Admin only.
"""

from __future__ import annotations

import logging
from enum import Enum
from typing import Any, Optional, Set

logger = logging.getLogger(__name__)


class PrivacyTier(Enum):
    """Data visibility tiers."""
    T0_PUBLIC = "public"
    T1_MINIMAL_SELF = "minimal_self"
    T2_EVENT_SCOPED = "event_scoped"
    T3_PRIVATE = "private"
    T4_ADMIN = "admin"


# =============================================================================
# FIELD SETS BY TIER
# =============================================================================

# T0: Public event fields (from v_public_events)
T0_EVENT_FIELDS: Set[str] = {
    "event_id", "title", "description", "purpose_type", "location_name",
    "landmark_text", "latitude", "longitude", "geo_radius_m",
    "geo_checkin_enabled", "map_provider", "start_at", "end_at",
    "application_deadline", "status", "acceptance_mode", "max_participants",
    "meals_provided", "lodging_provided", "travel_support_provided",
    "compensation_kind", "current_coordinator_id", "coordinator_name",
    "charity_fields", "spots_remaining",
}

# T1: Minimal public card (UUID lookup by any authenticated user)
T1_MINIMAL_CARD_FIELDS: Set[str] = {"uuid", "display_name"}

# T1: Self-only operational data
T1_SELF_FIELDS: Set[str] = {
    "id", "uuid", "display_name", "preferred_language", "home_area",
    "blood_type", "skills", "physical_ok", "good_eyesight", "needs_glasses",
    "can_lift_heavy", "can_work_outdoor", "has_leader_experience",
    "new_to_volunteer", "needs_meal_support", "needs_travel_support",
    "accepts_unpaid", "is_willing_to_donate", "is_willing_to_donate_blood",
    "is_willing_to_donate_items", "verification_status", "account_status",
    "created_at",
}

# T2: Event-scoped semi-private (coordinator sees for accepted volunteers)
T2_COORDINATOR_FIELDS: Set[str] = {
    "skills", "physical_ok", "good_eyesight", "needs_glasses",
    "can_lift_heavy", "can_work_outdoor", "has_leader_experience",
    "new_to_volunteer", "preferred_language", "home_area",
    "needs_meal_support", "needs_travel_support", "accepts_unpaid",
    "verification_status",
}

# T2: Event details visible to accepted volunteers
T2_EVENT_DETAILS_FIELDS: Set[str] = {
    "onboarding_text", "onboarding_version", "compensation_note",
    "group_code", "is_group_leader",
}

# T2: Roster peer subset (co-volunteers in same event)
T2_ROSTER_PEER_FIELDS: Set[str] = {
    "display_name", "group_code", "is_group_leader", "post_title",
}

# T3: Strictly private personal data
T3_PRIVATE_FIELDS: Set[str] = {
    "phone_enc", "emergency_contact_name", "emergency_contact_phone_enc",
    "blood_type", "is_willing_to_donate", "is_willing_to_donate_blood",
    "is_willing_to_donate_items",
}

# Fields that are NEVER exposed in any API response
NEVER_EXPOSE_FIELDS: Set[str] = {
    "phone_hash", "code_hash", "token_hash", "password",
}

# T4: Admin-only fields
T4_ADMIN_FIELDS: Set[str] = {
    "account_status", "blocked_until", "is_admin", "is_staff", "is_superuser",
}


# =============================================================================
# FILTERING HELPERS
# =============================================================================

def filter_fields_for_tier(
    data: dict[str, Any],
    allowed_fields: Set[str],
    strip_never_expose: bool = True,
) -> dict[str, Any]:
    """
    Filter a data dictionary to only include allowed fields.

    Always strips NEVER_EXPOSE_FIELDS regardless of allowed_fields.
    """
    result = {k: v for k, v in data.items() if k in allowed_fields}

    if strip_never_expose:
        for field in NEVER_EXPOSE_FIELDS:
            result.pop(field, None)

    return result


def get_minimal_public_card(user) -> dict[str, Any]:
    """
    Return the T1 Minimal Public Card for a user.
    """
    return {
        "uuid": str(user.uuid) if hasattr(user, "uuid") and user.uuid else None,
        "display_name": getattr(user, "display_name", ""),
    }


def get_self_profile_data(user) -> dict[str, Any]:
    """
    Return the full self-profile data for a user (T1 + T2 + T3 self fields).
    """
    return {
        "id": getattr(user, "id", None),
        "uuid": str(user.uuid) if hasattr(user, "uuid") and user.uuid else None,
        "display_name": getattr(user, "display_name", ""),
        "preferred_language": getattr(user, "preferred_language", "my"),
        "home_area": getattr(user, "home_area", None),
        "blood_type": getattr(user, "blood_type", "unknown"),
        "skills": getattr(user, "skills", []),
        "physical_ok": getattr(user, "physical_ok", False),
        "good_eyesight": getattr(user, "good_eyesight", False),
        "needs_glasses": getattr(user, "needs_glasses", False),
        "can_lift_heavy": getattr(user, "can_lift_heavy", False),
        "can_work_outdoor": getattr(user, "can_work_outdoor", False),
        "has_leader_experience": getattr(user, "has_leader_experience", False),
        "new_to_volunteer": getattr(user, "new_to_volunteer", True),
        "needs_meal_support": getattr(user, "needs_meal_support", False),
        "needs_travel_support": getattr(user, "needs_travel_support", False),
        "accepts_unpaid": getattr(user, "accepts_unpaid", True),
        "is_willing_to_donate": getattr(user, "is_willing_to_donate", False),
        "is_willing_to_donate_blood": getattr(user, "is_willing_to_donate_blood", False),
        "is_willing_to_donate_items": getattr(user, "is_willing_to_donate_items", False),
        "verification_status": getattr(user, "verification_status", "none"),
        "account_status": getattr(user, "account_status", "active"),
        "created_at": getattr(user, "created_at", None),
    }


def get_t2_volunteer_card(user) -> dict[str, Any]:
    """
    Return T2 event-scoped semi-private fields for a volunteer.
    """
    return {
        "id": getattr(user, "id", None),
        "display_name": getattr(user, "display_name", ""),
        "skills": getattr(user, "skills", []),
        "physical_ok": getattr(user, "physical_ok", False),
        "good_eyesight": getattr(user, "good_eyesight", False),
        "needs_glasses": getattr(user, "needs_glasses", False),
        "can_lift_heavy": getattr(user, "can_lift_heavy", False),
        "can_work_outdoor": getattr(user, "can_work_outdoor", False),
        "has_leader_experience": getattr(user, "has_leader_experience", False),
        "new_to_volunteer": getattr(user, "new_to_volunteer", True),
        "preferred_language": getattr(user, "preferred_language", "my"),
        "home_area": getattr(user, "home_area", None),
        "needs_meal_support": getattr(user, "needs_meal_support", False),
        "needs_travel_support": getattr(user, "needs_travel_support", False),
        "accepts_unpaid": getattr(user, "accepts_unpaid", True),
        "verification_status": getattr(user, "verification_status", "none"),
    }


def can_access_event_t2(user, event) -> bool:
    """
    Check if a user can access T2 event-level semi-private data:
    - onboarding_text
    - onboarding_version
    - compensation_note

    Access is granted if user is authenticated and:
    - Is an active admin, OR
    - Is an event manager (owner or current coordinator), OR
    - Holds an 'accepted' application for this event, OR
    - Holds an active (non-cancelled) assignment for this event.
    """
    if not user or not getattr(user, "is_authenticated", False) or not getattr(user, "is_active", False):
        return False

    if getattr(user, "is_admin", False):
        return True

    from common.permissions import _is_event_manager
    if _is_event_manager(user, event):
        return True

    from apps.events.models import EventApplications
    from apps.coordination.models import Assignments

    has_accepted_app = EventApplications.objects.filter(
        event_id=event.id,
        user_id=user.id,
        status="accepted",
    ).exists()
    if has_accepted_app:
        return True

    has_active_assignment = Assignments.objects.filter(
        event_id=event.id,
        user_id=user.id,
    ).exclude(status="cancelled").exists()
    return has_active_assignment


def can_access_t3_data(requestor, target_user, event=None) -> bool:
    """
    Check if requestor can access T3 strictly private data for target_user.

    T3 access is granted to:
    - The user themselves (self-view)
    - Active Admins / Super Admins
    - Active-Shift Safety Exception: current_coordinator of an active event
      where target has assigned/confirmed/checked_in attendance
    """
    if not requestor or not getattr(requestor, "is_authenticated", False):
        return False

    if requestor.id == target_user.id:
        return True

    if getattr(requestor, "is_admin", False) and getattr(requestor, "is_active", False):
        return True

    # Active-Shift Safety Exception
    if event is not None and getattr(event, "status", "") == "active":
        if requestor.id == getattr(event, "current_coordinator_id", None):
            from apps.coordination.models import Assignments
            has_active_assignment = Assignments.objects.filter(
                event_id=event.id,
                user_id=target_user.id,
                status__in=["assigned", "confirmed"],
            ).exists()
            if has_active_assignment:
                return True

    return False


def can_access_t4_data(requestor) -> bool:
    """
    Check if requestor can access T4 admin & governance data.
    """
    if not requestor or not getattr(requestor, "is_authenticated", False):
        return False
    return bool(getattr(requestor, "is_admin", False) and getattr(requestor, "is_active", False))

