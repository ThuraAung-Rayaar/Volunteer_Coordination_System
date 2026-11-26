"""
backend/ai/services/chat_service.py

Database-first, DTO-only assistant orchestration:
1. Resolve actor scope from authenticated user state.
2. Deterministically resolve prompt_key or free-text into a single intent.
3. Retrieve bounded, authorized data via backend services and explicit DTO allowlists.
4. Call the configured LLM once with NO tools solely to explain the supplied DTO.
5. Fall back deterministically from the same DTO on any provider failure.
"""

import json
import logging
import time
import uuid
from typing import Any, Dict, List, Optional

from django.conf import settings
from rest_framework.exceptions import ValidationError

from ai.prompts import build_role_system_instruction
from ai.providers import (
    BaseAIProvider,
    GeminiProvider,
    MockAIProvider,
    OllamaProvider,
)
from ai.security.prompt_guard import sanitize_user_prompt, validate_conversation_history
from ai.security.redaction import sanitize_ai_data
from ai.security.scope_policy import determine_actor_scope
from ai.services.assistant_context import build_intent_context
from ai.services.fallback_formatter import format_deterministic_response
from ai.services.intent_resolver import resolve_intent
from ai.services.prompt_catalog import get_prompt_label

logger = logging.getLogger(__name__)


