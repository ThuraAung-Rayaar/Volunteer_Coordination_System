import logging
from typing import Any, Dict, List, Optional
from django.utils import timezone

from ai.security.scope_policy import determine_actor_scope, verify_tool_access, ALLOWED_TOOLS_BY_SCOPE
from ai.security.redaction import sanitize_ai_data
from ai.tools.system_help import get_system_help_content
from apps.events.models import EventApplications, Events
from apps.coordination.models import Assignments
from services import query_service, recommendation_service, staffing_insight_service

logger = logging.getLogger(__name__)

TOOL_DEFINITIONS = [
    {
        "name": "search_events",
        "description": "Search public upcoming volunteer events by query text or charity category.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "query": {"type": "STRING", "description": "Keywords in title or location"},
                "category": {"type": "STRING", "description": "Charity category code (e.g. environment, education)"},
                "limit": {"type": "INTEGER", "description": "Max results to return (1-10)"},
            },
        },
    },
    {
        "name": "get_event_detail",
        "description": "Get public details, posts, and spots remaining for a specific event ID.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "event_id": {"type": "INTEGER", "description": "Target event ID"},
            },
            "required": ["event_id"],
        },
    },
    {
        "name": "get_my_applications",
        "description": "Retrieve the signed-in volunteer's own event applications and status.",
        "parameters": {
            "type": "OBJECT",
            "properties": {},
        },
    },
    {
        "name": "get_my_assignments",
        "description": "Retrieve the signed-in volunteer's own confirmed event shifts and assignments.",
        "parameters": {
            "type": "OBJECT",
            "properties": {},
        },
    },
    {
        "name": "get_recommendations",
        "description": "Get personalized event recommendations matching the signed-in volunteer's profile and availability.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "limit": {"type": "INTEGER", "description": "Max recommendations to return (1-5)"},
            },
        },
    },
    {
        "name": "get_staffing_insight",
        "description": "Get real-time staffing gap, required headcount, and coverage signals for a managed event (coordinators and admins only).",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "event_id": {"type": "INTEGER", "description": "ID of managed event"},
            },
            "required": ["event_id"],
        },
    },
    {
        "name": "get_system_help",
        "description": "Get authoritative help on VCS workflows including cancellations, check-in, and applications.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "topic": {"type": "STRING", "description": "Topic e.g. cancellation, checkin, applications, general"},
            },
            "required": ["topic"],
        },
    },
]


def get_available_tools_for_actor(actor: Any) -> List[Dict[str, Any]]:
    """Returns tool schemas that the actor is authorized to call."""
    scope = determine_actor_scope(actor)
    allowed_names = ALLOWED_TOOLS_BY_SCOPE.get(scope, set())
    return [t for t in TOOL_DEFINITIONS if t["name"] in allowed_names]


def execute_tool(actor: Any, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validates permissions, executes tool with actor's authorized context,
    and returns sanitized data dictionary.
    """
    verify_tool_access(actor, tool_name, arguments)

    if tool_name == "search_events":
        query = arguments.get("query", "")
        limit = min(int(arguments.get("limit") or 5), 10)
        filters = {}
        if query:
            filters["search"] = query
        category = arguments.get("category")
        if category:
            filters["charity_field"] = category

        events_qs = query_service.list_public_events(filters=filters, limit=limit)
        events_list = [
            {
                "event_id": e.event_id,
                "title": e.title,
                "start_at": e.start_at.isoformat() if e.start_at else None,
                "end_at": e.end_at.isoformat() if e.end_at else None,
                "location_name": e.location_name or "",
                "spots_remaining": e.spots_remaining,
                "charity_fields": e.charity_fields or [],
            }
            for e in events_qs
        ]
        return sanitize_ai_data({"events": events_list})

    elif tool_name == "get_event_detail":
        event_id = int(arguments.get("event_id") or 0)
        event_data = query_service.get_public_event(event_id)
        posts_data = query_service.get_event_posts(event_id)
        return sanitize_ai_data({
            "event": event_data,
            "posts": posts_data,
        })

    elif tool_name == "get_my_applications":
        apps = EventApplications.objects.filter(user_id=actor.id).order_by("-applied_at")[:10]
        results = [
            {
                "id": a.id,
                "event_id": a.event_id,
                "post_id": a.post_id,
                "status": a.status,
                "applied_at": a.applied_at.isoformat() if a.applied_at else None,
            }
            for a in apps
        ]
        return sanitize_ai_data({"applications": results})

    elif tool_name == "get_my_assignments":
        assigns = Assignments.objects.filter(user_id=actor.id).order_by("-assigned_at")[:10]
        results = [
            {
                "id": a.id,
                "event_id": a.event_id,
                "post_id": a.post_id,
                "status": a.status,
                "is_group_leader": a.is_group_leader,
                "group_code": a.group_code,
                "assigned_at": a.assigned_at.isoformat() if a.assigned_at else None,
            }
            for a in assigns
        ]
        return sanitize_ai_data({"assignments": results})

    elif tool_name == "get_recommendations":
        limit = min(int(arguments.get("limit") or 5), 10)
        recs = recommendation_service.get_recommendations_for_user(actor, limit=limit)
        return sanitize_ai_data(recs)

    elif tool_name == "get_staffing_insight":
        event_id = int(arguments.get("event_id") or 0)
        insight = staffing_insight_service.get_staffing_insight(event_id)
        return sanitize_ai_data(insight)

    elif tool_name == "get_system_help":
        topic = str(arguments.get("topic") or "general")
        return get_system_help_content(topic)

    else:
        raise ValueError(f"Unknown tool '{tool_name}'")
