"""
apps/events/tests/test_bff_phase2_parity.py

Phase 2: Backend Service & Serializer Payload Completeness Tests.
Verifies:
1. C-19 / C-27 / P0-05: Complete T2 volunteer profile in coordinator application and unassigned lists.
2. C-25 / C-26 / V-28 / P0-03 / P0-04: Truthful application_id, assigned_at, event location, and attendance state in assignment payloads.
3. C-04 / P2-05: Coordinator managed events list metadata (description, purpose_type, location, landmark, coordinator_name, charity_fields).
4. V-38 / P1-14: Enriched and privacy-sanitized attendance history for volunteers.
5. V-03 / W159: PublicEventDetailView draft preview fallback with truthful coordinator_name, require_onboarding_ack, and qr_registration_enabled.
"""
from __future__ import annotations

from datetime import timedelta
import secrets

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.attendance.models import Attendance
from apps.events.models import CharityFields, EventApplications, EventPosts, Events
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import (
    application_service,
    assignment_service,
    attendance_service,
    coordinator_service,
    event_post_service,
    event_service,
)


def _unique_phone():
    return f"+959{secrets.randbelow(900000000) + 100000000}"


def _make_user(name, is_admin=False, verified=True, **kwargs):
    phone = normalize_phone(_unique_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
        account_status="active",
        **kwargs,
    )


def _make_approved_coordinator(admin, name="Coordinator"):
    user = _make_user(name, verified=True)
    coordinator_service.apply_for_coordinator(user, "Coordinator application statement")
    coordinator_service.approve_coordinator(admin, user.id, "Approved by admin")
    user.refresh_from_db()
    return user


class Phase2BFFPayloadCompletenessTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin User", is_admin=True)
        cls.coord = _make_approved_coordinator(cls.admin, "Lead Coordinator")
        cls.other_coord = _make_approved_coordinator(cls.admin, "Other Coordinator")

        cls.vol_accepted = _make_user(
            "Accepted Volunteer",
            verified=True,
            skills=["first_aid", "logistics"],
            physical_ok=True,
            good_eyesight=True,
            needs_glasses=False,
            can_lift_heavy=True,
            can_work_outdoor=True,
            has_leader_experience=True,
            new_to_volunteer=False,
            preferred_language="en",
            home_area="Downtown",
            needs_meal_support=True,
            needs_travel_support=False,
            accepts_unpaid=True,
        )
        cls.vol_pending = _make_user(
            "Pending Volunteer",
            verified=True,
            skills=["cooking"],
            physical_ok=False,
        )

        now = timezone.now()
        start = now + timedelta(days=5)
        end = start + timedelta(hours=6)

        CharityFields.objects.get_or_create(code="education", defaults={"label": "Education", "active": True})

        # 1. Draft event for preview test
        cls.draft_event = event_service.create_event(
            cls.coord,
            {
                "title": "Phase 2 Draft Charity Gala",
                "description": "Exclusive preview gala",
                "purpose_type": "charity_event",
                "location_name": "Grand Hall",
                "landmark_text": "Opposite City Hall",
                "start_at": start,
                "end_at": end,
                "require_onboarding_ack": True,
                "qr_registration_enabled": True,
            },
            charity_codes=["education"],
        )

        # 2. Auto-assign published/active event
        cls.auto_event = Events.objects.create(
            owner_id=cls.coord.id,
            current_coordinator_id=cls.coord.id,
            title="Phase 2 Active Clean-up Drive",
            description="Park cleanup event description",
            purpose_type="charity_event",
            location_name="Inya Lake Park",
            landmark_text="Near West Gate",
            start_at=start,
            end_at=end,
            acceptance_mode="auto",
            auto_assign_enabled=True,
            require_onboarding_ack=False,
        )
        cls.post = EventPosts.objects.create(
            event=cls.auto_event,
            title="Logistics Coordinator",
            required_headcount=10,
        )
        Events.objects.filter(id=cls.auto_event.id).update(status="published")
        Events.objects.filter(id=cls.auto_event.id).update(status="active")
        cls.auto_event.refresh_from_db()

        # 3. Manual event for pending application test
        cls.manual_event = Events.objects.create(
            owner_id=cls.coord.id,
            current_coordinator_id=cls.coord.id,
            title="Phase 2 Manual Review Event",
            description="Manual selection event",
            purpose_type="charity_event",
            location_name="Youth Center",
            start_at=start + timedelta(days=2),
            end_at=start + timedelta(days=2, hours=4),
            acceptance_mode="manual",
            auto_assign_enabled=False,
            require_onboarding_ack=False,
        )
        cls.manual_post = EventPosts.objects.create(
            event=cls.manual_event,
            title="Tutor",
            required_headcount=5,
        )
        Events.objects.filter(id=cls.manual_event.id).update(status="published")
        cls.manual_event.refresh_from_db()

    def setUp(self):
        self.client = APIClient()

    # -------------------------------------------------------------------------
    # 1. T2 Volunteer Profile Completeness in Applications (C-19, C-27, P0-05)
    # -------------------------------------------------------------------------

    def test_coordinator_application_list_contains_complete_t2_for_accepted(self):
        # Apply to auto event -> trigger automatically accepts and assigns
        app = application_service.apply_to_event(
            self.vol_accepted,
            self.auto_event.id,
            post_id=self.post.id,
            note="Excited to assist with logistics",
        )
        self.assertEqual(app.status, "accepted")

        self.client.force_authenticate(user=self.coord)
        url = f"/api/v1/coordinator/events/{self.auto_event.id}/applications/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        items = resp.data["results"] if isinstance(resp.data, dict) and "results" in resp.data else resp.data
        matched = [i for i in items if i["id"] == app.id]
        self.assertEqual(len(matched), 1)
        item = matched[0]

        # Verify complete T2 profile
        self.assertEqual(item["uuid"], str(self.vol_accepted.uuid))
        self.assertEqual(item["skills"], ["first_aid", "logistics"])
        self.assertTrue(item["physical_ok"])
        self.assertTrue(item["good_eyesight"])
        self.assertFalse(item["needs_glasses"])
        self.assertTrue(item["can_lift_heavy"])
        self.assertTrue(item["can_work_outdoor"])
        self.assertTrue(item["has_leader_experience"])
        self.assertFalse(item["new_to_volunteer"])
        self.assertEqual(item["preferred_language"], "en")
        self.assertEqual(item["home_area"], "Downtown")
        self.assertTrue(item["needs_meal_support"])
        self.assertFalse(item["needs_travel_support"])
        self.assertTrue(item["accepts_unpaid"])
        self.assertEqual(item["verification_status"], "verified")
        self.assertEqual(item["note"], "Excited to assist with logistics")

        # Verify strictly NO T3/T4 leaks
        self.assertNotIn("phone_hash", item)
        self.assertNotIn("phone_enc", item)
        self.assertNotIn("phone", item)
        self.assertNotIn("emergency_contact_phone", item)
        self.assertNotIn("emergency_contact_phone_enc", item)
        self.assertNotIn("blood_type", item)

    def test_coordinator_application_list_conceals_t2_for_pending_applications(self):
        # Apply to manual event -> status is pending
        app = application_service.apply_to_event(
            self.vol_pending,
            self.manual_event.id,
            post_id=self.manual_post.id,
            note="Applying for tutoring",
        )
        self.assertEqual(app.status, "pending")

        self.client.force_authenticate(user=self.coord)
        url = f"/api/v1/coordinator/events/{self.manual_event.id}/applications/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        items = resp.data["results"] if isinstance(resp.data, dict) and "results" in resp.data else resp.data
        matched = [i for i in items if i["id"] == app.id]
        self.assertEqual(len(matched), 1)
        item = matched[0]

        self.assertEqual(item["status"], "pending")
        self.assertEqual(item["note"], "Applying for tutoring")
        # T2 fields must NOT be present for pending
        self.assertNotIn("physical_ok", item)
        self.assertNotIn("good_eyesight", item)
        self.assertNotIn("can_work_outdoor", item)
        self.assertNotIn("preferred_language", item)

    def test_unassigned_accepted_service_enriches_t2_profile(self):
        # Create an accepted application that has NO assignment
        # On a published manual event, coordinator decides to accept an application
        app = application_service.apply_to_event(
            self.vol_accepted,
            self.manual_event.id,
            post_id=self.manual_post.id,
        )
        application_service.accept_application(self.coord, app.id)
        app.refresh_from_db()
        self.assertEqual(app.status, "accepted")

        # Now query unassigned accepted
        unassigned = assignment_service.get_unassigned_accepted(self.coord, self.manual_event.id)
        matched = [u for u in unassigned if u["application_id"] == app.id]
        self.assertEqual(len(matched), 1)
        row = matched[0]

        self.assertEqual(row["user_id"], self.vol_accepted.id)
        self.assertEqual(row["display_name"], self.vol_accepted.display_name)
        self.assertEqual(row["uuid"], str(self.vol_accepted.uuid))
        self.assertTrue(row["physical_ok"])
        self.assertTrue(row["good_eyesight"])
        self.assertTrue(row["can_work_outdoor"])
        self.assertEqual(row["preferred_language"], "en")
        self.assertEqual(row["verification_status"], "verified")

    # -------------------------------------------------------------------------
    # 2. Assignment Payload Truthfulness (C-25, C-26, V-28, P0-03, P0-04)
    # -------------------------------------------------------------------------

    def test_coordinator_and_volunteer_assignments_include_truthful_fields(self):
        # Auto event application produced assignment and attendance
        application_service.apply_to_event(
            self.vol_accepted,
            self.auto_event.id,
            post_id=self.post.id,
            note="Excited to assist with logistics",
        )
        self.client.force_authenticate(user=self.coord)
        url_coord = f"/api/v1/coordinator/events/{self.auto_event.id}/assignments/"
        resp_coord = self.client.get(url_coord)
        self.assertEqual(resp_coord.status_code, status.HTTP_200_OK)

        items_coord = resp_coord.data["results"] if "results" in resp_coord.data else resp_coord.data
        self.assertGreaterEqual(len(items_coord), 1)
        c_item = items_coord[0]

        # Verify coordinator assignment fields
        self.assertIn("application_id", c_item)
        self.assertIsNotNone(c_item["application_id"])
        self.assertEqual(c_item["event_id"], self.auto_event.id)
        self.assertEqual(c_item["event_title"], self.auto_event.title)
        self.assertIn("assigned_at", c_item)
        self.assertIsNotNone(c_item["assigned_at"])
        self.assertEqual(c_item["post_id"], self.post.id)

        # Volunteer queries own assignments
        self.client.force_authenticate(user=self.vol_accepted)
        url_vol = "/api/v1/me/assignments/"
        resp_vol = self.client.get(url_vol)
        self.assertEqual(resp_vol.status_code, status.HTTP_200_OK)

        items_vol = resp_vol.data["results"] if "results" in resp_vol.data else resp_vol.data
        self.assertGreaterEqual(len(items_vol), 1)
        v_item = [i for i in items_vol if i["event_id"] == self.auto_event.id][0]

        self.assertIn("application_id", v_item)
        self.assertEqual(v_item["application_id"], c_item["application_id"])
        self.assertEqual(v_item["location_name"], "Inya Lake Park")
        self.assertIn("assigned_at", v_item)
        self.assertIsNotNone(v_item["assigned_at"])
        self.assertIn("attendance_id", v_item)
        self.assertIn("attendance_status", v_item)
        self.assertEqual(v_item["attendance_status"], "expected")

    # -------------------------------------------------------------------------
    # 3. Coordinator Managed Events List Metadata (C-04, P2-05)
    # -------------------------------------------------------------------------

    def test_coordinator_events_list_metadata_enrichment(self):
        self.client.force_authenticate(user=self.coord)
        url = "/api/v1/coordinator/events/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        items = resp.data["results"] if "results" in resp.data else resp.data
        matched = [e for e in items if e["id"] == self.draft_event.id]
        self.assertEqual(len(matched), 1)
        event_dict = matched[0]

        self.assertEqual(event_dict["description"], "Exclusive preview gala")
        self.assertEqual(event_dict["purpose_type"], "charity_event")
        self.assertEqual(event_dict["location_name"], "Grand Hall")
        self.assertEqual(event_dict["landmark_text"], "Opposite City Hall")
        self.assertEqual(event_dict["coordinator_name"], "Lead Coordinator")
        self.assertEqual(event_dict["charity_fields"], ["education"])

    # -------------------------------------------------------------------------
    # 4. Sanitized Volunteer Attendance History (V-38, P1-14)
    # -------------------------------------------------------------------------

    def test_volunteer_attendance_history_enrichment_and_privacy(self):
        # Apply to auto event to generate assignment and attendance
        application_service.apply_to_event(
            self.vol_accepted,
            self.auto_event.id,
            post_id=self.post.id,
            note="Excited to assist with logistics",
        )
        # Check-in volunteer via manual checkin
        attendance_service.manual_check_in(self.coord, self.auto_event.id, self.vol_accepted.id)

        self.client.force_authenticate(user=self.vol_accepted)
        url = "/api/v1/me/attendance/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        records = resp.data["results"]
        self.assertGreaterEqual(len(records), 1)
        rec = [r for r in records if r["event_id"] == self.auto_event.id][0]

        self.assertEqual(rec["event_title"], self.auto_event.title)
        self.assertEqual(rec["location_name"], "Inya Lake Park")
        self.assertIsNotNone(rec["assignment_id"])
        self.assertEqual(rec["post_id"], self.post.id)
        self.assertEqual(rec["post_title"], "Logistics Coordinator")
        self.assertIsNotNone(rec["schedule_start"])
        self.assertIsNotNone(rec["schedule_end"])
        self.assertEqual(rec["status"], "checked_in")

        # Strict BR-PRIV-T4 assertion: raw coordinates MUST NEVER be present
        self.assertNotIn("latitude", rec)
        self.assertNotIn("longitude", rec)
        self.assertNotIn("checkin_latitude", rec)
        self.assertNotIn("checkin_longitude", rec)
        self.assertNotIn("accuracy_m", rec)

    # -------------------------------------------------------------------------
    # 5. Draft Event Preview Fallback (V-03, W159)
    # -------------------------------------------------------------------------

    def test_public_event_detail_preview_draft_fallback(self):
        # Event manager can preview draft event
        self.client.force_authenticate(user=self.coord)
        url = f"/api/v1/events/{self.draft_event.id}/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        data = resp.data
        self.assertEqual(data["id"], self.draft_event.id)
        self.assertEqual(data["title"], "Phase 2 Draft Charity Gala")
        self.assertEqual(data["coordinator_name"], "Lead Coordinator")
        self.assertTrue(data["require_onboarding_ack"])
        self.assertTrue(data["qr_registration_enabled"])
        self.assertEqual(data["charity_fields"], ["education"])