def get_configured_ai_provider() -> BaseAIProvider:
    """Instantiate the configured provider without silently masking bad configuration."""
    provider_name = str(getattr(settings, "AI_PROVIDER", "mock")).lower()
    api_key = getattr(settings, "AI_API_KEY", "") or getattr(settings, "GEMINI_API_KEY", "")
    model = getattr(settings, "AI_MODEL", "gemini-3.5-flash-lite")
    timeout = getattr(settings, "AI_TIMEOUT_SECONDS", 45)

    if provider_name == "ollama":
        return OllamaProvider(
            base_url=getattr(settings, "AI_OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
            model=model or "qwen3.5:4b",
            timeout_seconds=timeout,
            keep_alive=getattr(settings, "AI_OLLAMA_KEEP_ALIVE", "5m"),
        )
    if provider_name == "gemini":
        if not api_key:
            raise RuntimeError("Gemini was selected but AI_API_KEY is not configured.")
        return GeminiProvider(
            api_key=api_key,
            model=model or "gemini-3.5-flash-lite",
            timeout_seconds=timeout,
        )
    if provider_name == "mock":
        return MockAIProvider()

    raise RuntimeError("Unsupported AI_PROVIDER. Use mock, ollama, or gemini.")


def build_system_instruction(
    actor: Any,
    scope: str,
    language: str = "en",
    intent_instruction: str = "",
) -> str:
    """Create a versioned role policy prompt conforming to the VCS AI spec."""
    instruction, _ = build_role_system_instruction(
        scope,
        language=language,
        intent_instruction=intent_instruction,
    )
    return instruction


def _format_provider_user_turn(question: str, dto: Dict[str, Any]) -> str:
    payload = {
        "intent": dto.get("intent"),
        "actor_scope": dto.get("actor_scope"),
        "generated_at": dto.get("generated_at"),
        "data": dto.get("data", {}),
    }
    compact_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return (
        f"USER_REQUEST: {question}\n"
        f"AUTHORIZED_DATA: {compact_json}"
    )


def process_chat_message(
    actor: Any,
    message: str = "",
    conversation_history: Optional[List[Dict[str, str]]] = None,
    language: str = "en",
    prompt_key: str = "",
    event_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Validate a bounded turn, deterministically resolve intent, build an allowlisted
    context DTO, and obtain a plain-language explanation without exposing tools or DB access.
    """
    request_id = str(uuid.uuid4())
    clean_key = str(prompt_key or "").strip()
    raw_message = str(message or "").strip()

    if clean_key:
        clean_message = (
            sanitize_ai_data(sanitize_user_prompt(raw_message))
            if raw_message
            else ""
        )
    else:
        if not raw_message:
            raise ValidationError({"message": "Message or prompt_key is required."})
        clean_message = sanitize_ai_data(sanitize_user_prompt(raw_message))

    validated_history = validate_conversation_history(conversation_history)
    scope = determine_actor_scope(actor)
    lang = "my" if str(language or "en").lower().startswith("my") else "en"

    resolution = resolve_intent(
        actor_scope=scope,
        prompt_key=clean_key,
        message=clean_message,
        explicit_event_id=event_id,
    )
    dto = build_intent_context(
        actor=actor,
        actor_scope=scope,
        resolution=resolution,
        language=lang,
    )

    system_instruction, prompt_version = build_role_system_instruction(
        scope,
        language=lang,
        intent_instruction=dto.get("intent_instruction", ""),
    )

    fallback_used = False
    answer = ""

    if dto.get("skip_llm"):
        answer = format_deterministic_response(dto)
    else:
        provider_name = str(getattr(settings, "AI_PROVIDER", "mock")).lower()
        question_label = clean_message or get_prompt_label(dto["intent"], language=lang)
        messages = sanitize_ai_data(list(validated_history))
        messages.append({
            "role": "user",
            "content": _format_provider_user_turn(question_label, dto),
        })

        configured_cap = int(getattr(settings, "AI_MAX_OUTPUT_TOKENS", 300))
        intent_cap = int(dto.get("max_tokens") or 300)
        max_tokens = max(100, min(configured_cap, intent_cap))

        start_time = time.monotonic()
        try:
            provider = get_configured_ai_provider()
            if isinstance(provider, MockAIProvider):
                answer = format_deterministic_response(dto)
            else:
                response = provider.generate_chat_response(
                    messages=messages,
                    system_instruction=system_instruction,
                    tools=None,
                    tool_results=None,
                    max_tokens=max_tokens,
                    temperature=0.15,
                )
                elapsed_ms = round((time.monotonic() - start_time) * 1000, 1)
                candidate_answer = str(response.get("content") or "").strip()
                if (
                    not candidate_answer
                    or candidate_answer == "No response was generated by the model."
                ):
                    fallback_used = True
                    answer = format_deterministic_response(dto)
                    logger.warning(
                        "Assistant provider returned empty response; using deterministic fallback: "
                        "request_id=%s provider=%s model=%s intent=%s prompt_version=%s elapsed_ms=%s",
                        request_id,
                        provider_name,
                        response.get("model", getattr(provider, "model", "")),
                        dto.get("intent"),
                        prompt_version,
                        elapsed_ms,
                    )
                else:
                    answer = candidate_answer
                    logger.info(
                        "Assistant explanation generated: "
                        "request_id=%s provider=%s model=%s intent=%s prompt_version=%s elapsed_ms=%s status=ok",
                        request_id,
                        provider_name,
                        response.get("model", getattr(provider, "model", "")),
                        dto.get("intent"),
                        prompt_version,
                        elapsed_ms,
                    )
        except Exception as exc:
            elapsed_ms = round((time.monotonic() - start_time) * 1000, 1)
            fallback_used = True
            answer = format_deterministic_response(dto)
            logger.warning(
                "Assistant provider failed; using deterministic fallback: "
                "request_id=%s provider=%s model=%s intent=%s prompt_version=%s elapsed_ms=%s error_type=%s",
                request_id,
                provider_name,
                getattr(settings, "AI_MODEL", ""),
                dto.get("intent"),
                prompt_version,
                elapsed_ms,
                type(exc).__name__,
            )

    return sanitize_ai_data({
        "answer": str(answer or "").strip(),
        "sources": dto.get("sources", []),
        "suggested_actions": dto.get("suggested_actions", []),
        "request_id": request_id,
        "intent": dto.get("intent", ""),
        "actor_scope": scope,
        "fallback_used": fallback_used,
    })
