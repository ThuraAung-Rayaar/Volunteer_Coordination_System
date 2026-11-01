from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import Q
from django.utils import timezone


class CharityFields(models.Model):
    code = models.CharField(primary_key=True, max_length=50)
    label = models.CharField(max_length=100)
    active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=100)

    class Meta:
        managed = False
        db_table = "charity_fields"


class Events(models.Model):
    class PurposeType(models.TextChoices):
        CHARITY_EVENT = 'charity_event', 'Charity Event'
        HELP_WANTED_EVENT = 'help_wanted_event', 'Help Wanted Event'

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PUBLISHED = 'published', 'Published'
        ACTIVE = 'active', 'Active'
        COMPLETED = 'completed', 'Completed'
        CANCELLED = 'cancelled', 'Cancelled'

    class AcceptanceMode(models.TextChoices):
        AUTO = 'auto', 'Auto'
        MANUAL = 'manual', 'Manual'

    class LeaderStrategy(models.TextChoices):
        NONE = 'none', 'None'
        FIRST_EXPERIENCED = 'first_experienced', 'First Experienced'
        MANUAL = 'manual', 'Manual'

    class CompensationKind(models.TextChoices):
        UNPAID = 'unpaid', 'Unpaid'
        ARRANGED_OUTSIDE_SYSTEM = 'arranged_outside_system', 'Arranged Outside System'

    class MapProvider(models.TextChoices):
        OPENSTREETMAP = 'openstreetmap', 'OpenStreetMap'
        GOOGLE = 'google', 'Google Maps'

    id = models.BigAutoField(primary_key=True)
    owner = models.ForeignKey(
        "coordination.CoordinatorProfiles",
        models.PROTECT,
        db_column="owner_id",
        to_field="user",
        related_name="owned_events",
    )
    current_coordinator = models.ForeignKey(
        "coordination.CoordinatorProfiles",
        models.PROTECT,
        db_column="current_coordinator_id",
        to_field="user",
        related_name="events_current_coordinator_set",
    )

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    purpose_type = models.CharField(
        max_length=30,
        choices=PurposeType.choices,
        default=PurposeType.CHARITY_EVENT,
    )

    location_name = models.TextField(blank=True, null=True)
    landmark_text = models.TextField(blank=True, null=True)

    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    geo_radius_m = models.IntegerField(blank=True, null=True)
    geo_checkin_enabled = models.BooleanField(default=False)
    geo_checkin_opens_before_min = models.IntegerField(default=30)
    require_checkin_confirmation = models.BooleanField(default=True)
    map_provider = models.CharField(
        max_length=20,
        choices=MapProvider.choices,
        default=MapProvider.OPENSTREETMAP,
    )

    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    application_deadline = models.DateTimeField(blank=True, null=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    acceptance_mode = models.CharField(
        max_length=20,
        choices=AcceptanceMode.choices,
        default=AcceptanceMode.MANUAL,
    )
    auto_assign_enabled = models.BooleanField(default=True)
    group_size = models.IntegerField(blank=True, null=True)
    leader_strategy = models.CharField(
        max_length=30,
        choices=LeaderStrategy.choices,
        default=LeaderStrategy.NONE,
    )
    max_participants = models.IntegerField(blank=True, null=True)

    meals_provided = models.BooleanField(default=False)
    lodging_provided = models.BooleanField(default=False)
    travel_support_provided = models.BooleanField(default=False)
    compensation_kind = models.CharField(
        max_length=30,
        choices=CompensationKind.choices,
        default=CompensationKind.UNPAID,
    )
    compensation_note = models.TextField(blank=True, null=True)

    onboarding_text = models.TextField(blank=True, null=True)
    onboarding_version = models.IntegerField(default=1)
    require_onboarding_ack = models.BooleanField(default=True)

    qr_registration_enabled = models.BooleanField(default=True)

    published_at = models.DateTimeField(blank=True, null=True)
    activated_at = models.DateTimeField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)
    cancelled_at = models.DateTimeField(blank=True, null=True)
    cancel_reason = models.TextField(blank=True, null=True)

    deleted_at = models.DateTimeField(blank=True, null=True)
    deleted_by = models.ForeignKey(
        "accounts.Users",
        models.PROTECT,
        related_name="events_deleted_by_set",
        blank=True,
        null=True,
    )

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "events"

    @property
    def owner_user(self):
        return self.owner.user

    @property
    def coordinator_user(self):
        return self.current_coordinator.user if self.current_coordinator else None


