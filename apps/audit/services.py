# apps/audit/services.py
from datetime import timedelta
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import CoordinatorProfile, User, UserVerificationImage
from apps.audit.models import AuditLog, ModerationAction
from apps.common.permissions import ensure_admin
from apps.events.models import Event
from apps.ops.models import Feedback


def log_action(
    actor=None,
    action: str = "",
    entity_type: str = "",
    entity_id=None,
    before=None,
    after=None,
    before_data=None,
    after_data=None,
    ip=None,
    request=None,
) -> AuditLog:
    ip_addr = ip
    if not ip_addr and request:
        ip_addr = request.META.get("REMOTE_ADDR")

    actor_user = actor if (actor and getattr(actor, "is_authenticated", False)) else None

    b_data = before if before is not None else before_data
    a_data = after if after is not None else after_data

    return AuditLog.objects.create(
        actor_user=actor_user,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before_data=b_data,
        after_data=a_data,
        ip_address=ip_addr,
    )


def warn_user(admin, target_user: User, reason: str) -> ModerationAction:
    ensure_admin(admin)

    with transaction.atomic():
        action = ModerationAction.objects.create(
            admin_user=admin,
            target_user=target_user,
            action_type="user_warning",
            reason=reason,
        )

        log_action(
            actor=admin,
            action="warn_user",
            entity_type="user",
            entity_id=target_user.id,
            after_data={"reason": reason, "action_id": action.id},
        )

    return action


def block_user(admin, target_user: User, reason: str, expires_at=None) -> ModerationAction:
    ensure_admin(admin)

    with transaction.atomic():
        before = {
            "account_status": target_user.account_status,
            "blocked_until": str(target_user.blocked_until),
        }

        target_user.account_status = "blocked"
        target_user.blocked_until = expires_at
        target_user.save(update_fields=["account_status", "blocked_until"])

        action = ModerationAction.objects.create(
            admin_user=admin,
            target_user=target_user,
            action_type="user_block",
            reason=reason,
            expires_at=expires_at,
        )

        log_action(
            actor=admin,
            action="block_user",
            entity_type="user",
            entity_id=target_user.id,
            before_data=before,
            after_data={
                "account_status": "blocked",
                "blocked_until": str(expires_at),
                "action_id": action.id,
            },
        )

    return action


def unblock_user(admin, target_user: User, reason: str) -> ModerationAction:
    ensure_admin(admin)

    with transaction.atomic():
        before = {
            "account_status": target_user.account_status,
            "blocked_until": str(target_user.blocked_until),
        }

        target_user.account_status = "active"
        target_user.blocked_until = None
        target_user.save(update_fields=["account_status", "blocked_until"])

        action = ModerationAction.objects.create(
            admin_user=admin,
            target_user=target_user,
            action_type="user_unblock",
            reason=reason,
        )

        log_action(
            actor=admin,
            action="unblock_user",
            entity_type="user",
            entity_id=target_user.id,
            before_data=before,
            after_data={
                "account_status": "active",
                "blocked_until": None,
                "action_id": action.id,
            },
        )

    return action


def close_account(admin, target_user: User, reason: str) -> ModerationAction:
    ensure_admin(admin)

    with transaction.atomic():
        before = {"account_status": target_user.account_status}

        target_user.account_status = "closed"
        target_user.save(update_fields=["account_status"])

        action = ModerationAction.objects.create(
            admin_user=admin,
            target_user=target_user,
            action_type="account_close",
            reason=reason,
        )

        log_action(
            actor=admin,
            action="close_account",
            entity_type="user",
            entity_id=target_user.id,
            before_data=before,
            after_data={"account_status": "closed", "action_id": action.id},
        )

    return action


