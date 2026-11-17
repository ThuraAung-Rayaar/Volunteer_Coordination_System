"""
services/audit_service.py

Read-only access to the append-only audit trail, coordinator history, and
moderation history for administrative investigation.

Database-first rules honoured here:
- audit_logs is written exclusively by PostgreSQL triggers (trg_95_*). This
  service NEVER inserts, updates, or deletes audit records.
- Access is restricted to admins (full trail to Super Admin per A05).
"""
from __future__ import annotations

import logging

from apps.audit.models import AuditLogs
from apps.coordination.models import EventCoordinatorHistory, VEventCoordinatorHistory
from common.exceptions import PermissionDeniedError, ResourceMaskedNotFound
from common.permissions import get_event_for_manager_or_404

logger = logging.getLogger(__name__)


def _require_admin(actor, require_superuser: bool = False) -> None:
    if not (actor and getattr(actor, "is_authenticated", False)
            and actor.is_admin and actor.is_active):
        raise ResourceMaskedNotFound(message="The requested resource was not found.")
    if require_superuser and not actor.is_superuser:
        raise ResourceMaskedNotFound(message="The requested resource was not found.")


def get_audit_records(
    actor,
    entity_type: str | None = None,
    entity_id: int | None = None,
    action: str | None = None,
    limit: int = 200,
) -> list[dict]:
    """
    Retrieve audit records (Super Admin only per A05). Filters are optional.
    Sensitive before/after payloads are returned but never include stripped
    secrets (the DB trigger already redacts phone_enc, password, coordinates).
    """
    _require_admin(actor, require_superuser=True)

    qs = AuditLogs.objects.all().order_by("-created_at")
    if entity_type:
        qs = qs.filter(entity_type=entity_type)
    if entity_id is not None:
        qs = qs.filter(entity_id=entity_id)
    if action:
        qs = qs.filter(action=action)

    return [
        {
            "id": log.id,
            "actor_user_id": log.actor_user_id,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "before_data": log.before_data,
            "after_data": log.after_data,
            "ip_address": log.ip_address,
            "created_at": log.created_at,
        }
        for log in qs[:limit]
    ]


def get_event_coordinator_history(actor, event_id: int | None = None) -> list[dict]:
    """
    Retrieve coordinator handover history from v_event_coordinator_history.
    Admins see all; event managers see only their event (handled by caller).
    """
    _require_admin(actor)
    qs = VEventCoordinatorHistory.objects.all().order_by("-changed_at")
    if event_id is not None:
        qs = qs.filter(event_id=event_id)
    return [
        {
            "event_id": h.event_id,
            "event_title": h.event_title,
            "from_coordinator_id": h.from_coordinator_id,
            "from_name": h.from_name,
            "to_coordinator_id": h.to_coordinator_id,
            "to_name": h.to_name,
            "changed_by_user_id": h.changed_by_user_id,
            "changed_by_name": h.changed_by_name,
            "reason": h.reason,
            "changed_at": h.changed_at,
        }
        for h in qs
    ]


def get_event_coordinator_history_for_manager(actor, event_id: int) -> list[dict]:
    """
    Retrieve coordinator handover history for an event manager (owner, current coordinator, admin).
    Returns privacy-safe audit trail rows from v_event_coordinator_history.
    """
    event = get_event_for_manager_or_404(actor, event_id, require_write=False)
    qs = VEventCoordinatorHistory.objects.filter(event_id=event_id).order_by("-changed_at")

    results = []
    for idx, h in enumerate(qs, start=1):
        is_initial = h.from_coordinator_id is None
        is_retake = bool(event and h.to_coordinator_id == event.owner_id and not is_initial)
        change_type = "initial" if is_initial else ("retake" if is_retake else "handover")
        results.append({
            "id": idx,
            "event_id": h.event_id,
            "event_title": h.event_title,
            "change_type": change_type,
            "previous_coordinator_id": h.from_coordinator_id,
            "previous_coordinator_name": h.from_name,
            "new_coordinator_id": h.to_coordinator_id,
            "new_coordinator_name": h.to_name,
            "changed_by_id": h.changed_by_user_id,
            "changed_by_name": h.changed_by_name,
            "from_coordinator_id": h.from_coordinator_id,
            "from_name": h.from_name,
            "to_coordinator_id": h.to_coordinator_id,
            "to_name": h.to_name,
            "changed_by_user_id": h.changed_by_user_id,
            "reason": h.reason,
            "changed_at": h.changed_at,
        })
    return results


def get_audit_log_detail(actor, log_id: int) -> dict:
    """Retrieve detail of a single audit log (Super Admin only)."""
    _require_admin(actor, require_superuser=True)
    log = AuditLogs.objects.filter(id=log_id).first()
    if log is None:
        raise ResourceMaskedNotFound(message="Audit log record not found.")
    return {
        "id": log.id,
        "actor_user_id": log.actor_user_id,
        "action": log.action,
        "entity_type": log.entity_type,
        "entity_id": log.entity_id,
        "before_data": log.before_data,
        "after_data": log.after_data,
        "ip_address": log.ip_address,
        "created_at": log.created_at,
    }


def list_geo_attempts_review(actor, limit: int = 200) -> list[dict]:
    """Retrieve telemetry log from v_geo_attempts_review for admin inspection."""
    _require_admin(actor)
    from apps.attendance.models import VGeoAttemptsReview
    rows = VGeoAttemptsReview.objects.all().order_by("-attempted_at")[:limit]
    return list(rows.values())


# Function aliases for specification compatibility
list_audit_logs = get_audit_records


