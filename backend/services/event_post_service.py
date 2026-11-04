"""
services/event_post_service.py

Event post (role) management: creation, editing, closure, and capacity.

Database-first rules honoured here:
- Post status open/full is maintained automatically by trg_01_posts_guard.
  Only 'closed' is set manually via close_event_post().
- Headcount cannot drop below active assignments (trigger-enforced).
- Post cannot move events (trigger-enforced).
- Capacity is read from v_event_post_capacity, never recomputed in Python.
"""
from __future__ import annotations

import logging
from typing import Optional

from apps.events.models import EventPosts, VEventPostCapacity
from common.exceptions import DomainError
from common.permissions import get_event_for_manager_or_404
from common.utils import normalize_tags

logger = logging.getLogger(__name__)

# Fields allowed on post creation/update (event, status, id excluded)
POST_EDITABLE_FIELDS = frozenset({
    "title", "description", "required_headcount", "physical_level",
    "required_skills", "leader_needed", "new_volunteers_allowed", "priority",
})

VALID_PHYSICAL_LEVELS = frozenset({"none", "light", "medium", "heavy"})


def _validate_post_data(validated_data: dict) -> dict:
    """Validate and normalize post fields."""
    unknown = set(validated_data.keys()) - POST_EDITABLE_FIELDS
    if unknown:
        raise DomainError(
            code="field_not_allowed",
            message=f"Unknown or non-editable post fields: {', '.join(sorted(unknown))}",
            status_code=400,
        )

    data = dict(validated_data)

    if "physical_level" in data and data["physical_level"] not in VALID_PHYSICAL_LEVELS:
        raise DomainError(
            code="invalid_physical_level",
            message=f"Invalid physical level '{data['physical_level']}'.",
            status_code=400,
        )

    if "required_skills" in data:
        data["required_skills"] = normalize_tags(data["required_skills"])

    if "required_headcount" in data and data["required_headcount"] < 1:
        raise DomainError(
            code="invalid_headcount",
            message="Required headcount must be at least 1.",
            status_code=400,
        )

    return data


# ---------------------------------------------------------------------------
# Post Creation
# ---------------------------------------------------------------------------

def create_event_post(actor, event_id: int, validated_data: dict) -> EventPosts:
    """
    Create a new post on an open event.

    The DB trigger trg_01_posts_guard verifies the event is open and the
    actor is a manager, and sets initial status to 'open'.
    """
    get_event_for_manager_or_404(actor, event_id, require_write=True)
    data = _validate_post_data(validated_data)

    post = EventPosts.objects.create(event_id=event_id, **data)
    post.refresh_from_db()

    logger.info("Event post created", extra={"post_id": post.id, "event_id": event_id})
    return post


# ---------------------------------------------------------------------------
# Post Update
# ---------------------------------------------------------------------------

def update_event_post(actor, post_id: int, validated_data: dict) -> EventPosts:
    """
    Update editable post fields. The trigger enforces headcount floor,
    event immutability, and manager permission.
    """
    try:
        post = EventPosts.objects.get(id=post_id)
    except EventPosts.DoesNotExist:
        raise DomainError(code="not_found", message="Post not found.", status_code=404)

    get_event_for_manager_or_404(actor, post.event_id, require_write=True)
    data = _validate_post_data(validated_data)

    for field, value in data.items():
        setattr(post, field, value)
    post.save()
    post.refresh_from_db()

    return post


# ---------------------------------------------------------------------------
# Post Closure
# ---------------------------------------------------------------------------

def close_event_post(actor, post_id: int) -> EventPosts:
    """
    Manually close a post. Only 'closed' is set manually; open/full are
    trigger-maintained.
    """
    try:
        post = EventPosts.objects.get(id=post_id)
    except EventPosts.DoesNotExist:
        raise DomainError(code="not_found", message="Post not found.", status_code=404)

    get_event_for_manager_or_404(actor, post.event_id, require_write=True)

    if post.status == "closed":
        return post  # idempotent

    post.status = "closed"
    post.save(update_fields=["status"])
    post.refresh_from_db()

    logger.info("Event post closed", extra={"post_id": post_id})
    return post


# ---------------------------------------------------------------------------
# Post Retrieval & Capacity
# ---------------------------------------------------------------------------

def get_event_posts_with_capacity(event_id: int) -> list[dict]:
    """
    Return all posts for an event with live capacity from v_event_post_capacity.
    Capacity is read from the SQL view, never recomputed.
    """
    capacity_map = {
        row.post_id: row
        for row in VEventPostCapacity.objects.filter(event_id=event_id)
    }
    posts = EventPosts.objects.filter(event_id=event_id).order_by("priority", "id")

    results = []
    for post in posts:
        cap = capacity_map.get(post.id)
        results.append({
            "id": post.id,
            "title": post.title,
            "description": post.description,
            "status": cap.status if cap else post.status,
            "physical_level": post.physical_level,
            "required_skills": list(post.required_skills or []),
            "leader_needed": post.leader_needed,
            "new_volunteers_allowed": post.new_volunteers_allowed,
            "priority": post.priority,
            "required_headcount": post.required_headcount,
            "assigned_count": int(cap.assigned_count) if cap else 0,
            "remaining": int(cap.remaining) if cap else post.required_headcount,
        })
    return results


def get_post_remaining_capacity(post_id: int) -> int:
    """Return remaining capacity for a single post from the SQL view."""
    cap = VEventPostCapacity.objects.filter(post_id=post_id).first()
    if cap is None:
        raise DomainError(code="not_found", message="Post not found.", status_code=404)
    return int(cap.remaining)

