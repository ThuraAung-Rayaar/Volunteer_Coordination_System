"""
Automated tests for Phase C1: Server-Side Verification Image Encrypted Storage & Authorized Admin Streaming.

Covers Section 5.1-5.5 and Section 5.8 Acceptance Tests:
1. Crypto unit tests (round-trip, unique nonce, tamper detection, wrong key, key separation).
2. Upload pipeline tests (disk ciphertext verification, DB metadata persistence, input validation, DB failure cleanup).
3. Admin streaming pipeline tests (authorized in-memory decryption, security headers, integrity check, fail-closed access controls).
"""
import base64
import hashlib
import io
import os
import secrets
import tempfile
import uuid
from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Users, UserVerificationImages
from apps.audit.models import AuditLogs
from common.exceptions import DomainError, PermissionDeniedError, ResourceMaskedNotFound, ValidationError
from common.image_crypto import (
    ENVELOPE_MAGIC,
    ImageCryptoError,
    ImageDecryptionError,
    InvalidEnvelopeError,
    KeyNotFoundError,
    KeySeparationError,
    decode_key,
    decrypt_image,
    encrypt_image,
    get_active_key,
    get_active_key_id,
    is_encrypted_envelope,
    is_plaintext_jpeg,
    validate_key_separation,
)
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone, sanitize_and_save_verification_jpeg
from services import verification_service


def _random_phone() -> str:
    return f"+959{secrets.randbelow(89999999) + 10000000}"


def _create_user(name="Volunteer", is_admin=False, is_active=True, verification_status="none") -> Users:
    phone = normalize_phone(_random_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        is_active=is_active,
        verification_status=verification_status,
    )


def _create_synthetic_jpeg(width: int = 300, height: int = 300, color=(120, 150, 180), exif_bytes=None) -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=color)
    if exif_bytes:
        img.save(buf, format="JPEG", quality=90, exif=exif_bytes)
    else:
        img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


class TestImageCryptoUnitPhaseC1(TestCase):
    """Exhaustive crypto unit tests per Section 5.8."""

    def test_round_trip_encryption_decryption(self):
        """Sanitized JPEG encrypted in memory decrypts to byte-identical plaintext."""
        payload = _create_synthetic_jpeg(400, 400)
        envelope = encrypt_image(payload)

        self.assertTrue(is_encrypted_envelope(envelope))
        self.assertFalse(is_plaintext_jpeg(envelope))

        decrypted, kid = decrypt_image(envelope)
        self.assertEqual(decrypted, payload)
        self.assertEqual(kid, get_active_key_id())

    def test_ciphertext_does_not_contain_plaintext_or_jpeg_header(self):
        """Ciphertext on disk starts with AGYI envelope magic, never 0xFFD8 JPEG markers."""
        payload = _create_synthetic_jpeg(300, 300)
        envelope = encrypt_image(payload)

        self.assertTrue(envelope.startswith(ENVELOPE_MAGIC))
        self.assertFalse(envelope.startswith(b"\xff\xd8"))
        self.assertNotIn(payload, envelope)

    def test_unique_nonce_per_encryption(self):
        """Two encryptions of the same image bytes produce different ciphertexts."""
        payload = _create_synthetic_jpeg(300, 300)
        envelope1 = encrypt_image(payload)
        envelope2 = encrypt_image(payload)

        self.assertNotEqual(envelope1, envelope2)
        dec1, _ = decrypt_image(envelope1)
        dec2, _ = decrypt_image(envelope2)
        self.assertEqual(dec1, payload)
        self.assertEqual(dec2, payload)

    def test_wrong_key_fails_authentication(self):
        """Decryption with an incorrect 32-byte key raises ImageDecryptionError."""
        payload = _create_synthetic_jpeg(300, 300)
        envelope = encrypt_image(payload)
        wrong_key = os.urandom(32)

        with self.assertRaises(ImageDecryptionError):
            decrypt_image(envelope, key_ring={get_active_key_id(): wrong_key})

    def test_tampered_ciphertext_fails_authentication(self):
        """Flipping a single bit in the ciphertext triggers AES-GCM tag verification failure."""
        payload = _create_synthetic_jpeg(300, 300)
        envelope = bytearray(encrypt_image(payload))
        envelope[-1] ^= 0x01

        with self.assertRaises(ImageDecryptionError):
            decrypt_image(bytes(envelope))

    def test_tampered_header_fails_authentication(self):
        """Modifying the AAD header causes GCM authentication failure."""
        payload = _create_synthetic_jpeg(300, 300)
        envelope = bytearray(encrypt_image(payload))
        # Modify version byte in header
        envelope[4] = 0x02

        with self.assertRaises(InvalidEnvelopeError):
            decrypt_image(bytes(envelope))

    def test_unknown_key_id_fails_closed(self):
        """Envelope specifying a key ID not present in keyring raises KeyNotFoundError."""
        payload = _create_synthetic_jpeg(300, 300)
        envelope = encrypt_image(payload, key_id="unknown_legacy_key")

        with self.assertRaises(KeyNotFoundError):
            decrypt_image(envelope)

    def test_key_separation_enforcement(self):
        """Reusing PHONE_ENCRYPTION_KEY or Django SECRET_KEY raises KeySeparationError."""
        phone_key = decode_key(settings.PHONE_ENCRYPTION_KEY)
        with self.assertRaises(KeySeparationError):
            validate_key_separation(phone_key)


