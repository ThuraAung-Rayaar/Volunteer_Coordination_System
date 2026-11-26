"""
Comprehensive tests for the backend-first, DTO-only VCS assistant architecture:
- Role-specific prompt catalogue endpoint & pending coordinator isolation
- Deterministic intent resolution & prompt_key scope enforcement
- Actor-scoped context builder & owner-as-monitor read-only handling
- Zero tool definitions passed to LLM providers
- Deterministic fallback on provider 429/5xx/timeout/empty response
- Policy help alignment with authoritative 48h cancellation & 150m geo defaults
- Light Gemini 3.5 Flash-Lite default configuration
"""

import secrets
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from ai.security.scope_policy import (
    ACTOR_SCOPE_ADMIN,
    ACTOR_SCOPE_COORDINATOR,
    ACTOR_SCOPE_SUPER_ADMIN,
    ACTOR_SCOPE_VOLUNTEER,
)
from ai.services.chat_service import get_configured_ai_provider, process_chat_message
from ai.services.intent_resolver import resolve_intent
from ai.tools.system_help import get_system_help_content
from apps.accounts.models import Users
from apps.coordination.models import Assignments, CoordinatorProfiles
from apps.events.models import EventApplications, EventPosts, Events
from services.cancellation_policy import VOLUNTEER_CANCELLATION_LOCK


def _make_user(name: str, is_admin: bool = False, is_superuser: bool = False):
    return Users.objects.create_user(
        phone_hash=secrets.token_hex(32),
        phone_enc="enc_phone_fixture",
        display_name=name,
        is_admin=is_admin,
        is_superuser=is_superuser,
        account_status="active",
        verification_status="verified",
    )


