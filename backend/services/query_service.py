"""
services/query_service.py

Read-oriented query services for public browsing and event inspection.

Database-first rules honoured here:
- Event visibility comes from v_public_events (published/active, not deleted).
  This service never re-implements that filter.
- Capacity (assigned_count / remaining / spots_remaining) comes from
  v_event_post_capacity and v_public_events. It is NEVER recomputed in Python.
- Summary counts come from v_event_summary.

Only filtering, sorting, and lookup orchestration live here.
"""

from __future__ import annotations

from typing import Any

from django.db.models import Q, QuerySet
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.events.models import (
    EventPosts,
    VEventPostCapacity,
    VEventSummary,
    VPublicEvents,
)
from common.exceptions import DomainError, ResourceMaskedNotFound

# The single field used to look up an event.
EVENT_LOOKUP_FIELD = "event_id"

# --- Allow-lists (prevent arbitrary field injection) -----------------------

EXACT_FILTERS = {
    "purpose_type": "purpose_type",
    "acceptance_mode": "acceptance_mode",
    "compensation_kind": "compensation_kind",
    "map_provider": "map_provider",
    "status": "status",
}

BOOLEAN_FILTERS = {
    "meals_provided": "meals_provided",
    "lodging_provided": "lodging_provided",
    "travel_support_provided": "travel_support_provided",
    "geo_checkin_enabled": "geo_checkin_enabled",
}

# Recognised query params handled explicitly or by the caller/paginator
SPECIAL_PARAMS = {
    "search",
    "charity_field",
    "starts_after",
    "starts_before",
    "upcoming",
    "sort",
    "page",
    "page_size",
}

SORT_FIELDS = {
    "start_at": "start_at",
    "-start_at": "-start_at",
    "end_at": "end_at",
    "-end_at": "-end_at",
    "title": "title",
    "-title": "-title",
    "spots_remaining": "spots_remaining",
    "-spots_remaining": "-spots_remaining",
}
DEFAULT_SORT = "start_at"


def _invalid(message: str) -> DomainError:
    return DomainError(code="invalid_filter", message=message, status_code=400)


def _parse_bool(value: Any, param: str) -> bool:
    text = str(value).strip().lower()
    if text in {"true", "1", "yes"}:
        return True
    if text in {"false", "0", "no"}:
        return False
    raise _invalid(f"Invalid boolean value for '{param}'.")


def _parse_datetime(value: Any, param: str):
    parsed = parse_datetime(str(value))
    if parsed is None:
        raise _invalid(f"Invalid datetime for '{param}'. Use ISO-8601.")
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.utc)
    return parsed


# --- Public event browsing -------------------------------------------------

def list_public_events(params: dict[str, Any]) -> QuerySet:
    """Return the filtered, sorted queryset of publicly visible events.

    Visibility is enforced by v_public_events. Unknown filter keys or an
    unknown sort field raise a 400 DomainError.
    """
    qs = VPublicEvents.objects.all()

    for key, value in params.items():
        if value in (None, ""):
            continue

        if key in EXACT_FILTERS:
            qs = qs.filter(**{EXACT_FILTERS[key]: value})
        elif key in BOOLEAN_FILTERS:
            qs = qs.filter(**{BOOLEAN_FILTERS[key]: _parse_bool(value, key)})
        elif key == "search":
            term = str(value).strip()
            if term:
                qs = qs.filter(
                    Q(title__icontains=term)
                    | Q(description__icontains=term)
                    | Q(location_name__icontains=term)
                )
        elif key == "charity_field":
            qs = qs.filter(charity_fields__contains=[str(value)])
        elif key == "starts_after":
            qs = qs.filter(start_at__gte=_parse_datetime(value, key))
        elif key == "starts_before":
            qs = qs.filter(start_at__lte=_parse_datetime(value, key))
        elif key == "upcoming":
            if _parse_bool(value, key):
                qs = qs.filter(start_at__gte=timezone.now())
        elif key in SPECIAL_PARAMS:
            continue
        else:
            raise _invalid(f"Unsupported filter '{key}'.")

    sort = params.get("sort") or DEFAULT_SORT
    if sort not in SORT_FIELDS:
        raise _invalid(f"Unsupported sort field '{sort}'.")

    # Secondary tie-breaker keeps pagination deterministic
    return qs.order_by(SORT_FIELDS[sort], EVENT_LOOKUP_FIELD)


