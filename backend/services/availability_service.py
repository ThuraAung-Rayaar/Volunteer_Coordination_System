"""
services/availability_service.py

Volunteer availability rules and exceptions.
Availability evaluation delegates to the PostgreSQL is_user_available() function.
Schedule conflict checks delegate to user_has_schedule_conflict().
"""
from __future__ import annotations

import logging
from typing import Optional

from django.db import connection, transaction

from apps.accounts.models import (
    VolunteerAvailabilityExceptions,
    VolunteerAvailabilityRules,
)
from common.exceptions import DomainError, ResourceMaskedNotFound

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------

def get_user_availability(user_id: int) -> dict:
    """
    Return all weekly rules and date exceptions for a user.
    """
    rules = list(
        VolunteerAvailabilityRules.objects.filter(user_id=user_id)
        .order_by("weekday", "start_time")
        .values(
            "id", "weekday", "start_time", "end_time", "valid_from", "valid_to"
        )
    )
    exceptions = list(
        VolunteerAvailabilityExceptions.objects.filter(user_id=user_id)
        .order_by("date")
        .values("id", "date", "is_available", "start_time", "end_time", "note")
    )
    return {"rules": rules, "exceptions": exceptions}


# ---------------------------------------------------------------------------
# Weekly Rules
# ---------------------------------------------------------------------------

def set_weekly_availability_rules(user_id: int, rules_data: list[dict]) -> list[dict]:
    """
    Atomically replace all weekly availability rules for a user.

    Args:
        user_id: The user's ID.
        rules_data: List of dicts with keys: weekday, start_time, end_time,
                    valid_from (optional), valid_to (optional).

    Returns:
        List of created rule dicts.
    """
    created = []
    with transaction.atomic():
        VolunteerAvailabilityRules.objects.filter(user_id=user_id).delete()
        for rule in rules_data:
            obj = VolunteerAvailabilityRules.objects.create(
                user_id=user_id,
                weekday=rule["weekday"],
                start_time=rule["start_time"],
                end_time=rule["end_time"],
                valid_from=rule.get("valid_from"),
                valid_to=rule.get("valid_to"),
            )
            created.append({
                "id": obj.id,
                "weekday": obj.weekday,
                "start_time": obj.start_time,
                "end_time": obj.end_time,
                "valid_from": obj.valid_from,
                "valid_to": obj.valid_to,
            })
    return created


# ---------------------------------------------------------------------------
# Date Exceptions
# ---------------------------------------------------------------------------

def upsert_availability_exception(user_id: int, exc_data: dict) -> dict:
    """
    Create or update a date-specific availability exception.

    The unique constraint (user_id, date) means there is at most one
    exception per date. This performs an upsert.

    Args:
        user_id: The user's ID.
        exc_data: Dict with keys: date, is_available, start_time (optional),
                  end_time (optional), note (optional).

    Returns:
        The created/updated exception dict.
    """
    obj, _created = VolunteerAvailabilityExceptions.objects.update_or_create(
        user_id=user_id,
        date=exc_data["date"],
        defaults={
            "is_available": exc_data.get("is_available", False),
            "start_time": exc_data.get("start_time"),
            "end_time": exc_data.get("end_time"),
            "note": exc_data.get("note", ""),
        },
    )
    return {
        "id": obj.id,
        "date": obj.date,
        "is_available": obj.is_available,
        "start_time": obj.start_time,
        "end_time": obj.end_time,
        "note": obj.note,
    }


def delete_availability_exception(user_id: int, exception_id: int) -> None:
    """
    Delete a date-specific exception owned by the user.

    Raises:
        ResourceMaskedNotFound: If the exception does not exist or is not owned.
    """
    deleted_count, _ = VolunteerAvailabilityExceptions.objects.filter(
        id=exception_id, user_id=user_id
    ).delete()
    if deleted_count == 0:
        raise ResourceMaskedNotFound(
            message="Availability exception not found."
        )


# ---------------------------------------------------------------------------
# Availability Check (delegates to SQL)
# ---------------------------------------------------------------------------

def check_user_availability(user_id: int, start_at, end_at) -> bool:
    """
    Check if a user is available for a given time window.

    Delegates to the PostgreSQL is_user_available() function.
    Does NOT reimplement the availability algorithm.

    Args:
        user_id: The user's ID.
        start_at: Start of the time window (datetime).
        end_at: End of the time window (datetime).

    Returns:
        True if available, False otherwise.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT is_user_available(%s, %s, %s)",
            [user_id, start_at, end_at],
        )
        row = cursor.fetchone()
        return bool(row[0]) if row else True


def check_schedule_conflict(
    user_id: int,
    start_at,
    end_at,
    except_event_id: Optional[int] = None,
) -> bool:
    """
    Check if a user has a scheduling conflict for a given time window.

    Delegates to the PostgreSQL user_has_schedule_conflict() function.

    Args:
        user_id: The user's ID.
        start_at: Start of the time window.
        end_at: End of the time window.
        except_event_id: Optional event ID to exclude from conflict check.

    Returns:
        True if a conflict exists, False otherwise.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT user_has_schedule_conflict(%s, %s, %s, %s)",
            [user_id, start_at, end_at, except_event_id],
        )
        row = cursor.fetchone()
        return bool(row[0]) if row else False


# Aliases for specification naming compatibility
set_user_availability = set_weekly_availability_rules
check_user_availability_window = check_user_availability


