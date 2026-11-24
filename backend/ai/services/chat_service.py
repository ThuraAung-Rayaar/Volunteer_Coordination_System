import logging
import uuid
from typing import Any, Dict, List, Optional
from django.conf import settings

from ai.providers import BaseAIProvider, GeminiProvider, MockAIProvider
from ai.security.prompt_guard import sanitize_user_prompt, validate_conversation_history
from ai.security.scope_policy import determine_actor_scope
from ai.security.redaction import sanitize_ai_data
from ai.tools.registry import get_available_tools_for_actor, execute_tool

logger = logging.getLogger(__name__)


def get_configured_ai_provider() -> BaseAIProvider:
    """Instantiate the active AI provider based on Django settings."""
    provider_name = getattr(settings, "AI_PROVIDER", "mock").lower()
    api_key = getattr(settings, "AI_API_KEY", "") or getattr(settings, "GEMINI_API_KEY", "")
    model = getattr(settings, "AI_MODEL", "gemini-1.5-flash")
    timeout = getattr(settings, "AI_TIMEOUT_SECONDS", 15)

    if provider_name == "gemini" and api_key:
        return GeminiProvider(api_key=api_key, model=model, timeout_seconds=timeout)

    return MockAIProvider()


def build_system_instruction(actor: Any, scope: str) -> str:
    display_name = getattr(actor, "display_name", "User")
    return (
        f"You are the Volunteer Coordination System (VCS) Assistant. You are interacting with {display_name} (Role: {scope}).\n"
        "Guidelines:\n"
        "1. Strictly READ-ONLY V1: You never execute write actions. You cannot create, edit, or delete events, applications, assignments, or users.\n"
        "2. Privacy: NEVER reveal phone numbers, emergency contacts, blood types, passwords, or auth tokens.\n"
        "3. Helpfulness: Provide concise, factual summaries using authoritative tools. If you use information from tools, cite the event or application.\n"
        "4. Truthfulness: Never guess or invent numbers, capacities, or volunteer details.\n"
        "5. Language: Reply in the user's language (defaulting to English)."
    )


def process_chat_message(
    actor: Any,
    message: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    language: str = "en",
) -> Dict[str, Any]:
    """
    Core entrypoint for assistant conversation requests.
    Validates input, enforces actor scope, executes allowlisted read tools,
    and returns a structured, sanitized response.
    """
    # 1. Validate inputs and guard against injection
    clean_message = sanitize_user_prompt(message)
    validated_history = validate_conversation_history(conversation_history)

    # 2. Scope resolution and tool preparation
    scope = determine_actor_scope(actor)
    available_tools = get_available_tools_for_actor(actor)

    # 3. Assemble messages for provider
    messages = list(validated_history)
    messages.append({"role": "user", "content": clean_message})

    system_instruction = build_system_instruction(actor, scope)
    provider = get_configured_ai_provider()

    # 4. Generate first turn (with potential tool call)
    first_resp = provider.generate_chat_response(
        messages=messages,
        system_instruction=system_instruction,
        tools=available_tools,
        max_tokens=getattr(settings, "AI_MAX_OUTPUT_TOKENS", 800),
    )

    tool_calls = first_resp.get("tool_calls", [])
    sources: List[Dict[str, Any]] = []
    suggested_actions: List[Dict[str, Any]] = []

    if tool_calls:
        tool_results = []
        for tc in tool_calls:
            t_name = tc.get("name")
            t_args = tc.get("arguments", {})
            try:
                t_result = execute_tool(actor, t_name, t_args)
                tool_results.append({
                    "name": t_name,
                    "result": t_result,
                })

                # Collect sources & suggested navigation actions
                if t_name == "search_events":
                    for ev in t_result.get("events", [])[:3]:
                        sources.append({"type": "event", "id": ev.get("event_id"), "label": ev.get("title")})
                        suggested_actions.append({"type": "open_event", "event_id": ev.get("event_id")})
                elif t_name == "get_event_detail":
                    ev = t_result.get("event", {})
                    if ev.get("id"):
                        sources.append({"type": "event", "id": ev.get("id"), "label": ev.get("title")})
                        suggested_actions.append({"type": "open_event", "event_id": ev.get("id")})
                elif t_name == "get_recommendations":
                    for r in t_result.get("results", [])[:3]:
                        ev = r.get("event", {})
                        if ev.get("event_id"):
                            sources.append({"type": "event", "id": ev.get("event_id"), "label": ev.get("title")})
                            suggested_actions.append({"type": "open_event", "event_id": ev.get("event_id")})
                elif t_name == "get_staffing_insight":
                    sources.append({"type": "staffing_insight", "id": t_result.get("event_id"), "label": t_result.get("event_title")})
                    suggested_actions.append({"type": "open_staffing", "event_id": t_result.get("event_id")})

            except Exception as e:
                logger.warning("Tool %s execution failed: %s", t_name, str(e))
                tool_results.append({
                    "name": t_name,
                    "result": {"error": str(e)},
                })

        # Synthesize tool results
        final_resp = provider.generate_chat_response(
            messages=messages,
            system_instruction=system_instruction,
            tools=available_tools,
            tool_results=tool_results,
            max_tokens=getattr(settings, "AI_MAX_OUTPUT_TOKENS", 800),
        )
        answer = final_resp.get("content", "")
    else:
        answer = first_resp.get("content", "")

    # Deduplicate suggested actions
    seen_actions = set()
    unique_actions = []
    for sa in suggested_actions:
        key = (sa.get("type"), sa.get("event_id"))
        if key not in seen_actions:
            seen_actions.add(key)
            unique_actions.append(sa)

    return sanitize_ai_data({
        "answer": answer.strip(),
        "sources": sources,
        "suggested_actions": unique_actions,
        "request_id": str(uuid.uuid4()),
    })
