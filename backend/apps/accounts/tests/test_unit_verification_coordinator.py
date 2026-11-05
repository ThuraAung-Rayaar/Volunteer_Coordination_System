"""
Unit tests for Phase 4: Identity Verification & Coordinator Lifecycle.

Focus:
- Verification image sanitizer unit tests (EXIF stripping, SHA-256 calculation, dimensions checking).
- Serializer validation (allow-list, bounds, choices).
- Dynamic settings limits.
"""
import io
import tempfile
import uuid
from pathlib import Path
from unittest import TestCase

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from admin_portal.serializers import (
    AdminCoordinatorProfileSerializer,
    AdminVerificationImageSerializer,
    AdminVerificationReviewSerializer,
    ReviewImageSerializer,
)
from bff.volunteer.serializers import (
    CoordinatorApplySerializer,
    CoordinatorProfileSerializer,
    VerificationImageSerializer,
    VerificationImageUploadSerializer,
)
from common.exceptions import ValidationError
from common.utils import sanitize_and_save_verification_jpeg
from services import verification_service


def _create_test_image(size=(400, 400), fmt="JPEG", exif_bytes=None) -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=(100, 150, 200))
    if exif_bytes:
        img.save(buf, format=fmt, exif=exif_bytes)
    else:
        img.save(buf, format=fmt)
    return buf.getvalue()


class SanitizerUnitTests(TestCase):
    def setUp(self):
        self._tempdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tempdir.cleanup)
        self.media_root = self._tempdir.name
        self.user_uuid = str(uuid.uuid4())

    def test_sanitize_valid_jpeg(self):
        raw_bytes = _create_test_image((300, 300))
        uploaded = SimpleUploadedFile("selfie.jpg", raw_bytes, content_type="image/jpeg")

        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            rel_path, sha256_hex = sanitize_and_save_verification_jpeg(
                self.user_uuid, "mock_selfie", uploaded
            )

        self.assertTrue(rel_path.endswith(".jpg"))
        self.assertEqual(len(sha256_hex), 64)
        self.assertTrue(all(c in "0123456789abcdef" for c in sha256_hex))

        # Ensure saved file is a valid image on disk
        saved_file = Path(self.media_root) / rel_path
        self.assertTrue(saved_file.exists())
        with Image.open(saved_file) as img:
            self.assertEqual(img.format, "JPEG")
            self.assertEqual(img.size, (300, 300))
            # EXIF metadata must be stripped
            self.assertFalse(hasattr(img, "_getexif") and img._getexif())

    def test_sanitize_dimension_too_small(self):
        raw_bytes = _create_test_image((150, 150))
        uploaded = SimpleUploadedFile("tiny.jpg", raw_bytes, content_type="image/jpeg")

        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            with self.assertRaises(ValidationError) as ctx:
                sanitize_and_save_verification_jpeg(
                    self.user_uuid, "mock_selfie", uploaded
                )
            self.assertEqual(ctx.exception.code, "image_too_small")

    def test_sanitize_dimension_too_large(self):
        raw_bytes = _create_test_image((6500, 1000))
        uploaded = SimpleUploadedFile("huge.jpg", raw_bytes, content_type="image/jpeg")

        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            with self.assertRaises(ValidationError) as ctx:
                sanitize_and_save_verification_jpeg(
                    self.user_uuid, "mock_selfie", uploaded
                )
            self.assertEqual(ctx.exception.code, "image_too_large")

    def test_sanitize_empty_file(self):
        uploaded = SimpleUploadedFile("empty.jpg", b"", content_type="image/jpeg")

        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            with self.assertRaises(ValidationError) as ctx:
                sanitize_and_save_verification_jpeg(
                    self.user_uuid, "mock_selfie", uploaded
                )
            self.assertEqual(ctx.exception.code, "empty_file")

    def test_sanitize_invalid_format(self):
        uploaded = SimpleUploadedFile("corrupt.jpg", b"NOT_A_VALID_JPEG_STREAM", content_type="image/jpeg")

        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            with self.assertRaises(ValidationError) as ctx:
                sanitize_and_save_verification_jpeg(
                    self.user_uuid, "mock_selfie", uploaded
                )
            self.assertEqual(ctx.exception.code, "invalid_image")

    def test_sanitize_invalid_image_type(self):
        raw_bytes = _create_test_image((300, 300))
        uploaded = SimpleUploadedFile("passport.jpg", raw_bytes, content_type="image/jpeg")

        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            with self.assertRaises(ValidationError) as ctx:
                sanitize_and_save_verification_jpeg(
                    self.user_uuid, "passport_scan", uploaded
                )
            self.assertEqual(ctx.exception.code, "invalid_image_type")

    def test_sanitize_path_traversal_uuid_blocked(self):
        raw_bytes = _create_test_image((300, 300))
        uploaded = SimpleUploadedFile("doc.jpg", raw_bytes, content_type="image/jpeg")

        with override_settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            with self.assertRaises(ValidationError) as ctx:
                sanitize_and_save_verification_jpeg(
                    "../../etc/passwd", "mock_selfie", uploaded
                )
            self.assertEqual(ctx.exception.code, "invalid_uuid")


