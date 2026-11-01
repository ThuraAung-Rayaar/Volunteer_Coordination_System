import secrets
import hashlib
from datetime import datetime, timedelta, timezone

def generate_otp(length: int = 6) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))

def hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode('utf-8')).hexdigest()

def verify_otp(raw_otp: str, hashed_otp: str) -> bool:
    return secrets.compare_digest(hash_otp(raw_otp), hashed_otp)
