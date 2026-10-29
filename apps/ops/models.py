# apps/ops/models.py
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q

from apps.common.constants import (
    ASSIGNMENT_ASSIGNED,
    ASSIGNMENT_CANCELLED,
    ASSIGNMENT_COMPLETED,
    ASSIGNMENT_CONFIRMED,
    ATTENDANCE_ABSENT,
    ATTENDANCE_CHECKED_IN,
    ATTENDANCE_COMPLETED,
    ATTENDANCE_EXPECTED,
    FEEDBACK_COORDINATOR_TO_VOLUNTEER,
    FEEDBACK_VOLUNTEER_TO_COORDINATOR,
    FEEDBACK_VOLUNTEER_TO_EVENT,
    QR_CHECKIN,
    QR_JOIN_EVENT,
    QR_WALKIN_REGISTRATION,
)
from apps.common.fields import ChoiceArrayField


class QrToken(models.Model):
    PURPOSE_CHOICES = [
        (QR_WALKIN_REGISTRATION, "Walk-in Registration"),
        (QR_CHECKIN, "Check-in"),
        (QR_JOIN_EVENT, "Join Event"),
    ]

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey(
        "events.Event",
        on_delete=models.CASCADE,
        related_name="qr_tokens",
    )
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="created_qr_tokens",
    )
    purpose = models.CharField(max_length=30, choices=PURPOSE_CHOICES)
    token_hash = models.CharField(max_length=128, unique=True)

    max_uses = models.IntegerField(null=True, blank=True)
    used_count = models.IntegerField(default=0)

    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "qr_tokens"
        verbose_name = "QR Token"
        verbose_name_plural = "QR Tokens"
        constraints = [
            models.CheckConstraint(
                condition=Q(max_uses__isnull=True) | Q(max_uses__gt=0),
                name="ck_qr_max_uses",
            ),
            models.CheckConstraint(
                condition=Q(used_count__gte=0),
                name="ck_qr_used_count_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(max_uses__isnull=True) | Q(used_count__lte=F("max_uses")),
                name="ck_qr_used_count",
            ),
        ]
        indexes = [
            models.Index(fields=["event", "purpose"], name="idx_qr_event_purpose"),
        ]

    def __str__(self):
        return f"QR Token ({self.purpose}) for {self.event.title}"

    def clean(self):
        super().clean()
        if self.max_uses is not None and self.max_uses <= 0:
            raise ValidationError({"max_uses": "max_uses must be greater than 0."})
        if self.used_count < 0:
            raise ValidationError({"used_count": "used_count cannot be negative."})
        if self.max_uses is not None and self.used_count > self.max_uses:
            raise ValidationError({"used_count": "used_count cannot exceed max_uses."})


