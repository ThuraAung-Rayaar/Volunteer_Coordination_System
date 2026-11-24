"""
services/recommendation_service.py

Feature 1: Explainable volunteer-to-event recommendations.
Eligibility remains deterministic and database-authoritative. Ranking is advisory
only and never creates applications or assignments.
Policy version: recommendation-v1
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import (
    Users,
    UserCharityInterests,
    VolunteerAvailabilityExceptions,
    VolunteerAvailabilityRules,
)
from apps.events.models import (
    EventApplications,
    EventPosts,
    VEventPostCapacity,
    VPublicEvents,
)
from apps.coordination.models import Assignments
from services.application_service import check_user_availability_for_event

logger = logging.getLogger(__name__)
POLICY_VERSION = "recommendation-v1"

# Versioned weights; all five signals sum to 100.
WEIGHTS = {
    "skill_match": 35,
    "charity_interest": 25,
    "availability": 25,
    "region_fit": 10,
    "role_fit": 5,
}


def _normalise(values: Any) -> set[str]:
    return {
        str(value).strip().casefold()
        for value in (values or [])
        if str(value).strip()
    }


def get_recommendations_for_user(user: Users, limit: int = 10) -> Dict[str, Any]:
    """Return eligible events ranked by deterministic, explainable profile fit."""
    try:
        result_limit = max(1, min(int(limit), 10))
    except (TypeError, ValueError):
        result_limit = 10

    empty_result = {"results": [], "policy_version": POLICY_VERSION}
    if (
        not getattr(user, "is_authenticated", False)
        or not getattr(user, "is_active", False)
        or getattr(user, "account_status", "") != "active"
    ):
        return empty_result

    now = timezone.now()
    candidates = VPublicEvents.objects.filter(
        status__in=["published", "active"],
        end_at__gt=now,
        spots_remaining__gt=0,
    ).filter(
        Q(application_deadline__isnull=True) | Q(application_deadline__gt=now)
    ).order_by("start_at", "event_id")[:100]
    if not candidates:
        return empty_result

    applied_event_ids = set(
        EventApplications.objects.filter(
            user_id=user.id,
            status__in=["pending", "accepted"],
        ).values_list("event_id", flat=True)
    )
    assigned_event_ids = set(
        Assignments.objects.filter(
            user_id=user.id,
            status__in=["assigned", "confirmed"],
        ).values_list("event_id", flat=True)
    )
    excluded_event_ids = applied_event_ids | assigned_event_ids

    user_skills = _normalise(getattr(user, "skills", []))
    user_interests = _normalise(
        UserCharityInterests.objects.filter(user=user).values_list("field_code_id", flat=True)
    )
    user_home_area = (getattr(user, "home_area", "") or "").strip().casefold()
    user_is_new = bool(getattr(user, "new_to_volunteer", False))
    user_has_leader_experience = bool(getattr(user, "has_leader_experience", False))

    results: List[Dict[str, Any]] = []
    for event in candidates:
        if event.event_id in excluded_event_ids:
            continue

        # The PostgreSQL availability and conflict functions decide eligibility.
        # A database error is not interpreted as evidence that the volunteer fits.
        try:
            availability = check_user_availability_for_event(user, event.event_id)
        except Exception:
            logger.exception(
                "Recommendation availability check failed: user_id=%s event_id=%s",
                user.id,
                event.event_id,
            )
            continue

        if not availability.get("available", False) or availability.get("schedule_conflict", True):
            continue

        # A post must be open and have positive remaining capacity in the
        # database view, not merely have a stale/open model status.
        capacity_rows = {
            row.post_id: row
            for row in VEventPostCapacity.objects.filter(
                event_id=event.event_id,
                status="open",
                remaining__gt=0,
            )
        }
        if not capacity_rows:
            continue

        posts = list(
            EventPosts.objects.filter(
                event_id=event.event_id,
                status="open",
                id__in=list(capacity_rows.keys()),
            ).order_by("priority", "id")
        )
        if not posts:
            continue

        event_charities = _normalise(event.charity_fields)
        interest_overlap = user_interests.intersection(event_charities)
        interest_score = WEIGHTS["charity_interest"] if interest_overlap else 0

        event_location = (event.location_name or "").strip().casefold()
        region_match = bool(
            user_home_area
            and event_location
            and (
                user_home_area in event_location
                or event_location in user_home_area
            )
        )
        region_score = WEIGHTS["region_fit"] if region_match else 0

        # The SQL routine permits a user with no availability rules, but that
        # is not a positive preference signal and receives no ranking points.
        event_date = event.start_at.date()
        event_start_time = event.start_at.time()
        event_end_time = event.end_at.time() if event.end_at else event_start_time
        exception = VolunteerAvailabilityExceptions.objects.filter(
            user=user, date=event_date
        ).first()
        availability_match = False
        if exception is not None:
            if exception.is_available:
                availability_match = (
                    exception.start_time is None
                    or (
                        exception.end_time is not None
                        and event_start_time >= exception.start_time
                        and event_end_time <= exception.end_time
                    )
                )
            else:
                availability_match = bool(
                    exception.start_time
                    and exception.end_time
                    and not (
                        event_start_time < exception.end_time
                        and event_end_time > exception.start_time
                    )
                )
        else:
            availability_match = VolunteerAvailabilityRules.objects.filter(
                user=user,
                weekday=event.start_at.isoweekday(),
            ).filter(
                Q(valid_from__isnull=True) | Q(valid_from__lte=event_date)
            ).filter(
                Q(valid_to__isnull=True) | Q(valid_to__gte=event_date)
            ).filter(
                start_time__lte=event_start_time,
                end_time__gte=event_end_time,
            ).exists()
        availability_score = WEIGHTS["availability"] if availability_match else 0

        shared_reasons: List[str] = []
        if interest_overlap:
            shared_reasons.append(
                "Matches your interests in " + ", ".join(sorted(interest_overlap))
            )
        if region_match:
            shared_reasons.append("Matches your preferred area")
        if availability_match:
            shared_reasons.append("Your saved availability covers this event")
        else:
            shared_reasons.append("No schedule conflict was found for this event")

        best_score = -1
        best_post_id = None
        best_reasons: List[str] = []
        for post in posts:
            score = interest_score + region_score + availability_score
            reasons = list(shared_reasons)

            required_skills = _normalise(post.required_skills)
            if required_skills:
                skill_overlap = user_skills.intersection(required_skills)
                if skill_overlap:
                    score += int(
                        len(skill_overlap) / len(required_skills)
                        * WEIGHTS["skill_match"]
                    )
                    reasons.append(
                        "Skills match: " + ", ".join(sorted(skill_overlap))
                    )
            else:
                score += int(WEIGHTS["skill_match"] * 0.7)
                reasons.append("No specialised skills are required")

            if post.new_volunteers_allowed and user_is_new:
                score += WEIGHTS["role_fit"]
                reasons.append("Welcomes new volunteers")
            elif post.leader_needed and user_has_leader_experience:
                score += WEIGHTS["role_fit"]
                reasons.append("Leadership experience fits this role")

            if score > best_score:
                best_score = score
                best_post_id = post.id
                best_reasons = reasons

        if best_post_id is None:
            continue

        score = min(max(best_score, 0), 100)
        match_label = (
            "strong" if score >= 75
            else "moderate" if score >= 50
            else "exploratory"
        )
        results.append({
            "event": {
                "event_id": event.event_id,
                "title": event.title,
                "start_at": event.start_at.isoformat() if event.start_at else None,
                "end_at": event.end_at.isoformat() if event.end_at else None,
                "location_name": event.location_name or "",
                "charity_fields": event.charity_fields or [],
                "spots_remaining": int(event.spots_remaining or 0),
            },
            "match_score": score,
            "match_label": match_label,
            "reasons": best_reasons[:5],
            "matched_post_ids": [best_post_id],
            "policy_version": POLICY_VERSION,
        })

    results.sort(
        key=lambda item: (
            -item["match_score"],
            item["event"]["start_at"] or "",
            item["event"]["event_id"],
        )
    )
    return {"results": results[:result_limit], "policy_version": POLICY_VERSION}
