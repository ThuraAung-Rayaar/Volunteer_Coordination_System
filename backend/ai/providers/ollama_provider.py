"""
Ollama local chat provider using the native /api/chat endpoint.
No Python SDK or additional package is required.
"""
import json
import logging
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

from .base import BaseAIProvider

logger = logging.getLogger(__name__)


def _normalise_schema(value: Any) -> Any:
    type_map = {
        "OBJECT": "object", "ARRAY": "array", "STRING": "string",
        "INTEGER": "integer", "NUMBER": "number", "BOOLEAN": "boolean",
        "NULL": "null",
    }
    if isinstance(value, dict):
        return {
            key: (
                type_map.get(item, item)
                if key == "type" and isinstance(item, str)
                else _normalise_schema(item)
            )
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_normalise_schema(item) for item in value]
    return value


class OllamaProvider(BaseAIProvider):
    """Small local model adapter supporting Ollama function calling."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:11434",
        model: str = "qwen3.5:4b",
        timeout_seconds: int = 45,
        keep_alive: str = "5m",
    ):
        self.base_url = (base_url or "http://127.0.0.1:11434").rstrip("/")
        self.model = model
        self.timeout_seconds = max(3, int(timeout_seconds))
        self.keep_alive = keep_alive or "5m"

    def _format_tools(self, tools: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        return [{
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool.get("description", ""),
                "parameters": _normalise_schema(
                    tool.get("parameters") or {"type": "OBJECT", "properties": {}}
                ),
            },
        } for tool in (tools or [])]

    def generate_chat_response(
        self,
        messages: List[Dict[str, str]],
        system_instruction: str,
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_results: Optional[List[Dict[str, Any]]] = None,
        max_tokens: int = 800,
        temperature: float = 0.2,
    ) -> Dict[str, Any]:
        if not self.model:
            raise ValueError("AI_MODEL must be configured for the Ollama provider.")

        ollama_messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_instruction}
        ]
        for item in messages:
            if item.get("role") in ("user", "assistant"):
                ollama_messages.append({
                    "role": item["role"],
                    "content": item.get("content", ""),
                })

        # Reconstruct the matching assistant tool-call turn before its tool replies.
        if tool_results:
            calls = []
            for index, result in enumerate(tool_results):
                name = str(result.get("name") or "")
                if not name:
                    continue
                arguments = result.get("arguments")
                calls.append({
                    "type": "function",
                    "function": {
                        "index": index,
                        "name": name,
                        "arguments": arguments if isinstance(arguments, dict) else {},
                    },
                })
            if calls:
                ollama_messages.append({"role": "assistant", "tool_calls": calls})
                for result in tool_results:
                    name = str(result.get("name") or "")
                    if name:
                        ollama_messages.append({
                            "role": "tool",
                            "tool_name": name,
                            "content": json.dumps(
                                result.get("result", {}),
                                ensure_ascii=False,
                                separators=(",", ":"),
                            ),
                        })

        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": ollama_messages,
            "stream": False,
            "keep_alive": self.keep_alive,
            "options": {
                "temperature": temperature,
                "num_predict": max(1, min(int(max_tokens), 2048)),
            },
        }
        formatted_tools = self._format_tools(tools)
        if formatted_tools:
            payload["tools"] = formatted_tools

        request = urllib.request.Request(
            f"{self.base_url}/api/chat",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                body = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            logger.warning("Ollama HTTP error: status=%s", exc.code)
            raise RuntimeError(f"Local AI provider returned HTTP {exc.code}.") from None
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            logger.warning("Ollama connection failed: %s", type(exc).__name__)
            raise RuntimeError(
                "Could not reach the local AI provider. Check that Ollama is running."
            ) from None
        except (json.JSONDecodeError, UnicodeDecodeError, KeyError, TypeError) as exc:
            logger.warning("Ollama returned an invalid response: %s", type(exc).__name__)
            raise RuntimeError("The local AI provider returned an invalid response.") from None

        if body.get("error"):
            logger.warning("Ollama returned a provider API error.")
            raise RuntimeError("The local AI provider returned an error.")

        message = body.get("message") or {}
        tool_calls = []
        for call in message.get("tool_calls") or []:
            function = call.get("function") or {}
            name = function.get("name")
            if not name:
                continue
            arguments = function.get("arguments") or {}
            if isinstance(arguments, str):
                try:
                    arguments = json.loads(arguments)
                except json.JSONDecodeError:
                    arguments = {}
            if not isinstance(arguments, dict):
                arguments = {}
            tool_calls.append({"name": name, "arguments": arguments})

        return {
            "content": str(message.get("content") or ""),
            "tool_calls": tool_calls,
            "usage": {
                "prompt_tokens": int(body.get("prompt_eval_count") or 0),
                "completion_tokens": int(body.get("eval_count") or 0),
            },
            "model": body.get("model") or self.model,
        }
