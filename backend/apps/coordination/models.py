from django.db import models
from django.db.models import Q
from django.utils import timezone


class CoordinatorProfiles(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        SUSPENDED = 'suspended', 'Suspended'
        REVOKED = 'revoked', 'Revoked'

    user = models.OneToOneField(
        "accounts.Users",
        models.PROTECT,
        primary_key=True,
        db_column="user_id",
        related_name="coordinator_profile",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    approved_by = models.ForeignKey(
        "accounts.Users",
        models.PROTECT,
        related_name="coordinatorprofiles_approved_by_set",
        blank=True,
        null=True,
    )
    approved_at = models.DateTimeField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "coordinator_profiles"


class EventCoordinatorHistory(models.Model):
    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey("events.Events", models.PROTECT, related_name="coordinator_history")
    from_coordinator = models.ForeignKey(
        "coordination.CoordinatorProfiles",
        models.PROTECT,
        db_column="from_coordinator_id",
        to_field="user",
        blank=True,
        null=True,
    )
    to_coordinator = models.ForeignKey(
        "coordination.CoordinatorProfiles",
        models.PROTECT,
        db_column="to_coordinator_id",
        to_field="user",
        related_name="eventcoordinatorhistory_to_coordinator_set",
    )
    changed_by_user = models.ForeignKey(
        "accounts.Users",
        models.PROTECT,
        related_name="eventcoordinatorhistory_changed_by_user_set",
        blank=True,
        null=True,
    )
    reason = models.TextField(blank=True, null=True)
    changed_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "event_coordinator_history"


class Assignments(models.Model):
    class Status(models.TextChoices):
        ASSIGNED = 'assigned', 'Assigned'
        CONFIRMED = 'confirmed', 'Confirmed'
        COMPLETED = 'completed', 'Completed'
        CANCELLED = 'cancelled', 'Cancelled'

    class AssignedBy(models.TextChoices):
        AUTO = 'auto', 'Auto'
        COORDINATOR = 'coordinator', 'Coordinator'
        ADMIN = 'admin', 'Admin'

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey("events.Events", models.PROTECT, related_name="assignments")
    application = models.ForeignKey("events.EventApplications", models.PROTECT, related_name="assignments")
    user = models.ForeignKey("accounts.Users", models.PROTECT, related_name="assignments")
    post = models.ForeignKey("events.EventPosts", models.PROTECT, blank=True, null=True, related_name="assignments")

    group_code = models.CharField(max_length=50, blank=True, null=True)
    is_group_leader = models.BooleanField(default=False)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ASSIGNED,
    )
    assigned_by = models.CharField(
        max_length=20,
        choices=AssignedBy.choices,
        default=AssignedBy.AUTO,
    )
    assigned_by_user = models.ForeignKey(
        "accounts.Users",
        models.PROTECT,
        related_name="assignments_assigned_by_user_set",
        blank=True,
        null=True,
    )

    schedule_start = models.DateTimeField()
    schedule_end = models.DateTimeField()

    confirmed_at = models.DateTimeField(blank=True, null=True)
    cancelled_at = models.DateTimeField(blank=True, null=True)
    cancel_reason = models.TextField(blank=True, null=True)

    conditions_snapshot = models.JSONField(blank=True, null=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "assignments"
        constraints = [
            models.UniqueConstraint(
                fields=["id", "event", "user"],
                name="uq_assignments_id_event_user",
            ),
            models.UniqueConstraint(
                fields=["event", "user"],
                condition=~Q(status="cancelled"),
                name="uq_assignment_active",
            ),
            models.UniqueConstraint(
                fields=["application"],
                condition=~Q(status="cancelled"),
                name="uq_assignment_application",
            ),
            models.UniqueConstraint(
                fields=["event", "group_code"],
                condition=Q(is_group_leader=True) & ~Q(status="cancelled"),
                name="uq_assignment_group_leader",
            ),
        ]


class VEventCoordinatorHistory(models.Model):
    event_id = models.BigIntegerField(primary_key=True)
    event_title = models.TextField(blank=True, null=True)
    from_coordinator_id = models.BigIntegerField(blank=True, null=True)
    from_name = models.TextField(blank=True, null=True)
    to_coordinator_id = models.BigIntegerField(blank=True, null=True)
    to_name = models.TextField(blank=True, null=True)
    changed_by_user_id = models.BigIntegerField(blank=True, null=True)
    changed_by_name = models.TextField(blank=True, null=True)
    reason = models.TextField(blank=True, null=True)
    changed_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = "v_event_coordinator_history"

