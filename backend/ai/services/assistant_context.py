"""
backend/ai/services/assistant_context.py

Actor-scoped, read-only context DTO builder for the VCS assistant.
Every query runs on behalf of the authenticated actor using existing Django
services and bounded ORM queries. Raw ORM objects and T3/T4 PII never enter
the returned DTO.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from ai.security.redaction import sanitize_ai_data
from ai.security.scope_policy import (
    ACTOR_SCOPE_COORDINATOR,
    ACTOR_SCOPE_SUPER_ADMIN,
    is_intent_allowed_for_scope,
)
from ai.services.intent_resolver import IntentResolution
from ai.services.prompt_catalog import get_prompt_catalog_for_actor
from ai.tools.system_help import get_system_help_content
from apps.attendance.models import Attendance
from apps.coordination.models import Assignments
from apps.events.models import EventApplications, Events, VEventSummary
from common.exceptions import ResourceMaskedNotFound
from common.permissions import get_event_for_manager_or_404
from services import query_service, recommendation_service, staffing_insight_service

MAX_RECORDS = 10
MAX_SUMMARY_EVENTS = 5
MAX_TEXT_LEN = 300

INTENT_INSTRUCTIONS = {
    "volunteer.next_steps": (
        "Explain the volunteer's current applications and assignments separately, "
        "noting any accepted-without-assignment state and suggesting only supported next UI steps."
    ),
    "volunteer.my_applications": (
        "Summarize the volunteer's submitted applications newest first with event/post label and status."
    ),
    "volunteer.my_assignments": (
        "Summarize the volunteer's assignments and attendance states, distinguishing assignment from attendance."
    ),
    "volunteer.recommendations": (
        "Explain the supplied recommendation-v1 matches using only supplied scores and reasons."
    ),
    "volunteer.prepare_for_event": (
        "Summarize upcoming assignment details, public venue label, and check-in/onboarding requirements."
    ),
    "volunteer.checkin_help": (
        "Explain VCS QR/geolocation check-in policy and any upcoming shift check-in flags in AUTHORIZED_DATA."
    ),
    "volunteer.policy_help": (
        "Explain the supplied policy topic accurately. If unverified, state that clearly."
    ),
    "coordinator.next_steps": (
        "Summarize what needs the coordinator's attention across their managed events, including read-only monitor notes."
    ),
    "coordinator.my_events": (
        "Summarize the coordinator's managed events and counts; never suggest mutations for read-only monitor events."
    ),
    "coordinator.staffing": (
        "Explain the event's staffing headcount, open slots, backlog, attendance counts, coverage, and readiness signals."
    ),
    "coordinator.pending_applications": (
        "Summarize pending applications awaiting review across the coordinator's managed events."
    ),
    "coordinator.unassigned_accepted": (
        "Summarize backend-confirmed accepted applications that still lack an active assignment."
    ),
    "coordinator.event_readiness": (
        "Explain whether the selected managed event is ready using the supplied staffing metrics and operational indicators."
    ),
    "admin.public_events": "Summarize the supplied public upcoming events and remaining capacity.",
    "admin.policy_help": "Explain the supplied VCS public workflow policy accurately.",
    "super_admin.public_events": "Summarize the supplied public upcoming events and remaining capacity.",
    "super_admin.event_staffing": (
        "Explain the supplied event-level staffing coverage and readiness signals without extrapolating global totals."
    ),
    "super_admin.policy_help": "Explain the supplied VCS public workflow policy accurately.",
    "public.events": "Summarize the matching public upcoming events and remaining capacity.",
    "public.event_detail": "Summarize the public event details and open posts supplied in AUTHORIZED_DATA.",
}


def _iso(dt: Any) -> Optional[str]:
    return dt.isoformat() if dt is not None else None


def _clip(text: Any, limit: int = MAX_TEXT_LEN) -> str:
    value = str(text or "").strip()
    if len(value) <= limit:
        return value
    return value[: limit - 3].rstrip() + "..."


def _dedupe_actions(actions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    unique: List[Dict[str, Any]] = []
    seen = set()
    for action in actions:
        key = (action.get("type"), action.get("event_id"), action.get("label"))
        if key not in seen:
            seen.add(key)
            unique.append(action)
    return unique


def _dedupe_sources(sources: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    unique: List[Dict[str, Any]] = []
    seen = set()
    for source in sources:
        key = (source.get("type"), source.get("id"), source.get("label"))
        if key not in seen:
            seen.add(key)
            unique.append(source)
    return unique


def _managed_events_queryset(actor: Any):
    return Events.objects.filter(deleted_at__isnull=True).filter(
        Q(owner_id=actor.id) | Q(current_coordinator_id=actor.id)
    ).order_by("start_at", "id")


def _serialize_application(app: EventApplications) -> Dict[str, Any]:
    event_title = app.event.title if app.event_id and app.event else f"Event #{app.event_id}"
    post_title = app.post.title if app.post_id and app.post else None
    return {
        "application_id": app.id,
        "event_id": app.event_id,
        "event_title": _clip(event_title, 150),
        "post_title": _clip(post_title, 120) if post_title else None,
        "application_status": app.status,
        "source": app.source,
        "applied_at": _iso(app.applied_at),
        "event_start_at": _iso(app.event.start_at) if app.event_id and app.event else None,
    }


def _attendance_map_for_assignments(actor: Any, assignment_ids: List[int]) -> Dict[int, Dict[str, Any]]:
    if not assignment_ids:
        return {}
    rows = Attendance.objects.filter(
        user_id=actor.id,
        assignment_id__in=assignment_ids,
    ).only("assignment_id", "status", "confirmation_status", "checkin_at", "checkout_at")
    mapping: Dict[int, Dict[str, Any]] = {}
    for att in rows:
        if att.checkout_at is not None:
            att_state = "checked_out"
        else:
            att_state = att.status
        mapping[att.assignment_id] = {
            "attendance_status": att_state,
            "confirmation_status": att.confirmation_status,
        }
    return mapping


def _serialize_assignment(
    assignment: Assignments,
    att_info: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    event_title = (
        assignment.event.title
        if assignment.event_id and assignment.event
        else f"Event #{assignment.event_id}"
    )
    post_title = assignment.post.title if assignment.post_id and assignment.post else None
    item: Dict[str, Any] = {
        "assignment_id": assignment.id,
        "event_id": assignment.event_id,
        "event_title": _clip(event_title, 150),
        "post_title": _clip(post_title, 120) if post_title else None,
        "assignment_status": assignment.status,
        "is_group_leader": bool(assignment.is_group_leader),
        "schedule_start": _iso(assignment.schedule_start),
        "schedule_end": _iso(assignment.schedule_end),
    }
    if att_info:
        item["attendance_status"] = att_info.get("attendance_status")
        item["confirmation_status"] = att_info.get("confirmation_status")
    return item


def _build_dto(
    *,
    intent: str,
    actor_scope: str,
    language: str,
    data: Dict[str, Any],
    sources: Optional[List[Dict[str, Any]]] = None,
    suggested_actions: Optional[List[Dict[str, Any]]] = None,
    skip_llm: bool = False,
    max_tokens: int = 280,
) -> Dict[str, Any]:
    return sanitize_ai_data({
        "intent": intent,
        "actor_scope": actor_scope,
        "language": language,
        "generated_at": timezone.now().isoformat(),
        "intent_instruction": INTENT_INSTRUCTIONS.get(intent, ""),
        "data": data,
        "sources": _dedupe_sources(sources or []),
        "suggested_actions": _dedupe_actions(suggested_actions or []),
        "skip_llm": skip_llm,
        "max_tokens": max_tokens,
    })


def _build_volunteer_next_steps(actor: Any, scope: str, language: str) -> Dict[str, Any]:
    apps = list(
        EventApplications.objects.filter(user_id=actor.id, event__deleted_at__isnull=True)
        .select_related("event", "post")
        .order_by("-applied_at")[:MAX_RECORDS]
    )
    assignments = list(
        Assignments.objects.filter(user_id=actor.id, event__deleted_at__isnull=True)
        .select_related("event", "post")
        .order_by("-created_at")[:MAX_RECORDS]
    )
    att_map = _attendance_map_for_assignments(actor, [a.id for a in assignments])
    active_assignment_app_ids = {
        a.application_id for a in assignments if a.status != "cancelled"
    }
    accepted_without_assignment = [
        app for app in apps
        if app.status == "accepted" and app.id not in active_assignment_app_ids
    ]

    summary = {
        "total_applications": len(apps),
        "pending_applications": sum(1 for a in apps if a.status == "pending"),
        "accepted_applications": sum(1 for a in apps if a.status == "accepted"),
        "waitlisted_applications": sum(1 for a in apps if a.status == "waitlisted"),
        "active_assignments": sum(1 for a in assignments if a.status in ("assigned", "confirmed")),
        "accepted_without_assignment": len(accepted_without_assignment),
    }

    sources: List[Dict[str, Any]] = []
    actions: List[Dict[str, Any]] = []
    for app in apps[:3]:
        title = app.event.title if app.event else f"Event #{app.event_id}"
        sources.append({"type": "application", "id": app.id, "label": _clip(title, 120)})
        actions.append({"type": "open_event", "event_id": app.event_id, "label": _clip(title, 60)})
    for asgn in assignments[:3]:
        title = asgn.event.title if asgn.event else f"Event #{asgn.event_id}"
        sources.append({"type": "assignment", "id": asgn.id, "label": _clip(title, 120)})
    if apps:
        actions.append({"type": "open_applications", "label": "Open My Applications"})
    if assignments:
        actions.append({"type": "open_assignments", "label": "Open My Assignments"})
    if not apps and not assignments:
        actions.append({"type": "open_events", "label": "Browse Upcoming Events"})

    return _build_dto(
        intent="volunteer.next_steps",
        actor_scope=scope,
        language=language,
        data={
            "summary": summary,
            "applications": [_serialize_application(a) for a in apps],
            "assignments": [_serialize_assignment(a, att_map.get(a.id)) for a in assignments],
        },
        sources=sources,
        suggested_actions=actions,
        skip_llm=(not apps and not assignments),
    )


def _build_volunteer_applications(actor: Any, scope: str, language: str) -> Dict[str, Any]:
    apps = list(
        EventApplications.objects.filter(user_id=actor.id, event__deleted_at__isnull=True)
        .select_related("event", "post")
        .order_by("-applied_at")[:MAX_RECORDS]
    )
    sources = [
        {
            "type": "application",
            "id": a.id,
            "label": _clip(a.event.title if a.event else f"Event #{a.event_id}", 120),
        }
        for a in apps[:5]
    ]
    actions = [
        {
            "type": "open_event",
            "event_id": a.event_id,
            "label": _clip(a.event.title if a.event else f"Event #{a.event_id}", 60),
        }
        for a in apps[:3]
    ]
    if apps:
        actions.append({"type": "open_applications", "label": "Open My Applications"})
    else:
        actions.append({"type": "open_events", "label": "Browse Upcoming Events"})

    return _build_dto(
        intent="volunteer.my_applications",
        actor_scope=scope,
        language=language,
        data={"applications": [_serialize_application(a) for a in apps]},
        sources=sources,
        suggested_actions=actions,
        skip_llm=(len(apps) == 0),
    )


def _build_volunteer_assignments(actor: Any, scope: str, language: str) -> Dict[str, Any]:
    assignments = list(
        Assignments.objects.filter(user_id=actor.id, event__deleted_at__isnull=True)
        .select_related("event", "post")
        .order_by("-created_at")[:MAX_RECORDS]
    )
    att_map = _attendance_map_for_assignments(actor, [a.id for a in assignments])
    sources = [
        {
            "type": "assignment",
            "id": a.id,
            "label": _clip(a.event.title if a.event else f"Event #{a.event_id}", 120),
        }
        for a in assignments[:5]
    ]
    actions = [
        {
            "type": "open_event",
            "event_id": a.event_id,
            "label": _clip(a.event.title if a.event else f"Event #{a.event_id}", 60),
        }
        for a in assignments[:3]
    ]
    if assignments:
        actions.append({"type": "open_assignments", "label": "Open My Assignments"})
    else:
        actions.append({"type": "open_events", "label": "Browse Upcoming Events"})

    return _build_dto(
        intent="volunteer.my_assignments",
        actor_scope=scope,
        language=language,
        data={"assignments": [_serialize_assignment(a, att_map.get(a.id)) for a in assignments]},
        sources=sources,
        suggested_actions=actions,
        skip_llm=(len(assignments) == 0),
    )


def _build_volunteer_recommendations(actor: Any, scope: str, language: str) -> Dict[str, Any]:
    raw = recommendation_service.get_recommendations_for_user(actor, limit=5)
    results = []
    sources = []
    actions = []
    for item in raw.get("results", [])[:5]:
        ev = item.get("event", {})
        event_id = ev.get("event_id")
        title = _clip(ev.get("title"), 150)
        results.append({
            "event_id": event_id,
            "title": title,
            "start_at": ev.get("start_at"),
            "end_at": ev.get("end_at"),
            "location_name": _clip(ev.get("location_name"), 120),
            "spots_remaining": ev.get("spots_remaining", 0),
            "charity_fields": ev.get("charity_fields") or [],
            "match_score": item.get("match_score"),
            "match_label": item.get("match_label"),
            "reasons": (item.get("reasons") or [])[:5],
        })
        if event_id:
            sources.append({"type": "event", "id": event_id, "label": title})
            actions.append({"type": "open_event", "event_id": event_id, "label": _clip(title, 60)})

    return _build_dto(
        intent="volunteer.recommendations",
        actor_scope=scope,
        language=language,
        data={
            "policy_version": raw.get("policy_version", recommendation_service.POLICY_VERSION),
            "results": results,
        },
        sources=sources,
        suggested_actions=actions or [{"type": "open_events", "label": "Browse Upcoming Events"}],
        skip_llm=(len(results) == 0),
    )


def _build_volunteer_prepare(actor: Any, scope: str, language: str) -> Dict[str, Any]:
    now = timezone.now()
    upcoming = list(
        Assignments.objects.filter(
            user_id=actor.id,
            status__in=["assigned", "confirmed"],
            schedule_end__gt=now,
            event__deleted_at__isnull=True,
        )
        .select_related("event", "post")
        .order_by("schedule_start", "id")[:3]
    )
    items = []
    sources = []
    actions = []
    for asgn in upcoming:
        ev = asgn.event
        items.append({
            "assignment_id": asgn.id,
            "assignment_status": asgn.status,
            "event_id": ev.id,
            "event_title": _clip(ev.title, 150),
            "post_title": _clip(asgn.post.title, 120) if asgn.post else None,
            "location_name": _clip(ev.location_name, 120),
            "start_at": _iso(ev.start_at),
            "end_at": _iso(ev.end_at),
            "schedule_start": _iso(asgn.schedule_start),
            "schedule_end": _iso(asgn.schedule_end),
            "geo_checkin_enabled": bool(ev.geo_checkin_enabled),
            "qr_registration_enabled": bool(ev.qr_registration_enabled),
            "geo_checkin_opens_before_min": int(ev.geo_checkin_opens_before_min),
            "require_checkin_confirmation": bool(ev.require_checkin_confirmation),
            "require_onboarding_ack": bool(ev.require_onboarding_ack),
            "onboarding_text": _clip(ev.onboarding_text, 300) if ev.onboarding_text else None,
            "meals_provided": bool(ev.meals_provided),
            "lodging_provided": bool(ev.lodging_provided),
            "travel_support_provided": bool(ev.travel_support_provided),
        })
        sources.append({"type": "event", "id": ev.id, "label": _clip(ev.title, 120)})
        actions.append({"type": "open_event", "event_id": ev.id, "label": _clip(ev.title, 60)})

    return _build_dto(
        intent="volunteer.prepare_for_event",
        actor_scope=scope,
        language=language,
        data={"upcoming_assignments": items},
        sources=sources,
        suggested_actions=actions or [{"type": "open_assignments", "label": "Open My Assignments"}],
        skip_llm=(len(items) == 0),
    )


def _build_checkin_help(actor: Any, scope: str, language: str) -> Dict[str, Any]:
    policy = get_system_help_content("checkin")
    now = timezone.now()
    next_assignment = (
        Assignments.objects.filter(
            user_id=actor.id,
            status__in=["assigned", "confirmed"],
            schedule_end__gt=now,
            event__deleted_at__isnull=True,
        )
        .select_related("event", "post")
        .order_by("schedule_start", "id")
        .first()
    )
    event_setup = None
    sources = [{"type": "policy", "label": "VCS Check-In Policy"}]
    actions: List[Dict[str, Any]] = []
    if next_assignment and next_assignment.event:
        ev = next_assignment.event
        event_setup = {
            "event_id": ev.id,
            "event_title": _clip(ev.title, 150),
            "geo_checkin_enabled": bool(ev.geo_checkin_enabled),
            "qr_registration_enabled": bool(ev.qr_registration_enabled),
            "geo_checkin_opens_before_min": int(ev.geo_checkin_opens_before_min),
            "require_checkin_confirmation": bool(ev.require_checkin_confirmation),
            "require_onboarding_ack": bool(ev.require_onboarding_ack),
        }
        sources.append({"type": "event", "id": ev.id, "label": _clip(ev.title, 120)})
        actions.append({"type": "open_event", "event_id": ev.id, "label": _clip(ev.title, 60)})

    return _build_dto(
        intent="volunteer.checkin_help",
        actor_scope=scope,
        language=language,
        data={
            "policy": policy,
            "upcoming_event_checkin": event_setup,
        },
        sources=sources,
        suggested_actions=actions,
    )


def _build_policy_help(intent: str, scope: str, language: str, topic: Optional[str]) -> Dict[str, Any]:
    policy = get_system_help_content(topic or "general")
    return _build_dto(
        intent=intent,
        actor_scope=scope,
        language=language,
        data={"policy": policy},
        sources=[{"type": "policy", "label": f"VCS Policy ({policy['topic']})"}],
        suggested_actions=[],
    )


def _build_public_events(intent: str, scope: str, language: str, search_query: Optional[str]) -> Dict[str, Any]:
    filters: Dict[str, Any] = {"upcoming": True}
    if search_query:
        cleaned_query = search_query.strip()[:100]
        # Only pass search query when it is not a generic menu phrase
        generic_terms = {
            "browse public upcoming events", "upcoming events", "public events",
            "events", "find events", "search events", "browse events",
        }
        if cleaned_query.lower().rstrip(".?") not in generic_terms and len(cleaned_query.split()) <= 3:
            filters["search"] = cleaned_query

    events = list(query_service.list_public_events(filters)[:5])
    if not events and "search" in filters:
        events = list(query_service.list_public_events({"upcoming": True})[:5])

    items = []
    sources = []
    actions = []
    for ev in events:
        items.append({
            "event_id": ev.event_id,
            "title": _clip(ev.title, 150),
            "description": _clip(ev.description, MAX_TEXT_LEN),
            "location_name": _clip(ev.location_name, 120),
            "start_at": _iso(ev.start_at),
            "end_at": _iso(ev.end_at),
            "spots_remaining": int(ev.spots_remaining or 0),
            "charity_fields": ev.charity_fields or [],
        })
        sources.append({"type": "event", "id": ev.event_id, "label": _clip(ev.title, 120)})
        actions.append({"type": "open_event", "event_id": ev.event_id, "label": _clip(ev.title, 60)})

    return _build_dto(
        intent=intent,
        actor_scope=scope,
        language=language,
        data={"events": items},
        sources=sources,
        suggested_actions=actions,
        skip_llm=(len(items) == 0),
    )


def _build_public_event_detail(scope: str, language: str, event_id: Optional[int]) -> Dict[str, Any]:
    if not event_id:
        return _build_dto(
            intent="public.event_detail",
            actor_scope=scope,
            language=language,
            data={"clarification_needed": True, "reason": "Please specify which event ID you want to inspect."},
            skip_llm=True,
        )
    ev = query_service.get_public_event(event_id)
    posts = query_service.get_event_posts(event_id, verified_visible=True)
    return _build_dto(
        intent="public.event_detail",
        actor_scope=scope,
        language=language,
        data={
            "event": {
                "event_id": ev.event_id,
                "title": _clip(ev.title, 150),
                "description": _clip(ev.description, MAX_TEXT_LEN),
                "purpose_type": ev.purpose_type,
                "location_name": _clip(ev.location_name, 120),
                "start_at": _iso(ev.start_at),
                "end_at": _iso(ev.end_at),
                "application_deadline": _iso(ev.application_deadline),
                "status": ev.status,
                "spots_remaining": int(ev.spots_remaining or 0),
                "geo_checkin_enabled": bool(ev.geo_checkin_enabled),
            },
            "posts": [
                {
                    "id": p.get("id"),
                    "title": _clip(p.get("title"), 120),
                    "status": p.get("status"),
                    "required_skills": p.get("required_skills") or [],
                    "required_headcount": p.get("required_headcount", 0),
                    "assigned_count": p.get("assigned_count", 0),
                    "remaining": p.get("remaining", 0),
                }
                for p in posts[:MAX_RECORDS]
            ],
        },
        sources=[{"type": "event", "id": ev.event_id, "label": _clip(ev.title, 120)}],
        suggested_actions=[{"type": "open_event", "event_id": ev.event_id, "label": _clip(ev.title, 60)}],
    )


def _build_coordinator_my_events(actor: Any, scope: str, language: str) -> Dict[str, Any]:
    events = list(_managed_events_queryset(actor)[:MAX_RECORDS])
    summaries = {
        s.event_id: s
        for s in VEventSummary.objects.filter(event_id__in=[e.id for e in events])
    }
    items = []
    sources = []
    actions = []
    for ev in events:
        s = summaries.get(ev.id)
        is_monitor = bool(ev.owner_id == actor.id and ev.current_coordinator_id != actor.id)
        items.append({
            "event_id": ev.id,
            "title": _clip(ev.title, 150),
            "status": ev.status,
            "start_at": _iso(ev.start_at),
            "end_at": _iso(ev.end_at),
            "is_read_only_monitor": is_monitor,
            "pending_applications": s.pending_count if s else 0,
            "accepted_applications": s.accepted_count if s else 0,
            "waitlisted_applications": s.waitlisted_count if s else 0,
            "assigned_count": s.assignment_count if s else 0,
            "checked_in_count": s.checked_in_count if s else 0,
            "pending_confirmations": s.pending_confirmations if s else 0,
        })
        sources.append({"type": "event", "id": ev.id, "label": _clip(ev.title, 120)})
        actions.append({"type": "open_staffing", "event_id": ev.id, "label": _clip(ev.title, 60)})

    if events:
        actions.append({"type": "open_coordinator_events", "label": "Open Managed Events"})

    return _build_dto(
        intent="coordinator.my_events",
        actor_scope=scope,
        language=language,
        data={"events": items},
        sources=sources[:5],
        suggested_actions=actions[:4],
        skip_llm=(len(items) == 0),
        max_tokens=350,
    )


def _build_coordinator_next_steps(actor: Any, scope: str, language: str) -> Dict[str, Any]:
    events = list(_managed_events_queryset(actor).exclude(status__in=["completed", "cancelled"])[:MAX_SUMMARY_EVENTS])
    if not events:
        events = list(_managed_events_queryset(actor)[:MAX_SUMMARY_EVENTS])

    items = []
    sources = []
    actions = []
    for ev in events:
        insight = staffing_insight_service.get_staffing_insight(ev.id)
        summary = insight.get("summary", {})
        is_monitor = bool(ev.owner_id == actor.id and ev.current_coordinator_id != actor.id)
        items.append({
            "event_id": ev.id,
            "event_title": _clip(ev.title, 150),
            "event_status": ev.status,
            "start_at": _iso(ev.start_at),
            "is_read_only_monitor": is_monitor,
            "readiness_status": insight.get("readiness_status"),
            "required_headcount": summary.get("required_headcount", 0),
            "assigned_count": summary.get("assigned_count", 0),
            "open_slots": summary.get("open_slots", 0),
            "accepted_unassigned": summary.get("accepted_unassigned", 0),
            "pending_applications": summary.get("pending_applications", 0),
            "pending_confirmations": summary.get("pending_confirmations", 0),
            "signals": [
                {"code": sig.get("code"), "severity": sig.get("severity"), "title": sig.get("title")}
                for sig in insight.get("signals", [])
            ],
        })
        sources.append({"type": "staffing_insight", "id": ev.id, "label": _clip(ev.title, 120)})
        actions.append({"type": "open_staffing", "event_id": ev.id, "label": _clip(ev.title, 60)})

    return _build_dto(
        intent="coordinator.next_steps",
        actor_scope=scope,
        language=language,
        data={"managed_events": items},
        sources=sources,
        suggested_actions=actions[:4],
        skip_llm=(len(items) == 0),
        max_tokens=350,
    )


def _build_staffing_dto(
    actor: Any,
    scope: str,
    intent: str,
    language: str,
    event_id: Optional[int],
) -> Dict[str, Any]:
    if scope == ACTOR_SCOPE_COORDINATOR:
        if event_id is None:
            managed = list(_managed_events_queryset(actor)[:MAX_SUMMARY_EVENTS])
            if not managed:
                return _build_dto(
                    intent=intent,
                    actor_scope=scope,
                    language=language,
                    data={"events": [], "empty": True},
                    skip_llm=True,
                )
            if len(managed) == 1:
                event_id = managed[0].id
            else:
                choices = [
                    {
                        "event_id": ev.id,
                        "event_title": _clip(ev.title, 120),
                        "status": ev.status,
                        "start_at": _iso(ev.start_at),
                    }
                    for ev in managed
                ]
                return _build_dto(
                    intent=intent,
                    actor_scope=scope,
                    language=language,
                    data={"clarification_needed": True, "event_choices": choices},
                    sources=[{"type": "staffing_insight", "id": ev.id, "label": _clip(ev.title, 120)} for ev in managed],
                    suggested_actions=[{"type": "open_staffing", "event_id": ev.id, "label": _clip(ev.title, 60)} for ev in managed[:4]],
                    skip_llm=True,
                )

        ev = get_event_for_manager_or_404(actor, int(event_id), require_write=False)
        is_monitor = bool(ev.owner_id == actor.id and ev.current_coordinator_id != actor.id)
    elif scope == ACTOR_SCOPE_SUPER_ADMIN:
        if event_id is None:
            candidate_events = list(
                Events.objects.filter(deleted_at__isnull=True).order_by("start_at", "id")[:MAX_SUMMARY_EVENTS]
            )
            choices = [
                {
                    "event_id": ev.id,
                    "event_title": _clip(ev.title, 120),
                    "status": ev.status,
                    "start_at": _iso(ev.start_at),
                }
                for ev in candidate_events
            ]
            return _build_dto(
                intent=intent,
                actor_scope=scope,
                language=language,
                data={"clarification_needed": True, "event_choices": choices},
                sources=[{"type": "staffing_insight", "id": ev.id, "label": _clip(ev.title, 120)} for ev in candidate_events],
                suggested_actions=[{"type": "open_staffing", "event_id": ev.id, "label": _clip(ev.title, 60)} for ev in candidate_events[:4]],
                skip_llm=True,
            )
        if not Events.objects.filter(id=int(event_id), deleted_at__isnull=True).exists():
            raise ResourceMaskedNotFound(message="Event not found.")
        is_monitor = False
    else:
        raise PermissionDenied("This assistant action is not available for your account.")

    insight = staffing_insight_service.get_staffing_insight(int(event_id))
    title = _clip(insight.get("event_title") or f"Event #{event_id}", 150)
    return _build_dto(
        intent=intent,
        actor_scope=scope,
        language=language,
        data={
            "event_id": insight.get("event_id"),
            "event_title": title,
            "event_status": insight.get("event_status"),
            "start_at": insight.get("start_at"),
            "is_read_only_monitor": is_monitor,
            "readiness_status": insight.get("readiness_status"),
            "summary": insight.get("summary", {}),
            "posts": [
                {
                    "post_id": p.get("post_id"),
                    "title": _clip(p.get("title"), 120),
                    "status": p.get("status"),
                    "required_headcount": p.get("required_headcount", 0),
                    "assigned_count": p.get("assigned_count", 0),
                    "remaining": p.get("remaining", 0),
                }
                for p in (insight.get("posts") or [])[:MAX_RECORDS]
            ],
            "signals": insight.get("signals", []),
            "insight_generated_at": insight.get("generated_at"),
        },
        sources=[{"type": "staffing_insight", "id": int(event_id), "label": title}],
        suggested_actions=[{"type": "open_staffing", "event_id": int(event_id), "label": _clip(title, 60)}],
        max_tokens=320,
    )


def _build_coordinator_pending_applications(actor: Any, scope: str, language: str) -> Dict[str, Any]:
    managed_ids = list(_managed_events_queryset(actor).values_list("id", flat=True))
    if not managed_ids:
        return _build_dto(
            intent="coordinator.pending_applications",
            actor_scope=scope,
            language=language,
            data={"pending_applications": [], "waitlisted_count": 0},
            skip_llm=True,
        )
    pending_apps = list(
        EventApplications.objects.filter(event_id__in=managed_ids, status="pending")
        .select_related("event", "post")
        .order_by("applied_at")[:MAX_RECORDS]
    )
    waitlisted_count = EventApplications.objects.filter(
        event_id__in=managed_ids,
        status="waitlisted",
    ).count()
    items = []
    sources = []
    actions = []
    for app in pending_apps:
        ev = app.event
        is_monitor = bool(ev.owner_id == actor.id and ev.current_coordinator_id != actor.id)
        items.append({
            "application_id": app.id,
            "event_id": app.event_id,
            "event_title": _clip(ev.title, 150),
            "post_title": _clip(app.post.title, 120) if app.post else None,
            "source": app.source,
            "applied_at": _iso(app.applied_at),
            "is_read_only_monitor": is_monitor,
        })
        sources.append({"type": "event", "id": app.event_id, "label": _clip(ev.title, 120)})
        actions.append({"type": "open_staffing", "event_id": app.event_id, "label": _clip(ev.title, 60)})
    if pending_apps:
        actions.append({"type": "open_coordinator_applications", "label": "Review Applications"})

    return _build_dto(
        intent="coordinator.pending_applications",
        actor_scope=scope,
        language=language,
        data={
            "pending_applications": items,
            "waitlisted_count": waitlisted_count,
        },
        sources=sources[:5],
        suggested_actions=actions[:4],
        skip_llm=(len(items) == 0 and waitlisted_count == 0),
    )


def _build_coordinator_unassigned_accepted(actor: Any, scope: str, language: str) -> Dict[str, Any]:
    managed_ids = list(_managed_events_queryset(actor).values_list("id", flat=True))
    if not managed_ids:
        return _build_dto(
            intent="coordinator.unassigned_accepted",
            actor_scope=scope,
            language=language,
            data={"unassigned_accepted": []},
            skip_llm=True,
        )
    assigned_app_ids = set(
        Assignments.objects.filter(
            event_id__in=managed_ids,
            status__in=["assigned", "confirmed", "completed"],
        ).values_list("application_id", flat=True)
    )
    rows = list(
        EventApplications.objects.filter(event_id__in=managed_ids, status="accepted")
        .exclude(id__in=assigned_app_ids)
        .select_related("event", "post")
        .order_by("applied_at")[:MAX_RECORDS]
    )
    items = []
    sources = []
    actions = []
    for app in rows:
        ev = app.event
        is_monitor = bool(ev.owner_id == actor.id and ev.current_coordinator_id != actor.id)
        items.append({
            "application_id": app.id,
            "event_id": app.event_id,
            "event_title": _clip(ev.title, 150),
            "post_title": _clip(app.post.title, 120) if app.post else None,
            "applied_at": _iso(app.applied_at),
            "is_read_only_monitor": is_monitor,
        })
        sources.append({"type": "event", "id": app.event_id, "label": _clip(ev.title, 120)})
        actions.append({"type": "open_staffing", "event_id": app.event_id, "label": _clip(ev.title, 60)})
    if rows:
        actions.append({"type": "open_coordinator_assignments", "label": "Open Assignments"})

    return _build_dto(
        intent="coordinator.unassigned_accepted",
        actor_scope=scope,
        language=language,
        data={"unassigned_accepted": items},
        sources=sources[:5],
        suggested_actions=actions[:4],
        skip_llm=(len(items) == 0),
    )


def build_intent_context(
    actor: Any,
    actor_scope: str,
    resolution: IntentResolution,
    language: str = "en",
) -> Dict[str, Any]:
    """
    Build an allowlisted, redacted, read-only context DTO for one resolved intent.
    Returns deterministic short-circuit DTOs when clarification/no-data applies.
    """
    lang = "my" if str(language or "en").lower().startswith("my") else "en"

    if resolution.status in ("clarification", "unavailable"):
        catalog = get_prompt_catalog_for_actor(actor, language=lang)
        available_prompts = [p for p in catalog["prompts"] if p.get("available")]
        if resolution.candidates:
            candidate_prompts = [p for p in available_prompts if p["key"] in resolution.candidates]
        else:
            candidate_prompts = available_prompts[:4]
        return _build_dto(
            intent=resolution.intent,
            actor_scope=actor_scope,
            language=lang,
            data={
                "status": resolution.status,
                "reason": resolution.reason,
                "choices": [
                    {"key": p["key"], "label": p["label"]}
                    for p in candidate_prompts
                ],
            },
            skip_llm=True,
        )

    intent = resolution.intent
    if not is_intent_allowed_for_scope(actor_scope, intent):
        raise PermissionDenied("This assistant action is not available for your account.")

    if intent == "volunteer.next_steps":
        return _build_volunteer_next_steps(actor, actor_scope, lang)
    if intent == "volunteer.my_applications":
        return _build_volunteer_applications(actor, actor_scope, lang)
    if intent == "volunteer.my_assignments":
        return _build_volunteer_assignments(actor, actor_scope, lang)
    if intent == "volunteer.recommendations":
        return _build_volunteer_recommendations(actor, actor_scope, lang)
    if intent == "volunteer.prepare_for_event":
        return _build_volunteer_prepare(actor, actor_scope, lang)
    if intent == "volunteer.checkin_help":
        return _build_checkin_help(actor, actor_scope, lang)
    if intent in ("volunteer.policy_help", "admin.policy_help", "super_admin.policy_help"):
        return _build_policy_help(intent, actor_scope, lang, resolution.topic)
    if intent in ("public.events", "admin.public_events", "super_admin.public_events"):
        return _build_public_events(intent, actor_scope, lang, resolution.search_query)
    if intent == "public.event_detail":
        return _build_public_event_detail(actor_scope, lang, resolution.event_id)
    if intent == "coordinator.my_events":
        return _build_coordinator_my_events(actor, actor_scope, lang)
    if intent == "coordinator.next_steps":
        return _build_coordinator_next_steps(actor, actor_scope, lang)
    if intent in ("coordinator.staffing", "coordinator.event_readiness", "super_admin.event_staffing"):
        return _build_staffing_dto(actor, actor_scope, intent, lang, resolution.event_id)
    if intent == "coordinator.pending_applications":
        return _build_coordinator_pending_applications(actor, actor_scope, lang)
    if intent == "coordinator.unassigned_accepted":
        return _build_coordinator_unassigned_accepted(actor, actor_scope, lang)

    raise PermissionDenied("Unknown or unavailable assistant intent.")
