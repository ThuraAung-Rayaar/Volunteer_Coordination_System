import json
import logging
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional
from .base import BaseAIProvider

logger = logging.getLogger(__name__)


class GeminiProvider(BaseAIProvider):
    """
    Production-ready Google Gemini API adapter using official REST endpoint
    with standard library urllib (zero external pip dependencies).
    """

    def __init__(
        self,
        api_key: str,
        model: str = "gemini-3.5-flash-lite",
        timeout_seconds: int = 15,
    ):
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds

    def generate_chat_response(
        self,
        messages: List[Dict[str, str]],
        system_instruction: str,
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_results: Optional[List[Dict[str, Any]]] = None,
        max_tokens: int = 800,
        temperature: float = 0.2,
    ) -> Dict[str, Any]:
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is not configured.")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"

        contents = []
        for msg in messages:
            role = "user" if msg.get("role") == "user" else "model"
            contents.append({
                "role": role,
                "parts": [{"text": msg.get("content", "")}],
            })

        # Reconstruct the provider's required function-call turn before sending
        # matching function responses. Tool execution has already been
        # authorized and performed by the backend service.
        if tool_results:
            response_parts = []
            provider_turn = next(
                (
                    result.get("provider_turn")
                    for result in tool_results
                    if isinstance(result.get("provider_turn"), dict)
                ),
                None,
            )
            for result in tool_results:
                name = result.get("name")
                if not name:
                    continue
                function_response = {
                    "name": name,
                    "response": {"output": result.get("result", {})},
                }
                if result.get("id"):
                    function_response["id"] = result["id"]
                response_parts.append({"functionResponse": function_response})

            if response_parts:
                if provider_turn:
                    contents.append(provider_turn)
                else:
                    call_parts = [
                        {
                            "functionCall": {
                                "name": result["name"],
                                "args": result.get("arguments") or {},
                            }
                        }
                        for result in tool_results
                        if result.get("name")
                    ]
                    contents.append({"role": "model", "parts": call_parts})
                contents.append({"role": "user", "parts": response_parts})

        payload: Dict[str, Any] = {
            "contents": contents,
            "systemInstruction": {
                "parts": [{"text": system_instruction}]
            },
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }

        # Format function declarations if tools provided
        if tools:
            func_decls = []
            for t in tools:
                func_decls.append({
                    "name": t.get("name"),
                    "description": t.get("description", ""),
                    "parameters": t.get("parameters", {"type": "OBJECT", "properties": {}}),
                })
            payload["tools"] = [{"functionDeclarations": func_decls}]

        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={"Content-Type": "application/json", "x-goog-api-key": self.api_key},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                raw_body = resp.read().decode("utf-8")
                resp_json = json.loads(raw_body)
        except urllib.error.HTTPError as e:
            try:
                err_body = e.read().decode("utf-8")
                err_json = json.loads(err_body)
                err_msg = err_json.get("error", {}).get("message", err_body)
            except Exception:
                err_msg = ""
            logger.warning("Gemini API HTTP error: status=%s detail=%s", e.code, err_msg)
            if e.code == 429:
                raise RuntimeError("Gemini API rate limit or quota exceeded.") from None
            if e.code >= 500:
                raise RuntimeError(f"Gemini API service temporarily unavailable (HTTP {e.code}).") from None
            raise RuntimeError(f"Gemini API returned HTTP {e.code}: {err_msg}") from None
        except (TimeoutError, urllib.error.URLError) as e:
            logger.warning("Gemini API network/timeout error: %s", type(e).__name__)
            raise RuntimeError("Gemini API request timed out or connection failed.") from None
        except Exception as e:
            logger.warning("Gemini API connection error: %s", type(e).__name__)
            raise RuntimeError("Failed to communicate with Gemini API.") from None

        candidates = resp_json.get("candidates", [])
        if not candidates:
            return {
                "content": "No response was generated by the model.",
                "tool_calls": [],
                "usage": {"prompt_tokens": 0, "completion_tokens": 0},
                "model": self.model,
            }

        candidate = candidates[0]
        content_parts = candidate.get("content", {}).get("parts", [])
        text_parts = []
        tool_calls = []

        for p in content_parts:
            if "text" in p:
                text_parts.append(p["text"])
            if "functionCall" in p:
                fc = p["functionCall"]
                tool_calls.append({
                    "name": fc.get("name"),
                    "arguments": fc.get("args", {}),
                    "id": fc.get("id"),
                })

        usage_meta = resp_json.get("usageMetadata", {})
        usage = {
            "prompt_tokens": usage_meta.get("promptTokenCount", 0),
            "completion_tokens": usage_meta.get("candidatesTokenCount", 0),
        }

        return {
            "content": "".join(text_parts),
            "tool_calls": tool_calls,
            "usage": usage,
            "model": self.model,
            "provider_turn": candidate.get("content"),
        }
