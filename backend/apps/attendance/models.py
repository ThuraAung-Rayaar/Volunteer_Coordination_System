from django.db import models
from django.utils import timezone


class QrTokens(models.Model):
    class Purpose(models.TextChoices):
        WALKIN_REGISTRATION = 'walkin_registration', 'Walkin Registration'
        CHECKIN = 'checkin', 'Checkin'
        JOIN_EVENT = 'join_event', 'Join Event'

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey("events.Events", models.PROTECT, related_name="qr_tokens")
    created_by = models.ForeignKey("accounts.Users", models.PROTECT, related_name="created_qr_tokens")

    purpose = models.CharField(
        max_length=30,
        choices=Purpose.choices,
    )
    token_hash = models.CharField(unique=True, max_length=128)

    max_uses = models.IntegerField(blank=True, null=True)
    used_count = models.IntegerField(default=0)

    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "qr_tokens"
        constraints = [
            models.UniqueConstraint(
                fields=["id", "event"],
                name="uq_qr_tokens_id_event",
            )
        ]


class Attendance(models.Model):
    class Status(models.TextChoices):
        EXPECTED = 'expected', 'Expected'
        CHECKED_IN = 'checked_in', 'Checked In'
        ABSENT = 'absent', 'Absent'
        COMPLETED = 'completed', 'Completed'
        CANCELLED = 'cancelled', 'Cancelled'

    class Method(models.TextChoices):
        QR_SCAN = 'qr_scan', 'QR Scan'
        COORDINATOR_MANUAL = 'coordinator_manual', 'Coordinator Manual'
        GEO = 'geo', 'Geo'
        SYSTEM = 'system', 'System'

    class ConfirmationStatus(models.TextChoices):
        NOT_REQUIRED = 'not_required', 'Not Required'
        PENDING = 'pending', 'Pending'
        CONFIRMED = 'confirmed', 'Confirmed'
        REJECTED = 'rejected', 'Rejected'

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey("events.Events", models.PROTECT, related_name="attendances")
    user = models.ForeignKey("accounts.Users", models.PROTECT, related_name="attendances")
    assignment = models.ForeignKey("coordination.Assignments", models.PROTECT, related_name="attendances")
    qr_token = models.ForeignKey("attendance.QrTokens", models.PROTECT, blank=True, null=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.EXPECTED,
    )

    checkin_at = models.DateTimeField(blank=True, null=True)
    checkout_at = models.DateTimeField(blank=True, null=True)

    method = models.CharField(
        max_length=30,
        choices=Method.choices,
        blank=True,
        null=True,
    )
    recorded_by_user = models.ForeignKey(
        "accounts.Users",
        models.PROTECT,
        related_name="attendance_recorded_by_user_set",
        blank=True,
        null=True,
    )
    walk_in_flag = models.BooleanField(default=False)
    note = models.TextField(blank=True, null=True)

    checkin_latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    checkin_longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    checkin_accuracy_m = models.DecimalField(max_digits=7, decimal_places=1, blank=True, null=True)
    checkin_distance_m = models.DecimalField(max_digits=10, decimal_places=1, blank=True, null=True)
    geo_verified = models.BooleanField(default=False)

    confirmation_status = models.CharField(
        max_length=20,
        choices=ConfirmationStatus.choices,
        default=ConfirmationStatus.NOT_REQUIRED,
    )
    confirmed_by_user = models.ForeignKey(
        "accounts.Users",
        models.PROTECT,
        related_name="attendance_confirmed_by_user_set",
        blank=True,
        null=True,
    )
    confirmed_at = models.DateTimeField(blank=True, null=True)
    confirmation_note = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "attendance"
        constraints = [
            models.UniqueConstraint(
                fields=["event", "user"],
                name="uq_attendance_event_user",
            )
        ]


class AttendanceGeoAttempts(models.Model):
    class Result(models.TextChoices):
        ACCEPTED = 'accepted', 'Accepted'
        ALREADY_CHECKED_IN = 'already_checked_in', 'Already Checked In'
        INVALID_FIX = 'invalid_fix', 'Invalid Fix'
        LOW_ACCURACY = 'low_accuracy', 'Low Accuracy'
        STALE_FIX = 'stale_fix', 'Stale Fix'
        MOCK_LOCATION = 'mock_location', 'Mock Location'
        OUTSIDE_GEOFENCE = 'outside_geofence', 'Outside Geofence'
        WINDOW_CLOSED = 'window_closed', 'Window Closed'
        EVENT_NOT_ACTIVE = 'event_not_active', 'Event Not Active'
        GEO_DISABLED = 'geo_disabled', 'Geo Disabled'
        NOT_ASSIGNED = 'not_assigned', 'Not Assigned'
        NOT_ELIGIBLE = 'not_eligible', 'Not Eligible'
        ONBOARDING_REQUIRED = 'onboarding_required', 'Onboarding Required'

    class ReviewStatus(models.TextChoices):
        NONE = 'none', 'None'
        PENDING = 'pending', 'Pending'
        CONFIRMED = 'confirmed', 'Confirmed'
        REJECTED = 'rejected', 'Rejected'

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey("events.Events", models.PROTECT, related_name="geo_attempts")
    user = models.ForeignKey("accounts.Users", models.PROTECT, related_name="geo_attempts")
    attendance = models.ForeignKey("attendance.Attendance", models.PROTECT, blank=True, null=True)

    attempted_at = models.DateTimeField(default=timezone.now)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    accuracy_m = models.DecimalField(max_digits=7, decimal_places=1, blank=True, null=True)
    captured_at = models.DateTimeField(blank=True, null=True)
    device_mocked = models.BooleanField(default=False)
    distance_m = models.DecimalField(max_digits=10, decimal_places=1, blank=True, null=True)
    radius_m = models.IntegerField(blank=True, null=True)

    result = models.CharField(
        max_length=40,
        choices=Result.choices,
    )

    review_status = models.CharField(
        max_length=20,
        choices=ReviewStatus.choices,
        default=ReviewStatus.NONE,
    )
    reviewed_by_user = models.ForeignKey(
        "accounts.Users",
        models.PROTECT,
        related_name="attendancegeoattempts_reviewed_by_user_set",
        blank=True,
        null=True,
    )
    reviewed_at = models.DateTimeField(blank=True, null=True)
    review_note = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "attendance_geo_attempts"
