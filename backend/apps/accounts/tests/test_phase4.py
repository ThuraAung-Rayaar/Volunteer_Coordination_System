"""
Unit and integration tests for Phase 4 — Identity Verification and Coordinator Lifecycle.

Covers all 14 acceptance test requirements:
1.  Valid JPEG upload.
2.  Invalid image format.
3.  Oversized image.
4.  Unauthorized image retrieval.
5.  Verification status retrieval.
6.  Verification recalculation (to verified, to rejected, to pending).
7.  Valid reviewer decision (approve / reject).
8.  Invalid verification transition (double-review, non-admin review).
9.  Coordinator application (verified user applies, unverified user blocked).
10. Coordinator approval (admin approves, approved_at & approved_by set).
11. Coordinator suspension (approved -> suspended).
12. Coordinator revocation (terminal revoked state).
13. Non-admin approval attempt (permission denied).
14. Unapproved coordinator permission denial (is_approved_coordinator SQL check).
"""

import io
import secrets
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import UserVerificationImages, Users
from apps.coordination.models import CoordinatorProfiles
from common.exceptions import DomainError, PermissionDeniedError
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import coordinator_service, verification_service

_phone_seq = 0


def _phone() -> str:
    global _phone_seq
    _phone_seq += 1
    return f"+959{_phone_seq:08d}"


def _make_user(name: str = "User", is_admin: bool = False, verified: bool = False, **kwargs) -> Users:
    phone = normalize_phone(_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
        **kwargs,
    )


def _jpeg_bytes(size=(400, 400)) -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", size, color=(200, 120, 40)).save(buf, format="JPEG")
    return buf.getvalue()


def _upload(name: str = "img.jpg", data: bytes = None, content_type: str = "image/jpeg") -> SimpleUploadedFile:
    data = data if data is not None else _jpeg_bytes()
    return SimpleUploadedFile(name, data, content_type=content_type)


class VerificationImageTestBase(TestCase):
    def setUp(self):
        self.user = _make_user(name="Volunteer")
        self.admin = _make_user(name="Admin", is_admin=True)
        self._tempdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tempdir.cleanup)
        self.media_root = self._tempdir.name


# =============================================================================
# 1-3. IMAGE UPLOAD & VALIDATION TESTS
# =============================================================================

class UploadTests(VerificationImageTestBase):
    def test_valid_jpeg_upload(self):
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                self.user, "mock_selfie", _upload()
            )
        self.assertEqual(image.status, "pending")
        self.assertTrue(image.is_current)
        self.assertEqual(image.image_type, "mock_selfie")
        self.assertIsNotNone(image.file_sha256)
        self.assertEqual(len(image.file_sha256), 64)

    def test_invalid_image_format_rejected(self):
        garbage = SimpleUploadedFile("file.jpg", b"not-an-image", content_type="image/jpeg")
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            with self.assertRaises(DomainError) as ctx:
                verification_service.upload_verification_image(
                    self.user, "mock_selfie", garbage
                )
            self.assertEqual(ctx.exception.code, "invalid_image")

    def test_oversized_image_rejected(self):
        with self.settings(
            VERIFICATION_MEDIA_ROOT=self.media_root,
            VERIFICATION_MAX_UPLOAD_BYTES=10,
        ):
            with self.assertRaises(DomainError) as ctx:
                verification_service.upload_verification_image(
                    self.user, "mock_selfie", _upload()
                )
            self.assertEqual(ctx.exception.code, "image_too_large")

    def test_invalid_image_type_rejected(self):
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            with self.assertRaises(DomainError) as ctx:
                verification_service.upload_verification_image(
                    self.user, "passport", _upload()
                )
            self.assertEqual(ctx.exception.code, "invalid_image_type")

    def test_upload_api_endpoint(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            response = client.post(
                "/api/v1/me/verification-images/",
                {"image_type": "mock_selfie", "image": _upload()},
                format="multipart",
            )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "pending")
        self.assertEqual(response.data["image_type"], "mock_selfie")
        # Ensure image_path is not exposed
        self.assertNotIn("image_path", response.data)


# =============================================================================
# 4-8. VERIFICATION STATUS, REVIEW & ACCESS TESTS
# =============================================================================

