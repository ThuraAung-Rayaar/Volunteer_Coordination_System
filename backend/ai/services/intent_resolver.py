"""
backend/ai/services/intent_resolver.py

Deterministic backend intent router.
Maps a validated prompt_key or bounded free-text user message into a single
registered intent (or a deterministic clarification/unavailable response).
The LLM never chooses tools or routes intents.
"""

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from rest_framework.exceptions import PermissionDenied, ValidationError

from ai.security.scope_policy import (
    ACTOR_SCOPE_ADMIN,
    ACTOR_SCOPE_COORDINATOR,
    ACTOR_SCOPE_SUPER_ADMIN,
    ACTOR_SCOPE_VOLUNTEER,
    is_intent_allowed_for_scope,
)
from ai.services.prompt_catalog import PROMPT_DEFINITIONS_BY_SCOPE

ALL_KNOWN_INTENTS = {
    item["key"]
    for items in PROMPT_DEFINITIONS_BY_SCOPE.values()
    for item in items
} | {"public.events", "public.event_detail"}

# Requests for private T3/T4 or unsupported global admin data are declined deterministically.
SENSITIVE_OR_UNSUPPORTED_PATTERNS = (
    r"\bphone\s*number",
    r"\bcontact\s*info",
    r"\bemergency\s*contact",
    r"\bblood\s*type",
    r"\bverification\s*image",
    r"\bpassword",
    r"\btoken\b",
    r"\botp\b",
    r"\bexact\s*coord",
    r"\blatitude\b",
    r"\blongitude\b",
    r"\baudit\s*log",
    r"\ball\s*users\b",
    r"\buser\s*analytics\b",
    r"\bcross[\s-]region\b",
    r"\bsql\b",
)


@dataclass
class IntentResolution:
    intent: str
    status: str = "resolved"  # resolved | clarification | unavailable
    event_id: Optional[int] = None
    topic: Optional[str] = None
    search_query: Optional[str] = None
    candidates: List[str] = field(default_factory=list)
    reason: str = ""


def _extract_event_id(message: str, explicit_event_id: Optional[int] = None) -> Optional[int]:
    if explicit_event_id is not None:
        return int(explicit_event_id)
    match = re.search(r"\b(?:event\s*#?|id\s*#?|#)(\d{1,9})\b", message.lower())
    if match:
        return int(match.group(1))
    return None


def _detect_policy_topic(message: str) -> str:
    lower = message.lower()
    if any(k in lower for k in ("cancel", "withdraw", "48", "24", "lock")):
        return "cancellation"
    if any(k in lower for k in ("check in", "checkin", "check-in", "qr", "geo", "location", "radius", "perimeter")):
        return "checkin"
    if any(k in lower for k in ("recommend", "match", "score")):
        return "recommendations"
    if any(k in lower for k in ("staffing", "coverage", "headcount")):
        return "staffing"
    if any(k in lower for k in ("apply", "application", "accept", "waitlist")):
        return "applications"
    return "general"


def _contains_sensitive_request(message: str) -> bool:
    lower = message.lower()
    return any(re.search(pattern, lower) for pattern in SENSITIVE_OR_UNSUPPORTED_PATTERNS)


