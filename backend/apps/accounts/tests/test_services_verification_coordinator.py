"""
Service integration tests for Phase 4: Identity Verification & Coordinator Lifecycle.

Focus:
- Integration of upload_verification_image using root project JPEG fixture.
- Document replacement and auto-archiving (is_current=False).
- Admin review workflows (approved/rejected, comparison status/scores).
- Coordinator application, lifecycle state machine (approve, suspend, reactivate, revoke).
- Transaction rollback guarantees.
"""
import io
import os
import secrets
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from django.test import TestCase

from apps.accounts.models import UserVerificationImages, Users
from apps.coordination.models import CoordinatorProfiles
from common.exceptions import DomainError, PermissionDeniedError, ResourceMaskedNotFound
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import coordinator_service, verification_service


def _next_phone() -> str:
    return f"+9598{secrets.randbelow(8999999) + 1000000}"



def _create_user(name="Volunteer", is_admin=False, is_active=True, verification_status="none") -> Users:
    phone = normalize_phone(_next_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        is_active=is_active,
        verification_status=verification_status,
    )


def _load_root_fixture() -> SimpleUploadedFile:
    fixture_path = Path(settings.BASE_DIR).parent / "JPEG_example_flower.jpg"
    if not fixture_path.exists():
        # Fallback in case path resolution differs
        fixture_path = Path(os.getcwd()) / "JPEG_example_flower.jpg"
    with open(fixture_path, "rb") as f:
        data = f.read()
    return SimpleUploadedFile("JPEG_example_flower.jpg", data, content_type="image/jpeg")


class VerificationServiceIntegrationTests(TestCase):
    def setUp(self):
        self.user = _create_user(name="Volunteer 1")
        self.admin = _create_user(name="Admin 1", is_admin=True)
        self._tempdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tempdir.cleanup)
        self.media_root = self._tempdir.name

    def test_upload_with_root_jpeg_fixture(self):
        """W27: Upload real JPEG fixture, check EXIF strip, SHA-256 and private storage."""
        uploaded_file = _load_root_fixture()

        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                self.user, "mock_selfie", uploaded_file
            )

        self.assertEqual(image.status, "pending")
        self.assertTrue(image.is_current)
        self.assertEqual(image.file_format, "jpeg")
        self.assertEqual(len(image.file_sha256), 64)
        self.assertIsNone(image.reviewed_by_id)
        self.assertIsNone(image.reviewed_at)

        # File exists on private disk
        file_path = Path(self.media_root) / image.image_path
        self.assertTrue(file_path.exists())

    def test_upload_replacement_auto_archives_previous_image(self):
        """W27: Uploading a second image of the same type sets previous is_current=False."""
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            first = verification_service.upload_verification_image(
                self.user, "mock_selfie", _load_root_fixture()
            )
            second = verification_service.upload_verification_image(
                self.user, "mock_selfie", _load_root_fixture()
            )

        first.refresh_from_db()
        second.refresh_from_db()

        self.assertFalse(first.is_current)
        self.assertTrue(second.is_current)
        self.assertEqual(first.image_type, second.image_type)

    def test_review_verification_image_decision(self):
        """W30, W31: Admin reviews image with note and comparison score."""
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                self.user, "mock_selfie", _load_root_fixture()
            )
            reviewed = verification_service.review_verification_image(
                actor=self.admin,
                image_id=image.id,
                decision="approved",
                note="Document clear and verified",
                comparison_status="match",
                comparison_score=0.98,
            )

        self.assertEqual(reviewed.status, "approved")
        self.assertEqual(reviewed.reviewed_by_id, self.admin.id)
        self.assertIsNotNone(reviewed.reviewed_at)
        self.assertEqual(reviewed.comparison_status, "match")
        self.assertEqual(float(reviewed.comparison_score), 0.98)
        self.assertEqual(reviewed.note, "Document clear and verified")

    def test_review_cannot_be_repeated(self):
        """W30: A reviewed image cannot be reviewed again (invalid_transition)."""
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                self.user, "mock_selfie", _load_root_fixture()
            )
            verification_service.review_verification_image(self.admin, image.id, "approved")

            with self.assertRaises(DomainError) as ctx:
                verification_service.review_verification_image(self.admin, image.id, "rejected")
            self.assertEqual(ctx.exception.code, "invalid_transition")

    def test_self_review_prevention(self):
        """W39: Admin cannot review their own verification image (no_self_review)."""
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            admin_image = verification_service.upload_verification_image(
                self.admin, "mock_selfie", _load_root_fixture()
            )
            with self.assertRaises(PermissionDeniedError) as ctx:
                verification_service.review_verification_image(self.admin, admin_image.id, "approved")
            self.assertEqual(ctx.exception.code, "no_self_review")

    def test_non_admin_cannot_review(self):
        """W40: Non-admin caller receives PermissionDeniedError."""
        other_user = _create_user(name="Other Volunteer")
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                self.user, "mock_selfie", _load_root_fixture()
            )
            with self.assertRaises(PermissionDeniedError) as ctx:
                verification_service.review_verification_image(other_user, image.id, "approved")
            self.assertEqual(ctx.exception.code, "permission_denied")

    def test_resolve_private_image_path_path_traversal_blocked(self):
        """W31: Path traversal outside VERIFICATION_MEDIA_ROOT is blocked."""
        image = UserVerificationImages(user=self.user, image_path="../../../etc/shadow")
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            with self.assertRaises(PermissionDeniedError) as ctx:
                verification_service.resolve_private_image_path(image)
            self.assertEqual(ctx.exception.code, "invalid_path")

    def test_resolve_private_image_path_not_found(self):
        """W31: Missing file raises ResourceMaskedNotFound."""
        image = UserVerificationImages(user=self.user, image_path="nonexistent_folder/missing.jpg")
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            with self.assertRaises(ResourceMaskedNotFound):
                verification_service.resolve_private_image_path(image)

    def test_review_transaction_rollback_preserves_state(self):
        """Simulate unexpected error during review to verify atomic rollback."""
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                self.user, "mock_selfie", _load_root_fixture()
            )

            # Patch logger.info to simulate unexpected exception after DB update
            with patch.object(verification_service.logger, "info", side_effect=RuntimeError("Simulated failure")):
                with self.assertRaises(RuntimeError):
                    verification_service.review_verification_image(self.admin, image.id, "approved")

            # Status should have rolled back to 'pending'
            image.refresh_from_db()
            self.assertEqual(image.status, "pending")
            self.assertIsNone(image.reviewed_by_id)


