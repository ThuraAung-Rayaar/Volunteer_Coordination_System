"""
Unit tests for Phase 3 — Authentication, Profiles, Cryptography & Serializers.
File: backend/apps/accounts/tests/test_unit_auth_profile.py
"""
import uuid
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from bff.auth.serializers import OtpRequestSerializer, OtpVerifySerializer
from bff.volunteer.serializers import (
    AvailabilityCheckSerializer,
    AvailabilityExceptionSerializer,
    AvailabilityRuleSerializer,
    AvailabilityRulesReplaceSerializer,
    ProfileUpdateSerializer,
    UserProfileSerializer,
    UserPublicCardSerializer,
    UserT2CoordinatorCardSerializer,
)
from common.utils import (
    compute_otp_hash,
    compute_phone_hash,
    decrypt_phone,
    encrypt_phone,
    normalize_phone,
    normalize_tags,
)


class CryptoAndNormalizationUnitTests(SimpleTestCase):
    """Test cryptographic transformations, hashing, and array normalization."""

    def test_compute_phone_hash_deterministic_and_length(self):
        phone = "+95912345678"
        h1 = compute_phone_hash(phone)
        h2 = compute_phone_hash(phone)
        self.assertEqual(h1, h2)
        self.assertEqual(len(h1), 64)  # Satisfies ck_users_phone_hash_len (32 <= len <= 128)

    def test_phone_encryption_and_decryption_roundtrip(self):
        raw_phone = "+95998765432"
        enc = encrypt_phone(raw_phone)
        self.assertNotEqual(raw_phone, enc)
        dec = decrypt_phone(enc)
        self.assertEqual(raw_phone, dec)

    def test_phone_normalization_formats(self):
        self.assertEqual(normalize_phone("+95 9 1234 5678"), "+95912345678")
        self.assertEqual(normalize_phone("+95-9-1234-5678"), "+95912345678")
        self.assertEqual(normalize_phone("+95 (9) 1234.5678"), "+95912345678")

    def test_tags_are_normalized_formula(self):
        raw_tags = ["  Medical ", "first aid", "MEDICAL", "", "  ", "Emergency Rescue  "]
        normalized = normalize_tags(raw_tags)
        self.assertEqual(normalized, ["medical", "first aid", "emergency rescue"])

    def test_compute_otp_hash(self):
        code = "1234"
        h = compute_otp_hash(code)
        self.assertEqual(len(h), 64)
        self.assertEqual(h, compute_otp_hash("1234"))
        self.assertNotEqual(h, compute_otp_hash("1235"))


class SerializerValidationUnitTests(SimpleTestCase):
    """Test serializer validation and allow-list boundary enforcement."""

    def test_otp_request_serializer_valid(self):
        s = OtpRequestSerializer(data={"phone": "+95912345678", "purpose": "login"})
        self.assertTrue(s.is_valid())

    def test_otp_request_serializer_invalid_purpose(self):
        s = OtpRequestSerializer(data={"phone": "+95912345678", "purpose": "invalid_purpose"})
        self.assertFalse(s.is_valid())

    def test_otp_verify_serializer_valid(self):
        s = OtpVerifySerializer(data={"phone": "+95912345678", "code": "1234", "display_name": "Test"})
        self.assertTrue(s.is_valid())
        self.assertEqual(s.validated_data["code"], "1234")

    def test_profile_update_serializer_allow_list_rejects_disallowed_keys(self):
        # Disallowed privileged fields: is_admin, role, trust_level, uuid, etc.
        disallowed_payloads = [
            ({"is_admin": True}, "is_admin"),
            ({"role": "admin"}, "role"),
            ({"trust_level": 5}, "trust_level"),
            ({"account_status": "active"}, "account_status"),
            ({"points_balance": 100}, "points_balance"),
            ({"unrecognized_key": "val"}, "unrecognized_key"),
        ]
        for payload, key in disallowed_payloads:
            s = ProfileUpdateSerializer(data=payload)
            self.assertFalse(s.is_valid(), f"Payload {payload} should be rejected by allow-list")
            self.assertIn(key, s.errors)

    def test_profile_update_serializer_accepts_allowed_fields(self):
        payload = {
            "display_name": "New Volunteer",
            "preferred_language": "my",
            "home_area": "Kamayut",
            "blood_type": "B+",
            "can_lift_heavy": True,
            "skills": ["first aid", "logistics"],
        }
        s = ProfileUpdateSerializer(data=payload)
        self.assertTrue(s.is_valid(), s.errors)

    def test_availability_rule_serializer_valid(self):
        s = AvailabilityRuleSerializer(data={"weekday": 1, "start_time": "09:00", "end_time": "17:00"})
        self.assertTrue(s.is_valid())

    def test_availability_rule_serializer_invalid_weekday(self):
        s = AvailabilityRuleSerializer(data={"weekday": 8, "start_time": "09:00", "end_time": "17:00"})
        self.assertFalse(s.is_valid())

    def test_availability_exception_serializer_valid(self):
        s = AvailabilityExceptionSerializer(data={"date": "2026-12-25", "is_available": False, "note": "Holiday"})
        self.assertTrue(s.is_valid())

    def test_user_public_card_serializer(self):
        sample_uuid = uuid.uuid4()
        s = UserPublicCardSerializer({"uuid": sample_uuid, "display_name": "Public Volunteer"})
        self.assertEqual(s.data["display_name"], "Public Volunteer")
        self.assertEqual(s.data["uuid"], str(sample_uuid))

