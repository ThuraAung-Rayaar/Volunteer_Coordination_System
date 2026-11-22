"""Shared volunteer cancellation-window policy.

The policy is enforced by both assignment cancellation and accepted-application
withdrawal because the PostgreSQL application trigger cascades withdrawal to
active assignments.
"""
from datetime import timedelta

from django.utils import timezone


VOLUNTEER_CANCELLATION_LOCK = timedelta(hours=48)


def is_within_volunteer_cancellation_window(schedule_start, now=None) -> bool:
    """Return True when the scheduled shift starts less than 48 hours from now."""
    current_time = now if now is not None else timezone.now()
    return schedule_start - current_time < VOLUNTEER_CANCELLATION_LOCK
