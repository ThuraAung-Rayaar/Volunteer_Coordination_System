"""
Cryptographic module for verification image server-side encryption (AES-256-GCM).

Implements Section 5.3 & 5.7 of V0_12_0_STABILIZATION_MASTER_PLAN.md:
- AES-256-GCM authenticated encryption with 96-bit unique nonce per file.
- Canonical versioned binary envelope authenticating header as AAD.
- Cryptographic key separation and multi-key keyring support for rotations.
- Zero leakage of raw image bytes, keys, nonces, or paths.
"""

import base64
import json
import logging
import os
from typing import Dict, Optional, Tuple

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings

logger = logging.getLogger(__name__)

# Envelope binary constants
ENVELOPE_MAGIC = b"AGYI"
ENVELOPE_VERSION_1 = 0x01
NONCE_BYTES_LENGTH = 12  # 96-bit nonce for AES-GCM
GCM_TAG_BYTES_LENGTH = 16  # 128-bit authentication tag
MIN_HEADER_LENGTH = 4 + 1 + 1 + 1 + NONCE_BYTES_LENGTH  # magic(4) + ver(1) + kid_len(1) + min_kid(1) + nonce(12)


class ImageCryptoError(Exception):
    """Base exception for image cryptographic operations."""
    pass


class InvalidEnvelopeError(ImageCryptoError):
    """Raised when an encrypted envelope has an invalid header or unsupported version."""
    pass


class KeyNotFoundError(ImageCryptoError):
    """Raised when the required key ID is not present in the keyring."""
    pass


class ImageDecryptionError(ImageCryptoError):
    """Raised when AES-GCM tag authentication fails (tampering or wrong key)."""
    pass


class KeySeparationError(ImageCryptoError):
    """Raised when the image encryption key violates key separation."""
    pass


def decode_key(raw_key: str | bytes) -> bytes:
    """
    Decode a 32-byte (256-bit) encryption key from base64, hex, or raw bytes.
    """
    if isinstance(raw_key, bytes):
        if len(raw_key) == 32:
            return raw_key
        raw_key = raw_key.decode("utf-8", errors="replace")

    raw_key = raw_key.strip()

    # Try URL-safe Base64 or standard Base64
    try:
        padded = raw_key + "=" * (-len(raw_key) % 4)
        decoded = base64.urlsafe_b64decode(padded)
        if len(decoded) == 32:
            return decoded
    except Exception:
        pass

    # Try hexadecimal
    try:
        if len(raw_key) == 64:
            decoded = bytes.fromhex(raw_key)
            if len(decoded) == 32:
                return decoded
    except Exception:
        pass

    # Try raw 32 ASCII bytes
    encoded = raw_key.encode("utf-8")
    if len(encoded) == 32:
        return encoded

    raise ValueError(f"Invalid key format: expected 32 bytes (got length {len(raw_key)})")


def validate_key_separation(key_bytes: bytes) -> None:
    """
    Ensure the verification image key does not reuse phone encryption or HMAC secrets.
    """
    forbidden = []
    phone_enc = getattr(settings, "PHONE_ENCRYPTION_KEY", None)
    if phone_enc:
        try:
            forbidden.append(decode_key(phone_enc))
        except Exception:
            pass

    for secret_name in [
        "SECRET_KEY",
        "PHONE_HASH_HMAC_SECRET",
        "OTP_CODE_HMAC_SECRET",
        "AUTH_SESSION_TOKEN_SECRET",
    ]:
        val = getattr(settings, secret_name, None)
        if val:
            forbidden.append(val.encode("utf-8"))

    for f in forbidden:
        if key_bytes == f:
            raise KeySeparationError(
                "VERIFICATION_IMAGE_ENCRYPTION_KEY must be distinct from PHONE_ENCRYPTION_KEY, "
                "SECRET_KEY, and all HMAC secrets."
            )


def get_active_key_id() -> str:
    """Return the active encryption key ID from settings."""
    return getattr(settings, "VERIFICATION_IMAGE_KEY_ID", "v1")


def get_active_key() -> bytes:
    """Return the decoded 32-byte active encryption key from settings."""
    raw_key = getattr(settings, "VERIFICATION_IMAGE_ENCRYPTION_KEY", None)
    if not raw_key:
        raise ImageCryptoError("VERIFICATION_IMAGE_ENCRYPTION_KEY is not configured.")
    key_bytes = decode_key(raw_key)
    validate_key_separation(key_bytes)
    return key_bytes


def get_key_ring() -> Dict[str, bytes]:
    """
    Return dictionary mapping key IDs to decoded 32-byte keys.
    Always includes the active key ID.
    """
    active_id = get_active_key_id()
    active_key = get_active_key()
    ring: Dict[str, bytes] = {active_id: active_key}

    raw_ring = getattr(settings, "VERIFICATION_IMAGE_KEYRING", None)
    if raw_ring:
        if isinstance(raw_ring, str):
            try:
                parsed = json.loads(raw_ring)
            except Exception as e:
                logger.error("Failed to parse VERIFICATION_IMAGE_KEYRING JSON: %s", type(e).__name__)
                parsed = {}
        elif isinstance(raw_ring, dict):
            parsed = raw_ring
        else:
            parsed = {}

        for kid, kval in parsed.items():
            try:
                ring[kid] = decode_key(kval)
            except Exception as e:
                logger.error("Failed to decode key for kid in keyring: %s", type(e).__name__)

    return ring


def is_encrypted_envelope(data: bytes) -> bool:
    """
    Determine if the byte sequence begins with the AGYI encrypted envelope header.
    """
    if len(data) < MIN_HEADER_LENGTH + GCM_TAG_BYTES_LENGTH:
        return False
    return data[:4] == ENVELOPE_MAGIC


