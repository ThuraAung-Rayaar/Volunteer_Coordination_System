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

    def test_missing_api_key_fails_closed(self):
        """Missing key must fail closed with ValueError."""
        provider = GeminiProvider(api_key="")
        with self.assertRaises(ValueError) as ctx:
            provider.generate_chat_response(
                messages=[{"role": "user", "content": "Hello"}],
                system_instruction="Policy",
            )
        self.assertIn("not configured", str(ctx.exception))

    def test_get_configured_provider_fails_closed_when_key_missing(self):
        """get_configured_ai_provider must raise RuntimeError when AI_PROVIDER=gemini and key is missing."""
        from ai.services.chat_service import get_configured_ai_provider
        from django.test import override_settings

        with override_settings(AI_PROVIDER="gemini", AI_API_KEY="", GEMINI_API_KEY=""):
            with self.assertRaises(RuntimeError) as ctx:
                get_configured_ai_provider()
            self.assertIn("AI_API_KEY is not configured", str(ctx.exception))

    def test_mock_and_ollama_do_not_require_gemini_key(self):
        """Mock and Ollama providers must instantiate without requiring a Gemini key."""
        from ai.services.chat_service import get_configured_ai_provider
        from django.test import override_settings

        with override_settings(AI_PROVIDER="mock", AI_API_KEY="", GEMINI_API_KEY=""):
            provider = get_configured_ai_provider()
            self.assertIsNotNone(provider)

        with override_settings(AI_PROVIDER="ollama", AI_API_KEY="", GEMINI_API_KEY=""):
            provider = get_configured_ai_provider()
            self.assertIsNotNone(provider)

    @patch("ai.providers.gemini_provider.urllib.request.urlopen")
    def test_http_429_rate_limit_handled_safely(self, urlopen):
        """HTTP 429 returns safe rate limit message without leaking secret or payload."""
        import urllib.error
        err = urllib.error.HTTPError("https://api.url", 429, "Too Many Requests", {}, None)
        urlopen.side_effect = err

        provider = GeminiProvider(api_key="super-secret-key-12345")
        with self.assertRaises(RuntimeError) as ctx:
            provider.generate_chat_response(
                messages=[{"role": "user", "content": "Sensitive query"}],
                system_instruction="System",
            )
        self.assertIn("rate limit or quota exceeded", str(ctx.exception))
        self.assertNotIn("super-secret-key-12345", str(ctx.exception))
        self.assertNotIn("Sensitive query", str(ctx.exception))

    @patch("ai.providers.gemini_provider.urllib.request.urlopen")
    def test_http_500_handled_safely(self, urlopen):
        """HTTP 5xx returns safe service unavailable message without leaking secrets."""
        import urllib.error
        err = urllib.error.HTTPError("https://api.url", 503, "Service Unavailable", {}, None)
        urlopen.side_effect = err

        provider = GeminiProvider(api_key="super-secret-key-12345")
        with self.assertRaises(RuntimeError) as ctx:
            provider.generate_chat_response(
                messages=[{"role": "user", "content": "Sensitive query"}],
                system_instruction="System",
            )
        self.assertIn("temporarily unavailable", str(ctx.exception))
        self.assertNotIn("super-secret-key-12345", str(ctx.exception))

    @patch("ai.providers.gemini_provider.urllib.request.urlopen")
    def test_timeout_handled_safely(self, urlopen):
        """TimeoutError returns safe message without leaking secret or payload."""
        urlopen.side_effect = TimeoutError("Connection timed out")

        provider = GeminiProvider(api_key="super-secret-key-12345")
        with self.assertRaises(RuntimeError) as ctx:
            provider.generate_chat_response(
                messages=[{"role": "user", "content": "Sensitive query"}],
                system_instruction="System",
            )
        self.assertIn("timed out or connection failed", str(ctx.exception))
        self.assertNotIn("super-secret-key-12345", str(ctx.exception))

    @patch("ai.providers.gemini_provider.urllib.request.urlopen")
    def test_malformed_response_handled_safely(self, urlopen):
        """Malformed JSON response returns safe failure message."""
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = b"<!DOCTYPE html><html>Gateway error</html>"
        urlopen.return_value = response

        provider = GeminiProvider(api_key="super-secret-key-12345")
        with self.assertRaises(RuntimeError) as ctx:
            provider.generate_chat_response(
                messages=[{"role": "user", "content": "Test"}],
                system_instruction="System",
            )
        self.assertIn("Failed to communicate with Gemini API", str(ctx.exception))
        self.assertNotIn("super-secret-key-12345", str(ctx.exception))
