import re
from typing import Any, Set

from common.privacy import NEVER_EXPOSE_FIELDS

# Field names are compared after punctuation/case normalization, so camelCase
# and snake_case aliases cannot bypass the deny-list.
AI_NEVER_EXPOSE_FIELDS: Set[str] = {
    re.sub(r"[^a-z0-9]", "", str(field).lower())
    for field in NEVER_EXPOSE_FIELDS
} | {
    "phone", "phoneenc", "phonehash", "emergencycontactname",
    "emergencycontactphone", "emergencycontactphoneenc", "bloodtype",
    "verificationimage", "verificationimagefile", "verificationimagebytes",
    "verificationmedia", "password", "tokenhash", "codehash",
    "authsessiontoken", "devcode", "sessionsecret",
    "latitude", "longitude", "lat", "lng", "coordinates",
    "homearea", "landmarktext", "georadiusm",
}


def sanitize_ai_data(data: Any) -> Any:
    """Recursively remove sensitive fields and redact Myanmar phone-number strings."""
    if isinstance(data, dict):
        return {
            key: sanitize_ai_data(value)
            for key, value in data.items()
            if re.sub(r"[^a-z0-9]", "", str(key).lower()) not in AI_NEVER_EXPOSE_FIELDS
        }
    if isinstance(data, (list, tuple)):
        return [sanitize_ai_data(item) for item in data]
    if isinstance(data, str):
        # Cover the common +959, 959, and local 09 Myanmar mobile forms.
        return re.sub(
            r"(?<!\d)(?:\+?959|09)\d[\d -]{6,10}(?!\d)",
            "[REDACTED_PHONE]",
            data,
        )
    return data
