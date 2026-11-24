import json
from unittest.mock import MagicMock, patch
from urllib.error import URLError

from django.test import SimpleTestCase

from ai.providers.ollama_provider import OllamaProvider


class OllamaProviderTests(SimpleTestCase):
    def _response(self, payload):
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = json.dumps(payload).encode("utf-8")
        return response

    @patch("ai.providers.ollama_provider.urllib.request.urlopen")
    def test_chat_request_maps_schema_and_parses_function_call(self, urlopen):
        urlopen.return_value = self._response({
            "model": "qwen3.5:4b",
            "message": {
                "role": "assistant",
                "content": "",
                "tool_calls": [{
                    "function": {
                        "name": "search_events",
                        "arguments": {"query": "cleanup"},
                    }
                }],
            },
            "prompt_eval_count": 42,
            "eval_count": 8,
        })
        result = OllamaProvider().generate_chat_response(
            messages=[{"role": "user", "content": "Find cleanup events"}],
            system_instruction="Read-only assistant",
            tools=[{
                "name": "search_events",
                "description": "Find public events",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {"query": {"type": "STRING"}},
                    "required": ["query"],
                },
            }],
        )
        payload = json.loads(urlopen.call_args.args[0].data.decode("utf-8"))
        self.assertFalse(payload["stream"])
        self.assertEqual(payload["tools"][0]["function"]["parameters"]["type"], "object")
        self.assertEqual(
            payload["tools"][0]["function"]["parameters"]["properties"]["query"]["type"],
            "string",
        )
        self.assertEqual(result["tool_calls"][0]["name"], "search_events")
        self.assertEqual(result["usage"]["prompt_tokens"], 42)

    @patch("ai.providers.ollama_provider.urllib.request.urlopen")
    def test_tool_results_are_sent_as_tool_messages(self, urlopen):
        urlopen.return_value = self._response({
            "model": "qwen3.5:4b",
            "message": {"role": "assistant", "content": "Two results were found."},
        })
        OllamaProvider().generate_chat_response(
            messages=[{"role": "user", "content": "Find events"}],
            system_instruction="Read-only assistant",
            tool_results=[{
                "name": "search_events",
                "arguments": {"query": "cleanup"},
                "result": {"events": [{"event_id": 5, "title": "Cleanup"}]},
            }],
        )
        payload = json.loads(urlopen.call_args.args[0].data.decode("utf-8"))
        self.assertEqual(payload["messages"][-1]["role"], "tool")
        self.assertEqual(payload["messages"][-1]["tool_name"], "search_events")
        self.assertEqual(
            payload["messages"][-2]["tool_calls"][0]["function"]["arguments"],
            {"query": "cleanup"},
        )

    @patch("ai.providers.ollama_provider.urllib.request.urlopen")
    def test_unavailable_local_provider_returns_safe_error(self, urlopen):
        urlopen.side_effect = URLError("connection refused")
        with self.assertRaisesRegex(RuntimeError, "Check that Ollama is running"):
            OllamaProvider().generate_chat_response(
                messages=[{"role": "user", "content": "Hello"}],
                system_instruction="Read-only assistant",
            )
