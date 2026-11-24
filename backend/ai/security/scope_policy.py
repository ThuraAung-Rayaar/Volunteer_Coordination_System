from typing import Any, Dict, List, Optional
from rest_framework.exceptions import PermissionDenied
from apps.coordination.models import CoordinatorProfiles
from common.permissions import get_event_for_manager_or_404

ACTOR_SCOPE_SUPER_ADMIN = "super_admin"
ACTOR_SCOPE_ADMIN = "admin"
ACTOR_SCOPE_COORDINATOR = "coordinator"
ACTOR_SCOPE_VOLUNTEER = "volunteer"

# Map actor scopes to allowlisted read-only tools
ALLOWED_TOOLS_BY_SCOPE = {
    ACTOR_SCOPE_VOLUNTEER: {
        "search_events",
        "get_event_detail",
        "get_my_applications",
        "get_my_assignments",
        "get_recommendations",
        "get_system_help",
    },
    ACTOR_SCOPE_COORDINATOR: {
        "search_events",
        "get_event_detail",
        "get_my_applications",
        "get_my_assignments",
        "get_recommendations",
        "get_system_help",
        "get_staffing_insight",
        "get_event_applications",
    },
    ACTOR_SCOPE_ADMIN: {
        "search_events",
        "get_event_detail",
        "get_staffing_insight",
        "get_system_help",
        "get_admin_overview",
    },
    ACTOR_SCOPE_SUPER_ADMIN: {
        "search_events",
        "get_event_detail",
        "get_staffing_insight",
        "get_system_help",
        "get_admin_overview",
    },
}


def determine_actor_scope(user: Any) -> str:
    """
    Deterministically computes the assistant actor scope based on existing DB fields.
    Does NOT invent new role or admin_tier fields.
    """
    if getattr(user, "is_admin", False) and getattr(user, "is_superuser", False):
        return ACTOR_SCOPE_SUPER_ADMIN

    if getattr(user, "is_admin", False):
        return ACTOR_SCOPE_ADMIN

    # Check if user has an approved coordinator profile
    try:
        if CoordinatorProfiles.objects.filter(user=user, status="approved").exists():
            return ACTOR_SCOPE_COORDINATOR
    except Exception:
        pass

    return ACTOR_SCOPE_VOLUNTEER


def verify_tool_access(user: Any, tool_name: str, arguments: Dict[str, Any]) -> None:
    """
    Enforces authorization check before executing any tool.
    Raises PermissionDenied if the tool is not allowed for the actor or if
    the target event is outside coordinator management boundary.
    """
    scope = determine_actor_scope(user)
    allowed_tools = ALLOWED_TOOLS_BY_SCOPE.get(scope, set())

    if tool_name not in allowed_tools:
        raise PermissionDenied(
            f"Action '{tool_name}' is not authorized for your account role ({scope})."
        )

    # For coordinator-specific tools, verify event ownership/management boundary
    if tool_name in ("get_staffing_insight", "get_event_applications"):
        if scope not in (ACTOR_SCOPE_ADMIN, ACTOR_SCOPE_SUPER_ADMIN):
            event_id = arguments.get("event_id")
            if not event_id:
                raise PermissionDenied("Event ID is required for this operation.")
            # Verify coordinator manages this event
            get_event_for_manager_or_404(user, int(event_id), require_write=False)
