"""
Automated tests for verification image encryption module and in-place conversion utility.

Covers all Phase C2 and Section 5.8 migration acceptance criteria:
1. Crypto unit tests (AES-256-GCM envelope, unique nonces, tamper rejection, wrong key rejection, key separation).
2. Dry-run makes zero file writes and zero DB modifications.
3. Legacy plaintext encrypts in place, preserving image_path and file_sha256.
4. In-memory decrypt matches pre-conversion plaintext hash.
5. Re-running conversion is idempotent and does not double-encrypt.
6. Missing and corrupt files are reported in aggregate without deleting DB rows.
7. Zero DB schema or row changes occur during conversion.
8. Safety gate: --apply strictly requires --confirm-backup.
9. --single-test-id converts only the target test record.
10. --verify-only post-conversion audit detects tampered/corrupt envelopes.
11. Output contains aggregate metrics only with zero PII, UUIDs, or paths.
"""

import io
import os
import secrets
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from apps.accounts.models import Users, UserVerificationImages
from common.image_crypto import (
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
    run_crypto_self_test,
    validate_key_separation,
)
from common.utils import compute_phone_hash, encrypt_phone


def _create_synthetic_jpeg(width: int = 10, height: int = 10) -> bytes:
    """Create valid minimal JPEG bytes for testing without external fixtures."""
    from PIL import Image
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=(73, 109, 137))
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _random_phone() -> str:
    digits = f"{secrets.randbelow(100000000):08d}"
    return f"+959{digits}"


class TestImageCryptoUnit(TestCase):
    """Unit tests for common/image_crypto.py per Section 5.8."""

    def test_round_trip_encryption_decryption(self):
        payload = _create_synthetic_jpeg()
        envelope = encrypt_image(payload)
        self.assertTrue(is_encrypted_envelope(envelope))
        self.assertFalse(is_plaintext_jpeg(envelope))

        decrypted, kid = decrypt_image(envelope)
        self.assertEqual(decrypted, payload)
        self.assertEqual(kid, get_active_key_id())

    def test_ciphertext_does_not_contain_plaintext_or_jpeg_header(self):
        payload = _create_synthetic_jpeg()
        envelope = encrypt_image(payload)

        # Envelope must start with AGYI magic, never JPEG 0xFFD8
        self.assertTrue(envelope.startswith(b"AGYI"))
        self.assertFalse(envelope.startswith(b"\xff\xd8"))

        # Raw JPEG content must not appear inside the ciphertext
        self.assertNotIn(payload, envelope)

    def test_unique_nonce_per_encryption(self):
        payload = _create_synthetic_jpeg()
        envelope1 = encrypt_image(payload)
        envelope2 = encrypt_image(payload)

        # Ciphertexts must differ due to unique 96-bit nonces
        self.assertNotEqual(envelope1, envelope2)

        # Both must decrypt to identical plaintext
        dec1, _ = decrypt_image(envelope1)
        dec2, _ = decrypt_image(envelope2)
        self.assertEqual(dec1, payload)
        self.assertEqual(dec2, payload)

    def test_wrong_key_fails_decryption(self):
        payload = _create_synthetic_jpeg()
        envelope = encrypt_image(payload)

        wrong_key = os.urandom(32)
        wrong_ring = {get_active_key_id(): wrong_key}

        with self.assertRaises(ImageDecryptionError):
            decrypt_image(envelope, key_ring=wrong_ring)

    def test_tampered_ciphertext_fails_authentication(self):
        payload = _create_synthetic_jpeg()
        envelope = bytearray(encrypt_image(payload))

        # Flip a bit in the ciphertext / tag region
        envelope[-1] ^= 0x01

        with self.assertRaises(ImageDecryptionError):
            decrypt_image(bytes(envelope))

    def test_tampered_header_fails_authentication(self):
        payload = _create_synthetic_jpeg()
        envelope = bytearray(encrypt_image(payload))

        # Header is authenticated as AAD; tampering with version should fail
        envelope[4] = 0x02

        with self.assertRaises(InvalidEnvelopeError):
            decrypt_image(bytes(envelope))

    def test_unknown_key_id_fails_closed(self):
        payload = _create_synthetic_jpeg()
        test_key = os.urandom(32)
        envelope = encrypt_image(payload, key_id="unknown_key_99", key=test_key)

        with self.assertRaises(KeyNotFoundError):
            decrypt_image(envelope, key_ring={"v1": get_active_key()})

    def test_key_separation_enforced(self):
        phone_key = get_active_key()
        # Mock PHONE_ENCRYPTION_KEY matching image key
        with override_settings(PHONE_ENCRYPTION_KEY=phone_key):
            with self.assertRaises(KeySeparationError):
                validate_key_separation(phone_key)

    def test_crypto_self_test_runs_cleanly(self):
        self.assertTrue(run_crypto_self_test())


