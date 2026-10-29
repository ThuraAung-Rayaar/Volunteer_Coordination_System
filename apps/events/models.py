# apps/events/models.py
from django.contrib.postgres.indexes import GinIndex
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q

from apps.common.constants import (
    APPLICATION_ACCEPTED,
    APPLICATION_EXPIRED,
    APPLICATION_PENDING,
    APPLICATION_REJECTED,
    APPLICATION_WAITLISTED,
    APPLICATION_WITHDRAWN,
    EVENT_ACTIVE,
    EVENT_CANCELLED,
    EVENT_COMPLETED,
    EVENT_DRAFT,
    EVENT_PUBLISHED,
)
from apps.common.fields import ChoiceArrayField


class CharityField(models.Model):
    code = models.CharField(max_length=50, primary_key=True)
    label = models.CharField(max_length=100)
    active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=100)

    class Meta:
        db_table = "charity_fields"
        ordering = ["sort_order", "code"]
        verbose_name = "Charity Field"
        verbose_name_plural = "Charity Fields"

    def __str__(self):
        return f"{self.label} ({self.code})"


class EventQuerySet(models.QuerySet):
    def visible(self):
        return self.filter(deleted_at__isnull=True)


class Event(models.Model):
    PURPOSE_TYPE_CHOICES = [
        ("charity_event", "Charity Event"),
        ("help_wanted_event", "Help Wanted Event"),
    ]

    STATUS_CHOICES = [
        (EVENT_DRAFT, "Draft"),
        (EVENT_PUBLISHED, "Published"),
        (EVENT_ACTIVE, "Active"),
        (EVENT_COMPLETED, "Completed"),
        (EVENT_CANCELLED, "Cancelled"),
    ]

    ACCEPTANCE_MODE_CHOICES = [
        ("auto", "Auto"),
        ("manual", "Manual"),
    ]

    LEADER_STRATEGY_CHOICES = [
        ("none", "None"),
        ("first_experienced", "First Experienced"),
        ("manual", "Manual"),
    ]

    COMPENSATION_KIND_CHOICES = [
        ("unpaid", "Unpaid"),
        ("arranged_outside_system", "Arranged Outside System"),
    ]

    id = models.BigAutoField(primary_key=True)

    coordinator = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        related_name="coordinated_events",
    )

    title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    purpose_type = models.CharField(
        max_length=30,
        choices=PURPOSE_TYPE_CHOICES,
        default="charity_event",
    )

    location_name = models.CharField(max_length=255, null=True, blank=True)
    landmark_text = models.TextField(null=True, blank=True)

    start_at = models.DateTimeField(db_index=True)
    end_at = models.DateTimeField()
    application_deadline = models.DateTimeField(null=True, blank=True)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=EVENT_DRAFT,
    )

    acceptance_mode = models.CharField(
        max_length=20,
        choices=ACCEPTANCE_MODE_CHOICES,
        default="manual",
    )
    auto_assign_enabled = models.BooleanField(default=True)
    group_size = models.IntegerField(null=True, blank=True)
    leader_strategy = models.CharField(
        max_length=30,
        choices=LEADER_STRATEGY_CHOICES,
        default="none",
    )
    max_participants = models.IntegerField(null=True, blank=True)

    # Recruiting conditions (informational only)
    meals_provided = models.BooleanField(default=False)
    lodging_provided = models.BooleanField(default=False)
    travel_support_provided = models.BooleanField(default=False)

    compensation_kind = models.CharField(
        max_length=30,
        choices=COMPENSATION_KIND_CHOICES,
        default="unpaid",
    )
    compensation_note = models.TextField(null=True, blank=True)

    # Onboarding
    onboarding_text = models.TextField(null=True, blank=True)
    onboarding_version = models.IntegerField(default=1)
    require_onboarding_ack = models.BooleanField(default=True)

    # Walk-in QR registration
    qr_registration_enabled = models.BooleanField(default=True)

    # Soft delete
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deleted_events",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = EventQuerySet.as_manager()

    class Meta:
        db_table = "events"
        verbose_name = "Event"
        verbose_name_plural = "Events"
        constraints = [
            models.CheckConstraint(
                condition=Q(end_at__gt=F("start_at")),
                name="ck_events_time",
            ),
            models.CheckConstraint(
                condition=Q(application_deadline__isnull=True)
                | Q(application_deadline__lte=F("start_at")),
                name="ck_events_deadline",
            ),
            models.CheckConstraint(
                condition=(
                    Q(deleted_at__isnull=True) & Q(deleted_by__isnull=True)
                )
                | (
                    Q(deleted_at__isnull=False) & Q(deleted_by__isnull=False)
                ),
                name="ck_events_soft_delete",
            ),
            models.CheckConstraint(
                condition=Q(group_size__isnull=True) | Q(group_size__gt=0),
                name="ck_events_group_size",
            ),
            models.CheckConstraint(
                condition=Q(max_participants__isnull=True) | Q(max_participants__gt=0),
                name="ck_events_max_participants",
            ),
            models.CheckConstraint(
                condition=Q(onboarding_version__gte=1),
                name="ck_events_onboarding_version",
            ),
        ]
        indexes = [
            models.Index(fields=["coordinator"], name="idx_events_coordinator"),
            models.Index(fields=["start_at"], name="idx_events_start_at"),
            models.Index(
                fields=["status", "start_at"],
                name="idx_events_visible",
                condition=Q(deleted_at__isnull=True),
            ),
        ]

    def __str__(self):
        return f"{self.title} ({self.status})"

    def clean(self):
        super().clean()
        if self.start_at and self.end_at and self.end_at <= self.start_at:
            raise ValidationError({"end_at": "end_at must be greater than start_at."})
        if self.application_deadline and self.start_at and self.application_deadline > self.start_at:
            raise ValidationError({"application_deadline": "application_deadline must be <= start_at."})
        if (self.deleted_at is None) != (self.deleted_by is None):
            raise ValidationError("deleted_at and deleted_by must be set together or both null.")
        if self.group_size is not None and self.group_size <= 0:
            raise ValidationError({"group_size": "group_size must be greater than 0."})
        if self.max_participants is not None and self.max_participants <= 0:
            raise ValidationError({"max_participants": "max_participants must be greater than 0."})
        if self.onboarding_version is not None and self.onboarding_version < 1:
            raise ValidationError({"onboarding_version": "onboarding_version must be >= 1."})


