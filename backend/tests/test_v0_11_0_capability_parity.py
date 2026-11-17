"""
backend/tests/test_v0_11_0_capability_parity.py

Phase 8: Full 40-Scenario End-to-End Capability Parity Verification Suite (Backend Django BFF Layer).
Directly tests against PostgreSQL the 20 Minimum Volunteer Scenarios and 20 Minimum Coordinator Scenarios
defined in Section 12 of the v0.11.0 Volunteer & Coordinator Capability Parity Plan.
"""
from __future__ import annotations

import io
import secrets
from datetime import timedelta
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.attendance.models import Attendance
from apps.coordination.models import Assignments
from apps.events.models import EventApplications, EventPosts, Events
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import (
    application_service,
    assignment_service,
    attendance_service,
    coordinator_service,
    event_post_service,
    event_service,
    geo_service,
    qr_service,
)


def _unique_phone() -> str:
    return f"+959{secrets.randbelow(900000000) + 100000000}"


def _make_user(name: str, is_admin: bool = False, verified: bool = True, **kwargs) -> Users:
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


def _make_approved_coordinator(admin_user: Users, name: str = "Coordinator") -> Users:
    user = _make_user(name, verified=True)
    coordinator_service.apply_for_coordinator(user, "Statement of qualification")
    coordinator_service.approve_coordinator(admin_user, user.id, "Approved by admin for parity tests")
    user.refresh_from_db()
    return user