# --- Event detail ----------------------------------------------------------

def get_public_event(event_id: int | str) -> VPublicEvents:
    """Return a publicly visible event or raise a masked 404.

    Because v_public_events only contains published/active, non-deleted
    events, draft/cancelled/completed/deleted events naturally 404 here.
    """
    try:
        eid = int(event_id)
        return VPublicEvents.objects.get(event_id=eid)
    except (ValueError, TypeError, VPublicEvents.DoesNotExist):
        raise ResourceMaskedNotFound(message="The requested event was not found.")


def get_event_posts(event_id: int | str) -> list[dict[str, Any]]:
    """Return posts (with capacity from v_event_post_capacity) for a public event.

    Raises a masked 404 if the event is not publicly visible.
    """
    event = get_public_event(event_id)
    eid = event.event_id

    capacity = {
        row.post_id: row
        for row in VEventPostCapacity.objects.filter(event_id=eid)
    }
    posts = EventPosts.objects.filter(event_id=eid).order_by("priority", "id")

    result = []
    for post in posts:
        cap = capacity.get(post.id)
        result.append({
            "id": post.id,
            "title": post.title,
            "description": post.description,
            "status": cap.status if cap else post.status,
            "physical_level": post.physical_level,
            "required_skills": list(post.required_skills or []),
            "leader_needed": post.leader_needed,
            "new_volunteers_allowed": post.new_volunteers_allowed,
            "required_headcount": post.required_headcount,
            "assigned_count": int(cap.assigned_count) if cap else 0,
            "remaining": int(cap.remaining) if cap else post.required_headcount,
        })
    return result


# --- Event summary (coordinator/manager-scoped, NOT public) ----------------

def get_event_summary(event_id: int | str) -> VEventSummary:
    """Return v_event_summary for an event.

    v_event_summary includes draft events and internal IDs, so callers MUST
    gate this behind event-manager permission. This function performs no
    authorization itself.
    """
    try:
        eid = int(event_id)
        return VEventSummary.objects.get(event_id=eid)
    except (ValueError, TypeError, VEventSummary.DoesNotExist):
        raise ResourceMaskedNotFound(message="The requested event was not found.")


# --- Admin Dashboard & Moderation Summary (administrative) -------------------

def get_admin_dashboard() -> dict:
    """Return the single-row v_admin_dashboard. No Python recalculation."""
    from apps.audit.models import VAdminDashboard
    row = VAdminDashboard.objects.first()
    if row is None:
        return {}
    return {
        "active_users": row.active_users,
        "blocked_users": row.blocked_users,
        "users_pending_verification": row.users_pending_verification,
        "images_pending_review": row.images_pending_review,
        "coordinators_pending_approval": row.coordinators_pending_approval,
        "coordinators_approved": row.coordinators_approved,
        "events_draft": row.events_draft,
        "events_published": row.events_published,
        "events_active": row.events_active,
        "events_completed": row.events_completed,
        "events_cancelled": row.events_cancelled,
        "events_deleted": row.events_deleted,
        "pending_checkin_confirmations": row.pending_checkin_confirmations,
        "warnings_last_30d": row.warnings_last_30d,
    }


def get_user_moderation_summary(user_id: int) -> dict | None:
    """Return v_user_moderation_summary for a single user."""
    from apps.audit.models import VUserModerationSummary
    row = VUserModerationSummary.objects.filter(user_id=user_id).first()
    if row is None:
        return None
    return {
        "user_id": row.user_id,
        "warning_count": row.warning_count,
        "last_warning_at": row.last_warning_at,
        "block_count": row.block_count,
        "last_block_at": row.last_block_at,
    }