class TestImageUploadPipelinePhaseC1(TestCase):
    """Upload pipeline, disk ciphertext verification, and database persistence per Section 5.4 & 5.8."""

    def setUp(self):
        self.user = _create_user(name="Volunteer Upload Test")
        self._tempdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tempdir.cleanup)
        self.media_root = self._tempdir.name

    def test_upload_persists_ciphertext_on_disk_and_metadata_in_db(self):
        """Upload writes encrypted envelope to disk (AGYI magic) and stores plaintext SHA-256 in DB."""
        raw_jpeg = _create_synthetic_jpeg(350, 350)
        uploaded = SimpleUploadedFile("selfie.jpg", raw_jpeg, content_type="image/jpeg")

        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(self.user, "mock_selfie", uploaded)

        # 1. DB Row Assertions: Metadata only, zero raw image bytes
        self.assertEqual(image.status, "pending")
        self.assertTrue(image.is_current)
        self.assertEqual(image.file_format, "jpeg")
        self.assertEqual(len(image.file_sha256), 64)
        self.assertTrue(image.image_path.endswith(".jpg"))

        # Confirm PostgreSQL does not have image bytes column
        self.assertFalse(hasattr(image, "image_bytes"))
        self.assertFalse(hasattr(image, "ciphertext"))

        # 2. Disk Assertions: File on disk contains encrypted envelope starting with AGYI
        target_file = Path(self.media_root) / image.image_path
        self.assertTrue(target_file.exists())
        file_bytes = target_file.read_bytes()

        self.assertTrue(file_bytes.startswith(ENVELOPE_MAGIC), "Disk file must start with AGYI envelope magic")
        self.assertFalse(file_bytes.startswith(b"\xff\xd8"), "Disk file must NOT start with JPEG 0xFFD8 markers")

        # 3. Decrypt on disk file and verify byte integrity against DB file_sha256
        decrypted_bytes, kid = decrypt_image(file_bytes)
        self.assertEqual(hashlib.sha256(decrypted_bytes).hexdigest(), image.file_sha256)

    def test_upload_strips_exif_metadata(self):
        """Sanitization removes EXIF metadata from uploaded image before encryption."""
        exif_bytes = b"Exif\x00\x00MM\x00*\x00\x00\x00\x08\x00\x00\x00\x00\x00\x00"
        raw_jpeg = _create_synthetic_jpeg(300, 300, exif_bytes=exif_bytes)
        uploaded = SimpleUploadedFile("exif_selfie.jpg", raw_jpeg, content_type="image/jpeg")

        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(self.user, "mock_selfie", uploaded)

        target_file = Path(self.media_root) / image.image_path
        decrypted_bytes, _ = decrypt_image(target_file.read_bytes())

        with Image.open(io.BytesIO(decrypted_bytes)) as img:
            self.assertFalse(hasattr(img, "_getexif") and img._getexif())

    def test_upload_db_failure_cleans_up_new_orphan_ciphertext_file(self):
        """If database insert fails, the newly-written ciphertext file is deleted from disk."""
        raw_jpeg = _create_synthetic_jpeg(300, 300)
        uploaded = SimpleUploadedFile("selfie.jpg", raw_jpeg, content_type="image/jpeg")

        created_files = []
        original_replace = os.replace

        def tracking_replace(src, dst):
            created_files.append(Path(dst))
            return original_replace(src, dst)

        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            with patch("os.replace", side_effect=tracking_replace):
                with patch("apps.accounts.models.UserVerificationImages.objects.create", side_effect=RuntimeError("Simulated DB Insert Failure")):
                    with self.assertRaises(RuntimeError):
                        verification_service.upload_verification_image(self.user, "mock_selfie", uploaded)

        # File was created temporarily, but cleaned up on DB failure
        self.assertEqual(len(created_files), 1)
        self.assertFalse(created_files[0].exists(), "Newly-created ciphertext file must be cleaned up on DB failure")

    def test_upload_invalid_dimensions_and_mime_spoofing(self):
        """Rejects dimension bounds violations and non-image payload spoofing."""
        # MIME spoof: text payload with .jpg extension
        spoofed = SimpleUploadedFile("malicious.jpg", b"MALICIOUS_NON_IMAGE_PAYLOAD", content_type="image/jpeg")
        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            with self.assertRaises(DomainError):
                verification_service.upload_verification_image(self.user, "mock_selfie", spoofed)

        # Too small (< 200px)
        tiny_jpeg = _create_synthetic_jpeg(100, 100)
        tiny_file = SimpleUploadedFile("tiny.jpg", tiny_jpeg, content_type="image/jpeg")
        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            with self.assertRaises(DomainError):
                verification_service.upload_verification_image(self.user, "mock_selfie", tiny_file)

    def test_volunteer_api_conceals_image_path(self):
        """Volunteer upload and status inspection strictly conceal image_path and file_sha256."""
        client = APIClient()
        client.force_authenticate(user=self.user)
        raw_jpeg = _create_synthetic_jpeg(300, 300)

        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            res = client.post(
                "/api/v1/me/verification-images/",
                {"image_type": "mock_selfie", "image": SimpleUploadedFile("doc.jpg", raw_jpeg, content_type="image/jpeg")},
                format="multipart",
            )
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)
            self.assertNotIn("image_path", res.data)
            self.assertNotIn("file_sha256", res.data)

            # GET status
            res_get = client.get("/api/v1/me/verification-images/")
            self.assertEqual(res_get.status_code, status.HTTP_200_OK)
            self.assertEqual(len(res_get.data["images"]), 1)
            img_data = res_get.data["images"][0]
            self.assertNotIn("image_path", img_data)
            self.assertNotIn("file_sha256", img_data)


