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

