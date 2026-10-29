# apps/common/tests/test_security.py
from django.test import SimpleTestCase, override_settings

from apps.common.security import (
    compute_phone_hash,
    decrypt_phone,
    encrypt_phone,
    generate_otp_code,
    generate_raw_token,
    hash_otp,
    hash_token,
    normalize_phone,
)


@override_settings(PHONE_HASH_HMAC_SECRET="test-hmac-secret-volunteer-system-2026")
class SecurityTests(SimpleTestCase):
    def test_phone_normalization_formats(self):
        # International with plus and spaces/dashes
        self.assertEqual(normalize_phone("+1 (555) 123-4567"), "+15551234567")
        self.assertEqual(normalize_phone("  +44 20 7946 0958  "), "+442079460958")
        self.assertEqual(normalize_phone("+95-9-123-456-789"), "+959123456789")

        # Local without plus
        self.assertEqual(normalize_phone("09-123-456-789"), "09123456789")
        self.assertEqual(normalize_phone(" (09) 1234 5678 "), "0912345678")

        # Empty / None handling
        self.assertEqual(normalize_phone(""), "")
        self.assertEqual(normalize_phone(None), "")

    def test_phone_hash_is_deterministic(self):
        # Same phone yields same hash
        h1 = compute_phone_hash("+959123456789")
        h2 = compute_phone_hash("+959123456789")
        self.assertEqual(h1, h2)
        self.assertEqual(len(h1), 64)  # HMAC-SHA256 hex digest length

        # Formatted phone yields identical hash due to normalization
        h3 = compute_phone_hash("+95-9-123-456-789")
        self.assertEqual(h1, h3)

        # Different phones yield different hashes
        h4 = compute_phone_hash("+959987654321")
        self.assertNotEqual(h1, h4)

    def test_encrypt_decrypt_phone_roundtrip(self):
        raw_phone = "+959123456789"
        encrypted = encrypt_phone(raw_phone)

        # Encrypted string must not be plain text
        self.assertNotEqual(encrypted, raw_phone)
        self.assertNotIn("959123456789", encrypted)

        # Decryption restores the normalized phone
        decrypted = decrypt_phone(encrypted)
        self.assertEqual(decrypted, raw_phone)

        # Test phone with spaces/dashes restores normalized form
        formatted_phone = "+1 (555) 234-5678"
        enc_formatted = encrypt_phone(formatted_phone)
        dec_formatted = decrypt_phone(enc_formatted)
        self.assertEqual(dec_formatted, "+15552345678")

    def test_raw_token_does_not_equal_hash(self):
        raw_token = generate_raw_token()
        self.assertTrue(len(raw_token) >= 32)

        hashed = hash_token(raw_token)
        self.assertEqual(len(hashed), 64)  # SHA-256 hex digest
        self.assertNotEqual(raw_token, hashed)

        # Hash is deterministic
        self.assertEqual(hash_token(raw_token), hashed)

    def test_hash_otp_deterministic(self):
        otp = generate_otp_code()
        self.assertEqual(len(otp), 6)
        self.assertTrue(otp.isdigit())

        h1 = hash_otp(otp)
        h2 = hash_otp(otp)
        self.assertEqual(h1, h2)
        self.assertEqual(len(h1), 64)
        self.assertNotEqual(otp, h1)

        # Different OTP codes yield different hashes
        diff_otp = "000000" if otp != "000000" else "111111"
        self.assertNotEqual(hash_otp(otp), hash_otp(diff_otp))

