# apps/accounts/tests/test_api.py
from io import BytesIO
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.authtoken.models import Token

from apps.accounts.models import CoordinatorProfile, User, UserVerificationImage
from apps.accounts.services import issue_token_for_user
from apps.common.constants import (
    COORDINATOR_PENDING,
    IMAGE_MOCK_SELFIE,
    VERIFICATION_NONE,
)
from apps.events.models import CharityField


def create_dummy_image_file(filename="selfie.png"):
    buffer = BytesIO()
    image = Image.new("RGBA", (100, 100), color="blue")
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return SimpleUploadedFile(filename, buffer.getvalue(), content_type="image/png")


class AccountsApiTests(APITestCase):
    def setUp(self):
        self.phone = "+959987654321"

    def test_otp_flow_api_returns_token(self):
        # 1. Request OTP
        req_resp = self.client.post("/api/v1/auth/otp/request/", {"phone": self.phone})
        self.assertEqual(req_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(req_resp.data.get("status"), "sent")
        code = req_resp.data.get("dev_code")
        self.assertIsNotNone(code)

        # 2. Verify OTP
        verify_resp = self.client.post("/api/v1/auth/otp/verify/", {"phone": self.phone, "code": code})
        self.assertEqual(verify_resp.status_code, status.HTTP_200_OK)
        self.assertIn("token", verify_resp.data)
        self.assertIn("user", verify_resp.data)
        self.assertTrue(verify_resp.data.get("created"))
        self.assertEqual(verify_resp.data["user"]["display_name"], f"Volunteer {self.phone[-4:]}")

    def test_me_patch_cannot_elevate_admin(self):
        # Create user & token
        user = User.objects.create(
            phone_hash="hash_user_patch",
            display_name="Regular Volunteer",
            is_admin=False,
        )
        token = issue_token_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        # Attempt to patch regular fields - should succeed
        patch_resp = self.client.patch("/api/v1/me/", {"display_name": "Updated Name", "home_area": "Yangon"}, format="json")
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_resp.data["display_name"], "Updated Name")
        self.assertEqual(patch_resp.data["home_area"], "Yangon")

        # Attempt to escalate to admin - MUST fail with 400 Bad Request
        elevate_resp = self.client.patch("/api/v1/me/", {"is_admin": True}, format="json")
        self.assertEqual(elevate_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(elevate_resp.data["error"]["code"], "field_not_allowed")

        # Verify in DB that is_admin is still False
        user.refresh_from_db()
        self.assertFalse(user.is_admin)

    def test_verification_images_returns_metadata_only(self):
        user = User.objects.create(
            phone_hash="hash_user_images",
            display_name="Image Uploader",
        )
        token = issue_token_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        # Upload image
        img_file = create_dummy_image_file()
        upload_resp = self.client.post(
            "/api/v1/me/verification-images/",
            {"image_type": IMAGE_MOCK_SELFIE, "image": img_file},
            format="multipart",
        )
        self.assertEqual(upload_resp.status_code, status.HTTP_201_CREATED)

        # Assert metadata is present
        self.assertIn("id", upload_resp.data)
        self.assertIn("image_type", upload_resp.data)
        self.assertIn("file_sha256", upload_resp.data)
        self.assertIn("file_format", upload_resp.data)
        self.assertIn("status", upload_resp.data)

        # Assert RAW PATH IS NOT EXPOSED
        self.assertNotIn("image_path", upload_resp.data)
        self.assertNotIn("path", upload_resp.data)

        # GET images list also returns metadata only
        list_resp = self.client.get("/api/v1/me/verification-images/")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_resp.data), 1)
        self.assertNotIn("image_path", list_resp.data[0])

    def test_me_profile_unauthenticated_fails(self):
        resp = self.client.get("/api/v1/me/")
        self.assertIn(resp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_me_charity_interests_get_and_put(self):
        f1 = CharityField.objects.create(code="elderly", label="Elderly Care", sort_order=1)
        user = User.objects.create(phone_hash="hash_user_interests", display_name="Interest User")
        token = issue_token_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        put_resp = self.client.put("/api/v1/me/charity-interests/", {"codes": ["elderly"]})
        self.assertEqual(put_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(put_resp.data["interests"], ["elderly"])

        get_resp = self.client.get("/api/v1/me/charity-interests/")
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(get_resp.data["interests"], ["elderly"])

    def test_me_coordinator_apply(self):
        user = User.objects.create(phone_hash="hash_coord_user", display_name="Coord Applicant")
        token = issue_token_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        apply_resp = self.client.post("/api/v1/me/coordinator/", {"notes": "Experienced leader"})
        self.assertEqual(apply_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(apply_resp.data["status"], COORDINATOR_PENDING)
        self.assertEqual(apply_resp.data["notes"], "Experienced leader")