def resolve_intent(
    actor_scope: str,
    prompt_key: str = "",
    message: str = "",
    explicit_event_id: Optional[int] = None,
) -> IntentResolution:
    """
    Deterministically resolve an authenticated user's request into one
    registered intent or a clarification/unavailable outcome.
    """
    clean_key = str(prompt_key or "").strip()
    clean_msg = str(message or "").strip()
    event_id = _extract_event_id(clean_msg, explicit_event_id)

    # 1. Prompt-key path (authoritative button/chip selection)
    if clean_key:
        if clean_key not in ALL_KNOWN_INTENTS:
            raise ValidationError({"prompt_key": "Unknown assistant prompt key."})
        if not is_intent_allowed_for_scope(actor_scope, clean_key):
            raise PermissionDenied("This assistant action is not available for your account.")

        topic = _detect_policy_topic(clean_msg) if clean_key.endswith("policy_help") and clean_msg else None
        return IntentResolution(
            intent=clean_key,
            status="resolved",
            event_id=event_id,
            topic=topic or "general",
            search_query=clean_msg[:100] if clean_key in ("public.events", "admin.public_events", "super_admin.public_events") else None,
        )

    # 2. Free-text path
    if not clean_msg:
        return IntentResolution(
            intent="clarification",
            status="clarification",
            reason="Please select a suggested prompt or enter a specific question.",
        )

    lower = clean_msg.lower()

    # Decline private/unsupported data requests deterministically before any lookup.
    if _contains_sensitive_request(lower):
        return IntentResolution(
            intent="unavailable",
            status="unavailable",
            reason="This assistant is read-only and cannot expose private contact details, verification data, coordinates, credentials, or audit logs.",
        )

    # Ordinary admin cannot access staffing or volunteer-specific intents.
    if actor_scope == ACTOR_SCOPE_ADMIN:
        if any(k in lower for k in ("staffing", "gap", "coverage", "readiness", "my application", "my assignment", "recommend")):
            return IntentResolution(
                intent="unavailable",
                status="unavailable",
                reason="Under current ordinary admin policy, this assistant provides public event discovery and workflow help only.",
            )
        if any(k in lower for k in ("policy", "cancel", "withdraw", "check in", "checkin", "check-in", "rule", "help", "workflow")):
            return IntentResolution(
                intent="admin.policy_help",
                status="resolved",
                topic=_detect_policy_topic(lower),
            )
        if event_id is not None and any(k in lower for k in ("event", "detail", "post", "spot")):
            return IntentResolution(
                intent="public.event_detail",
                status="resolved",
                event_id=event_id,
            )
        if any(k in lower for k in ("event", "public", "upcoming", "browse", "search", "find")):
            return IntentResolution(
                intent="admin.public_events",
                status="resolved",
                search_query=clean_msg[:100],
            )
        return IntentResolution(
            intent="clarification",
            status="clarification",
            reason="I can help you browse public upcoming events or explain VCS public workflows.",
        )

    # Super-admin deterministic routing
    if actor_scope == ACTOR_SCOPE_SUPER_ADMIN:
        if any(k in lower for k in ("staffing", "gap", "coverage", "readiness", "headcount")):
            return IntentResolution(
                intent="super_admin.event_staffing",
                status="resolved",
                event_id=event_id,
            )
        if any(k in lower for k in ("policy", "cancel", "withdraw", "check in", "checkin", "check-in", "rule", "help", "workflow")):
            return IntentResolution(
                intent="super_admin.policy_help",
                status="resolved",
                topic=_detect_policy_topic(lower),
            )
        if event_id is not None and any(k in lower for k in ("event", "detail", "post")):
            return IntentResolution(
                intent="public.event_detail",
                status="resolved",
                event_id=event_id,
            )
        if any(k in lower for k in ("event", "public", "upcoming", "browse", "search", "find")):
            return IntentResolution(
                intent="super_admin.public_events",
                status="resolved",
                search_query=clean_msg[:100],
            )
        return IntentResolution(
            intent="clarification",
            status="clarification",
            reason="I can browse public upcoming events, inspect staffing for a specific event, or explain VCS workflows.",
        )

    # Coordinator and Volunteer scoring rules
    scores: Dict[str, int] = {}

    def _add(intent_key: str, weight: int) -> None:
        if is_intent_allowed_for_scope(actor_scope, intent_key):
            scores[intent_key] = scores.get(intent_key, 0) + weight

    if actor_scope == ACTOR_SCOPE_COORDINATOR:
        if any(k in lower for k in ("what needs my attention", "needs attention", "attention", "overview", "priorit")):
            _add("coordinator.next_steps", 3)
        if any(k in lower for k in ("my managed event", "managed event", "summarise my", "summarize my", "my events")):
            _add("coordinator.my_events", 3)
        if any(k in lower for k in ("staffing", "gap", "coverage", "open slot", "headcount")):
            _add("coordinator.staffing", 3)
        if any(k in lower for k in ("pending application", "need review", "review application", "applications to review")):
            _add("coordinator.pending_applications", 3)
        if any(k in lower for k in ("unassigned", "need a post", "accepted volunteer", "without a post")):
            _add("coordinator.unassigned_accepted", 3)
        if any(k in lower for k in ("ready", "readiness")):
            _add("coordinator.event_readiness", 3)

    # Volunteer rules (also available to approved coordinators when explicitly asking about their own volunteer participation)
    if any(k in lower for k in ("what should i do next", "next step", "what do i do next")):
        _add("volunteer.next_steps", 3)
    if any(k in lower for k in ("my application", "application status", "i applied", "applied")):
        _add("volunteer.my_applications", 3)
    if any(k in lower for k in ("my assignment", "my shift", "i am assigned", "assigned to")):
        _add("volunteer.my_assignments", 3)
    if any(k in lower for k in ("recommend", "fit me", "match my", "suitable", "for me")):
        _add("volunteer.recommendations", 3)
    if any(k in lower for k in ("prepare", "upcoming shift", "upcoming assignment", "ready for my event")):
        _add("volunteer.prepare_for_event", 3)
    if any(k in lower for k in ("check in", "checkin", "check-in", "qr", "geofence", "perimeter")):
        _add("volunteer.checkin_help", 3)
    if any(k in lower for k in ("cancel", "withdraw", "policy", "rule", "help", "48 hour", "24 hour", "how does")):
        _add("volunteer.policy_help", 2)

    if not scores:
        if event_id is not None and any(k in lower for k in ("event", "detail", "post")):
            return IntentResolution(
                intent="public.event_detail",
                status="resolved",
                event_id=event_id,
            )
        if any(k in lower for k in ("event", "upcoming", "browse", "search", "find", "cleanup", "planting")):
            return IntentResolution(
                intent="public.events",
                status="resolved",
                search_query=clean_msg[:100],
            )
        return IntentResolution(
            intent="clarification",
            status="clarification",
            reason="I am not sure which task you want. Please choose one of the suggested prompts below.",
        )

    ranked: List[Tuple[str, int]] = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    top_intent, top_score = ranked[0]
    tied = [intent for intent, score in ranked if score == top_score]

    # Disambiguate clear single match vs multiple equally matched distinct intents.
    if len(tied) > 1:
        return IntentResolution(
            intent="clarification",
            status="clarification",
            candidates=tied[:4],
            reason="Your question could match more than one task. Please pick one of the options below.",
        )

    return IntentResolution(
        intent=top_intent,
        status="resolved",
        event_id=event_id,
        topic=_detect_policy_topic(lower) if top_intent == "volunteer.policy_help" else None,
        search_query=clean_msg[:100] if top_intent == "public.events" else None,
    )
