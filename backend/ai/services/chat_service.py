import logging
import uuid
from typing import Any, Dict, List, Optional

from django.conf import settings

from ai.providers import (
    BaseAIProvider,
    GeminiProvider,
    MockAIProvider,
    OllamaProvider,
)
from ai.prompts import build_role_system_instruction
from ai.security.prompt_guard import sanitize_user_prompt, validate_conversation_history
from ai.security.scope_policy import determine_actor_scope
from ai.security.redaction import sanitize_ai_data
from ai.tools.registry import get_available_tools_for_actor, execute_tool

logger = logging.getLogger(__name__)


def get_configured_ai_provider() -> BaseAIProvider:
    """Instantiate the configured provider without silently masking bad configuration."""
    provider_name = str(getattr(settings, "AI_PROVIDER", "mock")).lower()
    api_key = getattr(settings, "AI_API_KEY", "") or getattr(settings, "GEMINI_API_KEY", "")
    model = getattr(settings, "AI_MODEL", "gemini-3.6-flash")
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
        return GeminiProvider(api_key=api_key, model=model, timeout_seconds=timeout)
    if provider_name == "mock":
        return MockAIProvider()

    raise RuntimeError("Unsupported AI_PROVIDER. Use mock, ollama, or gemini.")


def build_system_instruction(actor: Any, scope: str, language: str = "en") -> str:
    """Create a versioned role policy prompt conforming to Section 10 of VCS AI spec."""
    instruction, _ = build_role_system_instruction(scope, language)
    return instruction


def process_chat_message(
    actor: Any,
    message: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    language: str = "en",
) -> Dict[str, Any]:
    """
    Validate a bounded turn, expose only actor-allowlisted tools, execute at most
    three read-only calls, and return a sanitized response. No chat rows persist.
    """
    clean_message = sanitize_ai_data(sanitize_user_prompt(message))
    validated_history = validate_conversation_history(conversation_history)

    scope = determine_actor_scope(actor)
    available_tools = get_available_tools_for_actor(actor)
    # History is only completed prior exchanges. The current prompt is appended
    # here once and therefore cannot be duplicated by the client payload.
    messages = sanitize_ai_data(list(validated_history))
    messages.append({"role": "user", "content": clean_message})

    system_instruction, prompt_version = build_role_system_instruction(scope, language)
    logger.info("Assistant processing message: scope=%s prompt_version=%s language=%s", scope, prompt_version, language)
    provider = get_configured_ai_provider()
    first_response = provider.generate_chat_response(
        messages=messages,
        system_instruction=system_instruction,
        tools=available_tools,
        max_tokens=getattr(settings, "AI_MAX_OUTPUT_TOKENS", 600),
    )

    tool_calls = first_response.get("tool_calls") or []
    too_many_tool_calls = len(tool_calls) > 3
    if too_many_tool_calls:
        # Reject the entire oversized batch. Sending only a subset of a
        # provider's original parallel function-call turn can break its
        # required call/result pairing.
        logger.warning("Assistant provider requested too many tools: count=%s", len(tool_calls))
        tool_calls = []

    sources: List[Dict[str, Any]] = []
    suggested_actions: List[Dict[str, Any]] = []

    if tool_calls:
        tool_results: List[Dict[str, Any]] = []
        # Keep one bounded tool round. A small model must not create an
        # unbounded agent loop or multiply the cost of one user request.
        for tool_call in tool_calls[:3]:
            tool_name = tool_call.get("name")
            arguments = tool_call.get("arguments", {})
            if not isinstance(arguments, dict):
                arguments = {}

            try:
                result = execute_tool(actor, tool_name, arguments)
                tool_results.append({
                    "name": tool_name,
                    "arguments": arguments,
                    "result": result,
                    "provider_turn": first_response.get("provider_turn"),
                })

                if tool_name == "search_events":
                    for event in result.get("events", [])[:3]:
                        event_id = event.get("event_id")
                        if event_id:
                            sources.append({
                                "type": "event",
                                "id": event_id,
                                "label": event.get("title"),
                            })
                            suggested_actions.append({
                                "type": "open_event",
                                "event_id": event_id,
                            })
                elif tool_name == "get_event_detail":
                    event = result.get("event", {})
                    event_id = event.get("event_id") or event.get("id")
                    if event_id:
                        sources.append({
                            "type": "event",
                            "id": event_id,
                            "label": event.get("title"),
                        })
                        suggested_actions.append({
                            "type": "open_event",
                            "event_id": event_id,
                        })
                elif tool_name == "get_recommendations":
                    for recommendation in result.get("results", [])[:3]:
                        event = recommendation.get("event", {})
                        event_id = event.get("event_id")
                        if event_id:
                            sources.append({
                                "type": "event",
                                "id": event_id,
                                "label": event.get("title"),
                            })
                            suggested_actions.append({
                                "type": "open_event",
                                "event_id": event_id,
                            })
                elif tool_name == "get_staffing_insight":
                    event_id = result.get("event_id")
                    if event_id:
                        sources.append({
                            "type": "staffing_insight",
                            "id": event_id,
                            "label": result.get("event_title"),
                        })
                        suggested_actions.append({
                            "type": "open_staffing",
                            "event_id": event_id,
                        })
            except Exception:
                # Do not feed SQL/provider/permission internals back to the model.
                logger.exception("Assistant tool execution failed: tool=%s", tool_name)
                tool_results.append({
                    "name": tool_name,
                    "arguments": arguments,
                    "result": {
                        "error": "The requested information could not be retrieved."
                    },
                    "provider_turn": first_response.get("provider_turn"),
                })

        # The provider sees only the completed tool exchange, not a new tool
        # schema. It must summarize the authoritative results, not chain again.
        final_response = provider.generate_chat_response(
            messages=messages,
            system_instruction=system_instruction,
            tools=None,
            tool_results=tool_results,
            max_tokens=getattr(settings, "AI_MAX_OUTPUT_TOKENS", 600),
        )
        answer = final_response.get("content", "")
    else:
        answer = (
            "Please narrow your request so I can retrieve no more than three "
            "pieces of information at a time."
            if too_many_tool_calls
            else first_response.get("content", "")
        )

    unique_actions: List[Dict[str, Any]] = []
    seen_actions = set()
    for action in suggested_actions:
        key = (action.get("type"), action.get("event_id"))
        if key not in seen_actions:
            seen_actions.add(key)
            unique_actions.append(action)

    return sanitize_ai_data({
        "answer": str(answer or "").strip(),
        "sources": sources,
        "suggested_actions": unique_actions,
        "request_id": str(uuid.uuid4()),
    })