class EventPosts(models.Model):
    class PhysicalLevel(models.TextChoices):
        NONE = 'none', 'None'
        LIGHT = 'light', 'Light'
        MEDIUM = 'medium', 'Medium'
        HEAVY = 'heavy', 'Heavy'

    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        FULL = 'full', 'Full'
        CLOSED = 'closed', 'Closed'

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey("events.Events", models.PROTECT, related_name="posts")
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True, null=True)

    required_headcount = models.IntegerField()
    physical_level = models.CharField(
        max_length=20,
        choices=PhysicalLevel.choices,
        default=PhysicalLevel.NONE,
    )
    required_skills = ArrayField(models.CharField(max_length=50), default=list, blank=True)

    leader_needed = models.BooleanField(default=False)
    new_volunteers_allowed = models.BooleanField(default=True)
    priority = models.IntegerField(default=100)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
    )

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "event_posts"
        constraints = [
            models.UniqueConstraint(
                fields=["event", "title"],
                name="uq_event_posts_event_title",
            ),
            models.UniqueConstraint(
                fields=["id", "event"],
                name="uq_event_posts_id_event",
            ),
        ]


class EventApplications(models.Model):
    class Source(models.TextChoices):
        BROWSE = 'browse', 'Browse'
        QR_WALKIN = 'qr_walkin', 'QR Walkin'
        INVITE = 'invite', 'Invite'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        ACCEPTED = 'accepted', 'Accepted'
        WAITLISTED = 'waitlisted', 'Waitlisted'
        REJECTED = 'rejected', 'Rejected'
        WITHDRAWN = 'withdrawn', 'Withdrawn'
        EXPIRED = 'expired', 'Expired'

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey("events.Events", models.PROTECT, related_name="applications")
    post = models.ForeignKey("events.EventPosts", models.PROTECT, blank=True, null=True, related_name="applications")
    user = models.ForeignKey("accounts.Users", models.PROTECT, related_name="event_applications")
    qr_token = models.ForeignKey("attendance.QrTokens", models.PROTECT, blank=True, null=True)

    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.BROWSE,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    applied_at = models.DateTimeField(default=timezone.now)

    decided_by = models.ForeignKey(
        "accounts.Users",
        models.PROTECT,
        related_name="eventapplications_decided_by_set",
        blank=True,
        null=True,
    )
    decided_at = models.DateTimeField(blank=True, null=True)

    conditions_acknowledged_at = models.DateTimeField(blank=True, null=True)
    conditions_snapshot = models.JSONField(blank=True, null=True)
    note = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "event_applications"
        constraints = [
            models.UniqueConstraint(
                fields=["id", "event", "user"],
                name="uq_event_applications_id_event_user",
            ),
            models.UniqueConstraint(
                fields=["event", "user"],
                condition=Q(status__in=["pending", "accepted", "waitlisted"]),
                name="uq_event_application_active",
            ),
        ]


class EventCharityFields(models.Model):
    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey("events.Events", models.CASCADE, related_name="charity_fields")
    field_code = models.ForeignKey("events.CharityFields", models.PROTECT, db_column="field_code")

    class Meta:
        managed = False
        db_table = "event_charity_fields"
        constraints = [
            models.UniqueConstraint(
                fields=["event", "field_code"],
                name="uq_event_charity_field",
            )
        ]
