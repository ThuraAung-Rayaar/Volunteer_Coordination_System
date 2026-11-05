"""
API and BFF Integration tests for Phase 4: Identity Verification & Coordinator Lifecycle.

Focus:
- Volunteer upload and status inspection endpoints (/api/v1/me/verification-images/).
- Storage path concealment (W29: image_path strictly omitted).
- Coordinator application endpoint (/api/v1/coordinator/apply/ and /api/v1/me/coordinator/).
- Admin verification queue, streaming with audit log, and review endpoints.
- Admin coordinator queue and lifecycle decision endpoints.
- Authorization gating and 404 resource masking.
"""
import os
import secrets
import tempfile
from pathlib import Path

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import UserVerificationImages, Users
from apps.audit.models import AuditLogs
from apps.coordination.models import CoordinatorProfiles
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import coordinator_service, verification_service


def _next_phone() -> str:
    return f"+9599{secrets.randbelow(8999999) + 1000000}"



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
        fixture_path = Path(os.getcwd()) / "JPEG_example_flower.jpg"
    with open(fixture_path, "rb") as f:
        data = f.read()
    return SimpleUploadedFile("JPEG_example_flower.jpg", data, content_type="image/jpeg")


class VolunteerVerificationAPITests(TestCase):
    def setUp(self):
        self.user = _create_user(name="Vol API", verification_status="none")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self._tempdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tempdir.cleanup)
        self.media_root = self._tempdir.name

    def test_upload_verification_image_endpoint(self):
        """W27, W29: POST /api/v1/me/verification-images/ succeeds and conceals image_path."""
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            response = self.client.post(
                "/api/v1/me/verification-images/",
                {"image_type": "mock_selfie", "image": _load_root_fixture()},
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "pending")
        self.assertEqual(response.data["image_type"], "mock_selfie")

        # W29: Never leak image_path
        self.assertNotIn("image_path", response.data)
        self.assertNotIn("file_sha256", response.data)

    def test_get_verification_status_endpoint(self):
        """W28, W29: GET /api/v1/me/verification-images/ returns status and sanitized images."""
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            verification_service.upload_verification_image(
                self.user, "mock_selfie", _load_root_fixture()
            )

        response = self.client.get("/api/v1/me/verification-images/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["verification_status"], "pending")
        self.assertEqual(len(response.data["images"]), 1)

        # Confirm privacy concealment
        img = response.data["images"][0]
        self.assertNotIn("image_path", img)
        self.assertNotIn("file_sha256", img)
        self.assertEqual(img["image_type"], "mock_selfie")


class CoordinatorApplicationAPITests(TestCase):
    def setUp(self):
        self.verified_user = _create_user(name="Verified Vol", verification_status="verified")
        self.unverified_user = _create_user(name="Unverified Vol", verification_status="none")
        self.client = APIClient()

    def test_apply_unverified_rejected(self):
        """W34: Unverified user calling /api/v1/coordinator/apply/ is rejected with 400 not_verified."""
        self.client.force_authenticate(user=self.unverified_user)
        response = self.client.post(
            "/api/v1/coordinator/apply/",
            {"notes": "I would like to coordinate"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "not_verified")

    def test_apply_verified_success(self):
        """W34: Verified volunteer calling /api/v1/coordinator/apply/ creates pending application."""
        self.client.force_authenticate(user=self.verified_user)
        response = self.client.post(
            "/api/v1/coordinator/apply/",
            {"notes": "Experienced leader"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["coordinator"]["status"], "pending")
        self.assertEqual(response.data["coordinator"]["notes"], "Experienced leader")

    def test_get_and_patch_coordinator_application(self):
        """Volunteer can retrieve profile and update application notes while pending."""
        coordinator_service.apply_for_coordinator(self.verified_user, "Draft note")
        self.client.force_authenticate(user=self.verified_user)

        # GET
        get_res = self.client.get("/api/v1/me/coordinator/")
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(get_res.data["coordinator"]["notes"], "Draft note")

        # PATCH
        patch_res = self.client.patch(
            "/api/v1/me/coordinator/",
            {"notes": "Refined leadership vision"},
            format="json",
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data["coordinator"]["notes"], "Refined leadership vision")


class AdminVerificationAndCoordinatorAPITests(TestCase):
    def setUp(self):
        self.admin = _create_user(name="Admin API", is_admin=True)
        self.volunteer = _create_user(name="Volunteer API", verification_status="none")
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(user=self.admin)
        self.vol_client = APIClient()
        self.vol_client.force_authenticate(user=self.volunteer)

        self._tempdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tempdir.cleanup)
        self.media_root = self._tempdir.name

    def test_admin_verification_queue_authorization_and_filtering(self):
        """W30: GET /api/v1/admin/verification-images/ requires admin and supports filtering."""
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            verification_service.upload_verification_image(
                self.volunteer, "mock_selfie", _load_root_fixture()
            )

        # 1. Unauthenticated -> 401
        anon_client = APIClient()
        res_anon = anon_client.get("/api/v1/admin/verification-images/")
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. Volunteer -> masked 404 or 403
        res_vol = self.vol_client.get("/api/v1/admin/verification-images/")
        self.assertIn(res_vol.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

        # 3. Admin -> 200
        res_admin = self.admin_client.get("/api/v1/admin/verification-images/")
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(res_admin.data["results"]), 1)

        # 4. Filter by image_type
        res_filter = self.admin_client.get("/api/v1/admin/verification-images/?image_type=mock_selfie")
        self.assertEqual(res_filter.status_code, status.HTTP_200_OK)
        self.assertTrue(all(r["image_type"] == "mock_selfie" for r in res_filter.data["results"]))

    def test_admin_file_stream_security_and_audit_logging(self):
        """W31: Private streaming requires admin, masks non-admin with 404, and logs audit."""
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                self.volunteer, "mock_selfie", _load_root_fixture()
            )

            # 1. Volunteer receives 404 resource masked
            res_vol = self.vol_client.get(f"/api/v1/admin/verification-images/{image.id}/file/")
            self.assertEqual(res_vol.status_code, status.HTTP_404_NOT_FOUND)

            # 2. Admin receives 200 image stream
            res_admin = self.admin_client.get(f"/api/v1/admin/verification-images/{image.id}/file/")
            self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
            self.assertEqual(res_admin["Content-Type"], "image/jpeg")

            # Safely close underlying file handle without triggering Django request_finished
            if hasattr(res_admin, "file_to_stream") and hasattr(res_admin.file_to_stream, "close"):
                res_admin.file_to_stream.close()

            # 3. Audit log verified
            audit_entry = AuditLogs.objects.filter(
                action="security.warning.admin_image_view",
                entity_type="user_verification_images",
                entity_id=image.id,
            ).first()
            self.assertIsNotNone(audit_entry)
            self.assertEqual(audit_entry.actor_user_id, self.admin.id)

    def test_admin_review_image_endpoint(self):
        """W30, W32: POST /api/v1/admin/verification-images/{id}/review/ updates status."""
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                self.volunteer, "mock_selfie", _load_root_fixture()
            )

            # Volunteer review attempt -> masked 404 or 403
            res_vol = self.vol_client.post(
                f"/api/v1/admin/verification-images/{image.id}/review/",
                {"decision": "approved"},
                format="json",
            )
            self.assertIn(res_vol.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

            # Admin review -> 200
            res_admin = self.admin_client.post(
                f"/api/v1/admin/verification-images/{image.id}/review/",
                {
                    "decision": "approved",
                    "note": "Verified identity document",
                    "comparison_status": "match",
                    "comparison_score": 0.95,
                },
                format="json",
            )
            self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
            self.assertEqual(res_admin.data["status"], "approved")

    def test_admin_coordinator_lifecycle_endpoints(self):
        """W35-W39: Admin coordinator queue, approve, suspend, revoke, and self-approval block."""
        verified_vol = _create_user(name="Verified Leader", verification_status="verified")
        coordinator_service.apply_for_coordinator(verified_vol, "Ready")

        # 1. Admin queue
        res_queue = self.admin_client.get("/api/v1/admin/coordinators/")
        self.assertEqual(res_queue.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(res_queue.data["results"]), 1)

        # 2. Approve
        res_appr = self.admin_client.post(
            f"/api/v1/admin/coordinators/{verified_vol.id}/approve/",
            {"notes": "Approved by committee"},
            format="json",
        )
        self.assertEqual(res_appr.status_code, status.HTTP_200_OK)
        self.assertEqual(res_appr.data["status"], "approved")
        self.assertEqual(res_appr.data["approved_by_id"], self.admin.id)

        # 3. Suspend
        res_susp = self.admin_client.post(
            f"/api/v1/admin/coordinators/{verified_vol.id}/suspend/",
            format="json",
        )
        self.assertEqual(res_susp.status_code, status.HTTP_200_OK)
        self.assertEqual(res_susp.data["status"], "suspended")

        # 4. Revoke
        res_rev = self.admin_client.post(
            f"/api/v1/admin/coordinators/{verified_vol.id}/revoke/",
            format="json",
        )
        self.assertEqual(res_rev.status_code, status.HTTP_200_OK)
        self.assertEqual(res_rev.data["status"], "revoked")

    def test_admin_self_approval_blocked_via_api(self):
        """W39: Admin cannot approve their own coordinator application via API."""
        admin_verified = _create_user(name="Admin Self", is_admin=True, verification_status="verified")
        coordinator_service.apply_for_coordinator(admin_verified)

        client = APIClient()
        client.force_authenticate(user=admin_verified)

        res = client.post(
            f"/api/v1/admin/coordinators/{admin_verified.id}/approve/",
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.data["error"]["code"], "no_self_approval")
