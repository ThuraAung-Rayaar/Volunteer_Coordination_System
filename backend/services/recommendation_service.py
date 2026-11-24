"""
services/recommendation_service.py

Feature 1: Volunteer-to-event recommendations engine.
Deterministic, explainable rule-based scoring with hard eligibility filters.
Policy version: recommendation-v1
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from django.utils import timezone
from django.db.models import Q

from apps.accounts.models import Users, UserCharityInterests
from apps.events.models import VPublicEvents, EventPosts, VEventPostCapacity, EventApplications
from apps.coordination.models import Assignments
from services.application_service import check_user_availability_for_event

logger = logging.getLogger(__name__)

POLICY_VERSION = "recommendation-v1"

# Versioned scoring weights (sum to 100)
WEIGHTS = {
    "skill_match": 35,
    "charity_interest": 25,
    "availability": 25,
    "region_fit": 10,
    "role_fit": 5,
}


def get_recommendations_for_user(
    user: Users,
    limit: int = 10,
) -> Dict[str, Any]:
    """
    Computes explainable, deterministic recommendations for the authenticated volunteer.
    Hard filters remove any ineligible events before ranking.
    """
    now = timezone.now()

    # 1. Hard Filter: Public upcoming events with open capacity and active deadlines
    candidate_events = VPublicEvents.objects.filter(
        status__in=["published", "active"],
        end_at__gt=now,
        spots_remaining__gt=0,
    ).filter(
        Q(application_deadline__isnull=True) | Q(application_deadline__gt=now)
    ).order_by("start_at")[:100]

    if not candidate_events:
        return {"results": [], "policy_version": POLICY_VERSION}

    # 2. Hard Filter: Exclude events user already applied to or is assigned to
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

    # 3. Load volunteer preferences and profile signals
    user_skills = set(
        s.strip().lower() for s in getattr(user, "skills", []) or [] if s
    )
    user_interests = set(
        UserCharityInterests.objects.filter(user=user).values_list("field_code_id", flat=True)
    )
    user_home_area = (getattr(user, "home_area", "") or "").strip().lower()
    user_is_new = getattr(user, "new_to_volunteer", False)
    user_has_leader_exp = getattr(user, "has_leader_experience", False)

    scored_results = []

    for ev in candidate_events:
        if ev.event_id in excluded_event_ids:
            continue

        # 4. Hard Filter: Availability & schedule conflict check via PostgreSQL function
        try:
            avail_check = check_user_availability_for_event(user, ev.event_id)
            if not avail_check.get("available", True) or avail_check.get("schedule_conflict", False):
                continue
        except Exception:
            # If availability check encounters an error, proceed conservatively
            pass

        # 5. Get open posts for this event
        open_posts = EventPosts.objects.filter(
            event_id=ev.event_id,
            status="open",
        )
        if not open_posts.exists():
            continue

        best_score = 0
        best_post_id = None
        best_reasons: List[str] = []

        # Check charity category match (shared across posts in the event)
        ev_charities = set(ev.charity_fields or [])
        charity_overlap = user_interests.intersection(ev_charities)
        charity_score = 0
        if charity_overlap:
            charity_score = WEIGHTS["charity_interest"]
            best_reasons.append(f"Matches your interest in {', '.join(charity_overlap)}")

        # Region/location fit
        region_score = 0
        ev_location = (ev.location_name or "").lower()
        if user_home_area and (user_home_area in ev_location or ev_location in user_home_area):
            region_score = WEIGHTS["region_fit"]
            best_reasons.append("Close to your preferred home area")

        # Availability score (already passed hard check)
        availability_score = WEIGHTS["availability"]
        best_reasons.append("Your saved availability covers this event")

        # Evaluate best post fit
        for post in open_posts:
            post_score = charity_score + region_score + availability_score
            post_reasons = list(best_reasons)

            # Skill overlap
            post_skills = set(s.strip().lower() for s in getattr(post, "required_skills", []) or [] if s)
            if post_skills and user_skills:
                matching_skills = user_skills.intersection(post_skills)
                if matching_skills:
                    ratio = len(matching_skills) / len(post_skills)
                    skill_points = int(ratio * WEIGHTS["skill_match"])
                    post_score += skill_points
                    post_reasons.append(f"Skills match: {', '.join(matching_skills)}")
            elif not post_skills:
                # No special skills required
                post_score += int(WEIGHTS["skill_match"] * 0.7)
                post_reasons.append("No specialized prerequisites required")

            # Role / experience fit
            if post.new_volunteers_allowed and user_is_new:
                post_score += WEIGHTS["role_fit"]
                post_reasons.append("Welcomes new volunteers")
            elif post.leader_needed and user_has_leader_exp:
                post_score += WEIGHTS["role_fit"]
                post_reasons.append("Leadership opportunity matching your experience")

            if post_score > best_score:
                best_score = post_score
                best_post_id = post.id
                best_reasons = post_reasons

        # Bound score between 0 and 100
        best_score = min(max(best_score, 0), 100)

        match_label = (
            "strong" if best_score >= 75
            else "moderate" if best_score >= 50
            else "exploratory"
        )

        scored_results.append({
            "event": {
                "event_id": ev.event_id,
                "title": ev.title,
                "start_at": ev.start_at.isoformat() if ev.start_at else None,
                "end_at": ev.end_at.isoformat() if ev.end_at else None,
                "location_name": ev.location_name or "",
                "charity_fields": ev.charity_fields or [],
                "spots_remaining": ev.spots_remaining,
            },
            "match_score": best_score,
            "match_label": match_label,
            "reasons": best_reasons[:4],
            "matched_post_ids": [best_post_id] if best_post_id else [],
            "policy_version": POLICY_VERSION,
        })

    # Sort descending by match_score
    scored_results.sort(key=lambda x: x["match_score"], reverse=True)

    return {
        "results": scored_results[:limit],
        "policy_version": POLICY_VERSION,
    }