class EventCharityField(models.Model):
    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name="charity_links",
    )
    field_code = models.ForeignKey(
        CharityField,
        on_delete=models.PROTECT,
        db_column="field_code",
        related_name="event_links",
    )

    class Meta:
        db_table = "event_charity_fields"
        constraints = [
            models.UniqueConstraint(
                fields=["event", "field_code"],
                name="uq_event_charity_field",
            ),
        ]
        verbose_name = "Event Charity Field"
        verbose_name_plural = "Event Charity Fields"

    def __str__(self):
        return f"{self.event.title} -> {self.field_code.label}"


class EventPost(models.Model):
    PHYSICAL_LEVEL_CHOICES = [
        ("none", "None"),
        ("light", "Light"),
        ("medium", "Medium"),
        ("heavy", "Heavy"),
    ]

    STATUS_CHOICES = [
        ("open", "Open"),
        ("full", "Full"),
        ("closed", "Closed"),
    ]

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name="posts",
    )

    title = models.CharField(max_length=150)
    description = models.TextField(null=True, blank=True)
    required_headcount = models.IntegerField()

    physical_level = models.CharField(
        max_length=20,
        choices=PHYSICAL_LEVEL_CHOICES,
        default="none",
    )
    required_skills = ChoiceArrayField(
        models.CharField(max_length=50),
        default=list,
        blank=True,
    )

    leader_needed = models.BooleanField(default=False)
    new_volunteers_allowed = models.BooleanField(default=True)
    priority = models.IntegerField(default=100)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="open",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "event_posts"
        constraints = [
            models.UniqueConstraint(
                fields=["event", "title"],
                name="uq_event_post_event_title",
            ),
            models.CheckConstraint(
                condition=Q(required_headcount__gt=0),
                name="ck_event_posts_headcount",
            ),
        ]
        indexes = [
            GinIndex(fields=["required_skills"], name="idx_event_posts_skills_gin"),
        ]
        verbose_name = "Event Post"
        verbose_name_plural = "Event Posts"

    def __str__(self):
        return f"{self.title} @ {self.event.title}"

    def clean(self):
        super().clean()
        if self.required_headcount is not None and self.required_headcount <= 0:
            raise ValidationError({"required_headcount": "required_headcount must be greater than 0."})


class EventApplication(models.Model):
    SOURCE_CHOICES = [
        ("browse", "Browse"),
        ("qr_walkin", "QR Walk-in"),
        ("invite", "Invite"),
    ]

    STATUS_CHOICES = [
        (APPLICATION_PENDING, "Pending"),
        (APPLICATION_ACCEPTED, "Accepted"),
        (APPLICATION_WAITLISTED, "Waitlisted"),
        (APPLICATION_REJECTED, "Rejected"),
        (APPLICATION_WITHDRAWN, "Withdrawn"),
        (APPLICATION_EXPIRED, "Expired"),
    ]

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name="applications",
    )
    post = models.ForeignKey(
        EventPost,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="applications",
    )
    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="applications",
    )
    qr_token = models.ForeignKey(
        "ops.QrToken",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="applications",
    )

    source = models.CharField(
        max_length=20,
        choices=SOURCE_CHOICES,
        default="browse",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=APPLICATION_PENDING,
        db_index=True,
    )

    applied_at = models.DateTimeField(auto_now_add=True)
    decided_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="decided_applications",
    )
    decided_at = models.DateTimeField(null=True, blank=True)

    conditions_acknowledged_at = models.DateTimeField(null=True, blank=True)
    conditions_snapshot = models.JSONField(null=True, blank=True)
    note = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "event_applications"
        verbose_name = "Event Application"
        verbose_name_plural = "Event Applications"
        constraints = [
            models.UniqueConstraint(
                fields=["event", "user"],
                condition=Q(status__in=["pending", "accepted", "waitlisted"]),
                name="uq_event_application_active",
            ),
            models.CheckConstraint(
                condition=~Q(source="qr_walkin") | Q(qr_token__isnull=False),
                name="ck_application_walkin_token",
            ),
            models.CheckConstraint(
                condition=~Q(status__in=["accepted", "rejected"])
                | Q(decided_at__isnull=False),
                name="ck_application_decided",
            ),
        ]
        indexes = [
            models.Index(fields=["event", "status"], name="idx_event_apps_status"),
        ]

    def __str__(self):
        return f"{self.user.display_name} -> {self.event.title} [{self.status}]"

    def clean(self):
        super().clean()
        if self.source == "qr_walkin" and self.qr_token is None:
            raise ValidationError({"qr_token": "qr_token is required when source is 'qr_walkin'."})
        if self.status in [APPLICATION_ACCEPTED, APPLICATION_REJECTED] and self.decided_at is None:
            raise ValidationError({"decided_at": f"decided_at is required when status is '{self.status}'."})
