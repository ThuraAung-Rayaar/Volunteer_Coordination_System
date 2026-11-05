"""
services/geo_service.py

GPS geolocation check-in orchestration around the SQL geo_check_in() function.

Database-first rules honoured here:
- The server (PostgreSQL) computes the authoritative distance via Haversine.
  The client's claimed distance is NEVER trusted or used.
- geo_check_in() returns one of 13 result codes and logs every attempt to
  attendance_geo_attempts. This service returns the code without raising so
  the telemetry row commits; the BFF maps it to an HTTP status.
- No independent geofence algorithm is implemented in Python.
"""
from __future__ import annotations

import logging

from django.db import connection

from common.db_context import get_db_session_context, set_db_session_context

logger = logging.getLogger(__name__)

# Result codes considered successful (HTTP 200); all others map to HTTP 400.
SUCCESS_RESULTS = ("accepted", "already_checked_in")

GEO_RESULT_MESSAGES = {
    "accepted": "Check-in successful.",
    "already_checked_in": "You are already checked in.",
    "invalid_fix": "The GPS coordinates are invalid.",
    "low_accuracy": "Your location signal is not accurate enough. Move to open sky and retry.",
    "stale_fix": "Your location fix is too old. Refresh your GPS and retry.",
    "mock_location": "Mock location detected. Check-in rejected.",
    "outside_geofence": "You are outside the event check-in area.",
    "window_closed": "Geo check-in is not open yet or has closed.",
    "event_not_active": "This event is not currently active.",
    "geo_disabled": "Geo check-in is not enabled for this event.",
    "not_assigned": "You do not have an active shift for this event.",
    "not_eligible": "Walk-in volunteers must check in by QR or with the coordinator.",
    "onboarding_required": "Please acknowledge the pre-shift briefing before checking in.",
}


def submit_geo_check_in(
    user,
    event_id: int,
    latitude: float,
    longitude: float,
    accuracy_m: float | None = None,
    captured_at=None,
    is_mocked: bool = False,
) -> dict:
    """
    Call the SQL geo_check_in() and return its result code, distance, and
    confirmation status. Does NOT raise on geofence/accuracy failures so the
    attempt telemetry commits.
    """
    prev_user_id, prev_ip = get_db_session_context()
    set_db_session_context(user.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM geo_check_in(%s, %s, %s, %s, %s, %s, %s)",
                [event_id, user.id, latitude, longitude, accuracy_m, captured_at, is_mocked],
            )
            row = cursor.fetchone()
    finally:
        set_db_session_context(prev_user_id, prev_ip)

    out_result, out_attendance_id, out_distance_m, out_confirmation = row

    result = {
        "result": out_result,
        "attendance_id": out_attendance_id,
        "distance_m": float(out_distance_m) if out_distance_m is not None else None,
        "confirmation_status": out_confirmation,
        "message": GEO_RESULT_MESSAGES.get(out_result, "Geo check-in processed."),
        "success": out_result in SUCCESS_RESULTS,
    }

    logger.info(
        "Geo check-in attempt",
        extra={"event_id": event_id, "user_id": user.id, "result": out_result},
    )
    return result


process_geo_check_in = submit_geo_check_in