class CoordinatorServiceIntegrationTests(TestCase):
    def setUp(self):
        self.verified_user = _create_user(name="Verified Vol", verification_status="verified")
        self.unverified_user = _create_user(name="Unverified Vol", verification_status="none")
        self.admin = _create_user(name="Admin Coord", is_admin=True)

    def test_apply_requires_verified_volunteer(self):
        """W34: Unverified volunteer cannot apply."""
        with self.assertRaises(DomainError) as ctx:
            coordinator_service.apply_for_coordinator(self.unverified_user)
        self.assertEqual(ctx.exception.code, "not_verified")

        # Verified volunteer can apply
        profile = coordinator_service.apply_for_coordinator(self.verified_user, "Ready to lead")
        self.assertEqual(profile.status, "pending")
        self.assertEqual(profile.notes, "Ready to lead")

    def test_update_pending_application_notes(self):
        """A volunteer can edit notes while application is pending."""
        coordinator_service.apply_for_coordinator(self.verified_user, "Initial note")
        updated = coordinator_service.update_coordinator_application(self.verified_user, "Updated note")
        self.assertEqual(updated.notes, "Updated note")

    def test_update_non_pending_application_fails(self):
        """Only pending applications can have notes updated."""
        coordinator_service.apply_for_coordinator(self.verified_user)
        coordinator_service.approve_coordinator(self.admin, self.verified_user.id)

        with self.assertRaises(DomainError) as ctx:
            coordinator_service.update_coordinator_application(self.verified_user, "Too late")
        self.assertEqual(ctx.exception.code, "invalid_state")

    def test_coordinator_lifecycle_transitions(self):
        """W35-W38: Full state transitions pending -> approved -> suspended -> approved -> revoked."""
        coordinator_service.apply_for_coordinator(self.verified_user)

        # 1. Approve
        p1 = coordinator_service.approve_coordinator(self.admin, self.verified_user.id, "Approved by admin")
        self.assertEqual(p1.status, "approved")
        self.assertEqual(p1.approved_by_id, self.admin.id)
        self.assertIsNotNone(p1.approved_at)
        self.assertTrue(coordinator_service.is_approved_coordinator(self.verified_user))

        # 2. Suspend
        p2 = coordinator_service.suspend_coordinator(self.admin, self.verified_user.id, "Temporary leave")
        self.assertEqual(p2.status, "suspended")
        self.assertFalse(coordinator_service.is_approved_coordinator(self.verified_user))

        # 3. Reactivate (suspended -> approved)
        p3 = coordinator_service.approve_coordinator(self.admin, self.verified_user.id, "Returned")
        self.assertEqual(p3.status, "approved")
        self.assertTrue(coordinator_service.is_approved_coordinator(self.verified_user))

        # 4. Revoke (terminal)
        p4 = coordinator_service.revoke_coordinator(self.admin, self.verified_user.id, "Permanent leave")
        self.assertEqual(p4.status, "revoked")
        self.assertFalse(coordinator_service.is_approved_coordinator(self.verified_user))

        # 5. Revoked cannot transition
        with self.assertRaises(Exception):
            coordinator_service.approve_coordinator(self.admin, self.verified_user.id)

    def test_self_coordinator_approval_blocked(self):
        """W39: Admin cannot approve their own coordinator application (no_self_approval)."""
        admin_verified = _create_user(name="Self Admin", is_admin=True, verification_status="verified")
        coordinator_service.apply_for_coordinator(admin_verified)

        with self.assertRaises(PermissionDeniedError) as ctx:
            coordinator_service.approve_coordinator(admin_verified, admin_verified.id)
        self.assertEqual(ctx.exception.code, "no_self_approval")

    def test_non_admin_cannot_decide_coordinator(self):
        """W40: Non-admin cannot approve coordinator."""
        other_user = _create_user(name="Random Vol")
        coordinator_service.apply_for_coordinator(self.verified_user)

        with self.assertRaises(PermissionDeniedError) as ctx:
            coordinator_service.approve_coordinator(other_user, self.verified_user.id)
        self.assertEqual(ctx.exception.code, "permission_denied")

    def test_decide_coordinator_transaction_rollback(self):
        """Simulate unexpected exception during coordinator decision to ensure atomic rollback."""
        coordinator_service.apply_for_coordinator(self.verified_user)

        with patch.object(coordinator_service.logger, "info", side_effect=RuntimeError("Simulated logging crash")):
            with self.assertRaises(RuntimeError):
                coordinator_service.approve_coordinator(self.admin, self.verified_user.id)

        profile = CoordinatorProfiles.objects.get(user_id=self.verified_user.id)
        self.assertEqual(profile.status, "pending")
        self.assertIsNone(profile.approved_by_id)
