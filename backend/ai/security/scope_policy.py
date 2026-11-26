from typing import Any, Dict, Set
from rest_framework.exceptions import PermissionDenied
from apps.coordination.models import CoordinatorProfiles
from common.permissions import get_event_for_manager_or_404

ACTOR_SCOPE_SUPER_ADMIN = "super_admin"
ACTOR_SCOPE_ADMIN = "admin"
ACTOR_SCOPE_COORDINATOR = "coordinator"
ACTOR_SCOPE_VOLUNTEER = "volunteer"

# Legacy tool allowlists preserved for direct registry unit tests;
# active assistant chat uses ALLOWED_INTENTS_BY_SCOPE with zero LLM tool access.
ALLOWED_TOOLS_BY_SCOPE: Dict[str, Set[str]] = {
    ACTOR_SCOPE_VOLUNTEER: {
        "search_events", "get_event_detail", "get_my_applications",
        "get_my_assignments", "get_recommendations", "get_system_help",
    },
    ACTOR_SCOPE_COORDINATOR: {
        "search_events", "get_event_detail", "get_my_applications",
        "get_my_assignments", "get_recommendations", "get_system_help",
        "get_staffing_insight",
    },
    ACTOR_SCOPE_ADMIN: {
        "search_events", "get_event_detail", "get_system_help",
    },
    ACTOR_SCOPE_SUPER_ADMIN: {
        "search_events", "get_event_detail", "get_staffing_insight",
        "get_system_help",
    },
}

ALLOWED_INTENTS_BY_SCOPE: Dict[str, Set[str]] = {
    ACTOR_SCOPE_VOLUNTEER: {
        "volunteer.next_steps",
        "volunteer.my_applications",
        "volunteer.my_assignments",
        "volunteer.recommendations",
        "volunteer.prepare_for_event",
        "volunteer.checkin_help",
        "volunteer.policy_help",
        "public.events",
        "public.event_detail",
    },
    ACTOR_SCOPE_COORDINATOR: {
        "coordinator.next_steps",
        "coordinator.my_events",
        "coordinator.staffing",
        "coordinator.pending_applications",
        "coordinator.unassigned_accepted",
        "coordinator.event_readiness",
        "volunteer.next_steps",
        "volunteer.my_applications",
        "volunteer.my_assignments",
        "volunteer.recommendations",
        "volunteer.prepare_for_event",
        "volunteer.checkin_help",
        "volunteer.policy_help",
        "public.events",
        "public.event_detail",
    },
    ACTOR_SCOPE_ADMIN: {
        "admin.public_events",
        "admin.policy_help",
        "public.events",
        "public.event_detail",
    },
    ACTOR_SCOPE_SUPER_ADMIN: {
        "super_admin.public_events",
        "super_admin.event_staffing",
        "super_admin.policy_help",
        "public.events",
        "public.event_detail",
    },
}


def determine_actor_scope(user: Any) -> str:
    """Resolve scope from existing account flags and approved coordinator profile."""
    if getattr(user, "is_admin", False) and getattr(user, "is_superuser", False):
        return ACTOR_SCOPE_SUPER_ADMIN
    if getattr(user, "is_admin", False):
        return ACTOR_SCOPE_ADMIN
    if CoordinatorProfiles.objects.filter(user=user, status="approved").exists():
        return ACTOR_SCOPE_COORDINATOR
    return ACTOR_SCOPE_VOLUNTEER


def is_intent_allowed_for_scope(scope: str, intent_key: str) -> bool:
    """Return True if the intent key is permitted for the given server-derived scope."""
    return intent_key in ALLOWED_INTENTS_BY_SCOPE.get(scope, set())


def verify_tool_access(user: Any, tool_name: str, arguments: Dict[str, Any]) -> None:
    """Re-authorize a legacy read-only tool call for the current actor."""
    scope = determine_actor_scope(user)
    if tool_name not in ALLOWED_TOOLS_BY_SCOPE.get(scope, set()):
        raise PermissionDenied("This assistant action is not available for your account.")

    if tool_name == "get_staffing_insight" and scope == ACTOR_SCOPE_COORDINATOR:
        event_id = arguments.get("event_id")
        if not event_id:
            raise PermissionDenied("An event ID is required for this staffing query.")
        get_event_for_manager_or_404(user, int(event_id), require_write=False)
