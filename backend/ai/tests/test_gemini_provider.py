import json
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from ai.providers.gemini_provider import GeminiProvider


class GeminiProviderTests(SimpleTestCase):
    def _response(self, payload):
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = json.dumps(payload).encode("utf-8")
        return response

    @patch("ai.providers.gemini_provider.urllib.request.urlopen")
    def test_tool_call_preserves_original_model_turn_and_call_id(self, urlopen):
        provider_turn = {
            "role": "model",
            "parts": [{
                "functionCall": {
                    "name": "search_events",
                    "args": {"query": "cleanup"},
                    "id": "call-123",
                },
                "thoughtSignature": "opaque-provider-metadata",
            }],
        }
        urlopen.return_value = self._response({
            "candidates": [{
                "content": provider_turn,
                "finishReason": "STOP",
            }],
            "usageMetadata": {
                "promptTokenCount": 50,
                "candidatesTokenCount": 5,
            },
        })
        provider = GeminiProvider(api_key="test-secret", model="gemini-3.6-flash")
        first = provider.generate_chat_response(
            messages=[{"role": "user", "content": "Find cleanup events"}],
            system_instruction="Read-only",
            tools=[{
                "name": "search_events",
                "description": "Search public event records",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {"query": {"type": "STRING"}},
                    "required": ["query"],
                },
            }],
        )
        self.assertEqual(first["tool_calls"][0]["id"], "call-123")
        self.assertEqual(first["provider_turn"], provider_turn)

        urlopen.return_value = self._response({
            "candidates": [{
                "content": {
                    "role": "model",
                    "parts": [{"text": "I found one matching event."}],
                }
            }]
        })
        provider.generate_chat_response(
            messages=[{"role": "user", "content": "Find cleanup events"}],
            system_instruction="Read-only",
            tool_results=[{
                "name": "search_events",
                "arguments": {"query": "cleanup"},
                "id": "call-123",
                "provider_turn": first["provider_turn"],
                "result": {"events": [{"event_id": 7, "title": "Cleanup"}]},
            }],
        )
        request = urlopen.call_args.args[0]
        payload = json.loads(request.data.decode("utf-8"))
        self.assertEqual(request.get_header("X-goog-api-key"), "test-secret")
        self.assertNotIn("test-secret", request.full_url)
        self.assertEqual(payload["contents"][-2], provider_turn)
        self.assertEqual(payload["contents"][-1]["role"], "user")
        function_response = payload["contents"][-1]["parts"][0]["functionResponse"]
        self.assertEqual(function_response["name"], "search_events")
        self.assertEqual(function_response["id"], "call-123")
        self.assertEqual(
            function_response["response"]["output"]["events"][0]["event_id"],
            7,
        )
