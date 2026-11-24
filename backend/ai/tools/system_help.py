"""
Curated documentation and business workflow guidance for the VCS Assistant.
"""

SYSTEM_HELP_TOPICS = {
    "cancellation": (
        "Volunteers can withdraw their applications or cancel assignments before the event cutoff window. "
        "Standard cancellation policy allows self-cancellation up to 24 hours prior to shift start without penalty. "
        "If an emergency arises closer to the shift, volunteers should contact the event coordinator directly."
    ),
    "checkin": (
        "VCS supports geolocation check-in and QR code registration. When an event has geo-checkin enabled, "
        "volunteers can check in from their mobile device when within the designated perimeter (usually 200m). "
        "The check-in window opens 30 minutes before the scheduled start time. Coordinators review and confirm attendance."
    ),
    "applications": (
        "Volunteers can browse public upcoming events and apply to specific post roles that match their skills. "
        "Applications may be auto-accepted if the event is configured for auto-acceptance and capacity remains, "
        "or reviewed manually by the coordinator. You can view your status under 'My Applications'."
    ),
    "recommendations": (
        "The VCS recommendation engine matches your profile interests, skills, and saved availability "
        "against upcoming public events with open positions. Keeping your profile skills and availability "
        "calendar up to date ensures the most relevant recommendations."
    ),
    "staffing": (
        "Coordinators can view real-time staffing gap insights on their managed event details page. "
        "The system highlights open headcount slots, accepted unassigned candidates, and urgency signals "
        "when shifts are approaching within 72 hours."
    ),
    "general": (
        "Volunteer Coordination System (VCS) connects volunteers with charity and community events. "
        "Volunteers can discover events, apply for posts, track hours, and check in on-site. "
        "Coordinators manage recruitment, shift assignments, and attendance rosters."
    ),
}


def get_system_help_content(topic: str) -> dict:
    """Returns curated guidance for a topic."""
    normalized = str(topic).lower().strip()
    for key, text in SYSTEM_HELP_TOPICS.items():
        if key in normalized or normalized in key:
            return {"topic": key, "content": text}

    return {"topic": "general", "content": SYSTEM_HELP_TOPICS["general"]}
