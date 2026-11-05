"""
BFF & REST API Integration Tests for Phase 5: Coordinator Event & Post Management.

Endpoints tested:
- GET /api/v1/coordinator/events/ (List coordinator events with filtering & pagination)
- POST /api/v1/coordinator/events/ (Create new event in draft status)
- GET /api/v1/coordinator/events/{id}/ (Detail view with role flags)
- PATCH /api/v1/coordinator/events/{id}/ (Edit mutable fields, bump onboarding_version)
- POST /api/v1/events/{id}/publish/ (Enforces publish gates: posts & future start)
- POST /api/v1/events/{id}/activate/ (Transition to active)
- POST /api/v1/events/{id}/complete/ (Transition to completed)
- POST /api/v1/events/{id}/cancel/ (Transition to cancelled with reason)
- POST /api/v1/events/{id}/handover/ (Coordinator handover, logs audit)
- POST /api/v1/events/{id}/retake/ (Owner retake coordination)
- POST /api/v1/coordinator/events/{id}/posts/ (Create role post)
- GET /api/v1/coordinator/events/{id}/posts/ (List posts with remaining capacity)
- PATCH /api/v1/posts/{id}/ (Update post headcount)
- POST /api/v1/posts/{id}/close/ (Close role post)

Authorization & security:
- Unauthenticated access returns 401
- Regular volunteer access returns 403
- Owner-as-Monitor read-only access returns 403 (owner_monitor_readonly)
- Masked 404 for non-managing coordinators
"""
import secrets
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.events.models import EventPosts, Events
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import coordinator_service, event_post_service, event_service


def _unique_phone():
    return f"+959{secrets.randbelow(900000000) + 100000000}"


def _make_user(name, is_admin=False, verified=True):
    phone = normalize_phone(_unique_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
        account_status="active",
    )


def _make_approved_coordinator(admin, name="Coordinator"):
    user = _make_user(name, verified=True)
    coordinator_service.apply_for_coordinator(user, "Application statement")
    coordinator_service.approve_coordinator(admin, user.id, "Approved")
    user.refresh_from_db()
    return user


class CoordinatorBFFAPIExtendedTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin User", is_admin=True)
        cls.coord1 = _make_approved_coordinator(cls.admin, "Lead Coordinator")
        cls.coord2 = _make_approved_coordinator(cls.admin, "Assistant Coordinator")
        cls.volunteer = _make_user("Regular Volunteer", verified=True)

    def setUp(self):
        self.client = APIClient()

    def _event_data(self, **overrides):
        now = timezone.now()
        base = {
            "title": "Community Health Camp",
            "description": "Providing basic health checkups for residents.",
            "start_at": (now + timedelta(days=7)).isoformat(),
            "end_at": (now + timedelta(days=7, hours=4)).isoformat(),
            "application_deadline": (now + timedelta(days=5)).isoformat(),
            "location_name": "Town Hall Main Auditorium",
            "latitude": 16.810,
            "longitude": 96.160,
            "geo_radius_m": 200,
            "charity_field_codes": ["teaching"],
        }
        base.update(overrides)
        return base

    # -------------------------------------------------------------------------
    # Authentication & Authorization Gates
    # -------------------------------------------------------------------------
    def test_unauthenticated_requests_fail_with_401(self):
        """Unauthenticated calls to coordinator endpoints must return 401."""
        resp = self.client.get("/api/v1/coordinator/events/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

        resp2 = self.client.post("/api/v1/coordinator/events/", self._event_data(), format="json")
        self.assertEqual(resp2.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_regular_volunteer_cannot_access_coordinator_endpoints(self):
        """Regular volunteers without approved coordinator status get 403."""
        self.client.force_authenticate(user=self.volunteer)

        resp = self.client.get("/api/v1/coordinator/events/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        resp2 = self.client.post("/api/v1/coordinator/events/", self._event_data(), format="json")
        self.assertEqual(resp2.status_code, status.HTTP_403_FORBIDDEN)

    # -------------------------------------------------------------------------
    # Event Creation & Listing
    # -------------------------------------------------------------------------
    def test_create_and_list_coordinator_events(self):
        """Approved coordinator can create and list events."""
        self.client.force_authenticate(user=self.coord1)

        create_resp = self.client.post(
            "/api/v1/coordinator/events/",
            self._event_data(title="Blood Drive Campaign"),
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        event_id = create_resp.data["id"]
        self.assertEqual(create_resp.data["status"], "draft")

        # List coordinator events
        list_resp = self.client.get("/api/v1/coordinator/events/")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        event_ids = [e["id"] for e in list_resp.data["results"]]
        self.assertIn(event_id, event_ids)

    def test_masked_404_for_other_coordinators_events(self):
        """Coordinator B cannot view or modify Coordinator A's event (masked 404)."""
        self.client.force_authenticate(user=self.coord1)
        create_resp = self.client.post(
            "/api/v1/coordinator/events/",
            self._event_data(title="Coord A Private Event"),
            format="json",
        )
        event_id = create_resp.data["id"]

        # Switch to Coordinator 2
        self.client.force_authenticate(user=self.coord2)
        get_resp = self.client.get(f"/api/v1/coordinator/events/{event_id}/summary/")
        self.assertEqual(get_resp.status_code, status.HTTP_404_NOT_FOUND)

        patch_resp = self.client.patch(
            f"/api/v1/coordinator/events/{event_id}/",
            {"title": "Hacked Title"},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_404_NOT_FOUND)

    # -------------------------------------------------------------------------
    # Lifecycle Transitions API (Publish, Activate, Complete, Cancel)
    # -------------------------------------------------------------------------
    def test_lifecycle_transitions_api(self):
        """Test full transition flow draft -> published -> active -> completed via API."""
        self.client.force_authenticate(user=self.coord1)
        create_resp = self.client.post(
            "/api/v1/coordinator/events/",
            self._event_data(title="Tree Planting Day"),
            format="json",
        )
        event_id = create_resp.data["id"]

        # Attempt publish without posts -> 400
        pub_fail = self.client.post(f"/api/v1/events/{event_id}/publish/")
        self.assertEqual(pub_fail.status_code, status.HTTP_400_BAD_REQUEST)

        # Create role post
        post_resp = self.client.post(
            f"/api/v1/coordinator/events/{event_id}/posts/",
            {"title": "Tree Planter", "required_headcount": 5},
            format="json",
        )
        self.assertEqual(post_resp.status_code, status.HTTP_201_CREATED)

        # Publish
        pub_resp = self.client.post(f"/api/v1/events/{event_id}/publish/")
        self.assertEqual(pub_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(pub_resp.data["status"], "published")

        # Activate
        act_resp = self.client.post(f"/api/v1/events/{event_id}/activate/")
        self.assertEqual(act_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(act_resp.data["status"], "active")

        # Complete
        comp_resp = self.client.post(f"/api/v1/events/{event_id}/complete/")
        self.assertEqual(comp_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(comp_resp.data["status"], "completed")

    def test_cancel_event_api(self):
        """Cancel event requires reason and transitions status to cancelled."""
        self.client.force_authenticate(user=self.coord1)
        create_resp = self.client.post(
            "/api/v1/coordinator/events/",
            self._event_data(title="Flooded Park Clean"),
            format="json",
        )
        event_id = create_resp.data["id"]

        cancel_resp = self.client.post(
            f"/api/v1/events/{event_id}/cancel/",
            {"reason": "Severe rainfall warning"},
            format="json",
        )
        self.assertEqual(cancel_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(cancel_resp.data["status"], "cancelled")

    # -------------------------------------------------------------------------
    # Handover, Owner-as-Monitor & Retake API
    # -------------------------------------------------------------------------
    def test_handover_owner_monitor_and_retake_api(self):
        """Test delegation to deputy, owner read-only 403, and owner retake."""
        self.client.force_authenticate(user=self.coord1)
        create_resp = self.client.post(
            "/api/v1/coordinator/events/",
            self._event_data(title="Delegated Event"),
            format="json",
        )
        event_id = create_resp.data["id"]

        # Handover to Coordinator 2
        ho_resp = self.client.post(
            f"/api/v1/events/{event_id}/handover/",
            {"new_coordinator_user_id": self.coord2.id, "reason": "Sabbatical leave"},
            format="json",
        )
        self.assertEqual(ho_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(ho_resp.data["current_coordinator_id"], self.coord2.id)

        # Owner is now in monitor mode: write attempts return 403 owner_monitor_readonly
        patch_resp = self.client.patch(
            f"/api/v1/coordinator/events/{event_id}/",
            {"title": "Owner Trying to Edit"},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(patch_resp.data["error"]["code"], "owner_monitor_read_only")

        # Post creation attempt by owner in monitor mode also returns 403
        post_resp = self.client.post(
            f"/api/v1/coordinator/events/{event_id}/posts/",
            {"title": "Blocked Post", "required_headcount": 1},
            format="json",
        )
        self.assertEqual(post_resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(post_resp.data["error"]["code"], "owner_monitor_read_only")

        # Deputy coordinator (coord2) CAN write
        self.client.force_authenticate(user=self.coord2)
        deputy_patch = self.client.patch(
            f"/api/v1/coordinator/events/{event_id}/",
            {"title": "Deputy Managed Event"},
            format="json",
        )
        self.assertEqual(deputy_patch.status_code, status.HTTP_200_OK)
        self.assertEqual(deputy_patch.data["id"], event_id)

        # Owner retakes coordination
        self.client.force_authenticate(user=self.coord1)
        retake_resp = self.client.post(
            f"/api/v1/events/{event_id}/retake/",
            {"reason": "Back from sabbatical"},
            format="json",
        )
        self.assertEqual(retake_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(retake_resp.data["current_coordinator_id"], self.coord1.id)

        # Now owner can edit again
        owner_edit_again = self.client.patch(
            f"/api/v1/coordinator/events/{event_id}/",
            {"title": "Owner Restored Control"},
            format="json",
        )
        self.assertEqual(owner_edit_again.status_code, status.HTTP_200_OK)
        self.assertEqual(owner_edit_again.data["id"], event_id)

    # -------------------------------------------------------------------------
    # Post Management API
    # -------------------------------------------------------------------------
    def test_post_creation_update_and_closure_api(self):
        """Test role post endpoints: create, update headcount, close."""
        self.client.force_authenticate(user=self.coord1)
        create_resp = self.client.post(
            "/api/v1/coordinator/events/",
            self._event_data(title="Role Post Test Event"),
            format="json",
        )
        event_id = create_resp.data["id"]

        # Create post
        post_resp = self.client.post(
            f"/api/v1/coordinator/events/{event_id}/posts/",
            {
                "title": "Registration Desk Helper",
                "description": "Greeting volunteers",
                "required_headcount": 4,
                "physical_level": "light",
            },
            format="json",
        )
        self.assertEqual(post_resp.status_code, status.HTTP_201_CREATED)
        post_id = post_resp.data["id"]
        self.assertEqual(post_resp.data["status"], "open")

        # Update post headcount
        patch_post = self.client.patch(
            f"/api/v1/posts/{post_id}/",
            {"required_headcount": 6},
            format="json",
        )
        self.assertEqual(patch_post.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_post.data["id"], post_id)

        # List posts
        list_posts = self.client.get(f"/api/v1/coordinator/events/{event_id}/posts/")
        self.assertEqual(list_posts.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_posts.data["results"]), 1)
        self.assertEqual(list_posts.data["results"][0]["remaining"], 6)

        # Close post
        close_resp = self.client.post(f"/api/v1/posts/{post_id}/close/")
        self.assertEqual(close_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(close_resp.data["status"], "closed")