def is_plaintext_jpeg(data: bytes) -> bool:
    """
    Determine if the byte sequence begins with the JPEG magic markers (0xFFD8).
    """
    return len(data) >= 3 and data[:2] == b"\xff\xd8"


def encrypt_image(
    plaintext_bytes: bytes,
    key_id: Optional[str] = None,
    key: Optional[bytes] = None,
) -> bytes:
    """
    Encrypt sanitized JPEG bytes into a versioned binary envelope using AES-256-GCM.

    Binary Envelope Structure:
    [0:4]   Magic: b"AGYI" (4 bytes)
    [4:5]   Version: 0x01 (1 byte)
    [5:6]   Key ID Length k (1 byte)
    [6:6+k] Key ID string (k bytes, UTF-8)
    [6+k : 6+k+12] Nonce (12 bytes, cryptographically random)
    [6+k+12 : ] Ciphertext + AES-GCM Tag (16 bytes)

    Authenticated Associated Data (AAD):
    Header from byte 0 to 6+k (Magic + Version + Key ID Len + Key ID).
    """
    kid = key_id or get_active_key_id()
    key_bytes = key or get_active_key()
    validate_key_separation(key_bytes)

    kid_bytes = kid.encode("utf-8")
    if len(kid_bytes) > 255:
        raise ValueError("Key ID exceeds maximum length of 255 bytes.")

    header = (
        ENVELOPE_MAGIC +
        bytes([ENVELOPE_VERSION_1]) +
        bytes([len(kid_bytes)]) +
        kid_bytes
    )
    aad = header  # Authenticate envelope header

    nonce = os.urandom(NONCE_BYTES_LENGTH)
    aesgcm = AESGCM(key_bytes)
    ciphertext = aesgcm.encrypt(nonce, plaintext_bytes, aad)

    return header + nonce + ciphertext


def decrypt_image(
    envelope_bytes: bytes,
    key_ring: Optional[Dict[str, bytes]] = None,
) -> Tuple[bytes, str]:
    """
    Authenticate and decrypt a versioned binary envelope.

    Returns:
        (plaintext_bytes, key_id_used)

    Raises:
        InvalidEnvelopeError: if envelope header or version is invalid.
        KeyNotFoundError: if the envelope's key ID is not found in the keyring.
        ImageDecryptionError: if authentication tag fails or data is corrupt.
    """
    if len(envelope_bytes) < MIN_HEADER_LENGTH + GCM_TAG_BYTES_LENGTH:
        raise InvalidEnvelopeError("Data too short to be a valid encrypted image envelope.")

    if envelope_bytes[:4] != ENVELOPE_MAGIC:
        raise InvalidEnvelopeError("Invalid magic bytes: not an AGYI envelope.")

    version = envelope_bytes[4]
    if version != ENVELOPE_VERSION_1:
        raise InvalidEnvelopeError(f"Unsupported envelope version: {version}")

    kid_len = envelope_bytes[5]
    header_end = 6 + kid_len
    if len(envelope_bytes) < header_end + NONCE_BYTES_LENGTH + GCM_TAG_BYTES_LENGTH:
        raise InvalidEnvelopeError("Malformed envelope header: truncated key ID or nonce.")

    kid = envelope_bytes[6:header_end].decode("utf-8", errors="replace")
    nonce_end = header_end + NONCE_BYTES_LENGTH
    nonce = envelope_bytes[header_end:nonce_end]
    ciphertext = envelope_bytes[nonce_end:]

    aad = envelope_bytes[:header_end]

    ring = key_ring or get_key_ring()
    if kid not in ring:
        raise KeyNotFoundError(f"Encryption key ID '{kid}' not found in active keyring.")

    key_bytes = ring[kid]
    aesgcm = AESGCM(key_bytes)

    try:
        plaintext = aesgcm.decrypt(nonce, ciphertext, aad)
    except InvalidTag:
        raise ImageDecryptionError("Authentication tag verification failed: ciphertext modified or wrong key.")
    except Exception as e:
        raise ImageDecryptionError(f"Decryption failed: {type(e).__name__}")

    return plaintext, kid


def run_crypto_self_test() -> bool:
    """
    Run an in-memory encrypt/decrypt/tamper self-test to verify crypto operations.
    """
    test_payload = b"AGY_VERIFICATION_IMAGE_CRYPTO_SELF_TEST_PAYLOAD_1234567890"
    active_id = get_active_key_id()
    active_key = get_active_key()

    # 1. Round-trip encryption and decryption
    envelope = encrypt_image(test_payload, key_id=active_id, key=active_key)
    decrypted, kid_used = decrypt_image(envelope, key_ring={active_id: active_key})
    if decrypted != test_payload or kid_used != active_id:
        raise ImageCryptoError("Self-test roundtrip failed: decrypted bytes mismatch.")

    # 2. Tamper detection: flip one bit in ciphertext
    corrupt_envelope = bytearray(envelope)
    corrupt_envelope[-1] ^= 0x01
    try:
        decrypt_image(bytes(corrupt_envelope), key_ring={active_id: active_key})
        raise ImageCryptoError("Self-test failed: corrupted ciphertext did not fail authentication.")
    except ImageDecryptionError:
        pass

    # 3. Wrong key rejection
    wrong_key = os.urandom(32)
    try:
        decrypt_image(envelope, key_ring={active_id: wrong_key})
        raise ImageCryptoError("Self-test failed: decryption with wrong key did not fail authentication.")
    except ImageDecryptionError:
        pass

    return True