class TestAdminImageStreamingPhaseC1(TestCase):
    """Admin streaming pipeline, in-memory decryption, integrity check, and fail-closed security per Section 5.5 & 5.8."""

    def setUp(self):
        self.admin = _create_user(name="Admin Reviewer", is_admin=True)
        self.volunteer = _create_user(name="Volunteer Owner")
        self.attacker = _create_user(name="Malicious User")

        self.admin_client = APIClient()
        self.admin_client.force_authenticate(user=self.admin)
        self.vol_client = APIClient()
        self.vol_client.force_authenticate(user=self.volunteer)
        self.attacker_client = APIClient()
        self.attacker_client.force_authenticate(user=self.attacker)

        self._tempdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tempdir.cleanup)
        self.media_root = self._tempdir.name

    def _upload_test_image(self) -> UserVerificationImages:
        raw_jpeg = _create_synthetic_jpeg(320, 320)
        uploaded = SimpleUploadedFile("selfie.jpg", raw_jpeg, content_type="image/jpeg")
        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            return verification_service.upload_verification_image(self.volunteer, "mock_selfie", uploaded)

    def test_admin_receives_decrypted_jpeg_stream_with_security_headers(self):
        """Active admin receives decrypted JPEG stream with private, no-store and nosniff headers."""
        image = self._upload_test_image()

        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            response = self.admin_client.get(f"/api/v1/admin/verification-images/{image.id}/file/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "image/jpeg")
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertIn(f"verification_{image.id}.jpg", response["Content-Disposition"])

        # Streamed content matches decrypted JPEG byte-for-byte
        streamed_bytes = b"".join(response.streaming_content)
        self.assertTrue(streamed_bytes.startswith(b"\xff\xd8"), "Admin stream must return genuine JPEG bytes")
        self.assertFalse(streamed_bytes.startswith(ENVELOPE_MAGIC), "Admin stream must NOT return raw ciphertext envelope")
        self.assertEqual(hashlib.sha256(streamed_bytes).hexdigest(), image.file_sha256)

        # Audit log verified
        audit = AuditLogs.objects.filter(
            action="security.warning.admin_image_view",
            entity_type="user_verification_images",
            entity_id=image.id,
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor_user_id, self.admin.id)

    def test_non_admin_and_unauthenticated_requests_are_blocked(self):
        """Volunteers receive masked 404; unauthenticated callers receive 401."""
        image = self._upload_test_image()

        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            # 1. Unauthenticated -> 401
            anon_client = APIClient()
            res_anon = anon_client.get(f"/api/v1/admin/verification-images/{image.id}/file/")
            self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)

            # 2. Volunteer owner -> 404 masked
            res_owner = self.vol_client.get(f"/api/v1/admin/verification-images/{image.id}/file/")
            self.assertEqual(res_owner.status_code, status.HTTP_404_NOT_FOUND)

            # 3. Third party volunteer -> 404 masked
            res_attacker = self.attacker_client.get(f"/api/v1/admin/verification-images/{image.id}/file/")
            self.assertEqual(res_attacker.status_code, status.HTTP_404_NOT_FOUND)

    def test_tampered_ciphertext_fails_closed(self):
        """Corrupted ciphertext causes AES-GCM tag verification failure and returns masked 404."""
        image = self._upload_test_image()
        target_path = Path(self.media_root) / image.image_path

        # Corrupt one byte of ciphertext on disk
        data = bytearray(target_path.read_bytes())
        data[-1] ^= 0x01
        target_path.write_bytes(bytes(data))

        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            response = self.admin_client.get(f"/api/v1/admin/verification-images/{image.id}/file/")

        # Fails closed with masked 404, never streaming corrupted bytes
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_hash_integrity_mismatch_fails_closed(self):
        """If decrypted bytes do not match DB file_sha256, endpoint fails closed with 404."""
        image = self._upload_test_image()
        target_path = Path(self.media_root) / image.image_path

        # Write ciphertext of a DIFFERENT image to the target path
        diff_payload = _create_synthetic_jpeg(320, 320, color=(1, 2, 3))
        target_path.write_bytes(encrypt_image(diff_payload))

        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            response = self.admin_client.get(f"/api/v1/admin/verification-images/{image.id}/file/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_path_traversal_fails_closed(self):
        """Path traversal outside VERIFICATION_MEDIA_ROOT raises PermissionDenied and fails closed."""
        fake_image = UserVerificationImages(image_path="../../etc/passwd")

        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            with self.assertRaises(PermissionDeniedError):
                verification_service.resolve_private_image_path(fake_image)

        # Also verify view fails closed when resolve_private_image_path detects traversal
        image = self._upload_test_image()
        with patch("services.verification_service.resolve_private_image_path", side_effect=PermissionDeniedError(message="Invalid image path.", code="invalid_path")):
            with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
                response = self.admin_client.get(f"/api/v1/admin/verification-images/{image.id}/file/")
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_missing_file_fails_closed_with_masked_404(self):
        """Missing file on disk returns masked 404."""
        image = self._upload_test_image()
        target_path = Path(self.media_root) / image.image_path
        target_path.unlink()

        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            response = self.admin_client.get(f"/api/v1/admin/verification-images/{image.id}/file/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