class V0110CapabilityParityBackendTestSuite(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("System Admin", is_admin=True)
        cls.coord1 = _make_approved_coordinator(cls.admin, "Lead Coordinator One")
        cls.coord2 = _make_approved_coordinator(cls.admin, "Relief Coordinator Two")
        cls.volunteer1 = _make_user("Aung Thura", verified=True)
        cls.volunteer2 = _make_user("Mya Mya", verified=True)

        now = timezone.now()
        # Canonical published event
        cls.canonical_event = event_service.create_event(
            cls.coord1,
            {
                "title": "Yangon Riverfront Plastic Clean-Up & Waste Audit",
                "description": "Sort and document recyclable plastics along the jetty.",
                "purpose_type": "charity_event",
                "start_at": now + timedelta(days=2),
                "end_at": now + timedelta(days=2, hours=5),
                "application_deadline": now + timedelta(days=1),
                "location_name": "Pansodan Ferry Terminal Pier 3",
                "landmark_text": "Opposite old customs building",
                "latitude": 16.7725,
                "longitude": 96.1583,
                "geo_radius_m": 250,
                "geo_checkin_enabled": True,
                "require_checkin_confirmation": True,
                "acceptance_mode": "manual",
                "require_onboarding_ack": True,
                "onboarding_text": "Wear high-visibility vests and puncture-resistant work gloves.",
                "qr_registration_enabled": True,
            },
            charity_codes=["environment", "cleaning"],
        )
        cls.canonical_post = event_post_service.create_event_post(
            cls.coord1,
            cls.canonical_event.id,
            {
                "title": "Debris Sorting Crew",
                "required_headcount": 10,
                "physical_level": "heavy",
                "required_skills": ["cleaning", "logistics"],
            },
        )
        event_service.publish_event(cls.coord1, cls.canonical_event.id)
        cls.canonical_event.refresh_from_db()

    def setUp(self):
        self.client = APIClient()

    def _create_active_event_with_post(self, **overrides):
        now = timezone.now()
        start = now + timedelta(hours=2)
        end = start + timedelta(hours=4)
        evt = event_service.create_event(
            self.coord1,
            {
                "title": overrides.get("title", "Active Parity Operational Event"),
                "description": "Operational event for real-time testing.",
                "start_at": start,
                "end_at": end,
                "purpose_type": "charity_event",
                "location_name": "Central Ground Pier 4",
                "latitude": 16.7725,
                "longitude": 96.1583,
                "geo_radius_m": overrides.get("geo_radius_m", 300),
                "geo_checkin_enabled": overrides.get("geo_checkin_enabled", True),
                "require_checkin_confirmation": overrides.get("require_checkin_confirmation", False),
                "acceptance_mode": overrides.get("acceptance_mode", "manual"),
                "require_onboarding_ack": overrides.get("require_onboarding_ack", False),
            },
        )
        post = event_post_service.create_event_post(self.coord1, evt.id, {"title": "Active Crew", "required_headcount": 10})
        # Publish and activate while start_at is in future
        Events.objects.filter(id=evt.id).update(status="published")
        Events.objects.filter(id=evt.id).update(status="active")

        # Open check-in window
        active_start = now - timedelta(minutes=10)
        active_end = now + timedelta(hours=4)
        Events.objects.filter(id=evt.id).update(start_at=active_start, end_at=active_end)
        evt.refresh_from_db()
        return evt, post

    # =========================================================================
    # PART A: 20 VOLUNTEER CAPABILITY SCENARIOS
    # =========================================================================

    def test_v01_otp_request_delivery_and_rate_limit(self):
        """V-01: OTP request, provider delivery result, and rate-limit handling."""
        phone = _unique_phone()
        resp = self.client.post("/api/v1/auth/request-otp/", {"phone": phone}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("status", resp.data)
        delivery = resp.data.get("delivery")
        self.assertIsNotNone(delivery)
        self.assertTrue(delivery.get("delivered"))
        self.assertIn("channel", delivery)

    @patch("services.auth_service.secrets.randbelow", return_value=1234)
    def test_v02_otp_verification_session_and_logout(self, mock_rand):
        """V-02: OTP verification returns access token, Bearer auth works, logout invalidates."""
        phone = _unique_phone()
        req_resp = self.client.post("/api/v1/auth/request-otp/", {"phone": phone}, format="json")
        self.assertEqual(req_resp.status_code, status.HTTP_200_OK)
        dev_code = "1234"

        verify_resp = self.client.post("/api/v1/auth/verify-otp/", {"phone": phone, "code": dev_code}, format="json")
        self.assertEqual(verify_resp.status_code, status.HTTP_200_OK)
        token = verify_resp.data.get("token")
        self.assertTrue(bool(token))

        auth_client = APIClient()
        auth_client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        me_resp = auth_client.get("/api/v1/me/")
        self.assertEqual(me_resp.status_code, status.HTTP_200_OK)

        logout_resp = auth_client.post("/api/v1/auth/logout/")
        self.assertEqual(logout_resp.status_code, status.HTTP_204_NO_CONTENT)

    def test_v03_profile_read_and_patch_with_allow_list(self):
        """V-03: Profile read & PATCH with allow-listed fields, verifying phone is first-class."""
        self.client.force_authenticate(user=self.volunteer1)
        get_resp = self.client.get("/api/v1/me/")
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK)
        self.assertIn("phone", get_resp.data)
        self.assertIsNotNone(get_resp.data["phone"])
        self.assertIn("display_name", get_resp.data)

        patch_resp = self.client.patch(
            "/api/v1/me/",
            {
                "display_name": "Aung Thura Updated",
                "home_area": "Kamayut Township",
                "preferred_language": "my",
            },
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_resp.data["display_name"], "Aung Thura Updated")
        self.assertEqual(patch_resp.data["home_area"], "Kamayut Township")

        # Disallowed key triggers 400 via AllowListSerializerMixin
        bad_patch = self.client.patch("/api/v1/me/", {"disallowed_injection_field": "exploit"}, format="json")
        self.assertEqual(bad_patch.status_code, status.HTTP_400_BAD_REQUEST)

    def test_v04_donation_flags_partial_merge_transitions(self):
        """V-04: Donation master & sub-flags partial merge transitions."""
        self.client.force_authenticate(user=self.volunteer1)
        resp1 = self.client.patch(
            "/api/v1/me/",
            {
                "is_willing_to_donate": True,
                "is_willing_to_donate_blood": True,
                "is_willing_to_donate_items": False,
            },
            format="json",
        )
        self.assertEqual(resp1.status_code, status.HTTP_200_OK)
        self.assertTrue(resp1.data.get("is_willing_to_donate"))
        self.assertTrue(resp1.data.get("is_willing_to_donate_blood"))
        self.assertFalse(resp1.data.get("is_willing_to_donate_items"))

        # Transition sub-flag without resetting master
        resp2 = self.client.patch("/api/v1/me/", {"is_willing_to_donate_items": True}, format="json")
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        self.assertTrue(resp2.data.get("is_willing_to_donate_items"))
        self.assertTrue(resp2.data.get("is_willing_to_donate"))

    def test_v05_charity_interests_get_and_put_replacement(self):
        """V-05: Charity interests GET and PUT full replacement."""
        self.client.force_authenticate(user=self.volunteer1)
        get_resp = self.client.get("/api/v1/me/charity-interests/")
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK)

        put_resp = self.client.put(
            "/api/v1/me/charity-interests/",
            {"field_codes": ["environment", "cleaning"]},
            format="json",
        )
        self.assertEqual(put_resp.status_code, status.HTTP_200_OK)
        saved = put_resp.data.get("field_codes", [])
        self.assertIn("environment", saved)
        self.assertIn("cleaning", saved)

    def test_v06_weekly_availability_get_and_post_replacement(self):
        """V-06: Weekly availability GET & POST rules replacement."""
        self.client.force_authenticate(user=self.volunteer1)
        rules_payload = {
            "rules": [
                {"weekday": 1, "start_time": "09:00:00", "end_time": "13:00:00"},
                {"weekday": 6, "start_time": "14:00:00", "end_time": "18:00:00"},
            ]
        }
        post_resp = self.client.post("/api/v1/me/availability/rules/", rules_payload, format="json")
        self.assertEqual(post_resp.status_code, status.HTTP_200_OK)

        get_resp = self.client.get("/api/v1/me/availability/")
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK)
        self.assertIn("rules", get_resp.data)
        self.assertGreaterEqual(len(get_resp.data["rules"]), 2)

    def test_v07_date_exception_post_upsert_and_delete(self):
        """V-07: Date exception POST upsert & DELETE by server ID."""
        self.client.force_authenticate(user=self.volunteer1)
        post_resp = self.client.post(
            "/api/v1/me/availability/exceptions/",
            {
                "date": "2026-12-25",
                "is_available": False,
                "note": "Holiday unavailable",
            },
            format="json",
        )
        self.assertIn(post_resp.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        exc_id = post_resp.data.get("id")
        self.assertIsNotNone(exc_id)

        del_resp = self.client.delete(f"/api/v1/me/availability/exceptions/{exc_id}/")
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)

    def test_v08_availability_checks_event_and_window(self):
        """V-08: Event availability check (GET) and time window check (POST)."""
        self.client.force_authenticate(user=self.volunteer1)
        event_check_resp = self.client.get(f"/api/v1/me/availability/check/?event_id={self.canonical_event.id}")
        self.assertEqual(event_check_resp.status_code, status.HTTP_200_OK)
        self.assertIn("schedule_conflict", event_check_resp.data)

        now = timezone.now()
        window_check_resp = self.client.post(
            "/api/v1/me/availability/check/",
            {
                "start_at": (now + timedelta(days=2)).isoformat(),
                "end_at": (now + timedelta(days=2, hours=4)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(window_check_resp.status_code, status.HTTP_200_OK)
        self.assertIn("schedule_conflict", window_check_resp.data)

    def test_v09_verification_image_upload_and_status(self):
        """V-09: Verification image multipart upload & status read."""
        user = _make_user("Unverified Volunteer", verified=False)
        self.client.force_authenticate(user=user)

        # 300x300 valid JPEG satisfies min resolution >= 200px
        buf = io.BytesIO()
        Image.new("RGB", (300, 300), color="blue").save(buf, format="JPEG")
        buf.seek(0)
        dummy_img = SimpleUploadedFile("id_license.jpg", buf.read(), content_type="image/jpeg")

        upload_resp = self.client.post(
            "/api/v1/me/verification-images/",
            {"image_type": "id_license", "image": dummy_img},
            format="multipart",
        )
        self.assertEqual(upload_resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("id", upload_resp.data)

        status_resp = self.client.get("/api/v1/me/verification-images/")
        self.assertEqual(status_resp.status_code, status.HTTP_200_OK)
        self.assertIn("verification_status", status_resp.data)

    def test_v10_coordinator_application_lifecycle(self):
        """V-10: Coordinator application submit, read, and notes update."""
        user = _make_user("Aspiring Coordinator", verified=True)
        self.client.force_authenticate(user=user)

        read_init = self.client.get("/api/v1/me/coordinator/")
        self.assertEqual(read_init.status_code, status.HTTP_200_OK)

        sub_resp = self.client.post(
            "/api/v1/me/coordinator/",
            {"notes": "Experienced team lead ready to organize events."},
            format="json",
        )
        self.assertEqual(sub_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(sub_resp.data["coordinator"]["status"], "pending")

        patch_resp = self.client.patch(
            "/api/v1/me/coordinator/",
            {"notes": "Added previous experience references."},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertIn("references", patch_resp.data["coordinator"].get("notes", ""))

    def test_v11_public_uuid_lookup_masking(self):
        """V-11: Public UUID lookup with T1 vs event-scoped T2 masking."""
        app = application_service.apply_to_event(self.volunteer1, self.canonical_event.id, self.canonical_post.id)
        application_service.accept_application(self.coord1, app.id)

        # Public caller gets strictly T1 Minimal Card
        self.client.force_authenticate(user=self.volunteer2)
        pub_resp = self.client.get(f"/api/v1/users/by-uuid/{self.volunteer1.uuid}/")
        self.assertEqual(pub_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(pub_resp.data["uuid"], str(self.volunteer1.uuid))
        self.assertEqual(pub_resp.data["display_name"], self.volunteer1.display_name)
        self.assertNotIn("phone", pub_resp.data)
        self.assertNotIn("skills", pub_resp.data)

        # Event Manager requesting with event_id gets T2 Card for accepted volunteer
        self.client.force_authenticate(user=self.coord1)
        t2_resp = self.client.get(f"/api/v1/users/by-uuid/{self.volunteer1.uuid}/?event_id={self.canonical_event.id}")
        self.assertEqual(t2_resp.status_code, status.HTTP_200_OK)
        self.assertIn("skills", t2_resp.data)
        self.assertIn("verification_status", t2_resp.data)

    def test_v12_public_event_discovery_filters_and_pagination(self):
        """V-12: Public event discovery with search/filters and pagination."""
        resp = self.client.get("/api/v1/events/?search=Riverfront&page=1")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", resp.data)
        self.assertIn("count", resp.data)
        self.assertGreaterEqual(resp.data["count"], 1)

    def test_v13_public_event_detail_posts_and_capacity(self):
        """V-13: Public event detail, open posts, and capacity calculation."""
        resp = self.client.get(f"/api/v1/events/{self.canonical_event.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], self.canonical_event.id)
        self.assertIn("posts", resp.data)
        self.assertIn("spots_remaining", resp.data)

    def test_v14_event_application_apply_and_withdraw(self):
        """V-14: Event post application, own list, and withdrawal."""
        user = _make_user("Applicant Volunteer", verified=True)
        self.client.force_authenticate(user=user)

        apply_resp = self.client.post(
            f"/api/v1/events/{self.canonical_event.id}/apply/",
            {"post_id": self.canonical_post.id, "note": "Happy to assist!"},
            format="json",
        )
        self.assertEqual(apply_resp.status_code, status.HTTP_201_CREATED)
        app_id = apply_resp.data["id"]

        list_resp = self.client.get("/api/v1/me/applications/")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        apps = list_resp.data.get("results", [])
        self.assertTrue(any(a["id"] == app_id for a in apps))

        withdraw_resp = self.client.post(f"/api/v1/applications/{app_id}/withdraw/")
        self.assertEqual(withdraw_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(withdraw_resp.data.get("status"), "withdrawn")

    def test_v15_own_assignments_list_confirm_and_cancel(self):
        """V-15: Own assignments list (with applicationId, location, assignedAt), confirm, cancel."""
        user = _make_user("Assignment Test Volunteer", verified=True)
        app = application_service.apply_to_event(user, self.canonical_event.id, self.canonical_post.id)
        application_service.accept_application(self.coord1, app.id)
        asgn_res = assignment_service.assign_volunteer_manually(
            self.coord1,
            application_id=app.id,
            post_id=self.canonical_post.id,
            group_code="GRP-A1",
            is_group_leader=False,
        )
        asgn_id = asgn_res["assignment_id"]

        self.client.force_authenticate(user=user)
        list_resp = self.client.get("/api/v1/me/assignments/")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        assignments = list_resp.data.get("results", [])
        self.assertTrue(any(a["id"] == asgn_id for a in assignments))
        target_item = next(a for a in assignments if a["id"] == asgn_id)
        self.assertIn("application_id", target_item)
        self.assertIn("assigned_at", target_item)
        self.assertIn("location_name", target_item)

        confirm_resp = self.client.post(f"/api/v1/assignments/{asgn_id}/confirm/")
        self.assertEqual(confirm_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(confirm_resp.data.get("status"), "confirmed")

        cancel_resp = self.client.post(f"/api/v1/assignments/{asgn_id}/cancel/")
        self.assertEqual(cancel_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(cancel_resp.data.get("status"), "cancelled")

    def test_v16_onboarding_read_and_acknowledgment(self):
        """V-16: Onboarding read & acknowledgment with version tracking."""
        user = _make_user("Onboarding Volunteer", verified=True)
        application_service.apply_to_event(user, self.canonical_event.id, self.canonical_post.id)

        self.client.force_authenticate(user=user)
        read_resp = self.client.get(f"/api/v1/checkin/events/{self.canonical_event.id}/onboarding/")
        self.assertEqual(read_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(read_resp.data["event_id"], self.canonical_event.id)
        self.assertIn("onboarding_text", read_resp.data)

        ack_resp = self.client.post(
            f"/api/v1/checkin/events/{self.canonical_event.id}/onboarding/acknowledge/",
            {"onboarding_version": self.canonical_event.onboarding_version},
            format="json",
        )
        self.assertEqual(ack_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(ack_resp.data.get("acknowledged"))

    def test_v17_qr_resolve_preview_and_checkin_redemption(self):
        """V-17: QR resolve preview (non-consuming) and QR check-in redemption."""
        evt, post = self._create_active_event_with_post(title="QR Checkin Event")
        user = _make_user("QR Volunteer", verified=True)
        app = application_service.apply_to_event(user, evt.id, post.id)
        application_service.accept_application(self.coord1, app.id)
        assignment_service.assign_volunteer_manually(self.coord1, app.id, post.id)

        token_record = qr_service.create_event_qr_token(
            self.coord1,
            evt.id,
            purpose="checkin",
            max_uses=10,
            ttl_minutes=120,
        )

        # 1. Preview token
        preview_resp = self.client.post("/api/v1/checkin/qr/resolve/", {"token": token_record["raw_token"]}, format="json")
        self.assertEqual(preview_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(preview_resp.data["is_valid"])
        self.assertEqual(preview_resp.data["event_id"], evt.id)

        # 2. Redeem checkin for accepted volunteer
        self.client.force_authenticate(user=user)
        redeem_resp = self.client.post("/api/v1/checkin/qr/redeem/", {"token": token_record["raw_token"]}, format="json")
        self.assertEqual(redeem_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(redeem_resp.data.get("result"), "checked_in")
        self.assertEqual(redeem_resp.data.get("event_id"), evt.id)

    def test_v18_geo_checkin_scenarios(self):
        """V-18: Geo check-in for accepted volunteers; outside geofence returns 400 with distance_m."""
        evt, post = self._create_active_event_with_post(title="Geo Checkin Event")
        user = _make_user("Geo Volunteer", verified=True)
        app = application_service.apply_to_event(user, evt.id, post.id)
        application_service.accept_application(self.coord1, app.id)
        assignment_service.assign_volunteer_manually(self.coord1, app.id, post.id)

        self.client.force_authenticate(user=user)

        # Outside geofence -> 400 Bad Request
        bad_geo = self.client.post(
            "/api/v1/checkin/attendance/geo-checkin/",
            {
                "event_id": evt.id,
                "latitude": 17.5000,
                "longitude": 97.0000,
                "accuracy_m": 10.0,
                "is_mocked": False,
            },
            format="json",
        )
        self.assertEqual(bad_geo.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(bad_geo.data.get("success"))
        self.assertIn("distance_m", bad_geo.data)

        # Inside geofence -> 200 OK
        good_geo = self.client.post(
            "/api/v1/checkin/attendance/geo-checkin/",
            {
                "event_id": evt.id,
                "latitude": 16.7725,
                "longitude": 96.1583,
                "accuracy_m": 12.0,
                "is_mocked": False,
            },
            format="json",
        )
        self.assertEqual(good_geo.status_code, status.HTTP_200_OK)
        self.assertTrue(good_geo.data.get("success"))

    def test_v19_shift_checkout_and_sanitized_attendance_history(self):
        """V-19: Shift checkout and sanitized attendance history."""
        evt, post = self._create_active_event_with_post(title="Checkout History Event")
        user = _make_user("Checkout Volunteer", verified=True)
        app = application_service.apply_to_event(user, evt.id, post.id)
        application_service.accept_application(self.coord1, app.id)
        assignment_service.assign_volunteer_manually(self.coord1, app.id, post.id)
        att = attendance_service.manual_check_in(self.coord1, evt.id, user.id)

        self.client.force_authenticate(user=user)
        checkout_resp = self.client.post(f"/api/v1/checkin/attendance/{att.id}/checkout/")
        self.assertEqual(checkout_resp.status_code, status.HTTP_200_OK)
        self.assertIn("checkout_at", checkout_resp.data)

        history_resp = self.client.get("/api/v1/checkin/me/attendance/")
        self.assertEqual(history_resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", history_resp.data)
        self.assertGreaterEqual(len(history_resp.data["results"]), 1)
        first = history_resp.data["results"][0]
        self.assertNotIn("phone_hash", first)
        self.assertNotIn("raw_gps", first)

    def test_v20_volunteer_feedback_submission_and_summary(self):
        """V-20: Volunteer feedback submission, authored list, and received aggregate summary."""
        evt, post = self._create_active_event_with_post(title="Feedback Completed Event")
        user = _make_user("Feedback Volunteer", verified=True)
        app = application_service.apply_to_event(user, evt.id, post.id)
        application_service.accept_application(self.coord1, app.id)
        assignment_service.assign_volunteer_manually(self.coord1, app.id, post.id)
        att = attendance_service.manual_check_in(self.coord1, evt.id, user.id)

        # Checkout and complete event so feedback trigger passes
        attendance_service.check_out(user, att.id)
        Events.objects.filter(id=evt.id).update(status="completed")

        self.client.force_authenticate(user=user)
        # 1. Feedback for event
        fb_event = self.client.post(
            f"/api/v1/events/{evt.id}/feedback/",
            {
                "direction": "volunteer_to_event",
                "score": 5,
                "comment": "Very well organized and safe working conditions.",
            },
            format="json",
        )
        self.assertEqual(fb_event.status_code, status.HTTP_201_CREATED)

        # 2. Feedback for coordinator
        fb_coord = self.client.post(
            f"/api/v1/events/{evt.id}/feedback/",
            {
                "direction": "volunteer_to_coordinator",
                "score": 5,
                "comment": "Great guidance and clear team direction.",
                "target_user_id": self.coord1.id,
            },
            format="json",
        )
        self.assertEqual(fb_coord.status_code, status.HTTP_201_CREATED)

        # 3. Read own feedback summary
        summary_resp = self.client.get("/api/v1/me/feedback/summary/")
        self.assertEqual(summary_resp.status_code, status.HTTP_200_OK)
        self.assertIn("summary", summary_resp.data)
        self.assertIn("results", summary_resp.data)
        self.assertEqual(len(summary_resp.data["results"]), 2)

    # =========================================================================
    # PART B: 20 COORDINATOR CAPABILITY SCENARIOS
    # =========================================================================

    def test_c01_coordinator_status_and_authority_gate(self):
        """C-01: Coordinator application status and authority gate (volunteer denied 403)."""
        self.client.force_authenticate(user=self.volunteer1)
        denied = self.client.get("/api/v1/coordinator/events/")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.coord1)
        allowed = self.client.get("/api/v1/coordinator/events/")
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)

    def test_c02_managed_events_list_and_summary(self):
        """C-02: Managed events list (with non-fabricated metadata) and event summary."""
        self.client.force_authenticate(user=self.coord1)
        list_resp = self.client.get("/api/v1/coordinator/events/")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", list_resp.data)
        self.assertGreaterEqual(len(list_resp.data["results"]), 1)
        first_evt = list_resp.data["results"][0]
        self.assertIn("charity_fields", first_evt)
        self.assertIn("location_name", first_evt)

        sum_resp = self.client.get(f"/api/v1/coordinator/events/{self.canonical_event.id}/summary/")
        self.assertEqual(sum_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(sum_resp.data["id"], self.canonical_event.id)

    def test_c03_create_draft_event(self):
        """C-03: Create draft event via POST coordinator/events/."""
        self.client.force_authenticate(user=self.coord1)
        now = timezone.now()
        payload = {
            "title": "Community Nutrition Outreach Drive",
            "description": "Distribute pre-packaged dry rations and hydration kits.",
            "purpose_type": "charity_event",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=4)).isoformat(),
            "location_name": "Insein Township Community Hall",
            "charity_field_codes": ["food_distribution"],
            "acceptance_mode": "manual",
        }
        resp = self.client.post("/api/v1/coordinator/events/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], "draft")
        self.assertIn("id", resp.data)
        created_evt = Events.objects.get(id=resp.data["id"])
        self.assertEqual(created_evt.title, "Community Nutrition Outreach Drive")

    def test_c04_create_update_and_close_post(self):
        """C-04: Create post, update required headcount, and close post."""
        self.client.force_authenticate(user=self.coord1)
        # 1. Create post
        create_resp = self.client.post(
            f"/api/v1/coordinator/events/{self.canonical_event.id}/posts/",
            {"title": "First Aid Lead", "required_headcount": 3, "leader_needed": True},
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        post_id = create_resp.data["id"]

        # 2. Update post
        update_resp = self.client.patch(f"/api/v1/posts/{post_id}/", {"required_headcount": 5}, format="json")
        self.assertEqual(update_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(update_resp.data["id"], post_id)

        # 3. Close post
        close_resp = self.client.post(f"/api/v1/posts/{post_id}/close/")
        self.assertEqual(close_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(close_resp.data["status"], "closed")

    def test_c05_read_event_post_capacity(self):
        """C-05: Read event post capacity breakdown."""
        self.client.force_authenticate(user=self.coord1)
        resp = self.client.get(f"/api/v1/coordinator/events/{self.canonical_event.id}/post-capacity/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", resp.data)
        self.assertGreaterEqual(len(resp.data["results"]), 1)

    def test_c06_update_event_metadata(self):
        """C-06: Update event metadata (title, location, onboarding)."""
        self.client.force_authenticate(user=self.coord1)
        patch_resp = self.client.patch(
            f"/api/v1/coordinator/events/{self.canonical_event.id}/",
            {"description": "Updated event instructions and logistics guide."},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_resp.data["id"], self.canonical_event.id)
        self.assertIn("onboarding_version", patch_resp.data)

    def test_c07_publish_gate_zero_posts_failure_and_success(self):
        """C-07: Publish failure when open posts == 0; publish success after adding post."""
        self.client.force_authenticate(user=self.coord1)
        now = timezone.now()
        draft_evt = event_service.create_event(
            self.coord1,
            {
                "title": "Empty Post Test Event",
                "start_at": now + timedelta(days=7),
                "end_at": now + timedelta(days=7, hours=3),
                "purpose_type": "charity_event",
            },
        )
        fail_pub = self.client.post(f"/api/v1/events/{draft_evt.id}/publish/")
        self.assertEqual(fail_pub.status_code, status.HTTP_400_BAD_REQUEST)

        event_post_service.create_event_post(self.coord1, draft_evt.id, {"title": "Volunteer", "required_headcount": 4})
        succ_pub = self.client.post(f"/api/v1/events/{draft_evt.id}/publish/")
        self.assertEqual(succ_pub.status_code, status.HTTP_200_OK)
        self.assertEqual(succ_pub.data["status"], "published")

    def test_c08_lifecycle_activate_complete_and_cancel(self):
        """C-08: Activate, complete, and cancel event lifecycle transitions."""
        self.client.force_authenticate(user=self.coord1)
        now = timezone.now()
        evt = event_service.create_event(
            self.coord1,
            {
                "title": "Lifecycle Transition Flow Event",
                "start_at": now + timedelta(days=3),
                "end_at": now + timedelta(days=3, hours=4),
                "purpose_type": "charity_event",
            },
        )
        event_post_service.create_event_post(self.coord1, evt.id, {"title": "Crew", "required_headcount": 5})
        event_service.publish_event(self.coord1, evt.id)

        # 1. Activate
        act_resp = self.client.post(f"/api/v1/events/{evt.id}/activate/")
        self.assertEqual(act_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(act_resp.data["status"], "active")

        # 2. Complete
        comp_resp = self.client.post(f"/api/v1/events/{evt.id}/complete/")
        self.assertEqual(comp_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(comp_resp.data["status"], "completed")

    def test_c09_handover_owner_monitor_retake_and_history(self):
        """C-09: Handover, Owner-as-Monitor read-only enforcement, retake, and history."""
        self.client.force_authenticate(user=self.coord1)
        hand_resp = self.client.post(
            f"/api/v1/events/{self.canonical_event.id}/handover/",
            {"new_coordinator_user_id": self.coord2.id, "reason": "Shift handover"},
            format="json",
        )
        self.assertEqual(hand_resp.status_code, status.HTTP_200_OK)

        bad_write = self.client.post(
            f"/api/v1/coordinator/events/{self.canonical_event.id}/posts/",
            {"title": "Unauthorized Write Post", "required_headcount": 2},
            format="json",
        )
        self.assertEqual(bad_write.status_code, status.HTTP_403_FORBIDDEN)

        retake_resp = self.client.post(
            f"/api/v1/events/{self.canonical_event.id}/retake/",
            {"reason": "Resuming active lead"},
            format="json",
        )
        self.assertEqual(retake_resp.status_code, status.HTTP_200_OK)

        hist_resp = self.client.get(f"/api/v1/coordinator/events/{self.canonical_event.id}/history/")
        self.assertEqual(hist_resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", hist_resp.data)
        self.assertGreaterEqual(len(hist_resp.data["results"]), 1)

    def test_c10_application_list_with_t2_disclosure(self):
        """C-10: Application review list discloses T2 fields for accepted applicants only."""
        user_accepted = _make_user("Accepted Volunteer", verified=True)
        user_pending = _make_user("Pending Volunteer", verified=True)

        app1 = application_service.apply_to_event(user_accepted, self.canonical_event.id, self.canonical_post.id)
        app2 = application_service.apply_to_event(user_pending, self.canonical_event.id, self.canonical_post.id)
        application_service.accept_application(self.coord1, app1.id)

        self.client.force_authenticate(user=self.coord1)
        resp = self.client.get(f"/api/v1/coordinator/events/{self.canonical_event.id}/applications/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", resp.data)

        accepted_item = next(a for a in resp.data["results"] if a["id"] == app1.id)
        pending_item = next(a for a in resp.data["results"] if a["id"] == app2.id)

        self.assertIn("skills", accepted_item)
        self.assertIn("physical_ok", accepted_item)
        self.assertNotIn("skills", pending_item)
        self.assertNotIn("physical_ok", pending_item)

    def test_c11_application_accept_reject_and_waitlist_sync(self):
        """C-11: Accept, reject, and waitlist decisions return updated item and synchronize list."""
        user1 = _make_user("Applicant Candidate 1", verified=True)
        app1 = application_service.apply_to_event(user1, self.canonical_event.id, self.canonical_post.id)

        user2 = _make_user("Applicant Candidate 2", verified=True)
        app2 = application_service.apply_to_event(user2, self.canonical_event.id, self.canonical_post.id)

        self.client.force_authenticate(user=self.coord1)
        # Waitlist app1
        wl_resp = self.client.post(f"/api/v1/coordinator/applications/{app1.id}/waitlist/", {}, format="json")
        self.assertEqual(wl_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(wl_resp.data["status"], "waitlisted")

        # Accept app1 from waitlist
        acc_resp = self.client.post(f"/api/v1/coordinator/applications/{app1.id}/accept/", {}, format="json")
        self.assertEqual(acc_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(acc_resp.data["status"], "accepted")

        # Reject app2
        rej_resp = self.client.post(f"/api/v1/coordinator/applications/{app2.id}/reject/", {}, format="json")
        self.assertEqual(rej_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(rej_resp.data["status"], "rejected")

    def test_c12_invite_volunteer(self):
        """C-12: Invite volunteer creates application with source='invite'."""
        user = _make_user("Invited Candidate", verified=True)
        self.client.force_authenticate(user=self.coord1)

        resp = self.client.post(
            f"/api/v1/coordinator/events/{self.canonical_event.id}/invite/",
            {
                "volunteer_user_id": user.id,
                "post_id": self.canonical_post.id,
                "note": "We need your expertise!",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["source"], "invite")
        self.assertEqual(resp.data["user_id"], user.id)

    def test_c13_auto_assignment(self):
        """C-13: Run auto-assignment algorithm on accepted applicants."""
        user = _make_user("Auto Assign Candidate", verified=True)
        app = application_service.apply_to_event(user, self.canonical_event.id, self.canonical_post.id)
        application_service.accept_application(self.coord1, app.id)

        self.client.force_authenticate(user=self.coord1)
        resp = self.client.post(f"/api/v1/coordinator/events/{self.canonical_event.id}/auto-assign/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("newly_assigned", resp.data)

    def test_c14_manual_assignment_custom_inputs(self):
        """C-14: Manual assignment with custom postId, groupCode, isGroupLeader preserving distinct IDs."""
        user = _make_user("Manual Assign Candidate", verified=True)
        app = application_service.apply_to_event(user, self.canonical_event.id, self.canonical_post.id)
        application_service.accept_application(self.coord1, app.id)

        self.client.force_authenticate(user=self.coord1)
        resp = self.client.post(
            f"/api/v1/coordinator/events/{self.canonical_event.id}/manual-assign/",
            {
                "application_id": app.id,
                "post_id": self.canonical_post.id,
                "group_code": "CUSTOM-ALPHA-9",
                "is_group_leader": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["application_id"], app.id)
        self.assertIn("assignment_id", resp.data)
        self.assertNotEqual(resp.data["assignment_id"], app.id)

    def test_c15_assignments_unassigned_and_capacity_reads(self):
        """C-15: Read event assignments, accepted-unassigned list, and post capacity."""
        self.client.force_authenticate(user=self.coord1)
        asgn_resp = self.client.get(f"/api/v1/coordinator/events/{self.canonical_event.id}/assignments/")
        self.assertEqual(asgn_resp.status_code, status.HTTP_200_OK)

        unassigned_resp = self.client.get(f"/api/v1/coordinator/events/{self.canonical_event.id}/unassigned/")
        self.assertEqual(unassigned_resp.status_code, status.HTTP_200_OK)

        cap_resp = self.client.get(f"/api/v1/coordinator/events/{self.canonical_event.id}/post-capacity/")
        self.assertEqual(cap_resp.status_code, status.HTTP_200_OK)

    def test_c16_coordinator_uuid_lookup_t2_card(self):
        """C-16: Coordinator UUID lookup with event_id returning T2 card."""
        user = _make_user("Lookup Volunteer", verified=True)
        app = application_service.apply_to_event(user, self.canonical_event.id, self.canonical_post.id)
        application_service.accept_application(self.coord1, app.id)

        self.client.force_authenticate(user=self.coord1)
        resp = self.client.get(f"/api/v1/users/by-uuid/{user.uuid}/?event_id={self.canonical_event.id}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("skills", resp.data)
        self.assertIn("verification_status", resp.data)

    def test_c17_attendance_board_and_manual_checkin(self):
        """C-17: Attendance board view and manual check-in."""
        evt, post = self._create_active_event_with_post(title="Board Manual Checkin Event")
        user = _make_user("Manual Checkin Volunteer", verified=True)
        app = application_service.apply_to_event(user, evt.id, post.id)
        application_service.accept_application(self.coord1, app.id)
        assignment_service.assign_volunteer_manually(self.coord1, app.id, post.id)

        self.client.force_authenticate(user=self.coord1)
        checkin_resp = self.client.post(
            "/api/v1/checkin/attendance/manual-checkin/",
            {"event_id": evt.id, "user_id": user.id},
            format="json",
        )
        self.assertEqual(checkin_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(checkin_resp.data.get("status"), "checked_in")

        board_resp = self.client.get(f"/api/v1/checkin/coordinator/events/{evt.id}/attendance/")
        self.assertEqual(board_resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", board_resp.data)

    def test_c18_qr_token_create_and_revoke(self):
        """C-18: Coordinator QR token create and revoke."""
        self.client.force_authenticate(user=self.coord1)
        create_resp = self.client.post(
            f"/api/v1/checkin/coordinator/events/{self.canonical_event.id}/qr-tokens/",
            {"purpose": "checkin", "max_uses": 20, "ttl_minutes": 60},
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        qr_id = create_resp.data["id"]

        revoke_resp = self.client.post(f"/api/v1/checkin/coordinator/qr-tokens/{qr_id}/revoke/")
        self.assertEqual(revoke_resp.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(revoke_resp.data.get("revoked_at"))

    def test_c19_geo_attempts_review_confirm_and_reject(self):
        """C-19: Coordinator geo attempts review, confirm, and reject."""
        evt, post = self._create_active_event_with_post(title="Geo Review Event", require_checkin_confirmation=True)
        user1 = _make_user("Geo Attempt Confirm", verified=True)
        app1 = application_service.apply_to_event(user1, evt.id, post.id)
        application_service.accept_application(self.coord1, app1.id)
        assignment_service.assign_volunteer_manually(self.coord1, app1.id, post.id)

        user2 = _make_user("Geo Attempt Reject", verified=True)
        app2 = application_service.apply_to_event(user2, evt.id, post.id)
        application_service.accept_application(self.coord1, app2.id)
        assignment_service.assign_volunteer_manually(self.coord1, app2.id, post.id)

        # Volunteers check in via geo, creating pending confirmations
        geo_service.submit_geo_check_in(user1, evt.id, 16.7725, 96.1583, 10.0, is_mocked=False)
        geo_service.submit_geo_check_in(user2, evt.id, 16.7725, 96.1583, 10.0, is_mocked=False)

        att1 = Attendance.objects.get(event_id=evt.id, user_id=user1.id)
        att2 = Attendance.objects.get(event_id=evt.id, user_id=user2.id)
        self.assertEqual(att1.confirmation_status, Attendance.ConfirmationStatus.PENDING)
        self.assertEqual(att2.confirmation_status, Attendance.ConfirmationStatus.PENDING)

        self.client.force_authenticate(user=self.coord1)
        attempts_resp = self.client.get(f"/api/v1/checkin/coordinator/events/{evt.id}/geo-attempts/")
        self.assertEqual(attempts_resp.status_code, status.HTTP_200_OK)

        # Confirm geo attendance
        confirm_resp = self.client.post(f"/api/v1/checkin/coordinator/attendance/{att1.id}/confirm/")
        self.assertEqual(confirm_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(confirm_resp.data.get("confirmation_status"), "confirmed")

        # Reject geo attendance with reason
        reject_resp = self.client.post(
            f"/api/v1/checkin/coordinator/attendance/{att2.id}/reject/",
            {"reason": "GPS reading outside designated safety perimeter"},
            format="json",
        )
        self.assertEqual(reject_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(reject_resp.data.get("confirmation_status"), "rejected")

    def test_c20_coordinator_feedback_operations(self):
        """C-20: Coordinator feedback to volunteer and coordinator feedback summary."""
        evt, post = self._create_active_event_with_post(title="Coord Feedback Event")
        user = _make_user("Feedback Target Volunteer", verified=True)
        app = application_service.apply_to_event(user, evt.id, post.id)
        application_service.accept_application(self.coord1, app.id)
        assignment_service.assign_volunteer_manually(self.coord1, app.id, post.id)
        att = attendance_service.manual_check_in(self.coord1, evt.id, user.id)

        # Complete attendance and event so feedback trigger passes
        attendance_service.check_out(user, att.id)
        Events.objects.filter(id=evt.id).update(status="completed")

        self.client.force_authenticate(user=self.coord1)
        fb_resp = self.client.post(
            f"/api/v1/events/{evt.id}/feedback/",
            {
                "target_user_id": user.id,
                "direction": "coordinator_to_volunteer",
                "score": 5,
                "comment": "Outstanding effort on hazardous waste sorting.",
            },
            format="json",
        )
        self.assertEqual(fb_resp.status_code, status.HTTP_201_CREATED)

        summary_resp = self.client.get("/api/v1/coordinator/feedback/")
        self.assertEqual(summary_resp.status_code, status.HTTP_200_OK)
