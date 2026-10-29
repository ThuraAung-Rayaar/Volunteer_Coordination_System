# apps/accounts/tests/test_models.py
from datetime import timedelta
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.db.models import Q
from django.test import SimpleTestCase
from django.utils import timezone

from apps.accounts.models import (
    AuthOtp,
    CoordinatorProfile,
    User,
    UserCharityInterest,
    UserVerificationImage,
)
from apps.common.constants import (
    ACCOUNT_ACTIVE,
    ACCOUNT_BLOCKED,
    COORDINATOR_APPROVED,
    COORDINATOR_PENDING,
    IMAGE_MOCK_SELFIE,
    VERIFICATION_PENDING,
    VERIFICATION_VERIFIED,
)


class AccountsModelConstraintTests(SimpleTestCase):
    def test_blocked_until_constraint_violation(self):
        # 1. Active account with blocked_until MUST raise ValidationError
        invalid_user = User(
            phone_hash="hash_blocked_until_violation",
            phone_enc="enc_phone",
            display_name="Invalid Blocked User",
            account_status=ACCOUNT_ACTIVE,
            blocked_until=timezone.now() + timedelta(days=1),
        )
        with self.assertRaises(ValidationError):
            invalid_user.clean()

        # 2. Blocked account with blocked_until is valid
        valid_blocked_user = User(
            phone_hash="hash_valid_blocked",
            phone_enc="enc_phone",
            display_name="Valid Blocked User",
            account_status=ACCOUNT_BLOCKED,
            blocked_until=timezone.now() + timedelta(days=1),
        )
        # Should not raise validation error for blocked_until
        try:
            valid_blocked_user.clean()
        except ValidationError as e:
            self.assertNotIn("blocked_until", e.message_dict)

        # 3. Active account with blocked_until=None is valid
        valid_active_user = User(
            phone_hash="hash_valid_active",
            phone_enc="enc_phone",
            display_name="Valid Active User",
            account_status=ACCOUNT_ACTIVE,
            blocked_until=None,
        )
        try:
            valid_active_user.clean()
        except ValidationError as e:
            self.assertNotIn("blocked_until", e.message_dict)

        # Verify the CheckConstraint condition in Meta
        constraint = next(
            c for c in User._meta.constraints if c.name == "ck_users_blocked_until"
        )
        self.assertIsNotNone(constraint)
        self.assertEqual(
            constraint.condition,
            Q(blocked_until__isnull=True) | Q(account_status="blocked"),
        )

    def test_donation_consistency_constraint_violation(self):
        # 1. Willing to donate blood without is_willing_to_donate=True MUST fail
        invalid_blood_donor = User(
            phone_hash="hash_invalid_blood_donor",
            phone_enc="enc_phone",
            display_name="Invalid Blood Donor",
            is_willing_to_donate=False,
            is_willing_to_donate_blood=True,
            is_willing_to_donate_items=False,
        )
        with self.assertRaises(ValidationError):
            invalid_blood_donor.clean()

        # 2. Willing to donate items without is_willing_to_donate=True MUST fail
        invalid_items_donor = User(
            phone_hash="hash_invalid_items_donor",
            phone_enc="enc_phone",
            display_name="Invalid Items Donor",
            is_willing_to_donate=False,
            is_willing_to_donate_blood=False,
            is_willing_to_donate_items=True,
        )
        with self.assertRaises(ValidationError):
            invalid_items_donor.clean()

        # 3. Willing to donate=True with blood/items is valid
        valid_donor = User(
            phone_hash="hash_valid_donor",
            phone_enc="enc_phone",
            display_name="Valid Donor",
            is_willing_to_donate=True,
            is_willing_to_donate_blood=True,
            is_willing_to_donate_items=True,
        )
        try:
            valid_donor.clean()
        except ValidationError as e:
            self.assertNotIn("is_willing_to_donate", e.message_dict)

        # 4. Willing to donate=False with blood=False, items=False is valid
        valid_non_donor = User(
            phone_hash="hash_valid_non_donor",
            phone_enc="enc_phone",
            display_name="Valid Non Donor",
            is_willing_to_donate=False,
            is_willing_to_donate_blood=False,
            is_willing_to_donate_items=False,
        )
        try:
            valid_non_donor.clean()
        except ValidationError as e:
            self.assertNotIn("is_willing_to_donate", e.message_dict)

        # Verify the CheckConstraint condition in Meta
        constraint = next(
            c for c in User._meta.constraints if c.name == "ck_users_donation_consistency"
        )
        self.assertIsNotNone(constraint)
        self.assertEqual(
            constraint.condition,
            Q(is_willing_to_donate=True)
            | (Q(is_willing_to_donate_blood=False) & Q(is_willing_to_donate_items=False)),
        )

    def test_single_current_verification_image_constraint(self):
        # Verify UniqueConstraint specification on UserVerificationImage
        constraint = next(
            c for c in UserVerificationImage._meta.constraints
            if c.name == "uq_current_verification_image"
        )
        self.assertIsNotNone(constraint)
        self.assertEqual(list(constraint.fields), ["user", "image_type"])
        self.assertEqual(constraint.condition, Q(is_current=True))

        # Also verify review constraint on UserVerificationImage
        review_constraint = next(
            c for c in UserVerificationImage._meta.constraints
            if c.name == "ck_verification_review"
        )
        self.assertIsNotNone(review_constraint)
        self.assertEqual(
            review_constraint.condition,
            Q(status="pending") | (Q(reviewed_by__isnull=False) & Q(reviewed_at__isnull=False)),
        )

        # A verified image without reviewed_by/reviewed_at MUST fail validation
        dummy_user = User(id=1, phone_hash="dummy_u1", display_name="Dummy User")
        invalid_verified_image = UserVerificationImage(
            user=dummy_user,
            image_type=IMAGE_MOCK_SELFIE,
            status=VERIFICATION_VERIFIED,
            reviewed_by=None,
            reviewed_at=None,
        )
        with self.assertRaises(ValidationError):
            invalid_verified_image.clean()

    def test_coordinator_approval_timestamp_constraint(self):
        dummy_user = User(id=2, phone_hash="dummy_u2", display_name="Coordinator User")

        # 1. Approved coordinator without approved_at MUST fail validation
        invalid_approved_profile = CoordinatorProfile(
            user=dummy_user,
            status=COORDINATOR_APPROVED,
            approved_at=None,
        )
        with self.assertRaises(ValidationError):
            invalid_approved_profile.clean()

        # 2. Pending coordinator without approved_at is valid
        valid_pending_profile = CoordinatorProfile(
            user=dummy_user,
            status=COORDINATOR_PENDING,
            approved_at=None,
        )
        try:
            valid_pending_profile.clean()
        except ValidationError as e:
            self.assertNotIn("approved_at", e.message_dict)

        # 3. Approved coordinator with approved_at is valid
        valid_approved_profile = CoordinatorProfile(
            user=dummy_user,
            status=COORDINATOR_APPROVED,
            approved_at=timezone.now(),
        )
        try:
            valid_approved_profile.clean()
        except ValidationError as e:
            self.assertNotIn("approved_at", e.message_dict)

        # Verify the CheckConstraint condition in Meta
        constraint = next(
            c for c in CoordinatorProfile._meta.constraints
            if c.name == "ck_coordinator_approval"
        )
        self.assertIsNotNone(constraint)
        self.assertEqual(
            constraint.condition,
            Q(status="pending") | Q(approved_at__isnull=False),
        )
