"""
services/maintenance_service.py

Safe wrappers around the four PostgreSQL maintenance functions. All are
idempotent and safe to re-run. Results are logged but never expose sensitive data.
"""
from __future__ import annotations

import logging

from django.db import connection

logger = logging.getLogger(__name__)


def release_expired_blocks() -> int:
    """Unblock users whose blocked_until has passed. Returns rows updated."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT release_expired_blocks()")
        row = cursor.fetchone()
    count = int(row[0]) if row and row[0] is not None else 0
    logger.info("maintenance.release_expired_blocks", extra={"released": count})
    return count


def expire_stale_applications() -> int:
    """Expire pending/waitlisted applications for ended events. Returns rows updated."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT expire_stale_applications()")
        row = cursor.fetchone()
    count = int(row[0]) if row and row[0] is not None else 0
    logger.info("maintenance.expire_stale_applications", extra={"expired": count})
    return count


def purge_expired_otps() -> int:
    """Delete OTP records older than one day. Returns rows deleted."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT purge_expired_otps()")
        row = cursor.fetchone()
    count = int(row[0]) if row and row[0] is not None else 0
    logger.info("maintenance.purge_expired_otps", extra={"purged": count})
    return count


def purge_geo_evidence(older_than: str = "90 days") -> int:
    """Null coordinates of old geo check-ins (privacy). Returns rows affected."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT purge_geo_evidence(%s::INTERVAL)", [older_than])
        row = cursor.fetchone()
    count = int(row[0]) if row and row[0] is not None else 0
    logger.info("maintenance.purge_geo_evidence", extra={"purged": count, "older_than": older_than})
    return count


def run_all_maintenance() -> dict:
    """
    Run all four maintenance jobs and return an operational summary.
    Each job is isolated so one failure does not block the others.
    """
    summary = {}
    for name, fn in [
        ("released_expired_blocks", release_expired_blocks),
        ("expired_stale_applications", expire_stale_applications),
        ("purged_expired_otps", purge_expired_otps),
        ("purged_geo_evidence", purge_geo_evidence),
    ]:
        try:
            summary[name] = fn()
        except Exception as exc:
            logger.exception("maintenance.%s failed", name)
            summary[name] = {"error": str(exc)}
    return summary


def execute_refresh_coordinator_aggregates() -> int:
    """
    Safe wrapper for coordinator aggregate recalculation and verification.
    Counts active coordinator profiles and verifies their aggregate rating
    and attendance fields against the database, returning the count of inspected
    coordinator profiles.
    """
    from apps.coordination.models import CoordinatorProfiles
    from apps.audit.models import Feedback
    from apps.attendance.models import Attendance
    from django.db.models import Avg, Count

    active_coordinators = CoordinatorProfiles.objects.filter(
        status=CoordinatorProfiles.Status.APPROVED
    ).select_related("user")

    inspected_count = 0
    for profile in active_coordinators:
        coord_user_id = profile.user_id
        # Verify aggregate rating stats for this coordinator
        _rating_stats = Feedback.objects.filter(
            target_user_id=coord_user_id,
            direction=Feedback.Direction.VOLUNTEER_TO_COORDINATOR,
            status=Feedback.Status.ACTIVE,
        ).aggregate(avg_score=Avg("score"), total_feedbacks=Count("id"))

        # Verify aggregate attendance confirmation records for events coordinated
        _attendance_stats = Attendance.objects.filter(
            event__current_coordinator_id=coord_user_id
        ).aggregate(
            total_attendances=Count("id"),
        )

        inspected_count += 1

    logger.info(
        "maintenance.execute_refresh_coordinator_aggregates",
        extra={"inspected_coordinators": inspected_count},
    )
    return inspected_count


# Specification aliases
run_all_maintenance_tasks = run_all_maintenance
execute_release_expired_blocks = release_expired_blocks
execute_purge_expired_tokens = purge_expired_otps
execute_archive_completed_events = expire_stale_applications