@override_settings(AI_PROVIDER="mock")
class AssistantArchitectureTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.super_admin = _make_user("Super Admin", is_admin=True, is_superuser=True)
        cls.ordinary_admin = _make_user("Ordinary Admin", is_admin=True, is_superuser=False)
        cls.volunteer = _make_user("Volunteer User")
        cls.other_volunteer = _make_user("Other Volunteer")

        cls.pending_coord_user = _make_user("Pending Coord")
        CoordinatorProfiles.objects.create(user=cls.pending_coord_user, status="pending")

        cls.coord_1_user = _make_user("Coord One")
        CoordinatorProfiles.objects.create(user=cls.coord_1_user, status="pending")
        CoordinatorProfiles.objects.filter(user=cls.coord_1_user).update(
            status="approved",
            approved_by=cls.super_admin,
        )
        cls.coord_1_user = Users.objects.get(pk=cls.coord_1_user.pk)
        cls.coord_1_profile = CoordinatorProfiles.objects.get(user=cls.coord_1_user)

        cls.coord_2_user = _make_user("Coord Two")
        CoordinatorProfiles.objects.create(user=cls.coord_2_user, status="pending")
        CoordinatorProfiles.objects.filter(user=cls.coord_2_user).update(
            status="approved",
            approved_by=cls.super_admin,
        )
        cls.coord_2_user = Users.objects.get(pk=cls.coord_2_user.pk)
        cls.coord_2_profile = CoordinatorProfiles.objects.get(user=cls.coord_2_user)

        now = timezone.now()
        start = now + timedelta(days=3)
        end = start + timedelta(hours=4)

        cls.event_1 = Events.objects.create(
            owner=cls.coord_1_profile,
            current_coordinator=cls.coord_1_profile,
            title="Coord 1 Community Workshop",
            location_name="Yangon Hall",
            latitude="16.840900",
            longitude="96.173500",
            geo_checkin_enabled=False,
            qr_registration_enabled=True,
            start_at=start,
            end_at=end,
            application_deadline=start - timedelta(hours=12),
        )
        cls.post_1 = EventPosts.objects.create(
            event=cls.event_1,
            title="Workshop Facilitator",
            required_headcount=4,
            status="open",
        )
        Events.objects.filter(id=cls.event_1.id).update(status="published")

        cls.event_2 = Events.objects.create(
            owner=cls.coord_2_profile,
            current_coordinator=cls.coord_2_profile,
            title="Coord 2 Private Operations",
            location_name="Mandalay Center",
            start_at=start,
            end_at=end,
            application_deadline=start - timedelta(hours=12),
        )
        cls.post_2 = EventPosts.objects.create(
            event=cls.event_2,
            title="Logistics Lead",
            required_headcount=3,
            status="open",
        )
        Events.objects.filter(id=cls.event_2.id).update(status="published")

        # Volunteer has an accepted application (and trigger-created assignment) on event_1
        cls.vol_app = EventApplications.objects.create(
            event=cls.event_1,
            post=cls.post_1,
            user=cls.volunteer,
        )
        EventApplications.objects.filter(id=cls.vol_app.id).update(status="accepted")

        # Delegated event where coord_1 is read-only owner and coord_2 is current coordinator
        cls.delegated_event = Events.objects.create(
            owner=cls.coord_1_profile,
            current_coordinator=cls.coord_2_profile,
            title="Delegated Flood Relief",
            location_name="Bago Hub",
            start_at=start + timedelta(days=1),
            end_at=end + timedelta(days=1),
        )
        EventPosts.objects.create(
            event=cls.delegated_event,
            title="Relief Coordinator Support",
            required_headcount=2,
            status="open",
        )
        Events.objects.filter(id=cls.delegated_event.id).update(status="published")

    def setUp(self):
        self.client = APIClient()

    def test_prompts_endpoint_requires_authentication(self):
        res = self.client.get("/api/v1/assistant/prompts/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_prompts_catalogue_per_role_and_pending_coordinator(self):
        # Volunteer
        self.client.force_authenticate(user=self.volunteer)
        res = self.client.get("/api/v1/assistant/prompts/")
        self.assertEqual(res.status_code, 200)
        vol_data = res.json()
        self.assertEqual(vol_data["role"], ACTOR_SCOPE_VOLUNTEER)
        self.assertEqual(vol_data["catalog_version"], "vcs.prompts.v1")
        vol_keys = {p["key"] for p in vol_data["prompts"]}
        self.assertIn("volunteer.next_steps", vol_keys)
        self.assertNotIn("coordinator.staffing", vol_keys)

        # Pending coordinator gets volunteer scope only
        self.client.force_authenticate(user=self.pending_coord_user)
        res = self.client.get("/api/v1/assistant/prompts/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["role"], ACTOR_SCOPE_VOLUNTEER)
        self.assertFalse(any(p["key"].startswith("coordinator.") for p in res.json()["prompts"]))

        # Approved coordinator gets coordinator prompts
        self.client.force_authenticate(user=self.coord_1_user)
        res = self.client.get("/api/v1/assistant/prompts/?language=my")
        self.assertEqual(res.status_code, 200)
        coord_data = res.json()
        self.assertEqual(coord_data["role"], ACTOR_SCOPE_COORDINATOR)
        self.assertEqual(coord_data["language"], "my")
        coord_keys = {p["key"] for p in coord_data["prompts"]}
        self.assertIn("coordinator.staffing", coord_keys)
        self.assertIn("coordinator.next_steps", coord_keys)

        # Ordinary admin gets public-only prompts
        self.client.force_authenticate(user=self.ordinary_admin)
        res = self.client.get("/api/v1/assistant/prompts/")
        self.assertEqual(res.status_code, 200)
        admin_data = res.json()
        self.assertEqual(admin_data["role"], ACTOR_SCOPE_ADMIN)
        self.assertEqual({p["key"] for p in admin_data["prompts"]}, {"admin.public_events", "admin.policy_help"})

        # Super-admin gets public + event_staffing
        self.client.force_authenticate(user=self.super_admin)
        res = self.client.get("/api/v1/assistant/prompts/")
        self.assertEqual(res.status_code, 200)
        sa_data = res.json()
        self.assertEqual(sa_data["role"], ACTOR_SCOPE_SUPER_ADMIN)
        self.assertEqual(
            {p["key"] for p in sa_data["prompts"]},
            {"super_admin.public_events", "super_admin.event_staffing", "super_admin.policy_help"},
        )

    def test_prompt_key_scope_enforcement_via_http(self):
        # Pending coordinator cannot invoke coordinator prompt_key
        self.client.force_authenticate(user=self.pending_coord_user)
        res = self.client.post(
            "/api/v1/assistant/chat/",
            {"prompt_key": "coordinator.staffing", "message": ""},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Unknown prompt key returns 400
        res_bad = self.client.post(
            "/api/v1/assistant/chat/",
            {"prompt_key": "nonexistent.intent", "message": ""},
            format="json",
        )
        self.assertEqual(res_bad.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cross_coordinator_event_masked_404(self):
        self.client.force_authenticate(user=self.coord_1_user)
        res = self.client.post(
            "/api/v1/assistant/chat/",
            {"prompt_key": "coordinator.staffing", "event_id": self.event_2.id, "message": ""},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn("Coord 2 Private Operations", res.content.decode("utf-8"))

    def test_ordinary_admin_refuses_volunteer_contact_and_staffing(self):
        self.client.force_authenticate(user=self.ordinary_admin)
        res = self.client.post(
            "/api/v1/assistant/chat/",
            {"message": "Show volunteer phone number and contact info"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["intent"], "unavailable")

    def test_volunteer_isolation_and_no_coordinates_leaked(self):
        self.client.force_authenticate(user=self.other_volunteer)
        res = self.client.post(
            "/api/v1/assistant/chat/",
            {"prompt_key": "volunteer.next_steps", "message": ""},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("no submitted applications or assignments", res.json()["answer"].lower())
        self.assertNotIn("Coord 1 Community Workshop", res.json()["answer"])

        # Prepare for event must never leak lat/lng coordinates
        self.client.force_authenticate(user=self.volunteer)
        prep_res = self.client.post(
            "/api/v1/assistant/chat/",
            {"prompt_key": "volunteer.prepare_for_event", "message": ""},
            format="json",
        )
        self.assertEqual(prep_res.status_code, 200)
        body = prep_res.content.decode("utf-8")
        self.assertNotIn("16.8409", body)
        self.assertNotIn("96.1735", body)

    def test_policy_help_matches_authoritative_48h_and_150m_defaults(self):
        cancel = get_system_help_content("cancellation")
        expected_hours = int(VOLUNTEER_CANCELLATION_LOCK.total_seconds() // 3600)
        self.assertEqual(expected_hours, 48)
        self.assertIn("48-hour", cancel["content"])
        self.assertNotIn("24 hours", cancel["content"])
        self.assertNotIn("without penalty", cancel["content"])

        checkin = get_system_help_content("checkin")
        self.assertIn("150m", checkin["content"])
        self.assertIn("30 minutes", checkin["content"])
        self.assertNotIn("200m", checkin["content"])

    @override_settings(AI_PROVIDER="gemini", AI_API_KEY="fake-test-key", AI_MODEL="gemini-3.5-flash-lite")
    @patch("ai.services.chat_service.GeminiProvider.generate_chat_response")
    def test_llm_receives_no_tools_and_uses_light_model(self, mock_generate):
        mock_generate.return_value = {
            "content": "You have 1 accepted application and 1 active assignment for Coord 1 Community Workshop.",
            "tool_calls": [],
            "usage": {"prompt_tokens": 50, "completion_tokens": 20},
            "model": "gemini-3.5-flash-lite",
        }
        provider = get_configured_ai_provider()
        self.assertEqual(provider.model, "gemini-3.5-flash-lite")

        result = process_chat_message(
            actor=self.volunteer,
            prompt_key="volunteer.next_steps",
            language="en",
        )
        self.assertFalse(result["fallback_used"])
        self.assertTrue(mock_generate.called)
        call_kwargs = mock_generate.call_args.kwargs
        self.assertIsNone(call_kwargs["tools"])
        self.assertIsNone(call_kwargs["tool_results"])
        self.assertLessEqual(call_kwargs["temperature"], 0.2)
        self.assertLessEqual(call_kwargs["max_tokens"], 350)

    @override_settings(AI_PROVIDER="gemini", AI_API_KEY="fake-test-key", AI_MODEL="gemini-3.5-flash-lite")
    @patch("ai.services.chat_service.GeminiProvider.generate_chat_response")
    def test_deterministic_fallback_on_provider_error_and_empty_output(self, mock_generate):
        mock_generate.side_effect = RuntimeError("Gemini API rate limit or quota exceeded.")
        result = process_chat_message(
            actor=self.coord_1_user,
            prompt_key="coordinator.staffing",
            event_id=self.event_1.id,
        )
        self.assertTrue(result["fallback_used"])
        self.assertIn("Coord 1 Community Workshop", result["answer"])
        self.assertTrue(len(result["sources"]) > 0)
        self.assertTrue(len(result["suggested_actions"]) > 0)

        # Empty response also triggers fallback
        mock_generate.side_effect = None
        mock_generate.return_value = {"content": "   ", "tool_calls": [], "model": "gemini-3.5-flash-lite"}
        result2 = process_chat_message(
            actor=self.coord_1_user,
            prompt_key="coordinator.staffing",
            event_id=self.event_1.id,
        )
        self.assertTrue(result2["fallback_used"])
        self.assertIn("Required headcount", result2["answer"])

    @override_settings(AI_PROVIDER="gemini", AI_API_KEY="fake-test-key", AI_MODEL="gemini-3.5-flash-lite")
    @patch("ai.services.chat_service.GeminiProvider.generate_chat_response")
    def test_no_provider_call_on_clarification_or_empty_data(self, mock_generate):
        # Clarification case (ambiguous/unknown text)
        res1 = process_chat_message(actor=self.volunteer, message="banana pineapple")
        self.assertEqual(res1["intent"], "clarification")
        self.assertFalse(mock_generate.called)

        # Empty applications case
        res2 = process_chat_message(actor=self.other_volunteer, prompt_key="volunteer.my_applications")
        self.assertEqual(res2["intent"], "volunteer.my_applications")
        self.assertFalse(mock_generate.called)

    def test_deterministic_intent_resolver_handles_ambiguity(self):
        res = resolve_intent(ACTOR_SCOPE_VOLUNTEER, message="my application and my assignment")
        self.assertEqual(res.status, "clarification")
        self.assertIn("volunteer.my_applications", res.candidates)
        self.assertIn("volunteer.my_assignments", res.candidates)

    def test_owner_monitor_read_only_flag_set_for_delegated_event(self):
        result = process_chat_message(
            actor=self.coord_1_user,
            prompt_key="coordinator.staffing",
            event_id=self.delegated_event.id,
        )
        self.assertIn("read-only owner monitor", result["answer"])