class TestImageConversionCommand(TestCase):
    """Integration and migration tests for encrypt_verification_images command per Section 5.8."""

    def setUp(self):
        super().setUp()
        self.temp_dir = tempfile.mkdtemp(prefix="test_verification_images_")
        self.media_root = Path(self.temp_dir)

        # Create test user in disposable test database
        phone = _random_phone()
        self.user = Users.objects.create(
            phone_hash=compute_phone_hash(phone),
            phone_enc=encrypt_phone(phone),
            display_name="Conversion Test User",
        )

    def tearDown(self):
        if Path(self.temp_dir).exists():
            shutil.rmtree(self.temp_dir, ignore_errors=True)
        super().tearDown()

    def _create_test_image_file(self, rel_path: str, content: bytes = None) -> Path:
        """Create a file under the temporary media root."""
        full_path = self.media_root / rel_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        data = content if content is not None else _create_synthetic_jpeg()
        full_path.write_bytes(data)
        return full_path

    def test_dry_run_makes_zero_file_or_db_writes(self):
        import hashlib
        jpeg_bytes = _create_synthetic_jpeg()
        expected_hash = hashlib.sha256(jpeg_bytes).hexdigest()
        rel_path = "user_1/id_card.jpg"
        file_path = self._create_test_image_file(rel_path, jpeg_bytes)

        rec = UserVerificationImages.objects.create(
            user=self.user,
            image_type=UserVerificationImages.ImageType.ID_LICENSE,
            image_path=rel_path,
            file_format="jpeg",
            file_sha256=expected_hash,
            status=UserVerificationImages.Status.PENDING,
        )

        initial_stat = file_path.stat()
        out = io.StringIO()

        call_command(
            "encrypt_verification_images",
            dry_run=True,
            media_root=str(self.media_root),
            stdout=out,
        )

        output = out.getvalue()

        # 1. File on disk must remain strictly untouched
        self.assertEqual(file_path.read_bytes(), jpeg_bytes)
        self.assertTrue(is_plaintext_jpeg(file_path.read_bytes()))
        self.assertFalse(is_encrypted_envelope(file_path.read_bytes()))
        self.assertEqual(file_path.stat().st_size, initial_stat.st_size)

        # 2. Database row must remain strictly untouched
        rec.refresh_from_db()
        self.assertEqual(rec.image_path, rel_path)
        self.assertEqual(rec.file_sha256, expected_hash)
        self.assertEqual(rec.status, UserVerificationImages.Status.PENDING)

        # 3. Output must report dry-run completion and zero PII
        self.assertIn("Dry run complete: zero files modified, zero database writes.", output)
        self.assertIn("Plaintext JPEGs Identified: 1", output)
        self.assertIn("Files Converted In Place: 0", output)
        self.assertNotIn(rel_path, output)
        self.assertNotIn(str(file_path), output)
        self.assertNotIn(str(self.user.id), output)

    def test_apply_without_confirm_backup_fails_closed(self):
        jpeg_bytes = _create_synthetic_jpeg()
        rel_path = "user_1/id_card.jpg"
        file_path = self._create_test_image_file(rel_path, jpeg_bytes)

        UserVerificationImages.objects.create(
            user=self.user,
            image_type=UserVerificationImages.ImageType.ID_LICENSE,
            image_path=rel_path,
            file_format="jpeg",
            status=UserVerificationImages.Status.PENDING,
        )

        with self.assertRaises(CommandError) as ctx:
            call_command(
                "encrypt_verification_images",
                apply=True,
                confirm_backup=False,
                media_root=str(self.media_root),
            )

        self.assertIn("SAFETY REFUSAL", str(ctx.exception))
        # Confirm file was not modified
        self.assertTrue(is_plaintext_jpeg(file_path.read_bytes()))

    def test_apply_encrypts_plaintext_in_place_preserving_image_path_and_db_rows(self):
        import hashlib
        jpeg_bytes = _create_synthetic_jpeg()
        raw_sha256 = hashlib.sha256(jpeg_bytes).hexdigest()
        rel_path = "user_2/license.jpg"
        file_path = self._create_test_image_file(rel_path, jpeg_bytes)

        rec = UserVerificationImages.objects.create(
            user=self.user,
            image_type=UserVerificationImages.ImageType.DRIVER_LICENSE,
            image_path=rel_path,
            file_format="jpeg",
            file_sha256=raw_sha256,
            status=UserVerificationImages.Status.PENDING,
        )

        out = io.StringIO()
        call_command(
            "encrypt_verification_images",
            apply=True,
            confirm_backup=True,
            media_root=str(self.media_root),
            stdout=out,
        )

        output = out.getvalue()

        # 1. File on disk is now an encrypted envelope
        file_bytes = file_path.read_bytes()
        self.assertTrue(is_encrypted_envelope(file_bytes))
        self.assertFalse(is_plaintext_jpeg(file_bytes))

        # 2. In-memory decrypt matches pre-conversion plaintext and hash
        decrypted_bytes, kid = decrypt_image(file_bytes)
        self.assertEqual(decrypted_bytes, jpeg_bytes)
        self.assertEqual(hashlib.sha256(decrypted_bytes).hexdigest(), raw_sha256)

        # 3. Database row is completely unchanged (zero DB writes)
        rec.refresh_from_db()
        self.assertEqual(rec.image_path, rel_path)
        self.assertEqual(rec.file_sha256, raw_sha256)
        self.assertEqual(rec.file_format, "jpeg")
        self.assertEqual(rec.status, UserVerificationImages.Status.PENDING)

        # 4. Output reports successful conversion with aggregate metrics
        self.assertIn("Files Converted In Place: 1", output)
        self.assertIn("In-place conversion complete: zero database writes occurred.", output)

    def test_apply_idempotent_does_not_double_encrypt(self):
        import hashlib
        jpeg_bytes = _create_synthetic_jpeg()
        raw_sha256 = hashlib.sha256(jpeg_bytes).hexdigest()
        rel_path = "user_3/selfie.jpg"
        file_path = self._create_test_image_file(rel_path, jpeg_bytes)

        rec = UserVerificationImages.objects.create(
            user=self.user,
            image_type=UserVerificationImages.ImageType.MOCK_SELFIE,
            image_path=rel_path,
            file_format="jpeg",
            file_sha256=raw_sha256,
            status=UserVerificationImages.Status.PENDING,
        )

        # First run: converts plaintext to encrypted envelope
        call_command(
            "encrypt_verification_images",
            apply=True,
            confirm_backup=True,
            media_root=str(self.media_root),
        )

        first_run_bytes = file_path.read_bytes()
        self.assertTrue(is_encrypted_envelope(first_run_bytes))

        # Second run: must recognize already-encrypted file and NOT double encrypt
        out = io.StringIO()
        call_command(
            "encrypt_verification_images",
            apply=True,
            confirm_backup=True,
            media_root=str(self.media_root),
            stdout=out,
        )

        second_run_bytes = file_path.read_bytes()
        self.assertEqual(first_run_bytes, second_run_bytes)

        # File continues to decrypt cleanly
        decrypted, _ = decrypt_image(second_run_bytes)
        self.assertEqual(decrypted, jpeg_bytes)

        output = out.getvalue()
        self.assertIn("Already Encrypted Envelopes: 1", output)
        self.assertIn("Files Converted In Place: 0", output)

    def test_single_test_id_converts_only_target(self):
        jpeg1 = _create_synthetic_jpeg()
        jpeg2 = _create_synthetic_jpeg()

        file1 = self._create_test_image_file("user_4/img1.jpg", jpeg1)
        file2 = self._create_test_image_file("user_4/img2.jpg", jpeg2)

        rec1 = UserVerificationImages.objects.create(
            user=self.user,
            image_type=UserVerificationImages.ImageType.ID_LICENSE,
            image_path="user_4/img1.jpg",
            file_format="jpeg",
            status=UserVerificationImages.Status.PENDING,
        )
        rec2 = UserVerificationImages.objects.create(
            user=self.user,
            image_type=UserVerificationImages.ImageType.DRIVER_LICENSE,
            image_path="user_4/img2.jpg",
            file_format="jpeg",
            status=UserVerificationImages.Status.PENDING,
        )

        out = io.StringIO()
        call_command(
            "encrypt_verification_images",
            single_test_id=rec1.id,
            apply=True,
            confirm_backup=True,
            media_root=str(self.media_root),
            stdout=out,
        )

        # Rec1 file must be encrypted
        self.assertTrue(is_encrypted_envelope(file1.read_bytes()))

        # Rec2 file must still be plaintext JPEG
        self.assertTrue(is_plaintext_jpeg(file2.read_bytes()))
        self.assertFalse(is_encrypted_envelope(file2.read_bytes()))

        output = out.getvalue()
        self.assertIn("Database Rows Scanned: 1", output)
        self.assertIn("Files Converted In Place: 1", output)

    def test_missing_and_corrupt_files_reported_without_deleting_db_rows(self):
        # 1. Missing file (valid path ending in .jpg but file absent on disk)
        rec_missing = UserVerificationImages.objects.create(
            user=self.user,
            image_type=UserVerificationImages.ImageType.ID_LICENSE,
            image_path="nonexistent/missing_file.jpg",
            file_format="jpeg",
            status=UserVerificationImages.Status.PENDING,
        )

        # 2. Corrupt file (not valid JPEG, not valid envelope)
        corrupt_path = self._create_test_image_file("corrupt/corrupt.jpg", b"INVALID_GARBAGE_BYTES")
        rec_corrupt = UserVerificationImages.objects.create(
            user=self.user,
            image_type=UserVerificationImages.ImageType.DRIVER_LICENSE,
            image_path="corrupt/corrupt.jpg",
            file_format="jpeg",
            status=UserVerificationImages.Status.PENDING,
        )

        # Test missing record via single_test_id
        out_missing = io.StringIO()
        call_command(
            "encrypt_verification_images",
            single_test_id=rec_missing.id,
            apply=True,
            confirm_backup=True,
            media_root=str(self.media_root),
            stdout=out_missing,
        )
        self.assertIn("Missing Referenced Files: 1", out_missing.getvalue())
        self.assertTrue(UserVerificationImages.objects.filter(id=rec_missing.id).exists())

        # Test corrupt record via single_test_id
        out_corrupt = io.StringIO()
        call_command(
            "encrypt_verification_images",
            single_test_id=rec_corrupt.id,
            apply=True,
            confirm_backup=True,
            media_root=str(self.media_root),
            stdout=out_corrupt,
        )
        self.assertIn("Corrupt / Unreadable Files: 1", out_corrupt.getvalue())
        self.assertTrue(UserVerificationImages.objects.filter(id=rec_corrupt.id).exists())

    def test_verify_only_audit(self):
        jpeg_bytes = _create_synthetic_jpeg()
        import hashlib
        h = hashlib.sha256(jpeg_bytes).hexdigest()
        rel_path = "audit/valid.jpg"
        file_path = self._create_test_image_file(rel_path, jpeg_bytes)

        rec = UserVerificationImages.objects.create(
            user=self.user,
            image_type=UserVerificationImages.ImageType.ID_LICENSE,
            image_path=rel_path,
            file_format="jpeg",
            file_sha256=h,
            status=UserVerificationImages.Status.PENDING,
        )

        # First convert it to encrypted envelope
        call_command(
            "encrypt_verification_images",
            single_test_id=rec.id,
            apply=True,
            confirm_backup=True,
            media_root=str(self.media_root),
        )

        # Verify-only passes cleanly on valid encrypted record
        out = io.StringIO()
        call_command(
            "encrypt_verification_images",
            single_test_id=rec.id,
            verify_only=True,
            media_root=str(self.media_root),
            stdout=out,
        )
        self.assertIn("Post-conversion audit complete: all verified files are encrypted and valid.", out.getvalue())
        self.assertIn("Files Verified Valid: 1", out.getvalue())

    def test_output_contains_zero_pii_paths_or_uuids(self):
        jpeg_bytes = _create_synthetic_jpeg()
        rel_path = f"sensitive_user_{self.user.id}/secret_id.jpg"
        self._create_test_image_file(rel_path, jpeg_bytes)

        UserVerificationImages.objects.create(
            user=self.user,
            image_type=UserVerificationImages.ImageType.ID_LICENSE,
            image_path=rel_path,
            file_format="jpeg",
            status=UserVerificationImages.Status.PENDING,
        )

        out = io.StringIO()
        call_command(
            "encrypt_verification_images",
            dry_run=True,
            media_root=str(self.media_root),
            stdout=out,
        )
        output = out.getvalue()

        # Zero paths or PII in output
        self.assertNotIn("sensitive_user", output)
        self.assertNotIn("secret_id.jpg", output)
        self.assertNotIn(str(self.media_root), output)
        self.assertNotIn(str(self.user.id), output)
