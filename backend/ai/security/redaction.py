import re
from typing import Any, Dict, List, Set, Union
from common.privacy import NEVER_EXPOSE_FIELDS

# Strictest set of prohibited fields that must NEVER appear in AI context or responses
AI_NEVER_EXPOSE_FIELDS: Set[str] = NEVER_EXPOSE_FIELDS | {
    "phone",
    "phone_enc",
    "phone_hash",
    "emergency_contact_name",
    "emergency_contact_phone_enc",
    "blood_type",
    "verification_image",
    "verification_image_file",
    "verification_image_bytes",
    "verification_media",
    "password",
    "token_hash",
    "code_hash",
    "auth_session_token",
    "dev_code",
    "session_secret",
}


def sanitize_ai_data(data: Any) -> Any:
    """
    Recursively remove sensitive PII and credential fields from any dict or list
    before passing to LLM or returning to chat client.
    """
    if isinstance(data, dict):
        cleaned = {}
        for k, v in data.items():
            if str(k).lower() in AI_NEVER_EXPOSE_FIELDS:
                continue
            cleaned[k] = sanitize_ai_data(v)
        return cleaned

    if isinstance(data, list):
        return [sanitize_ai_data(item) for item in data]

    if isinstance(data, str):
        # Redact potential raw phone numbers matching +959... or standard 10+ digit sequences
        redacted = re.sub(r'(\+?959\d{7,9})', '[REDACTED_PHONE]', data)
        return redacted

    return data
