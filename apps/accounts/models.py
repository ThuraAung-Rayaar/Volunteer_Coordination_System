# apps/accounts/models.py
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.contrib.postgres.indexes import GinIndex
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from apps.common.constants import (
    ACCOUNT_ACTIVE,
    ACCOUNT_BLOCKED,
    ACCOUNT_CLOSED,
    COORDINATOR_APPROVED,
    COORDINATOR_PENDING,
    COORDINATOR_REVOKED,
    COORDINATOR_SUSPENDED,
    IMAGE_DRIVER_LICENSE,
    IMAGE_ID_LICENSE,
    IMAGE_MOCK_SELFIE,
    VERIFICATION_NONE,
    VERIFICATION_PENDING,
    VERIFICATION_REJECTED,
    VERIFICATION_VERIFIED,
)
from apps.common.fields import ChoiceArrayField


class UserManager(BaseUserManager):
    def create_user(self, phone_hash, display_name, password=None, **extra_fields):
        if not phone_hash:
            raise ValueError("The phone_hash must be set.")
        if not display_name:
            raise ValueError("The display_name must be set.")

        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)

        user = self.model(
            phone_hash=phone_hash,
            display_name=display_name,
            **extra_fields,
        )
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, phone_hash, display_name, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_admin", True)

        if not password:
            raise ValueError("Superusers must have a password.")

        return self.create_user(phone_hash, display_name, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    ACCOUNT_STATUS_CHOICES = [
        (ACCOUNT_ACTIVE, "Active"),
        (ACCOUNT_BLOCKED, "Blocked"),
        (ACCOUNT_CLOSED, "Closed"),
    ]

    BLOOD_TYPE_CHOICES = [
        ("A+", "A+"),
        ("A-", "A-"),
        ("B+", "B+"),
        ("B-", "B-"),
        ("AB+", "AB+"),
        ("AB-", "AB-"),
        ("O+", "O+"),
        ("O-", "O-"),
        ("unknown", "Unknown"),
    ]

    VERIFICATION_STATUS_CHOICES = [
        (VERIFICATION_NONE, "None"),
        (VERIFICATION_PENDING, "Pending"),
        (VERIFICATION_VERIFIED, "Verified"),
        (VERIFICATION_REJECTED, "Rejected"),
    ]

    id = models.BigAutoField(primary_key=True)

    # Auth
    phone_hash = models.CharField(max_length=128, unique=True, db_index=True)
    phone_enc = models.TextField(help_text="Encrypted phone representation")
    display_name = models.CharField(max_length=150)
    password = models.CharField(max_length=128, null=True, blank=True)

    is_admin = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    account_status = models.CharField(
        max_length=20,
        choices=ACCOUNT_STATUS_CHOICES,
        default=ACCOUNT_ACTIVE,
    )
    blocked_until = models.DateTimeField(null=True, blank=True)

    preferred_language = models.CharField(max_length=10, default="en")
    home_area = models.CharField(max_length=150, null=True, blank=True)

    # Emergency Contact
    emergency_contact_name = models.CharField(max_length=150, null=True, blank=True)
    emergency_contact_phone_enc = models.TextField(null=True, blank=True)

    # Charity / Volunteering attributes
    blood_type = models.CharField(
        max_length=10,
        choices=BLOOD_TYPE_CHOICES,
        default="unknown",
    )
    is_willing_to_donate = models.BooleanField(default=False)
    is_willing_to_donate_blood = models.BooleanField(default=False)
    is_willing_to_donate_items = models.BooleanField(default=False)

    # Physical / Capability hints
    physical_ok = models.BooleanField(default=False)
    good_eyesight = models.BooleanField(default=True)
    needs_glasses = models.BooleanField(default=False)
    can_lift_heavy = models.BooleanField(default=False)
    can_work_outdoor = models.BooleanField(default=False)
    has_leader_experience = models.BooleanField(default=False)
    new_to_volunteer = models.BooleanField(default=True)

    # Free-form skills
    skills = ChoiceArrayField(
        models.CharField(max_length=50),
        default=list,
        blank=True,
    )

    # Recruiting preferences
    needs_meal_support = models.BooleanField(default=False)
    needs_travel_support = models.BooleanField(default=False)
    accepts_unpaid = models.BooleanField(default=True)

    # Identity verification
    verification_status = models.CharField(
        max_length=20,
        choices=VERIFICATION_STATUS_CHOICES,
        default=VERIFICATION_NONE,
    )

    last_login = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "phone_hash"
    REQUIRED_FIELDS = ["display_name"]

    class Meta:
        db_table = "users"
        verbose_name = "User"
        verbose_name_plural = "Users"
        constraints = [
            models.CheckConstraint(
                condition=Q(blocked_until__isnull=True) | Q(account_status="blocked"),
                name="ck_users_blocked_until",
            ),
            models.CheckConstraint(
                condition=Q(is_willing_to_donate=True)
                | (
                    Q(is_willing_to_donate_blood=False)
                    & Q(is_willing_to_donate_items=False)
                ),
                name="ck_users_donation_consistency",
            ),
        ]
        indexes = [
            models.Index(fields=["account_status"], name="idx_users_account_status"),
            models.Index(fields=["verification_status"], name="idx_users_verif_status"),
            models.Index(
                fields=["is_admin"],
                name="idx_users_is_admin",
                condition=Q(is_admin=True),
            ),
            models.Index(
                fields=["blood_type"],
                name="idx_users_blood_donors",
                condition=Q(is_willing_to_donate_blood=True),
            ),
            GinIndex(fields=["skills"], name="idx_users_skills_gin"),
        ]

    def __str__(self):
        return f"{self.display_name} (ID: {self.id})"

    def clean(self):
        super().clean()
        if self.blocked_until is not None and self.account_status != ACCOUNT_BLOCKED:
            raise ValidationError(
                {"blocked_until": "blocked_until may only be set when account_status is 'blocked'."}
            )
        if (self.is_willing_to_donate_blood or self.is_willing_to_donate_items) and not self.is_willing_to_donate:
            raise ValidationError(
                {"is_willing_to_donate": "is_willing_to_donate must be True if willing to donate blood or items."}
            )


class CoordinatorProfile(models.Model):
    STATUS_CHOICES = [
        (COORDINATOR_PENDING, "Pending"),
        (COORDINATOR_APPROVED, "Approved"),
        (COORDINATOR_SUSPENDED, "Suspended"),
        (COORDINATOR_REVOKED, "Revoked"),
    ]

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="coordinator_profile",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=COORDINATOR_PENDING,
    )
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_coordinators",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "coordinator_profiles"
        verbose_name = "Coordinator Profile"
        verbose_name_plural = "Coordinator Profiles"
        constraints = [
            models.CheckConstraint(
                condition=Q(status="pending") | Q(approved_at__isnull=False),
                name="ck_coordinator_approval",
            ),
        ]

    def __str__(self):
        return f"Coordinator: {self.user.display_name} [{self.status}]"

    def clean(self):
        super().clean()
        if self.status != COORDINATOR_PENDING and self.approved_at is None:
            raise ValidationError(
                {"approved_at": "approved_at must be set when status is not 'pending'."}
            )


