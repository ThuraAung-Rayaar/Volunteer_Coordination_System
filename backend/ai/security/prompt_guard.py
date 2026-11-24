from typing import Any, Dict, List
from rest_framework.exceptions import ValidationError

MAX_MESSAGE_LENGTH = 2000
MAX_HISTORY_MESSAGES = 4  # Last 2 user/assistant exchanges
ALLOWED_CLIENT_ROLES = {"user", "assistant"}


def sanitize_user_prompt(message: str) -> str:
    """Validate and clean incoming user chat prompt."""
    if not isinstance(message, str):
        raise ValidationError({"message": "Message must be a string."})

    cleaned = message.strip()
    if not cleaned:
        raise ValidationError({"message": "Message cannot be empty."})

    if len(cleaned) > MAX_MESSAGE_LENGTH:
        raise ValidationError({"message": f"Message exceeds maximum length of {MAX_MESSAGE_LENGTH} characters."})

    return cleaned


def validate_conversation_history(history: Any) -> List[Dict[str, str]]:
    """
    Validates conversation history sent by client:
    - Enforces strictly 'user' and 'assistant' roles (rejects 'system', 'developer', 'tool' role injection).
    - Caps history to the last 2 exchanges (max 4 messages).
    """
    if not history:
        return []

    if not isinstance(history, list):
        raise ValidationError({"conversation": "Conversation history must be a list."})

    validated = []
    for idx, item in enumerate(history):
        if not isinstance(item, dict):
            raise ValidationError({"conversation": f"History item #{idx} must be a dictionary."})

        role = item.get("role")
        if role not in ALLOWED_CLIENT_ROLES:
            raise ValidationError(
                {"conversation": f"Invalid history role '{role}'. Only 'user' and 'assistant' roles are permitted."}
            )

        content = item.get("content")
        if not isinstance(content, str):
            raise ValidationError({"conversation": f"History item #{idx} content must be a string."})

        validated.append({
            "role": role,
            "content": content[:MAX_MESSAGE_LENGTH].strip(),
        })

    # Return only the most recent MAX_HISTORY_MESSAGES
    return validated[-MAX_HISTORY_MESSAGES:]
