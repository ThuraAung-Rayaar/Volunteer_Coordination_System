# apps/common/validators.py
import hashlib
import os
import uuid
from io import BytesIO
from pathlib import Path
from PIL import Image
from django.conf import settings

from apps.common.exceptions import DomainError


def validate_and_transcode_jpeg(uploaded_file, destination_dir: str | Path) -> tuple[str, str]:
    """
    Open image using Pillow, verify, strip EXIF, convert to RGB,
    save to destination_dir as JPEG, return (relative_file_path, sha256_hex).
    """
    try:
        img = Image.open(uploaded_file)
        # Ensure image is loaded
        img.load()
        if img.mode in ("RGBA", "LA"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[-1])
            rgb_image = background
        else:
            rgb_image = img.convert("RGB")
    except Exception as e:
        raise DomainError(f"Invalid or corrupted image: {str(e)}", code="invalid_image")

    dest_path = Path(destination_dir)
    dest_path.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}.jpg"
    full_path = dest_path / filename

    # Save to buffer to strip EXIF and get SHA-256
    buffer = BytesIO()
    rgb_image.save(buffer, format="JPEG", quality=90, optimize=True)
    image_bytes = buffer.getvalue()

    sha256_hex = hashlib.sha256(image_bytes).hexdigest()

    with open(full_path, "wb") as f:
        f.write(image_bytes)

    # Determine relative path
    media_root = getattr(settings, "MEDIA_ROOT", None)
    if media_root:
        try:
            rel_path = full_path.relative_to(Path(media_root)).as_posix()
        except ValueError:
            rel_path = f"{dest_path.name}/{filename}"
    else:
        rel_path = f"{dest_path.name}/{filename}"

    return rel_path, sha256_hex

