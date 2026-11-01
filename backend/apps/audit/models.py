from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import Q
from django.utils import timezone


class AuditLogs(models.Model):
    id = models.BigAutoField(primary_key=True)
    actor_user = models.ForeignKey("accounts.Users", models.PROTECT, blank=True, null=True)

    action = models.CharField(max_length=100)
    entity_type = models.CharField(max_length=100)
    entity_id = models.BigIntegerField(blank=True, null=True)

    before_data = models.JSONField(blank=True, null=True)
    after_data = models.JSONField(blank=True, null=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "audit_logs"


class Feedback(models.Model):
    class Direction(models.TextChoices):
        COORDINATOR_TO_VOLUNTEER = 'coordinator_to_volunteer', 'Coordinator to Volunteer'
        VOLUNTEER_TO_EVENT = 'volunteer_to_event', 'Volunteer to Event'
        VOLUNTEER_TO_COORDINATOR = 'volunteer_to_coordinator', 'Volunteer to Coordinator'

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        HIDDEN = 'hidden', 'Hidden'

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey("events.Events", models.PROTECT, related_name="feedbacks")
    rater_user = models.ForeignKey("accounts.Users", models.PROTECT, related_name="given_feedbacks")
    target_user = models.ForeignKey(
        "accounts.Users",
        models.PROTECT,
        related_name="feedback_target_user_set",
        blank=True,
        null=True,
    )

    direction = models.CharField(
        max_length=30,
        choices=Direction.choices,
    )
    score = models.IntegerField()
    tags = ArrayField(models.CharField(max_length=50), default=list, blank=True)
    comment = models.TextField(blank=True, null=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "feedback"
        constraints = [
            models.UniqueConstraint(
                fields=["event", "rater_user", "direction"],
                condition=Q(target_user__isnull=True),
                name="uq_feedback_event_once",
            ),
            models.UniqueConstraint(
                fields=["event", "rater_user", "direction", "target_user"],
                condition=Q(target_user__isnull=False),
                name="uq_feedback_user_once",
            ),
        ]


class ModerationActions(models.Model):
    class ActionType(models.TextChoices):
        USER_WARNING = 'user_warning', 'User Warning'
        USER_BLOCK = 'user_block', 'User Block'
        USER_UNBLOCK = 'user_unblock', 'User Unblock'
        ACCOUNT_CLOSE = 'account_close', 'Account Close'
        ACCOUNT_REINSTATE = 'account_reinstate', 'Account Reinstate'
        EVENT_DELETE = 'event_delete', 'Event Delete'
        EVENT_RESTORE = 'event_restore', 'Event Restore'
        EVENT_CANCEL = 'event_cancel', 'Event Cancel'
        FEEDBACK_HIDE = 'feedback_hide', 'Feedback Hide'

    id = models.BigAutoField(primary_key=True)
    admin_user = models.ForeignKey("accounts.Users", models.PROTECT, related_name="performed_moderations")

    target_user = models.ForeignKey(
        "accounts.Users",
        models.PROTECT,
        related_name="moderationactions_target_user_set",
        blank=True,
        null=True,
    )
    event = models.ForeignKey("events.Events", models.PROTECT, blank=True, null=True)
    feedback = models.ForeignKey("audit.Feedback", models.PROTECT, blank=True, null=True)

    action_type = models.CharField(
        max_length=30,
        choices=ActionType.choices,
    )
    reason = models.TextField(blank=True, null=True)
    expires_at = models.DateTimeField(blank=True, null=True)

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "moderation_actions"


class AppSettings(models.Model):
    key = models.CharField(primary_key=True, max_length=100)
    value_int = models.IntegerField()
    description = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "app_settings"
