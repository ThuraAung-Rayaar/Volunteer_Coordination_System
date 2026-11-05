"""
General-purpose utilities for the Volunteer Coordination System.

Provides:
- Tag/skill array normalization (matches PostgreSQL tags_are_normalized)
- JPEG image sanitization for verification uploads
- String/int safety helpers
- UTC datetime and hashing helpers
"""

from __future__ import annotations

import hashlib
import io
import logging
import uuid as uuid_module
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from django.conf import settings

from common.security import (
    compute_otp_hash,
    compute_phone_hash,
    decrypt_phone,
    encrypt_phone,
    generate_otp_code,
    generate_raw_qr_token,
    hash_phone,
    hash_qr_token,
    normalize_phone,
    redact_sensitive_data,
)

logger = logging.getLogger(__name__)


def get_current_utc():
    """Return current datetime in UTC timezone."""
    return datetime.now(timezone.utc)


def hash_image_bytes(image_bytes: bytes) -> str:
    """Compute SHA-256 hash of raw image bytes."""
    return hashlib.sha256(image_bytes).hexdigest()


# =============================================================================
# TAG / SKILL NORMALIZATION
# =============================================================================

def normalize_tags(tags: Optional[list[str]]) -> list[str]:
    """
    Normalize a list of tags/skills to match PostgreSQL tags_are_normalized().

    Rules:
    - Lowercase each tag
    - Trim whitespace (btrim equivalent)
    - Remove empty strings
    - Deduplicate preserving order
    - Maximum 30 tags
    - Each tag maximum 50 characters

    Args:
        tags: List of raw tag strings, or None.

    Returns:
        Normalized list of tags.

    Raises:
        ValidationError: If more than 30 tags after normalization (inherits from DomainError and ValueError).
    """
    from common.exceptions import ValidationError

    if tags is None:
        return []

    if not isinstance(tags, list):
        raise ValidationError("Tags must be a list", code="invalid_tags")

    seen = set()
    result = []

    for tag in tags:
        if not isinstance(tag, str):
            continue
        normalized = tag.strip().lower()
        if not normalized:
            continue
        if len(normalized) > 50:
            normalized = normalized[:50]
        if normalized not in seen:
            seen.add(normalized)
            result.append(normalized)

    if len(result) > 30:
        raise ValidationError("Maximum 30 tags allowed", code="invalid_tags")

    return result


# =============================================================================
# IMAGE SANITIZATION
# =============================================================================

def sanitize_and_save_verification_jpeg(
    user_uuid: str,
    image_type: str,
    uploaded_file,
) -> tuple[str, str]:
    """
    Sanitize an uploaded verification image and save as JPEG.

    Process:
    1. Validate user_uuid against path traversal using UUID format
    2. Validate image_type against allowed types
    3. Open with Pillow and verify it's a valid image
    4. Validate dimensions against bounds (VERIFICATION_MIN_DIMENSION to VERIFICATION_MAX_DIMENSION)
    5. Convert to RGB (strips all EXIF metadata)
    6. Encode as JPEG (quality=90)
    7. Compute SHA-256 hash of the JPEG bytes
    8. Save to VERIFICATION_MEDIA_ROOT / {user_uuid}/{image_type}_{random}.jpg

    Args:
        user_uuid: The user's UUID string (for directory organization).
        image_type: One of 'mock_selfie', 'id_license', 'driver_license'.
        uploaded_file: Django UploadedFile object or file-like object.

    Returns:
        Tuple of (relative_path, sha256_hex).
        relative_path: Path relative to VERIFICATION_MEDIA_ROOT.
        sha256_hex: 64-character lowercase hex SHA-256 hash.

    Raises:
        ValidationError: If the file is invalid, out of dimension bounds, or uuid is malformed.
    """
    from PIL import Image, UnidentifiedImageError
    from common.exceptions import ValidationError

    # Strict UUID validation to prevent directory traversal
    try:
        clean_uuid = str(uuid_module.UUID(str(user_uuid)))
    except (ValueError, AttributeError, TypeError):
        raise ValidationError("Invalid user UUID format", code="invalid_uuid")

    valid_types = ("mock_selfie", "id_license", "driver_license")
    if image_type not in valid_types:
        raise ValidationError(
            f"Invalid image type. Must be one of: {', '.join(valid_types)}",
            code="invalid_image_type",
        )

    try:
        if hasattr(uploaded_file, "seek"):
            uploaded_file.seek(0, io.SEEK_END)
            size = uploaded_file.tell()
            uploaded_file.seek(0)
            if size == 0:
                raise ValidationError("Uploaded image file is empty", code="empty_file")

        img = Image.open(uploaded_file)
        img.verify()
    except (UnidentifiedImageError, Exception) as e:
        if isinstance(e, ValidationError):
            raise
        raise ValidationError(f"Invalid image file: {e}", code="invalid_image")

    uploaded_file.seek(0)
    img = Image.open(uploaded_file)

    min_dim = getattr(settings, "VERIFICATION_MIN_DIMENSION", 200)
    max_dim = getattr(settings, "VERIFICATION_MAX_DIMENSION", 6000)

    if img.width < min_dim or img.height < min_dim:
        raise ValidationError(
            f"Image dimensions ({img.width}x{img.height}) below minimum allowed ({min_dim}x{min_dim}px)",
            code="image_too_small",
        )
    if img.width > max_dim or img.height > max_dim:
        raise ValidationError(
            f"Image dimensions ({img.width}x{img.height}) exceed maximum allowed ({max_dim}x{max_dim}px)",
            code="image_too_large",
        )

    if img.mode != "RGB":
        img = img.convert("RGB")

    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=90)
    jpeg_bytes = buffer.getvalue()

    sha256_hex = hashlib.sha256(jpeg_bytes).hexdigest()

    random_suffix = uuid_module.uuid4().hex[:8]
    filename = f"{image_type}_{random_suffix}.jpg"
    relative_path = f"{clean_uuid}/{filename}"

    verification_root = Path(settings.VERIFICATION_MEDIA_ROOT)
    target_dir = verification_root / clean_uuid
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / filename

    with open(target_path, "wb") as f:
        f.write(jpeg_bytes)

    logger.info(
        "Saved verification image: %s (%d bytes, sha256=%s)",
        relative_path,
        len(jpeg_bytes),
        sha256_hex[:16] + "...",
    )

    return relative_path, sha256_hex


# =============================================================================
# GENERAL HELPERS
# =============================================================================

def truncate_string(value: Optional[str], max_length: int) -> Optional[str]:
    """Safely truncate a string to max_length."""
    if value is None:
        return None
    return value[:max_length]


def safe_int(value, default: int = 0) -> int:
    """Safely convert a value to int."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
