import hashlib
import secrets
from datetime import datetime, timezone

def generate_qr_token(event_id: int, user_id: int) -> tuple[str, str]:
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
    return raw_token, token_hash

def verify_token_hash(raw_token: str, token_hash: str) -> bool:
    expected_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
    return secrets.compare_digest(expected_hash, token_hash)