class VerificationStatusTests(VerificationImageTestBase):
    def _approve_both(self):
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            selfie = verification_service.upload_verification_image(
                self.user, "mock_selfie", _upload()
            )
            id_img = verification_service.upload_verification_image(
                self.user, "id_license", _upload()
            )
        verification_service.review_verification_image(self.admin, selfie.id, "approved")
        verification_service.review_verification_image(self.admin, id_img.id, "approved")

    def test_status_retrieval(self):
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            verification_service.upload_verification_image(self.user, "mock_selfie", _upload())
        data = verification_service.get_verification_status(self.user)
        self.assertEqual(data["verification_status"], "pending")
        self.assertEqual(len(data["images"]), 1)

    def test_status_retrieval_api(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            verification_service.upload_verification_image(self.user, "mock_selfie", _upload())
        response = client.get("/api/v1/me/verification-images/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["verification_status"], "pending")
        self.assertEqual(len(response.data["images"]), 1)

    def test_recalculation_to_verified(self):
        self._approve_both()
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, "verified")

    def test_recalculation_to_rejected(self):
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            selfie = verification_service.upload_verification_image(
                self.user, "mock_selfie", _upload()
            )
        verification_service.review_verification_image(self.admin, selfie.id, "rejected")
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, "rejected")

    def test_recompute_verification_helper(self):
        status_val = verification_service.recompute_verification(self.user.id)
        self.assertEqual(status_val, "none")

    def test_valid_reviewer_decision(self):
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                self.user, "mock_selfie", _upload()
            )
        reviewed = verification_service.review_verification_image(
            self.admin, image.id, "approved", note="looks good"
        )
        self.assertEqual(reviewed.status, "approved")
        self.assertEqual(reviewed.reviewed_by_id, self.admin.id)
        self.assertIsNotNone(reviewed.reviewed_at)
        self.assertEqual(reviewed.note, "looks good")

    def test_admin_review_api(self):
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                self.user, "mock_selfie", _upload()
            )
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.post(
            f"/api/v1/admin/verification-images/{image.id}/review/",
            {"decision": "approved", "note": "Verified via API"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "approved")

    def test_invalid_transition_review_twice(self):
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                self.user, "mock_selfie", _upload()
            )
        verification_service.review_verification_image(self.admin, image.id, "approved")
        with self.assertRaises(DomainError) as ctx:
            verification_service.review_verification_image(self.admin, image.id, "rejected")
        self.assertEqual(ctx.exception.code, "invalid_transition")

    def test_self_review_rejected(self):
        admin_self = _make_user(name="SelfAdmin", is_admin=True)
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                admin_self, "mock_selfie", _upload()
            )
        with self.assertRaises(PermissionDeniedError) as ctx:
            verification_service.review_verification_image(admin_self, image.id, "approved")
        self.assertEqual(ctx.exception.code, "no_self_review")

    def test_unauthorized_image_retrieval(self):
        client = APIClient()
        client.force_authenticate(user=self.user)  # non-admin
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                self.user, "mock_selfie", _upload()
            )
            resp = client.get(f"/api/v1/admin/verification-images/{image.id}/file/")
        self.assertIn(resp.status_code, (403, 404))

    def test_authorized_admin_image_file_stream(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)  # admin
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                self.user, "mock_selfie", _upload()
            )
            resp = client.get(f"/api/v1/admin/verification-images/{image.id}/file/")
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            self.assertEqual(resp["content-type"], "image/jpeg")

    def test_admin_pending_images_queue(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            verification_service.upload_verification_image(self.user, "mock_selfie", _upload())
        resp = client.get("/api/v1/admin/verification-images/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(resp.data["results"]), 1)


# =============================================================================
# 9-14. COORDINATOR LIFECYCLE TESTS
# =============================================================================

class CoordinatorLifecycleTests(TestCase):
    def setUp(self):
        self.admin = _make_user(name="Admin", is_admin=True)
        self.verified_user = _make_user(name="Verified", verified=True)
        self.unverified_user = _make_user(name="Unverified", verified=False)

    def test_unverified_cannot_apply(self):
        with self.assertRaises(DomainError) as ctx:
            coordinator_service.apply_for_coordinator(self.unverified_user)
        self.assertEqual(ctx.exception.code, "not_verified")

    def test_coordinator_application(self):
        profile = coordinator_service.apply_for_coordinator(self.verified_user, "keen to help")
        self.assertEqual(profile.status, "pending")
        self.assertEqual(profile.user_id, self.verified_user.id)
        self.assertEqual(profile.notes, "keen to help")

    def test_coordinator_application_api(self):
        client = APIClient()
        client.force_authenticate(user=self.verified_user)
        res = client.post("/api/v1/me/coordinator/", {"notes": "Interested"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["coordinator"]["status"], "pending")

        # GET application
        get_res = client.get("/api/v1/me/coordinator/")
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(get_res.data["coordinator"]["notes"], "Interested")

        # PATCH application notes
        patch_res = client.patch("/api/v1/me/coordinator/", {"notes": "Updated note"}, format="json")
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data["coordinator"]["notes"], "Updated note")

    def test_coordinator_approval(self):
        coordinator_service.apply_for_coordinator(self.verified_user)
        profile = coordinator_service.approve_coordinator(self.admin, self.verified_user.id)
        self.assertEqual(profile.status, "approved")
        self.assertEqual(profile.approved_by_id, self.admin.id)
        self.assertIsNotNone(profile.approved_at)

    def test_coordinator_approval_api(self):
        coordinator_service.apply_for_coordinator(self.verified_user)
        client = APIClient()
        client.force_authenticate(user=self.admin)
        res = client.post(
            f"/api/v1/admin/coordinators/{self.verified_user.id}/approve/",
            {"notes": "Approved by board"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "approved")
        self.assertEqual(res.data["approved_by_id"], self.admin.id)

    def test_coordinator_suspension(self):
        coordinator_service.apply_for_coordinator(self.verified_user)
        coordinator_service.approve_coordinator(self.admin, self.verified_user.id)
        profile = coordinator_service.suspend_coordinator(self.admin, self.verified_user.id)
        self.assertEqual(profile.status, "suspended")

    def test_coordinator_revocation(self):
        coordinator_service.apply_for_coordinator(self.verified_user)
        coordinator_service.approve_coordinator(self.admin, self.verified_user.id)
        profile = coordinator_service.revoke_coordinator(self.admin, self.verified_user.id)
        self.assertEqual(profile.status, "revoked")

    def test_revoked_cannot_transition(self):
        coordinator_service.apply_for_coordinator(self.verified_user)
        coordinator_service.revoke_coordinator(self.admin, self.verified_user.id)
        # Attempting to approve after revocation must fail (trigger trg_01_coordinator_guard)
        with self.assertRaises(Exception):
            coordinator_service.approve_coordinator(self.admin, self.verified_user.id)

    def test_non_admin_approval_rejected(self):
        coordinator_service.apply_for_coordinator(self.verified_user)
        other = _make_user(name="Other")
        with self.assertRaises(PermissionDeniedError):
            coordinator_service.approve_coordinator(other, self.verified_user.id)

    def test_self_coordinator_approval_rejected(self):
        # Admin verified user cannot approve their own coordinator application
        admin_verified = _make_user(name="AdminVerified", is_admin=True, verified=True)
        coordinator_service.apply_for_coordinator(admin_verified)
        with self.assertRaises(PermissionDeniedError) as ctx:
            coordinator_service.approve_coordinator(admin_verified, admin_verified.id)
        self.assertEqual(ctx.exception.code, "no_self_approval")

    def test_unapproved_coordinator_permission_denied(self):
        # No profile at all
        self.assertFalse(coordinator_service.is_approved_coordinator(self.verified_user))
        # Pending profile is still not approved
        coordinator_service.apply_for_coordinator(self.verified_user)
        self.assertFalse(coordinator_service.is_approved_coordinator(self.verified_user))
        # Approved profile IS approved
        coordinator_service.approve_coordinator(self.admin, self.verified_user.id)
        self.assertTrue(coordinator_service.is_approved_coordinator(self.verified_user))
        # Suspended profile is NOT approved
        coordinator_service.suspend_coordinator(self.admin, self.verified_user.id)
        self.assertFalse(coordinator_service.is_approved_coordinator(self.verified_user))

    def test_admin_pending_coordinators_queue(self):
        coordinator_service.apply_for_coordinator(self.verified_user, "Applying")
        client = APIClient()
        client.force_authenticate(user=self.admin)
        res = client.get("/api/v1/admin/coordinators/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(res.data["results"]), 1)