class Assignment(models.Model):
    STATUS_CHOICES = [
        (ASSIGNMENT_ASSIGNED, "Assigned"),
        (ASSIGNMENT_CONFIRMED, "Confirmed"),
        (ASSIGNMENT_COMPLETED, "Completed"),
        (ASSIGNMENT_CANCELLED, "Cancelled"),
    ]

    ASSIGNED_BY_CHOICES = [
        ("auto", "Auto"),
        ("coordinator", "Coordinator"),
        ("admin", "Admin"),
    ]

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey(
        "events.Event",
        on_delete=models.CASCADE,
        related_name="assignments",
    )
    application = models.ForeignKey(
        "events.EventApplication",
        on_delete=models.CASCADE,
        related_name="assignments",
    )
    post = models.ForeignKey(
        "events.EventPost",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assignments",
    )
    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="assignments",
    )

    group_code = models.CharField(max_length=50, null=True, blank=True)
    is_group_leader = models.BooleanField(default=False)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=ASSIGNMENT_ASSIGNED,
    )
    assigned_by = models.CharField(
        max_length=20,
        choices=ASSIGNED_BY_CHOICES,
        default="auto",
    )
    assigned_by_user = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="made_assignments",
    )

    schedule_start = models.DateTimeField(null=True, blank=True)
    schedule_end = models.DateTimeField(null=True, blank=True)
    conditions_snapshot = models.JSONField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "assignments"
        verbose_name = "Assignment"
        verbose_name_plural = "Assignments"
        constraints = [
            models.UniqueConstraint(
                fields=["event", "user"],
                condition=~Q(status=ASSIGNMENT_CANCELLED),
                name="uq_assignment_active",
            ),
            models.UniqueConstraint(
                fields=["application"],
                condition=~Q(status=ASSIGNMENT_CANCELLED),
                name="uq_assignment_application",
            ),
            models.UniqueConstraint(
                fields=["event", "group_code"],
                condition=Q(is_group_leader=True) & ~Q(status=ASSIGNMENT_CANCELLED),
                name="uq_assignment_group_leader",
            ),
            models.CheckConstraint(
                condition=(
                    Q(assigned_by="auto") & Q(assigned_by_user__isnull=True)
                )
                | (
                    ~Q(assigned_by="auto") & Q(assigned_by_user__isnull=False)
                ),
                name="ck_assignment_actor",
            ),
            models.CheckConstraint(
                condition=Q(schedule_start__isnull=True)
                | Q(schedule_end__isnull=True)
                | Q(schedule_end__gt=F("schedule_start")),
                name="ck_assignment_schedule",
            ),
            models.CheckConstraint(
                condition=Q(is_group_leader=False) | Q(group_code__isnull=False),
                name="ck_assignment_leader_group",
            ),
        ]
        indexes = [
            models.Index(fields=["event", "user"], name="idx_assign_event_user"),
        ]

    def __str__(self):
        return f"{self.user.display_name} -> {self.event.title} [{self.status}]"

    def clean(self):
        super().clean()
        if self.assigned_by == "auto" and self.assigned_by_user is not None:
            raise ValidationError("assigned_by_user must be null when assigned_by is 'auto'.")
        if self.assigned_by != "auto" and self.assigned_by_user is None:
            raise ValidationError("assigned_by_user must be set when assigned_by is not 'auto'.")
        if self.schedule_start and self.schedule_end and self.schedule_end <= self.schedule_start:
            raise ValidationError({"schedule_end": "schedule_end must be greater than schedule_start."})
        if self.is_group_leader and not self.group_code:
            raise ValidationError({"group_code": "group_code is required when is_group_leader is True."})


class Attendance(models.Model):
    STATUS_CHOICES = [
        (ATTENDANCE_EXPECTED, "Expected"),
        (ATTENDANCE_CHECKED_IN, "Checked In"),
        (ATTENDANCE_ABSENT, "Absent"),
        (ATTENDANCE_COMPLETED, "Completed"),
    ]

    METHOD_CHOICES = [
        ("qr_scan", "QR Scan"),
        ("coordinator_manual", "Coordinator Manual"),
        ("system", "System"),
    ]

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey(
        "events.Event",
        on_delete=models.CASCADE,
        related_name="attendances",
    )
    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="attendances",
    )
    assignment = models.ForeignKey(
        Assignment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attendances",
    )
    qr_token = models.ForeignKey(
        QrToken,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attendances",
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=ATTENDANCE_EXPECTED,
    )
    checkin_at = models.DateTimeField(null=True, blank=True)
    checkout_at = models.DateTimeField(null=True, blank=True)

    method = models.CharField(
        max_length=30,
        choices=METHOD_CHOICES,
        null=True,
        blank=True,
    )
    recorded_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column="recorded_by_user_id",
        related_name="recorded_attendances",
    )

    note = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "attendance"
        verbose_name = "Attendance"
        verbose_name_plural = "Attendances"
        constraints = [
            models.UniqueConstraint(
                fields=["event", "user"],
                name="uq_attendance_event_user",
            ),
            models.CheckConstraint(
                condition=~Q(status__in=[ATTENDANCE_CHECKED_IN, ATTENDANCE_COMPLETED])
                | Q(checkin_at__isnull=False),
                name="ck_attendance_checkin",
            ),
            models.CheckConstraint(
                condition=Q(checkout_at__isnull=True)
                | (
                    Q(checkin_at__isnull=False)
                    & Q(checkout_at__gte=F("checkin_at"))
                ),
                name="ck_attendance_checkout",
            ),
        ]
        indexes = [
            models.Index(fields=["event", "status"], name="idx_attend_event_status"),
        ]

    def __str__(self):
        return f"Attendance: {self.user.display_name} @ {self.event.title} [{self.status}]"

    def clean(self):
        super().clean()
        if self.status in [ATTENDANCE_CHECKED_IN, ATTENDANCE_COMPLETED] and self.checkin_at is None:
            raise ValidationError({"checkin_at": "checkin_at is required when checked_in or completed."})
        if self.checkout_at is not None:
            if self.checkin_at is None:
                raise ValidationError({"checkout_at": "checkin_at is required if checkout_at is set."})
            if self.checkout_at < self.checkin_at:
                raise ValidationError({"checkout_at": "checkout_at must be >= checkin_at."})


