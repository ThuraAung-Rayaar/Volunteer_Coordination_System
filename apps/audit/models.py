# apps/audit/models.py
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


class ModerationAction(models.Model):
    USER_ACTION_TYPES = [
        "user_warning",
        "user_block",
        "user_unblock",
        "account_close",
        "account_reinstate",
    ]
    EVENT_ACTION_TYPES = [
        "event_delete",
        "event_restore",
        "event_cancel",
    ]
    FEEDBACK_ACTION_TYPES = [
        "feedback_hide",
    ]

    ACTION_TYPE_CHOICES = [
        ("user_warning", "User Warning"),
        ("user_block", "User Block"),
        ("user_unblock", "User Unblock"),
        ("account_close", "Account Close"),
        ("account_reinstate", "Account Reinstate"),
        ("event_delete", "Event Delete"),
        ("event_restore", "Event Restore"),
        ("event_cancel", "Event Cancel"),
        ("feedback_hide", "Feedback Hide"),
    ]

    id = models.BigAutoField(primary_key=True)
    admin_user = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        related_name="performed_moderations",
    )
    target_user = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="moderation_records",
    )
    event = models.ForeignKey(
        "events.Event",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="moderation_records",
    )
    feedback = models.ForeignKey(
        "ops.Feedback",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="moderation_records",
    )

    action_type = models.CharField(max_length=30, choices=ACTION_TYPE_CHOICES)
    reason = models.TextField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "moderation_actions"
        verbose_name = "Moderation Action"
        verbose_name_plural = "Moderation Actions"
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(
                        action_type__in=[
                            "user_warning",
                            "user_block",
                            "user_unblock",
                            "account_close",
                            "account_reinstate",
                        ]
                    )
                    & Q(target_user__isnull=False)
                )
                | (
                    Q(
                        action_type__in=[
                            "event_delete",
                            "event_restore",
                            "event_cancel",
                        ]
                    )
                    & Q(event__isnull=False)
                )
                | (
                    Q(action_type="feedback_hide")
                    & Q(feedback__isnull=False)
                ),
                name="ck_moderation_subject",
            ),
            models.CheckConstraint(
                condition=Q(expires_at__isnull=True) | Q(action_type="user_block"),
                name="ck_moderation_expiry",
            ),
        ]
        indexes = [
            models.Index(fields=["admin_user"], name="idx_mod_action_admin"),
            models.Index(fields=["target_user", "action_type"], name="idx_mod_action_target"),
            models.Index(fields=["event"], name="idx_mod_action_event"),
        ]

    def __str__(self):
        return f"{self.action_type} by Admin {self.admin_user_id}"

    def clean(self):
        super().clean()
        if self.action_type in self.USER_ACTION_TYPES and self.target_user is None:
            raise ValidationError({"target_user": f"target_user is required for '{self.action_type}'."})
        if self.action_type in self.EVENT_ACTION_TYPES and self.event is None:
            raise ValidationError({"event": f"event is required for '{self.action_type}'."})
        if self.action_type in self.FEEDBACK_ACTION_TYPES and self.feedback is None:
            raise ValidationError({"feedback": f"feedback is required for '{self.action_type}'."})
        if self.expires_at is not None and self.action_type != "user_block":
            raise ValidationError({"expires_at": "expires_at may only be set for 'user_block' action."})


class AuditLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    actor_user = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=100)
    entity_type = models.CharField(max_length=100)
    entity_id = models.BigIntegerField(null=True, blank=True)

    before_data = models.JSONField(null=True, blank=True)
    after_data = models.JSONField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_logs"
        verbose_name = "Audit Log"
        verbose_name_plural = "Audit Logs"
        indexes = [
            models.Index(fields=["entity_type", "entity_id"], name="idx_audit_entity"),
            models.Index(fields=["actor_user"], name="idx_audit_actor"),
            models.Index(fields=["created_at"], name="idx_audit_created"),
        ]

    def __str__(self):
        return f"{self.action} on {self.entity_type} #{self.entity_id}"

    def save(self, *args, **kwargs):
        if self.pk is not None and not getattr(self, "_state", None).adding:
            raise ValidationError("AuditLog records are append-only and cannot be updated.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("AuditLog records are append-only and cannot be deleted.")
