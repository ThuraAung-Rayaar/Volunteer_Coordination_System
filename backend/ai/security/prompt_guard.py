from typing import Any, Dict, List
from rest_framework.exceptions import ValidationError

MAX_MESSAGE_LENGTH = 2000
MAX_HISTORY_MESSAGES = 4
ALLOWED_CLIENT_ROLES = {"user", "assistant"}


def sanitize_user_prompt(message: str) -> str:
    if not isinstance(message, str):
        raise ValidationError({"message": "Message must be a string."})
    cleaned = message.strip()
    if not cleaned:
        raise ValidationError({"message": "Message cannot be empty."})
    if len(cleaned) > MAX_MESSAGE_LENGTH:
        raise ValidationError({"message": f"Message exceeds {MAX_MESSAGE_LENGTH} characters."})
    return cleaned


def validate_conversation_history(history: Any) -> List[Dict[str, str]]:
    """Accept only bounded completed user/assistant turns; disallow system/tool roles."""
    if history in (None, []):
        return []
    if not isinstance(history, list):
        raise ValidationError({"conversation": "Conversation history must be a list."})

    validated: List[Dict[str, str]] = []
    for index, item in enumerate(history):
        if not isinstance(item, dict):
            raise ValidationError({"conversation": f"History item #{index} must be an object."})
        role = item.get("role")
        if role not in ALLOWED_CLIENT_ROLES:
            raise ValidationError({"conversation": "Only user and assistant history roles are permitted."})
        content = item.get("content")
        if not isinstance(content, str):
            raise ValidationError({"conversation": f"History item #{index} content must be text."})
        cleaned = content.strip()
        if cleaned:
            validated.append({"role": role, "content": cleaned[:MAX_MESSAGE_LENGTH]})

    bounded = validated[-MAX_HISTORY_MESSAGES:]
    # The current question is sent separately, never included in client history.
    while bounded and bounded[-1]["role"] == "user":
        bounded.pop()
    # Discard a welcome assistant bubble that is not a completed exchange.
    while bounded and bounded[0]["role"] != "user":
        bounded.pop(0)
    return bounded
