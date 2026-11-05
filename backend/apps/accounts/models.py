import uuid

from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import Q
from django.db.models.expressions import RawSQL
from django.utils import timezone
from apps.accounts.managers import UserManager


class Users(AbstractBaseUser):
    class AccountStatus(models.TextChoices):
        ACTIVE = 'active', 'Active'
        BLOCKED = 'blocked', 'Blocked'
        CLOSED = 'closed', 'Closed'

    class BloodType(models.TextChoices):
        A_POS = 'A+', 'A+'
        A_NEG = 'A-', 'A-'
        B_POS = 'B+', 'B+'
        B_NEG = 'B-', 'B-'
        AB_POS = 'AB+', 'AB+'
        AB_NEG = 'AB-', 'AB-'
        O_POS = 'O+', 'O+'
        O_NEG = 'O-', 'O-'
        UNKNOWN = 'unknown', 'Unknown'

    class VerificationStatus(models.TextChoices):
        NONE = 'none', 'None'
        PENDING = 'pending', 'Pending'
        VERIFIED = 'verified', 'Verified'
        REJECTED = 'rejected', 'Rejected'

    id = models.BigAutoField(primary_key=True)
    uuid = models.UUIDField(unique=True, editable=False, db_default=RawSQL('uuidv7()', []))
    phone_hash = models.CharField(unique=True, max_length=128)
    phone_enc = models.TextField()
    password = models.TextField(blank=True, null=True)
    last_login = models.DateTimeField(blank=True, null=True)
    display_name = models.CharField(max_length=150)

    is_admin = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)

    is_active = models.BooleanField(default=True)
    account_status = models.CharField(
        max_length=20,
        choices=AccountStatus.choices,
        default=AccountStatus.ACTIVE,
    )
    blocked_until = models.DateTimeField(blank=True, null=True)

    preferred_language = models.CharField(max_length=35, default="en")
    home_area = models.TextField(blank=True, null=True)

    emergency_contact_name = models.TextField(blank=True, null=True)
    emergency_contact_phone_enc = models.TextField(blank=True, null=True)

    blood_type = models.CharField(
        max_length=10,
        choices=BloodType.choices,
        default=BloodType.UNKNOWN,
    )
    is_willing_to_donate = models.BooleanField(default=False)
    is_willing_to_donate_blood = models.BooleanField(default=False)
    is_willing_to_donate_items = models.BooleanField(default=False)

    physical_ok = models.BooleanField(default=False)
    good_eyesight = models.BooleanField(default=True)
    needs_glasses = models.BooleanField(default=False)
    can_lift_heavy = models.BooleanField(default=False)
    can_work_outdoor = models.BooleanField(default=False)
    has_leader_experience = models.BooleanField(default=False)
    new_to_volunteer = models.BooleanField(default=True)

    skills = ArrayField(models.CharField(max_length=50), default=list, blank=True)

    needs_meal_support = models.BooleanField(default=False)
    needs_travel_support = models.BooleanField(default=False)
    accepts_unpaid = models.BooleanField(default=True)

    verification_status = models.CharField(
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.NONE,
    )

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "phone_hash"
    REQUIRED_FIELDS = ["display_name"]

    class Meta:
        managed = False
        db_table = "users"

    def has_perm(self, perm, obj=None):
        return self.is_superuser or self.is_admin

    def has_module_perms(self, app_label):
        return self.is_superuser or self.is_admin


class AuthOtp(models.Model):
    class Purpose(models.TextChoices):
        LOGIN = 'login', 'Login'
        QR_REGISTRATION = 'qr_registration', 'QR Registration'

    id = models.BigAutoField(primary_key=True)
    phone_hash = models.TextField()
    code_hash = models.TextField()
    purpose = models.CharField(
        max_length=30,
        choices=Purpose.choices,
        default=Purpose.LOGIN,
    )
    attempt_count = models.IntegerField(default=0)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "auth_otp"


class UserVerificationImages(models.Model):
    class ImageType(models.TextChoices):
        MOCK_SELFIE = 'mock_selfie', 'Mock Selfie'
        ID_LICENSE = 'id_license', 'ID License'
        DRIVER_LICENSE = 'driver_license', 'Driver License'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    class ComparisonStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        MATCH = 'match', 'Match'
        NO_MATCH = 'no_match', 'No Match'
        NEEDS_REVIEW = 'needs_review', 'Needs Review'

    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey("accounts.Users", models.PROTECT, related_name="verification_images")
    image_type = models.CharField(
        max_length=30,
        choices=ImageType.choices,
    )
    image_path = models.CharField(max_length=255)
    file_format = models.CharField(max_length=10, default="jpeg")
    file_sha256 = models.CharField(max_length=64, blank=True, null=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    comparison_status = models.CharField(
        max_length=20,
        choices=ComparisonStatus.choices,
        default=ComparisonStatus.PENDING,
    )
    comparison_score = models.DecimalField(max_digits=5, decimal_places=4, blank=True, null=True)
    is_current = models.BooleanField(default=True)
    reviewed_by = models.ForeignKey(
        "accounts.Users",
        models.PROTECT,
        related_name="userverificationimages_reviewed_by_set",
        blank=True,
        null=True,
    )
    reviewed_at = models.DateTimeField(blank=True, null=True)
    note = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "user_verification_images"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "image_type"],
                condition=Q(is_current=True),
                name="uq_current_verification_image",
            )
        ]


class OnboardingAcknowledgments(models.Model):
    class Method(models.TextChoices):
        APP_TICK = 'app_tick', 'App Tick'

    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey("accounts.Users", models.PROTECT, related_name="onboarding_acknowledgments")
    event = models.ForeignKey("events.Events", models.PROTECT, related_name="onboarding_acknowledgments")
    onboarding_version = models.IntegerField()
    method = models.CharField(
        max_length=30,
        choices=Method.choices,
        default=Method.APP_TICK,
    )
    acknowledged_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "onboarding_acknowledgments"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "event", "onboarding_version"],
                name="uq_onboarding_ack_user_event_ver",
            )
        ]


class UserCharityInterests(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey("accounts.Users", models.CASCADE, related_name="charity_interests")
    field_code = models.ForeignKey("events.CharityFields", models.PROTECT, db_column="field_code")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "user_charity_interests"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "field_code"],
                name="uq_user_charity_interest",
            )
        ]


class VolunteerAvailabilityRules(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey("accounts.Users", models.CASCADE, related_name="availability_rules")
    weekday = models.IntegerField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    valid_from = models.DateField(blank=True, null=True)
    valid_to = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "volunteer_availability_rules"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "weekday", "start_time"],
                name="uq_availability_rule",
            )
        ]


class VolunteerAvailabilityExceptions(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey("accounts.Users", models.CASCADE, related_name="availability_exceptions")
    date = models.DateField()
    is_available = models.BooleanField(default=False)
    start_time = models.TimeField(blank=True, null=True)
    end_time = models.TimeField(blank=True, null=True)
    note = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = False
        db_table = "volunteer_availability_exceptions"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "date"],
                name="uq_availability_exception",
            )
        ]
