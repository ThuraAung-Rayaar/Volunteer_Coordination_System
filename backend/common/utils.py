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
    normalize_phone,
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
        ValueError: If more than 30 tags after normalization.
    """
    if tags is None:
        return []

    if not isinstance(tags, list):
        raise ValueError("Tags must be a list")

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
        raise ValueError("Maximum 30 tags allowed")

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
    1. Open with Pillow and verify it's a valid image
    2. Convert to RGB (strips all EXIF metadata)
    3. Encode as JPEG (quality=90)
    4. Compute SHA-256 hash of the JPEG bytes
    5. Save to VERIFICATION_MEDIA_ROOT / {user_uuid}/{image_type}_{random}.jpg

    Args:
        user_uuid: The user's UUID string (for directory organization).
        image_type: One of 'mock_selfie', 'id_license', 'driver_license'.
        uploaded_file: Django UploadedFile object or file-like object.

    Returns:
        Tuple of (relative_path, sha256_hex).
        relative_path: Path relative to VERIFICATION_MEDIA_ROOT.
        sha256_hex: 64-character lowercase hex SHA-256 hash.

    Raises:
        ValueError: If the file is not a valid image.
    """
    from PIL import Image, UnidentifiedImageError

    try:
        img = Image.open(uploaded_file)
        img.verify()
    except (UnidentifiedImageError, Exception) as e:
        raise ValueError(f"Invalid image file: {e}")

    uploaded_file.seek(0)
    img = Image.open(uploaded_file)

    if img.mode != "RGB":
        img = img.convert("RGB")

    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=90)
    jpeg_bytes = buffer.getvalue()

    sha256_hex = hashlib.sha256(jpeg_bytes).hexdigest()

    random_suffix = uuid_module.uuid4().hex[:8]
    filename = f"{image_type}_{random_suffix}.jpg"
    relative_path = f"{user_uuid}/{filename}"

    verification_root = Path(settings.VERIFICATION_MEDIA_ROOT)
    target_dir = verification_root / user_uuid
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