class OnboardingAcknowledgment(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="onboarding_acknowledgments",
    )
    event = models.ForeignKey(
        "events.Event",
        on_delete=models.CASCADE,
        related_name="onboarding_acknowledgments",
    )
    onboarding_version = models.IntegerField()
    method = models.CharField(max_length=30, default="app_tick")
    acknowledged_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "onboarding_acknowledgments"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "event", "onboarding_version"],
                name="uq_onboarding_ack",
            ),
        ]
        verbose_name = "Onboarding Acknowledgment"
        verbose_name_plural = "Onboarding Acknowledgments"

    def __str__(self):
        return f"{self.user.display_name} acknowledged event {self.event_id} (v{self.onboarding_version})"


class Feedback(models.Model):
    DIRECTION_CHOICES = [
        (FEEDBACK_COORDINATOR_TO_VOLUNTEER, "Coordinator to Volunteer"),
        (FEEDBACK_VOLUNTEER_TO_EVENT, "Volunteer to Event"),
        (FEEDBACK_VOLUNTEER_TO_COORDINATOR, "Volunteer to Coordinator"),
    ]

    STATUS_CHOICES = [
        ("active", "Active"),
        ("hidden", "Hidden"),
    ]

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey(
        "events.Event",
        on_delete=models.CASCADE,
        related_name="feedbacks",
    )
    rater_user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="given_feedbacks",
    )
    target_user = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="received_feedbacks",
    )

    direction = models.CharField(max_length=30, choices=DIRECTION_CHOICES)
    score = models.IntegerField(null=True, blank=True)
    tags = ChoiceArrayField(
        models.CharField(max_length=50),
        default=list,
        blank=True,
    )
    comment = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "feedback"
        verbose_name = "Feedback"
        verbose_name_plural = "Feedbacks"
        constraints = [
            models.CheckConstraint(
                condition=Q(score__gte=1) & Q(score__lte=5),
                name="ck_feedback_score",
            ),
            models.CheckConstraint(
                condition=(
                    Q(direction=FEEDBACK_VOLUNTEER_TO_EVENT) & Q(target_user__isnull=True)
                )
                | (
                    ~Q(direction=FEEDBACK_VOLUNTEER_TO_EVENT) & Q(target_user__isnull=False)
                ),
                name="ck_feedback_target",
            ),
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
        indexes = [
            models.Index(fields=["event"], name="idx_feedback_event"),
            models.Index(fields=["rater_user"], name="idx_feedback_rater"),
            models.Index(fields=["target_user"], name="idx_feedback_target"),
        ]

    def __str__(self):
        return f"Feedback {self.direction} by {self.rater_user.display_name} ({self.score}/5)"

    def clean(self):
        super().clean()
        if self.score is not None and not (1 <= self.score <= 5):
            raise ValidationError({"score": "score must be between 1 and 5."})
        if self.direction == FEEDBACK_VOLUNTEER_TO_EVENT and self.target_user is not None:
            raise ValidationError({"target_user": "target_user must be null when direction is 'volunteer_to_event'."})
        if self.direction != FEEDBACK_VOLUNTEER_TO_EVENT and self.target_user is None:
            raise ValidationError({"target_user": "target_user is required when direction is not 'volunteer_to_event'."})
