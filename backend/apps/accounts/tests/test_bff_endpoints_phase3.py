"""
BFF API Integration tests for Phase 3 — Endpoints, Permissions, Privacy & Rollback.
File: backend/apps/accounts/tests/test_bff_endpoints_phase3.py
"""
from datetime import timedelta
import secrets
import uuid

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import (
    Users,
    VolunteerAvailabilityRules,
)
from apps.coordination.models import CoordinatorProfiles
from apps.events.models import EventApplications, Events
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import auth_service


def _unique_phone() -> str:
    return f"+959{secrets.randbelow(100000000):08d}"


def _make_user(phone: str = None, name: str = "API User", **kwargs) -> Users:
    raw = phone or _unique_phone()
    norm = normalize_phone(raw)
    return Users.objects.create(
        phone_hash=compute_phone_hash(norm),
        phone_enc=encrypt_phone(norm),
        display_name=name,
        **kwargs,
    )


class BffEndpointsPhase3Tests(TestCase):
    """Test REST API endpoints for auth, profile, availability, and UUID lookup."""

    def setUp(self):
        self.client = APIClient()
        self.user = _make_user(name="Alice Volunteer")
        self.client.force_authenticate(user=self.user)

    # -------------------------------------------------------------------------
    # Authentication Endpoints
    # -------------------------------------------------------------------------
    def test_auth_request_and_verify_endpoints(self):
        anon_client = APIClient()
        phone = _unique_phone()

        with override_settings(DEBUG=True):
            req_res = anon_client.post("/api/v1/auth/request-otp/", {"phone": phone, "purpose": "login"})
            self.assertEqual(req_res.status_code, status.HTTP_200_OK)
            code = req_res.data["dev_code"]

            verify_res = anon_client.post(
                "/api/v1/auth/verify-otp/",
                {"phone": phone, "code": code, "display_name": "API New User"},
            )
            self.assertEqual(verify_res.status_code, status.HTTP_200_OK)
            self.assertIn("token", verify_res.data)

    def test_auth_logout_endpoint(self):
        logout_res = self.client.post("/api/v1/auth/logout/")
        self.assertEqual(logout_res.status_code, status.HTTP_204_NO_CONTENT)

    # -------------------------------------------------------------------------
    # Profile Endpoints
    # -------------------------------------------------------------------------
    def test_profile_get_and_patch(self):
        # GET profile
        get_res = self.client.get("/api/v1/profile/")
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(get_res.data["display_name"], "Alice Volunteer")
        self.assertNotIn("phone_hash", get_res.data)

        # PATCH profile with valid fields
        patch_res = self.client.patch("/api/v1/profile/", {"display_name": "Alice Patched", "home_area": "Yangon"})
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data["display_name"], "Alice Patched")

    def test_profile_rejects_privileged_fields_with_400(self):
        res = self.client.patch("/api/v1/profile/", {"is_admin": True})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_profile_unauthenticated_returns_401(self):
        anon_client = APIClient()
        self.assertEqual(anon_client.get("/api/v1/profile/").status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(anon_client.patch("/api/v1/profile/", {}).status_code, status.HTTP_401_UNAUTHORIZED)

    # -------------------------------------------------------------------------
    # Availability Endpoints
    # -------------------------------------------------------------------------
    def test_availability_get_and_put(self):
        payload = {
            "rules": [
                {"weekday": 1, "start_time": "09:00:00", "end_time": "17:00:00"},
                {"weekday": 3, "start_time": "13:00:00", "end_time": "18:00:00"},
            ]
        }
        put_res = self.client.put("/api/v1/availability/", payload, format="json")
        self.assertEqual(put_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(put_res.data["rules"]), 2)

        get_res = self.client.get("/api/v1/availability/")
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(get_res.data["rules"]), 2)

    def test_availability_check_endpoint(self):
        res = self.client.post(
            "/api/v1/events/check-availability/",
            {"start_at": "2026-12-01T10:00:00Z", "end_at": "2026-12-01T14:00:00Z"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("available", res.data)
        self.assertIn("schedule_conflict", res.data)

    def test_availability_put_invalid_rule_rollback(self):
        # First set 1 valid rule
        self.client.put(
            "/api/v1/availability/",
            {"rules": [{"weekday": 1, "start_time": "09:00:00", "end_time": "12:00:00"}]},
            format="json",
        )
        self.assertEqual(VolunteerAvailabilityRules.objects.filter(user=self.user).count(), 1)

        # Submit batch with an invalid weekday (8)
        invalid_payload = {
            "rules": [
                {"weekday": 2, "start_time": "10:00:00", "end_time": "12:00:00"},
                {"weekday": 8, "start_time": "10:00:00", "end_time": "12:00:00"},
            ]
        }
        res = self.client.put("/api/v1/availability/", invalid_payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Verify previous rules were preserved via transaction rollback
        self.assertEqual(VolunteerAvailabilityRules.objects.filter(user=self.user).count(), 1)
        self.assertEqual(VolunteerAvailabilityRules.objects.filter(user=self.user).first().weekday, 1)

    # -------------------------------------------------------------------------
    # Public UUID Lookup & Coordinator Scan (W24)
    # -------------------------------------------------------------------------
    def test_lookup_user_by_uuid_t1_minimal_public_card(self):
        other_user = _make_user(name="Target Volunteer")
        res = self.client.get(f"/api/v1/users/by-uuid/{other_user.uuid}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["uuid"], str(other_user.uuid))
        self.assertEqual(res.data["display_name"], "Target Volunteer")

        # Field-level privacy masking: never exposes private/semi-private fields in T1
        self.assertNotIn("phone", res.data)
        self.assertNotIn("emergency_contact_name", res.data)
        self.assertNotIn("skills", res.data)
        self.assertNotIn("blood_type", res.data)

    def test_lookup_user_by_uuid_coordinator_t2_card(self):
        admin = _make_user(name="Admin User", is_admin=True, is_staff=True)
        coordinator = _make_user(name="Coordinator User", verification_status="verified")
        coord_prof = CoordinatorProfiles.objects.create(user=coordinator, status="pending")
        coord_prof.status = "approved"
        coord_prof.approved_by = admin
        coord_prof.approved_at = timezone.now()
        coord_prof.save()

        now = timezone.now()
        event = Events.objects.create(
            title="Tree Planting",
            owner=coord_prof,
            current_coordinator=coord_prof,
            start_at=now + timedelta(days=3),
            end_at=now + timedelta(days=3, hours=4),
            acceptance_mode="auto",
            max_participants=20,
        )
        from apps.events.models import EventPosts
        EventPosts.objects.create(
            event=event,
            title="Planter",
            required_headcount=10,
            status="open",
        )
        event.status = "published"
        event.save()

        # Volunteer has accepted application
        target_volunteer = _make_user(name="Accepted Volunteer")
        EventApplications.objects.create(
            event=event,
            user=target_volunteer,
            status="accepted",
        )

        coord_client = APIClient()
        coord_client.force_authenticate(user=coordinator)
        res = coord_client.get(f"/api/v1/users/by-uuid/{target_volunteer.uuid}/?event_id={event.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["uuid"], str(target_volunteer.uuid))
        self.assertIn("skills", res.data)
        self.assertIn("verification_status", res.data)
        self.assertEqual(res.data["event_id"], event.id)

    def test_lookup_user_by_uuid_regular_volunteer_with_event_id_falls_back_to_t1(self):
        # Regular volunteer passing ?event_id= gets strictly T1
        target_volunteer = _make_user(name="Target Volunteer")
        res = self.client.get(f"/api/v1/users/by-uuid/{target_volunteer.uuid}/?event_id=999")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["uuid"], str(target_volunteer.uuid))
        self.assertNotIn("skills", res.data)

    def test_lookup_user_by_uuid_masked_404_on_missing_or_inactive(self):
        res = self.client.get(f"/api/v1/users/by-uuid/{uuid.uuid4()}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Inactive/blocked user returns 404 masked
        blocked = _make_user(account_status="blocked", is_active=False)
        res_blocked = self.client.get(f"/api/v1/users/by-uuid/{blocked.uuid}/")
        self.assertEqual(res_blocked.status_code, status.HTTP_404_NOT_FOUND)

    def test_lookup_user_by_uuid_unauthenticated_returns_401(self):
        anon_client = APIClient()
        res = anon_client.get(f"/api/v1/users/by-uuid/{self.user.uuid}/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
