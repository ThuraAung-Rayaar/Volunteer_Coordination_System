import hashlib
from datetime import datetime, timezone

def get_current_utc():
    return datetime.now(timezone.utc)

def hash_image_bytes(image_bytes: bytes) -> str:
    return hashlib.sha256(image_bytes).hexdigest()
