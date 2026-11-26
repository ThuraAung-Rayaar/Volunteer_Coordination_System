import logging
from typing import Any, Dict, List

from ai.security.scope_policy import (
    ALLOWED_TOOLS_BY_SCOPE,
    determine_actor_scope,
    verify_tool_access,
)
from ai.security.redaction import sanitize_ai_data
from ai.tools.system_help import get_system_help_content
from apps.events.models import EventApplications
from apps.coordination.models import Assignments
from services import query_service, recommendation_service, staffing_insight_service

logger = logging.getLogger(__name__)

TOOL_DEFINITIONS = [
    {
        "name": "search_events",
        "description": "Search public upcoming volunteer events by keywords or charity category.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "query": {"type": "STRING", "description": "Keywords in title, description, or public location name"},
                "category": {"type": "STRING", "description": "Charity category code"},
                "limit": {"type": "INTEGER", "description": "Maximum number of results (1-10)"},
            },
        },
    },
    {
        "name": "get_event_detail",
        "description": "Get public details and open post capacity for a published or active event.",
        "parameters": {
            "type": "OBJECT",
            "properties": {"event_id": {"type": "INTEGER", "description": "Event ID"}},
            "required": ["event_id"],
        },
    },
    {
        "name": "get_my_applications",
        "description": "Retrieve the signed-in user's own applications and statuses.",
        "parameters": {"type": "OBJECT", "properties": {}},
    },
    {
        "name": "get_my_assignments",
        "description": "Retrieve the signed-in user's own assignments and statuses.",
        "parameters": {"type": "OBJECT", "properties": {}},
    },
    {
        "name": "get_recommendations",
        "description": "Get explainable event recommendations for the signed-in volunteer.",
        "parameters": {
            "type": "OBJECT",
            "properties": {"limit": {"type": "INTEGER", "description": "Maximum results (1-10)"}},
        },
    },
    {
        "name": "get_staffing_insight",
        "description": "Get staffing coverage and gap analytics for an event the actor manages.",
        "parameters": {
            "type": "OBJECT",
            "properties": {"event_id": {"type": "INTEGER", "description": "Managed event ID"}},
            "required": ["event_id"],
        },
    },
    {
        "name": "get_system_help",
        "description": "Get curated guidance on VCS workflows and policies.",
        "parameters": {
            "type": "OBJECT",
            "properties": {"topic": {"type": "STRING", "description": "Workflow topic"}},
            "required": ["topic"],
        },
    },
]


def get_available_tools_for_actor(actor: Any) -> List[Dict[str, Any]]:
    scope = determine_actor_scope(actor)
    allowed_names = ALLOWED_TOOLS_BY_SCOPE.get(scope, set())
    return [definition for definition in TOOL_DEFINITIONS if definition["name"] in allowed_names]


def _bounded_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        return max(minimum, min(int(value), maximum))
    except (TypeError, ValueError):
        return default


def execute_tool(actor: Any, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """Execute one allowlisted, read-only tool after checking actor permissions."""
    if not isinstance(arguments, dict):
        raise ValueError("Tool arguments must be an object.")

    verify_tool_access(actor, tool_name, arguments)

    if tool_name == "search_events":
        query = str(arguments.get("query") or "").strip()[:100]
        category = str(arguments.get("category") or "").strip()[:50]
        limit = _bounded_int(arguments.get("limit"), 5, 1, 10)
        filters: Dict[str, Any] = {"upcoming": True}
        if query:
            filters["search"] = query
        if category:
            filters["charity_field"] = category

        # query_service accepts one params dictionary (not filters/limit kwargs).
        events = query_service.list_public_events(filters)[:limit]
        return sanitize_ai_data({
            "events": [
                {
                    "event_id": event.event_id,
                    "title": event.title,
                    "description": event.description,
                    "start_at": event.start_at.isoformat() if event.start_at else None,
                    "end_at": event.end_at.isoformat() if event.end_at else None,
                    "location_name": event.location_name or "",
                    "spots_remaining": int(event.spots_remaining or 0),
                    "charity_fields": event.charity_fields or [],
                }
                for event in events
            ]
        })

    if tool_name == "get_event_detail":
        event_id = _bounded_int(arguments.get("event_id"), 0, 1, 2_147_483_647)
        event = query_service.get_public_event(event_id)
        posts = query_service.get_event_posts(event_id)
        # VPublicEvents is a Django model instance: return an explicit JSON-safe
        # public allow-list and deliberately omit exact coordinates/geo settings.
        return sanitize_ai_data({
            "event": {
                "event_id": event.event_id,
                "title": event.title,
                "description": event.description,
                "purpose_type": event.purpose_type,
                "location_name": event.location_name or "",
                "start_at": event.start_at.isoformat() if event.start_at else None,
                "end_at": event.end_at.isoformat() if event.end_at else None,
                "application_deadline": (
                    event.application_deadline.isoformat()
                    if event.application_deadline else None
                ),
                "status": event.status,
                "charity_fields": event.charity_fields or [],
                "spots_remaining": int(event.spots_remaining or 0),
            },
            "posts": [
                {
                    "id": post.get("id"),
                    "title": post.get("title"),
                    "description": post.get("description"),
                    "status": post.get("status"),
                    "required_skills": post.get("required_skills") or [],
                    "required_headcount": post.get("required_headcount", 0),
                    "assigned_count": post.get("assigned_count", 0),
                    "remaining": post.get("remaining", 0),
                }
                for post in posts[:10]
            ],
        })

    if tool_name == "get_my_applications":
        applications = EventApplications.objects.filter(
            user_id=actor.id
        ).order_by("-applied_at")[:10]
        return sanitize_ai_data({
            "applications": [
                {
                    "id": item.id,
                    "event_id": item.event_id,
                    "post_id": item.post_id,
                    "status": item.status,
                    "applied_at": item.applied_at.isoformat() if item.applied_at else None,
                }
                for item in applications
            ]
        })

    if tool_name == "get_my_assignments":
        assignments = Assignments.objects.filter(
            user_id=actor.id
        ).order_by("-created_at")[:10]
        return sanitize_ai_data({
            "assignments": [
                {
                    "id": item.id,
                    "event_id": item.event_id,
                    "post_id": item.post_id,
                    "status": item.status,
                    "is_group_leader": item.is_group_leader,
                    "assigned_at": item.created_at.isoformat() if item.created_at else None,
                }
                for item in assignments
            ]
        })

    if tool_name == "get_recommendations":
        limit = _bounded_int(arguments.get("limit"), 5, 1, 10)
        return sanitize_ai_data(recommendation_service.get_recommendations_for_user(actor, limit=limit))

    if tool_name == "get_staffing_insight":
        event_id = _bounded_int(arguments.get("event_id"), 0, 1, 2_147_483_647)
        return sanitize_ai_data(staffing_insight_service.get_staffing_insight(event_id))

    if tool_name == "get_system_help":
        topic = str(arguments.get("topic") or "general")[:50]
        return sanitize_ai_data(get_system_help_content(topic))

    raise ValueError("Unknown or unavailable assistant tool.")
