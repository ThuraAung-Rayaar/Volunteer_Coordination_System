# apps/accounts/tests/test_profile_services.py
from io import BytesIO
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from apps.accounts.models import CoordinatorProfile, User, UserVerificationImage
from apps.accounts.services import (
    add_verification_image,
    apply_as_coordinator,
    approve_coordinator,
    recompute_verification_status,
    review_verification_image,
    revoke_coordinator,
    set_charity_interests,
    suspend_coordinator,
    update_profile,
)
from apps.common.constants import (
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
from apps.common.exceptions import (
    DomainError,
    PermissionDeniedError,
    VerificationRequiredError,
)
from apps.events.models import CharityField


def create_dummy_uploaded_image(filename="sample.png", format="PNG", color="red"):
    buffer = BytesIO()
    image = Image.new("RGBA", (100, 100), color=color)
    image.save(buffer, format=format)
    buffer.seek(0)
    return SimpleUploadedFile(filename, buffer.getvalue(), content_type=f"image/{format.lower()}")


class ProfileServicesTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(
            phone_hash="hash_user_1",
            display_name="Volunteer One",
        )
        self.admin = User.objects.create(
            phone_hash="hash_admin",
            display_name="Admin One",
            is_admin=True,
        )

    def test_verification_image_transcoded_to_jpeg_and_old_deactivated(self):
        # 1. Upload first selfie (PNG format)
        file1 = create_dummy_uploaded_image("selfie1.png", format="PNG", color="blue")
        img1 = add_verification_image(self.user, IMAGE_MOCK_SELFIE, file1)

        self.assertTrue(img1.is_current)
        self.assertEqual(img1.file_format, "jpeg")
        self.assertTrue(img1.image_path.name.endswith(".jpg"))
        self.assertIsNotNone(img1.file_sha256)

        # User status should now be pending
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, VERIFICATION_PENDING)

        # 2. Upload second selfie
        file2 = create_dummy_uploaded_image("selfie2.png", format="PNG", color="green")
        img2 = add_verification_image(self.user, IMAGE_MOCK_SELFIE, file2)

        # img1 must now be deactivated (is_current=False), img2 is current
        img1.refresh_from_db()
        self.assertFalse(img1.is_current)
        self.assertTrue(img2.is_current)
        self.assertNotEqual(img1.id, img2.id)

    def test_recompute_verification_status_logic(self):
        # Initially none
        self.assertEqual(self.user.verification_status, VERIFICATION_NONE)

        # Upload selfie -> pending
        file_selfie = create_dummy_uploaded_image("selfie.png")
        img_selfie = add_verification_image(self.user, IMAGE_MOCK_SELFIE, file_selfie)
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, VERIFICATION_PENDING)

        # Upload ID -> pending
        file_id = create_dummy_uploaded_image("id.png")
        img_id = add_verification_image(self.user, IMAGE_ID_LICENSE, file_id)
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, VERIFICATION_PENDING)

        # Approve selfie only -> still pending because ID is pending
        review_verification_image(self.admin, img_selfie, status="approved")
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, VERIFICATION_PENDING)

        # Approve ID -> both approved -> verified!
        review_verification_image(self.admin, img_id, status="approved")
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, VERIFICATION_VERIFIED)

        # If a new ID is uploaded and rejected -> status becomes rejected
        file_id2 = create_dummy_uploaded_image("id2.png")
        img_id2 = add_verification_image(self.user, IMAGE_ID_LICENSE, file_id2)
        review_verification_image(self.admin, img_id2, status="rejected", note="Blurry image")
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, VERIFICATION_REJECTED)

    def test_coordinator_approval_requires_verified_user(self):
        # Apply as coordinator
        profile = apply_as_coordinator(self.user, notes="Ready to lead events")
        self.assertEqual(profile.status, COORDINATOR_PENDING)

        # Non-admin cannot approve
        non_admin = User.objects.create(phone_hash="hash_regular", display_name="Regular")
        with self.assertRaises(PermissionDeniedError):
            approve_coordinator(non_admin, profile)

        # Admin cannot approve if user is unverified
        self.assertEqual(self.user.verification_status, VERIFICATION_NONE)
        with self.assertRaises(VerificationRequiredError):
            approve_coordinator(self.admin, profile)

        # Now verify user
        self.user.verification_status = VERIFICATION_VERIFIED
        self.user.save()

        # Approval succeeds
        approved_profile = approve_coordinator(self.admin, profile)
        self.assertEqual(approved_profile.status, COORDINATOR_APPROVED)
        self.assertEqual(approved_profile.approved_by, self.admin)
        self.assertIsNotNone(approved_profile.approved_at)

        # Suspend
        suspended = suspend_coordinator(self.admin, approved_profile)
        self.assertEqual(suspended.status, COORDINATOR_SUSPENDED)

        # Revoke
        revoked = revoke_coordinator(self.admin, suspended)
        self.assertEqual(revoked.status, COORDINATOR_REVOKED)

    def test_update_profile_disallows_restricted_fields(self):
        # Updating regular fields works
        update_profile(self.user, {"display_name": "New Name", "home_area": "Downtown"})
        self.user.refresh_from_db()
        self.assertEqual(self.user.display_name, "New Name")
        self.assertEqual(self.user.home_area, "Downtown")

        # Updating restricted fields raises DomainError
        with self.assertRaises(DomainError):
            update_profile(self.user, {"is_admin": True})

        with self.assertRaises(DomainError):
            update_profile(self.user, {"verification_status": VERIFICATION_VERIFIED})

    def test_set_charity_interests_atomic_replace(self):
        f1 = CharityField.objects.create(code="education", label="Education", sort_order=1)
        f2 = CharityField.objects.create(code="healthcare", label="Healthcare", sort_order=2)
        f3 = CharityField.objects.create(code="animals", label="Animal Welfare", sort_order=3)

        set_charity_interests(self.user, ["education", "healthcare"])
        interests = list(self.user.charity_interests.values_list("field_code", flat=True))
        self.assertCountEqual(interests, ["education", "healthcare"])

        # Replaces cleanly
        set_charity_interests(self.user, ["animals"])
        interests2 = list(self.user.charity_interests.values_list("field_code", flat=True))
        self.assertCountEqual(interests2, ["animals"])