class UserCharityInterest(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="charity_interests",
    )
    field_code = models.ForeignKey(
        "events.CharityField",
        on_delete=models.CASCADE,
        db_column="field_code",
        related_name="user_interests",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "user_charity_interests"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "field_code"],
                name="uq_user_charity_interest",
            ),
        ]
        verbose_name = "User Charity Interest"
        verbose_name_plural = "User Charity Interests"

    def __str__(self):
        return f"{self.user.display_name} -> {self.field_code_id}"


class UserVerificationImage(models.Model):
    IMAGE_TYPE_CHOICES = [
        (IMAGE_MOCK_SELFIE, "Mock Selfie"),
        (IMAGE_ID_LICENSE, "ID License"),
        (IMAGE_DRIVER_LICENSE, "Driver License"),
    ]

    STATUS_CHOICES = [
        (VERIFICATION_PENDING, "Pending"),
        ("approved", "Approved"),
        (VERIFICATION_VERIFIED, "Verified"),
        (VERIFICATION_REJECTED, "Rejected"),
    ]

    COMPARISON_STATUS_CHOICES = [
        ("pending", "Pending"),
        ("match", "Match"),
        ("no_match", "No Match"),
        ("needs_review", "Needs Review"),
    ]

    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="verification_images",
    )
    image_type = models.CharField(max_length=30, choices=IMAGE_TYPE_CHOICES)
    image_path = models.ImageField(upload_to="verification_images/")
    file_format = models.CharField(max_length=10, default="jpeg")
    file_sha256 = models.CharField(max_length=64, null=True, blank=True)

    comparison_score = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=VERIFICATION_PENDING,
    )
    comparison_status = models.CharField(
        max_length=20,
        choices=COMPARISON_STATUS_CHOICES,
        default="pending",
    )
    is_current = models.BooleanField(default=True)

    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_verification_images",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    note = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_verification_images"
        verbose_name = "User Verification Image"
        verbose_name_plural = "User Verification Images"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "image_type"],
                condition=Q(is_current=True),
                name="uq_current_verification_image",
            ),
            models.CheckConstraint(
                condition=Q(status="pending")
                | (Q(reviewed_by__isnull=False) & Q(reviewed_at__isnull=False)),
                name="ck_verification_review",
            ),
            models.CheckConstraint(
                condition=Q(comparison_score__isnull=True)
                | (Q(comparison_score__gte=0) & Q(comparison_score__lte=1)),
                name="ck_verification_score_range",
            ),
        ]

    def __str__(self):
        return f"{self.user.display_name} - {self.image_type} ({self.status})"

    def clean(self):
        super().clean()
        if self.status != VERIFICATION_PENDING:
            if self.reviewed_by is None or self.reviewed_at is None:
                raise ValidationError(
                    "Reviewed images must have reviewed_by and reviewed_at set."
                )
        if self.comparison_score is not None:
            if not (0 <= self.comparison_score <= 1):
                raise ValidationError(
                    {"comparison_score": "comparison_score must be between 0 and 1."}
                )


class AuthOtp(models.Model):
    PURPOSE_CHOICES = [
        ("login", "Login"),
        ("qr_registration", "QR Registration"),
    ]

    id = models.BigAutoField(primary_key=True)
    phone_hash = models.CharField(max_length=128, db_index=True)
    code_hash = models.CharField(max_length=128)
    purpose = models.CharField(max_length=30, choices=PURPOSE_CHOICES, default="login")
    attempt_count = models.IntegerField(default=0)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "auth_otp"
        verbose_name = "Auth OTP"
        verbose_name_plural = "Auth OTPs"
        constraints = [
            models.CheckConstraint(
                condition=Q(attempt_count__gte=0),
                name="ck_auth_otp_attempt_count",
            ),
        ]
        indexes = [
            models.Index(fields=["phone_hash", "-created_at"], name="idx_auth_otp_phone_created"),
        ]

    def __str__(self):
        return f"OTP {self.purpose} for {self.phone_hash[:8]}..."

    def clean(self):
        super().clean()
        if self.attempt_count < 0:
            raise ValidationError({"attempt_count": "attempt_count cannot be negative."})
