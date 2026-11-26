"""
Curated documentation and business workflow guidance for the VCS Assistant.

Rule values such as the volunteer cancellation lock window are read directly
from authoritative domain policy modules rather than hardcoded separately.
"""

from typing import Any, Dict

from services.cancellation_policy import VOLUNTEER_CANCELLATION_LOCK

POLICY_CONTENT_VERSION = "vcs.policy_help.v2"
DEFAULT_GEO_RADIUS_M = 150
DEFAULT_CHECKIN_OPENS_BEFORE_MIN = 30


def get_cancellation_lock_hours() -> int:
    """Return the authoritative volunteer cancellation lock window in hours."""
    return int(VOLUNTEER_CANCELLATION_LOCK.total_seconds() // 3600)


def build_system_help_topics() -> Dict[str, str]:
    """Build curated guidance topics aligned with current backend/DB rules."""
    lock_hours = get_cancellation_lock_hours()
    return {
        "cancellation": (
            f"Volunteers can withdraw an application or cancel an assignment before the {lock_hours}-hour "
            f"lock window. Under current VCS policy, self-cancellation and withdrawal are blocked inside "
            f"{lock_hours} hours before the scheduled shift start. If an emergency occurs within "
            f"{lock_hours} hours of the shift, contact the event coordinator directly."
        ),
        "checkin": (
            "VCS supports QR code registration and optional geolocation check-in when enabled for an event. "
            f"When geolocation check-in is enabled, the permitted perimeter is event-specific and shown in the app "
            f"(the system default radius is {DEFAULT_GEO_RADIUS_M}m when an event does not override it). "
            f"The check-in window opens {DEFAULT_CHECKIN_OPENS_BEFORE_MIN} minutes before the scheduled start time "
            "by default unless event-specific settings override it. Coordinators review and confirm attendance."
        ),
        "applications": (
            "Volunteers can browse public upcoming events and apply to specific post roles. "
            "Applications may be auto-accepted if the event uses auto-acceptance and capacity remains, "
            "or reviewed manually by the coordinator. Application status (pending, accepted, waitlisted, "
            "rejected, withdrawn, expired) is distinct from assignment status (assigned, confirmed, completed, "
            "cancelled) and attendance status (checked-in, checked-out, completed)."
        ),
        "recommendations": (
            "The VCS recommendation engine (recommendation-v1) ranks eligible public upcoming events using "
            "deterministic weighted scoring across skills (35), charity interests (25), saved availability (25), "
            "region fit (10), and role fit (5), after checking capacity, existing applications/assignments, "
            "and schedule conflicts."
        ),
        "staffing": (
            "Approved coordinators can view deterministic staffing insights for their managed events, including "
            "required headcount, assigned volunteers, open slots, accepted-but-unassigned applications, pending "
            "and waitlisted counts, coverage percentage, and operational readiness signals."
        ),
        "general": (
            "Volunteer Coordination System (VCS) connects volunteers with charity and community events. "
            "Volunteers can discover events, apply for posts, track assignments, and check in on-site. "
            "Coordinators manage applications, shift assignments, staffing coverage, and attendance."
        ),
    }


SYSTEM_HELP_TOPICS = build_system_help_topics()


def get_system_help_content(topic: str) -> Dict[str, Any]:
    """Return curated guidance and authoritative policy metadata for a topic."""
    topics = build_system_help_topics()
    normalized = str(topic or "general").lower().strip()
    matched_key = "general"
    for key in topics:
        if key in normalized or normalized in key:
            matched_key = key
            break

    return {
        "topic": matched_key,
        "policy_version": POLICY_CONTENT_VERSION,
        "content": topics[matched_key],
        "verified": True,
        "rules": {
            "cancellation_lock_hours": get_cancellation_lock_hours(),
            "default_geo_radius_m": DEFAULT_GEO_RADIUS_M,
            "default_checkin_opens_before_min": DEFAULT_CHECKIN_OPENS_BEFORE_MIN,
        },
    }