class SerializerUnitTests(TestCase):
    def test_verification_image_upload_serializer_valid(self):
        raw_bytes = _create_test_image((300, 300))
        uploaded = SimpleUploadedFile("doc.jpg", raw_bytes, content_type="image/jpeg")

        serializer = VerificationImageUploadSerializer(data={
            "image_type": "mock_selfie",
            "image": uploaded,
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_verification_image_upload_serializer_invalid_type(self):
        raw_bytes = _create_test_image((300, 300))
        uploaded = SimpleUploadedFile("doc.jpg", raw_bytes, content_type="image/jpeg")

        serializer = VerificationImageUploadSerializer(data={
            "image_type": "unsupported_badge",
            "image": uploaded,
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn("image_type", serializer.errors)

    def test_admin_verification_review_serializer_valid(self):
        serializer = AdminVerificationReviewSerializer(data={
            "decision": "approved",
            "note": "Document verified against registry",
            "comparison_status": "match",
            "comparison_score": 0.95,
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_admin_verification_review_serializer_bounds(self):
        # Bound 0.00 is valid
        s1 = ReviewImageSerializer(data={"decision": "approved", "comparison_score": 0.0})
        self.assertTrue(s1.is_valid(), s1.errors)

        # Bound 1.00 is valid
        s2 = ReviewImageSerializer(data={"decision": "approved", "comparison_score": 1.0})
        self.assertTrue(s2.is_valid(), s2.errors)

        # Below 0.0 is invalid
        s3 = ReviewImageSerializer(data={"decision": "approved", "comparison_score": -0.01})
        self.assertFalse(s3.is_valid())
        self.assertIn("comparison_score", s3.errors)

        # Above 1.0 is invalid
        s4 = ReviewImageSerializer(data={"decision": "approved", "comparison_score": 1.05})
        self.assertFalse(s4.is_valid())
        self.assertIn("comparison_score", s4.errors)

    def test_admin_verification_review_serializer_invalid_decision(self):
        serializer = AdminVerificationReviewSerializer(data={
            "decision": "undecided",
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn("decision", serializer.errors)

    def test_coordinator_apply_serializer_valid(self):
        s = CoordinatorApplySerializer(data={"notes": "Experienced coordinator with 5 years tenure"})
        self.assertTrue(s.is_valid())
        self.assertEqual(s.validated_data["notes"], "Experienced coordinator with 5 years tenure")

        # Blank notes also valid
        s2 = CoordinatorApplySerializer(data={})
        self.assertTrue(s2.is_valid())


class DynamicLimitsUnitTests(TestCase):
    @override_settings(VERIFICATION_MAX_UPLOAD_BYTES=1024)
    def test_max_upload_bytes_override(self):
        self.assertEqual(verification_service._max_upload_bytes(), 1024)

    @override_settings(VERIFICATION_MIN_DIMENSION=150)
    def test_min_dimension_override(self):
        self.assertEqual(verification_service._min_dimension(), 150)

    @override_settings(VERIFICATION_MAX_DIMENSION=4000)
    def test_max_dimension_override(self):
        self.assertEqual(verification_service._max_dimension(), 4000)

