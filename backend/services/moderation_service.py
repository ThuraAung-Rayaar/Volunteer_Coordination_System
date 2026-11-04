"""
services/moderation_service.py

Administrative moderation via the insert-to-apply moderation_actions mechanism.

Database-first rules honoured here:
- This service ONLY inserts into moderation_actions. The trigger
  trg_50_moderation_after_insert applies the mutation (block user, cancel event,
  hide feedback, etc.) within the same transaction using app.privileged_write.
- This service NEVER updates users.account_status, events.deleted_at, or
  feedback.status directly.
- Super-admin-only actions are gated here before the insert.
"""
from __future__ import annotations

import logging

from django.db import IntegrityError, InternalError, ProgrammingError, connection
from apps.audit.models import Feedback, ModerationActions
from apps.events.models import Events
from apps.accounts.models import Users
from common.exceptions import DomainError, PermissionDeniedError, ResourceMaskedNotFound, translate_db_exception

logger = logging.getLogger(__name__)

# Action types and whether they require super admin (per Admin Matrix A08-A11)
ACTION_REQUIRES_SUPERUSER = {
    "user_warning": False,
    "user_block": False,
    "user_unblock": False,
    "account_close": True,       # A10
    "account_reinstate": True,   # A10
    "event_delete": True,        # A08
    "event_restore": True,       # A08
    "event_cancel": False,       # A07
    "feedback_hide": False,      # A07
}

# Which target field each action type requires (mirrors ck_moderation_subject)
ACTION_TARGET_FIELD = {
    "user_warning": "target_user_id",
    "user_block": "target_user_id",
    "user_unblock": "target_user_id",
    "account_close": "target_user_id",
    "account_reinstate": "target_user_id",
    "event_delete": "event_id",
    "event_restore": "event_id",
    "event_cancel": "event_id",
    "feedback_hide": "feedback_id",
}

# Actions that require a non-empty reason (mirrors ck_moderation_reason)
REASON_REQUIRED_ACTIONS = {
    "user_block", "account_close", "event_delete", "event_cancel", "feedback_hide",
}


def _require_admin(actor, require_superuser: bool = False) -> None:
    if not (actor and getattr(actor, "is_authenticated", False)
            and actor.is_admin and actor.is_active):
        raise PermissionDeniedError(
            message="Only administrators can perform moderation.",
            code="permission_denied",
        )
    if require_superuser and not actor.is_superuser:
        # Mask as 404 per the 404-Not-403 rule for elevated admin routes
        raise ResourceMaskedNotFound(message="This action is not available.")


def record_moderation_action(
    admin_user,
    action_type: str,
    target_user_id: int | None = None,
    event_id: int | None = None,
    feedback_id: int | None = None,
    reason: str = "",
    expires_at=None,
) -> ModerationActions:
    """
    Insert a moderation_actions row. The DB trigger applies the action.

    Raises DomainError for invalid action/target/reason before the insert so the
    caller gets a clean 400 instead of a raw constraint violation.
    """
    if action_type not in ACTION_REQUIRES_SUPERUSER:
        raise DomainError(
            code="invalid_moderation_action",
            message=f"Unsupported moderation action '{action_type}'.",
            status_code=400,
        )

    _require_admin(admin_user, require_superuser=ACTION_REQUIRES_SUPERUSER[action_type])

    # Validate the correct target field is present (mirrors ck_moderation_subject)
    required_field = ACTION_TARGET_FIELD[action_type]
    provided = {
        "target_user_id": target_user_id,
        "event_id": event_id,
        "feedback_id": feedback_id,
    }
    if provided.get(required_field) is None:
        raise DomainError(
            code="invalid_moderation_target",
            message=f"Action '{action_type}' requires {required_field}.",
            status_code=400,
        )
    # Ensure no extra targets are set (mutual exclusivity)
    for field, value in provided.items():
        if field != required_field and value is not None:
            raise DomainError(
                code="invalid_moderation_target",
                message=f"Action '{action_type}' must not set {field}.",
                status_code=400,
            )

    # Validate target existence
    if required_field == "target_user_id":
        if not Users.objects.filter(id=target_user_id).exists():
            raise ResourceMaskedNotFound(message="Target user not found.")
    elif required_field == "event_id":
        if not Events.objects.filter(id=event_id).exists():
            raise ResourceMaskedNotFound(message="Target event not found.")
    elif required_field == "feedback_id":
        if not Feedback.objects.filter(id=feedback_id).exists():
            raise ResourceMaskedNotFound(message="Target feedback not found.")

    # Reason required for destructive actions
    if action_type in REASON_REQUIRED_ACTIONS and not (reason or "").strip():
        raise DomainError(
            code="reason_required",
            message="A reason is required for this moderation action.",
            status_code=400,
        )

    # expires_at only for user_block
    if expires_at is not None and action_type != "user_block":
        raise DomainError(
            code="invalid_moderation_expiry",
            message="expires_at is only valid for user_block.",
            status_code=400,
        )

    # Self-moderation guard (mirrors ck_moderation_no_self)
    if target_user_id is not None and target_user_id == admin_user.id:
        raise PermissionDeniedError(
            message="You cannot moderate your own account.",
            code="no_self_moderation",
        )

    # Set app.user_id to ensure trigger actor validation succeeds
    with connection.cursor() as cursor:
        cursor.execute("SELECT set_config('app.user_id', %s, true)", [str(admin_user.id)])

    try:
        action = ModerationActions.objects.create(
            admin_user=admin_user,
            target_user_id=target_user_id,
            event_id=event_id,
            feedback_id=feedback_id,
            action_type=action_type,
            reason=reason,
            expires_at=expires_at,
        )
    except (ProgrammingError, IntegrityError, InternalError) as exc:
        raise translate_db_exception(exc) from exc

    logger.info(
        "Moderation action recorded",
        extra={"action_id": action.id, "action_type": action_type, "admin_id": admin_user.id},
    )
    return action


def get_moderation_history(actor, target_user_id: int | None = None) -> list[dict]:
    """Retrieve moderation history (admin only), optionally filtered by target user."""
    _require_admin(actor)
    qs = ModerationActions.objects.select_related("admin_user", "target_user").order_by("-created_at")
    if target_user_id is not None:
        qs = qs.filter(target_user_id=target_user_id)
    return [
        {
            "id": m.id,
            "action_type": m.action_type,
            "admin_user_id": m.admin_user_id,
            "target_user_id": m.target_user_id,
            "event_id": m.event_id,
            "feedback_id": m.feedback_id,
            "reason": m.reason,
            "expires_at": m.expires_at,
            "created_at": m.created_at,
        }
        for m in qs
    ]

