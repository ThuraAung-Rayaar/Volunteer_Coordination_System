"""
backend/ai/management/commands/ai_smoke_test.py

Smoke-test management command for AI providers conforming to Section 12 of
docs/VCS_AI_UNIFIED_HANDOFF.md.

Prints only:
- Provider name
- Model name
- Response status / success flag
- Latency (ms)
- Token usage counts (prompt / completion)

STRICTLY NEVER prints API keys, full URLs, sensitive prompts, or private payloads.
"""

import time
from django.core.management.base import BaseCommand
from django.conf import settings
from ai.services.chat_service import get_configured_ai_provider
from ai.providers import MockAIProvider, OllamaProvider, GeminiProvider


class Command(BaseCommand):
    help = "Run an isolated AI provider smoke test (redacts keys and prompts)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--provider",
            type=str,
            default=None,
            help="Override provider: mock | ollama | gemini",
        )
        parser.add_argument(
            "--model",
            type=str,
            default=None,
            help="Override model name (e.g. gemini-1.5-flash, gemini-2.0-flash)",
        )

    def handle(self, *args, **options):
        provider_override = options.get("provider")
        api_key = getattr(settings, "AI_API_KEY", "") or getattr(settings, "GEMINI_API_KEY", "")
        model = options.get("model") or getattr(settings, "AI_MODEL", "gemini-1.5-flash")
        timeout = getattr(settings, "AI_TIMEOUT_SECONDS", 15)

        if provider_override == "mock":
            provider = MockAIProvider()
            provider_name = "mock"
        elif provider_override == "ollama":
            provider = OllamaProvider(
                base_url=getattr(settings, "AI_OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
                model=getattr(settings, "AI_MODEL", "qwen3.5:4b"),
                timeout_seconds=timeout,
            )
            provider_name = "ollama"
        elif provider_override == "gemini":
            if not api_key:
                self.stderr.write("[FAIL] Gemini selected but AI_API_KEY / GEMINI_API_KEY is not configured.")
                return
            provider = GeminiProvider(api_key=api_key, model=model, timeout_seconds=timeout)
            provider_name = "gemini"
        else:
            try:
                provider = get_configured_ai_provider()
                provider_name = getattr(settings, "AI_PROVIDER", "mock")
            except Exception as exc:
                self.stderr.write(f"[FAIL] Provider configuration error: {exc}")
                return

        self.stdout.write("=" * 60)
        self.stdout.write("AI Provider Smoke Test (Safe Telemetry Only)")
        self.stdout.write("=" * 60)
        self.stdout.write(f"Provider: {provider_name}")
        self.stdout.write(f"Model:    {getattr(provider, 'model', 'default')}")

        start_time = time.monotonic()
        try:
            response = provider.generate_chat_response(
                messages=[{"role": "user", "content": "Ping"}],
                system_instruction="Reply with Pong.",
                max_tokens=20,
            )
            latency_ms = round((time.monotonic() - start_time) * 1000, 2)
            usage = response.get("usage", {})

            self.stdout.write("Status:   SUCCESS (200 OK)")
            self.stdout.write(f"Latency:  {latency_ms} ms")
            self.stdout.write(f"Prompt Tokens:     {usage.get('prompt_tokens', 0)}")
            self.stdout.write(f"Completion Tokens: {usage.get('completion_tokens', 0)}")
            self.stdout.write("=" * 60)
        except Exception as exc:
            latency_ms = round((time.monotonic() - start_time) * 1000, 2)
            self.stderr.write(f"Status:   FAILED ({type(exc).__name__})")
            self.stderr.write(f"Latency:  {latency_ms} ms")
            self.stderr.write(f"Reason:   {exc}")
            self.stderr.write("=" * 60)