def reinstate_account(admin, target_user: User, reason: str) -> ModerationAction:
    ensure_admin(admin)

    with transaction.atomic():
        before = {"account_status": target_user.account_status}

        target_user.account_status = "active"
        target_user.save(update_fields=["account_status"])

        action = ModerationAction.objects.create(
            admin_user=admin,
            target_user=target_user,
            action_type="account_reinstate",
            reason=reason,
        )

        log_action(
            actor=admin,
            action="reinstate_account",
            entity_type="user",
            entity_id=target_user.id,
            before_data=before,
            after_data={"account_status": "active", "action_id": action.id},
        )

    return action


def delete_event(admin, event: Event, reason: str) -> ModerationAction:
    ensure_admin(admin)

    with transaction.atomic():
        now = timezone.now()
        event.deleted_at = now
        event.deleted_by = admin
        event.save(update_fields=["deleted_at", "deleted_by"])

        action = ModerationAction.objects.create(
            admin_user=admin,
            event=event,
            action_type="event_delete",
            reason=reason,
        )

        log_action(
            actor=admin,
            action="delete_event",
            entity_type="event",
            entity_id=event.id,
            after_data={"deleted_at": str(now), "action_id": action.id},
        )

    return action


def restore_event(admin, event: Event, reason: str) -> ModerationAction:
    ensure_admin(admin)

    with transaction.atomic():
        event.deleted_at = None
        event.deleted_by = None
        event.save(update_fields=["deleted_at", "deleted_by"])

        action = ModerationAction.objects.create(
            admin_user=admin,
            event=event,
            action_type="event_restore",
            reason=reason,
        )

        log_action(
            actor=admin,
            action="restore_event",
            entity_type="event",
            entity_id=event.id,
            after_data={"restored": True, "action_id": action.id},
        )

    return action


def cancel_event_by_admin(admin, event: Event, reason: str) -> ModerationAction:
    ensure_admin(admin)

    from apps.events.services import cancel_event

    with transaction.atomic():
        cancel_event(actor=admin, event=event, reason=reason)

        action = ModerationAction.objects.create(
            admin_user=admin,
            event=event,
            action_type="event_cancel",
            reason=reason,
        )

        log_action(
            actor=admin,
            action="cancel_event_by_admin",
            entity_type="event",
            entity_id=event.id,
            after_data={"reason": reason, "action_id": action.id},
        )

    return action


def hide_feedback(admin, feedback: Feedback, reason: str) -> ModerationAction:
    ensure_admin(admin)

    with transaction.atomic():
        feedback.status = "hidden"
        feedback.save(update_fields=["status"])

        action = ModerationAction.objects.create(
            admin_user=admin,
            feedback=feedback,
            action_type="feedback_hide",
            reason=reason,
        )

        log_action(
            actor=admin,
            action="hide_feedback",
            entity_type="feedback",
            entity_id=feedback.id,
            after_data={"status": "hidden", "action_id": action.id},
        )

    return action


def dashboard_stats() -> dict:
    thirty_days_ago = timezone.now() - timedelta(days=30)
    return {
        "active_users": User.objects.filter(account_status="active").count(),
        "blocked_users": User.objects.filter(account_status="blocked").count(),
        "users_pending_verification": User.objects.filter(verification_status="pending").count(),
        "images_pending_review": UserVerificationImage.objects.filter(status="pending", is_current=True).count(),
        "coordinators_pending_approval": CoordinatorProfile.objects.filter(status="pending").count(),
        "coordinators_approved": CoordinatorProfile.objects.filter(status="approved").count(),
        "events_draft": Event.objects.filter(deleted_at__isnull=True, status="draft").count(),
        "events_published": Event.objects.filter(deleted_at__isnull=True, status="published").count(),
        "events_active": Event.objects.filter(deleted_at__isnull=True, status="active").count(),
        "events_completed": Event.objects.filter(deleted_at__isnull=True, status="completed").count(),
        "events_cancelled": Event.objects.filter(deleted_at__isnull=True, status="cancelled").count(),
        "events_deleted": Event.objects.filter(deleted_at__isnull=False).count(),
        "warnings_last_30d": ModerationAction.objects.filter(
            action_type="user_warning",
            created_at__gte=thirty_days_ago,
        ).count(),
    }
