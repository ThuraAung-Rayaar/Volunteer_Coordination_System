"""
Unit tests for Phase 7 serializers, allow-list mixin, and QR cryptography.
"""
import hashlib
import secrets
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from bff.checkin.serializers import (
    AttendanceRosterSerializer,
    GeoCheckInSerializer,
    ManualCheckInSerializer,
    OnboardingAcknowledgeSerializer,
    QrTokenCreateSerializer,
    QrTokenRedeemSerializer,
    QrTokenSerializer,
)
from services.qr_service import _hash_token


class AttendanceSerializerUnitTests(SimpleTestCase):
    def test_qr_token_create_serializer_valid(self):
        data = {
            "purpose": "checkin",
            "max_uses": 5,
            "ttl_minutes": 120,
        }
        serializer = QrTokenCreateSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["purpose"], "checkin")
        self.assertEqual(serializer.validated_data["max_uses"], 5)
        self.assertEqual(serializer.validated_data["ttl_minutes"], 120)

    def test_qr_token_create_serializer_invalid_purpose(self):
        data = {"purpose": "unsupported_action"}
        serializer = QrTokenCreateSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("purpose", serializer.errors)

    def test_qr_token_create_serializer_ttl_bounds(self):
        # min_value is 1, max_value is 10080
        data_low = {"purpose": "checkin", "ttl_minutes": 0}
        self.assertFalse(QrTokenCreateSerializer(data=data_low).is_valid())

        data_high = {"purpose": "checkin", "ttl_minutes": 20000}
        self.assertFalse(QrTokenCreateSerializer(data=data_high).is_valid())

    def test_qr_redeem_serializer(self):
        serializer = QrTokenRedeemSerializer(data={"token": "test-token-1234"})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["token"], "test-token-1234")

    def test_geo_checkin_serializer_valid(self):
        data = {
            "event_id": 10,
            "latitude": 1.3521,
            "longitude": 103.8198,
            "accuracy_m": 12.5,
            "is_mocked": False,
        }
        serializer = GeoCheckInSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_geo_checkin_serializer_out_of_bounds(self):
        # Latitude range: [-90, 90]
        data_lat = {"event_id": 1, "latitude": 95.0, "longitude": 10.0}
        self.assertFalse(GeoCheckInSerializer(data=data_lat).is_valid())

        # Longitude range: [-180, 180]
        data_lon = {"event_id": 1, "latitude": 10.0, "longitude": 195.0}
        self.assertFalse(GeoCheckInSerializer(data=data_lon).is_valid())

    def test_manual_checkin_serializer(self):
        data = {"event_id": 42, "user_id": 100, "note": "Checked in at reception desk"}
        serializer = ManualCheckInSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["note"], "Checked in at reception desk")

    def test_allow_list_mixin_rejects_unknown_fields(self):
        data = {
            "purpose": "checkin",
            "forbidden_extra_field": "injected_payload",
        }
        serializer = QrTokenCreateSerializer(data=data)
        with self.assertRaises(ValidationError) as ctx:
            serializer.is_valid(raise_exception=True)
        self.assertIn("forbidden_extra_field", ctx.exception.detail)

    def test_allow_list_mixin_rejects_modifying_read_only_fields(self):
        data = {
            "id": 999,  # read_only on QrTokenSerializer
            "raw_token": "foo",
        }
        serializer = QrTokenSerializer(data=data)
        with self.assertRaises(ValidationError) as ctx:
            serializer.is_valid(raise_exception=True)
        self.assertIn("id", ctx.exception.detail)

    def test_qr_hash_token_cryptography(self):
        raw = "my_secure_random_nonce_value"
        expected = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        self.assertEqual(_hash_token(raw), expected)
        self.assertEqual(len(_hash_token(raw)), 64)

    def test_nonce_randomness(self):
        t1 = secrets.token_urlsafe(32)
        t2 = secrets.token_urlsafe(32)
        self.assertNotEqual(t1, t2)
        self.assertNotEqual(_hash_token(t1), _hash_token(t2))

