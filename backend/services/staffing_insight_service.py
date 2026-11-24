"""
services/staffing_insight_service.py

Feature 2: Event staffing gap and coverage insight engine.
Deterministic, rule-based operational metrics and signals for coordinators and admins.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from datetime import timedelta
from django.utils import timezone

from apps.events.models import Events, VEventSummary, VEventPostCapacity, EventApplications
from apps.coordination.models import Assignments
from common.exceptions import ResourceMaskedNotFound

logger = logging.getLogger(__name__)


def get_staffing_insight(event_id: int) -> Dict[str, Any]:
    """
    Computes staffing gap metrics, post breakdowns, and urgency signals
    using authoritative database views (VEventSummary, VEventPostCapacity).
    """
    try:
        event = Events.objects.get(id=event_id, deleted_at__isnull=True)
    except Events.DoesNotExist:
        raise ResourceMaskedNotFound(message="Event not found.")

    try:
        summary = VEventSummary.objects.get(event_id=event_id)
    except VEventSummary.DoesNotExist:
        summary = None

    post_capacities = list(VEventPostCapacity.objects.filter(event_id=event_id))

    required_headcount = sum(p.required_headcount for p in post_capacities)
    assigned_count = summary.assignment_count if summary else sum(p.assigned_count for p in post_capacities)
    open_slots = sum(max(p.remaining, 0) for p in post_capacities if p.status == "open")

    # Accepted applications that are not yet assigned
    assigned_app_ids = set(
        Assignments.objects.filter(
            event_id=event_id,
            status__in=["assigned", "confirmed"],
        ).values_list("application_id", flat=True)
    )
    accepted_apps_count = EventApplications.objects.filter(
        event_id=event_id,
        status="accepted",
    ).exclude(id__in=assigned_app_ids).count()

    pending_count = summary.pending_count if summary else EventApplications.objects.filter(event_id=event_id, status="pending").count()
    waitlisted_count = summary.waitlisted_count if summary else EventApplications.objects.filter(event_id=event_id, status="waitlisted").count()
    checked_in_count = summary.checked_in_count if summary else 0
    pending_confirmations = summary.pending_confirmations if summary else 0

    if required_headcount > 0:
        coverage_percent = round((assigned_count / required_headcount) * 100.0, 1)
    else:
        coverage_percent = 100.0 if assigned_count > 0 else 0.0

    # Build post breakdown
    posts_data = []
    has_full_post = False
    has_remaining_post = False

    for p in post_capacities:
        posts_data.append({
            "post_id": p.post_id,
            "title": p.title,
            "status": p.status,
            "required_headcount": p.required_headcount,
            "assigned_count": p.assigned_count,
            "remaining": p.remaining,
        })
        if p.status == "open":
            if p.remaining == 0:
                has_full_post = True
            elif p.remaining > 0:
                has_remaining_post = True

    # Compute deterministic signals
    now = timezone.now()
    hours_until_start = (event.start_at - now).total_seconds() / 3600.0 if event.start_at else 999.0
    signals: List[Dict[str, Any]] = []

    if open_slots > 0:
        if 0 <= hours_until_start <= 72:
            signals.append({
                "code": "STAFFING_GAP_NEAR_START",
                "severity": "high",
                "title": "Open positions remain close to event start",
                "evidence": {
                    "open_slots": open_slots,
                    "hours_until_start": round(hours_until_start, 1),
                },
            })
        else:
            signals.append({
                "code": "STAFFING_GAP",
                "severity": "medium",
                "title": "Open headcount positions available",
                "evidence": {"open_slots": open_slots},
            })

    if accepted_apps_count > 0:
        signals.append({
            "code": "ACCEPTED_UNASSIGNED",
            "severity": "medium",
            "title": "Accepted volunteers awaiting post assignment",
            "evidence": {"accepted_unassigned": accepted_apps_count},
        })

    if pending_count > 0:
        deadline_passed = bool(event.application_deadline and event.application_deadline < now)
        if deadline_passed or (0 <= hours_until_start <= 48):
            signals.append({
                "code": "APPLICATION_BACKLOG",
                "severity": "high",
                "title": "Pending applications require review before event start",
                "evidence": {
                    "pending_applications": pending_count,
                    "deadline_passed": deadline_passed,
                },
            })

    if has_full_post and has_remaining_post:
        signals.append({
            "code": "POST_COVERAGE_IMBALANCE",
            "severity": "low",
            "title": "Some posts are full while others have remaining slots",
            "evidence": {},
        })

    # Compute readiness status
    deadline_passed = bool(event.application_deadline and event.application_deadline < now)
    deadline_within_48h = bool(event.application_deadline and 0 <= (event.application_deadline - now).total_seconds() <= 172800)
    has_open_gap = any(p.remaining > 0 for p in post_capacities if p.status == "open")

    if coverage_percent < 50.0 and (deadline_passed or deadline_within_48h or (0 <= hours_until_start <= 48)):
        readiness_status = "critical"
    elif coverage_percent < 80.0 or has_open_gap:
        readiness_status = "warning"
    else:
        readiness_status = "healthy"

    return {
        "event_id": event.id,
        "event_title": event.title,
        "event_status": event.status,
        "start_at": event.start_at.isoformat() if event.start_at else None,
        "readiness_status": readiness_status,
        "summary": {
            "required_headcount": required_headcount,
            "assigned_count": assigned_count,
            "open_slots": open_slots,
            "accepted_unassigned": accepted_apps_count,
            "pending_applications": pending_count,
            "waitlisted_applications": waitlisted_count,
            "checked_in_count": checked_in_count,
            "pending_confirmations": pending_confirmations,
            "coverage_percent": coverage_percent,
            "readiness_status": readiness_status,
        },
        "posts": posts_data,
        "signals": signals,
        "generated_at": now.isoformat(),
    }
