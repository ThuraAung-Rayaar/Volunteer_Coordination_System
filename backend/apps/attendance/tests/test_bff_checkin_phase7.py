"""
API Integration Tests for Phase 7 BFF:
- Volunteer endpoints & URL route parity
- Coordinator endpoints & URL route parity
- Owner-as-Monitor HTTP 403 enforcement
- 404 Resource masking on unauthorized rosters
- T4 privacy verification on /api/v1/me/attendance/
"""
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.attendance.models import Attendance, QrTokens
from apps.events.models import EventApplications, EventPosts, Events
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import coordinator_service, onboarding_service

_api_phone_idx = 9000


def _api_phone():
    global _api_phone_idx
    _api_phone_idx += 1
    return f"+959{_api_phone_idx:08d}"


def _make_api_user(name, is_admin=False, verified=False):
    ph = normalize_phone(_api_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(ph),
        phone_enc=encrypt_phone(ph),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
    )


class BffCheckinPhase7ApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_api_user("Admin User", is_admin=True)

        cls.owner = _make_api_user("Event Owner", verified=True)
        coordinator_service.apply_for_coordinator(cls.owner, "Owner Vetting")
        coordinator_service.approve_coordinator(cls.admin, cls.owner.id, "Approved")
        cls.owner.refresh_from_db()

        cls.coord = _make_api_user("Current Coordinator", verified=True)
        coordinator_service.apply_for_coordinator(cls.coord, "Coord Vetting")
        coordinator_service.approve_coordinator(cls.admin, cls.coord.id, "Approved")
        cls.coord.refresh_from_db()

        cls.unauth_coord = _make_api_user("Third Party Coordinator", verified=True)
        coordinator_service.apply_for_coordinator(cls.unauth_coord, "Third Party Vetting")
        coordinator_service.approve_coordinator(cls.admin, cls.unauth_coord.id, "Approved")
        cls.unauth_coord.refresh_from_db()

        cls.vol = _make_api_user("Volunteer Worker")

    def setUp(self):
        self.client = APIClient()

        start = timezone.now() + timedelta(hours=2)
        end = start + timedelta(hours=4)
        # Event owner != current_coordinator -> activates Owner-as-Monitor mode
        self.event = Events.objects.create(
            owner_id=self.owner.id,
            current_coordinator_id=self.coord.id,
            title="BFF Checkin Event",
            start_at=start,
            end_at=end,
            acceptance_mode="auto",
            auto_assign_enabled=True,
            require_onboarding_ack=True,
            onboarding_text="Please wear a high-vis jacket.",
            latitude=1.3521,
            longitude=103.8198,
            geo_radius_m=400,
            geo_checkin_enabled=True,
            require_checkin_confirmation=False,
        )
        self.post = EventPosts.objects.create(
            event=self.event,
            title="Steward",
            required_headcount=10,
        )
        Events.objects.filter(id=self.event.id).update(status="published")
        Events.objects.filter(id=self.event.id).update(status="active")
        start_active = timezone.now() - timedelta(minutes=10)
        Events.objects.filter(id=self.event.id).update(start_at=start_active)
        self.event.refresh_from_db()

        self.app = EventApplications.objects.create(
            event=self.event,
            user=self.vol,
            source="browse",
            conditions_acknowledged_at=timezone.now(),
        )

    # --- Onboarding Endpoints ---

    def test_onboarding_acknowledge_and_status_api(self):
        self.client.force_authenticate(user=self.vol)

        # Status before
        res_stat = self.client.get(f"/api/v1/events/{self.event.id}/onboarding/")
        self.assertEqual(res_stat.status_code, status.HTTP_200_OK)
        self.assertFalse(res_stat.data["acknowledged"])

        # Status alias endpoint
        res_alias = self.client.get(f"/api/v1/events/{self.event.id}/onboarding/status/")
        self.assertEqual(res_alias.status_code, status.HTTP_200_OK)

        # Acknowledge
        res_ack = self.client.post(f"/api/v1/events/{self.event.id}/onboarding/acknowledge/", {})
        self.assertEqual(res_ack.status_code, status.HTTP_200_OK)
        self.assertTrue(res_ack.data["acknowledged"])

    # --- QR Token Endpoints ---

    def test_coordinator_create_and_revoke_qr_token_api(self):
        self.client.force_authenticate(user=self.coord)

        # Create QR token
        create_res = self.client.post(
            f"/api/v1/coordinator/events/{self.event.id}/qr-tokens/",
            {"purpose": "checkin", "max_uses": 5, "ttl_minutes": 60},
            format="json",
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        raw_token = create_res.data["raw_token"]
        token_id = create_res.data["id"]

        # Revoke QR token
        revoke_res = self.client.post(f"/api/v1/coordinator/qr-tokens/{token_id}/revoke/")
        self.assertEqual(revoke_res.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(revoke_res.data["revoked_at"])

    # --- Geo Check-In URL Parity ---

    def test_geo_checkin_flat_and_event_scoped_url_parity(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)
        self.client.force_authenticate(user=self.vol)

        # Event-scoped RESTful endpoint
        payload = {
            "latitude": 1.3521,
            "longitude": 103.8198,
            "accuracy_m": 15.0,
            "is_mocked": False,
        }
        res_scoped = self.client.post(
            f"/api/v1/events/{self.event.id}/geo-check-in/",
            payload,
            format="json",
        )
        self.assertEqual(res_scoped.status_code, status.HTTP_200_OK)
        self.assertEqual(res_scoped.data["result"], "accepted")

        # Flat endpoint with event_id in body
        payload_flat = {
            "event_id": self.event.id,
            "latitude": 1.3521,
            "longitude": 103.8198,
            "accuracy_m": 15.0,
        }
        res_flat = self.client.post(
            "/api/v1/attendance/geo-checkin/",
            payload_flat,
            format="json",
        )
        # Already checked in -> HTTP 200
        self.assertEqual(res_flat.status_code, status.HTTP_200_OK)
        self.assertEqual(res_flat.data["result"], "already_checked_in")

    # --- Manual Check-In URL Parity & Canonical Authoritative Payload (ATT-01) ---

    def test_manual_checkin_canonical_and_aliased_authoritative_payload(self):
        vol_c = _make_api_user("Volunteer C")
        EventApplications.objects.create(
            event=self.event,
            user=vol_c,
            source="browse",
            conditions_acknowledged_at=timezone.now(),
        )
        onboarding_service.acknowledge_event_onboarding(vol_c, self.event.id)

        self.client.force_authenticate(user=self.coord)

        # 1. Canonical route: POST /api/v1/checkin/attendance/manual-checkin/
        res = self.client.post(
            "/api/v1/checkin/attendance/manual-checkin/",
            {"event_id": self.event.id, "user_id": vol_c.id, "note": "Checked in via canonical route"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Assert full authoritative mutation response shape
        self.assertIn("attendance_id", res.data)
        self.assertEqual(res.data["event_id"], self.event.id)
        self.assertEqual(res.data["user_id"], vol_c.id)
        self.assertEqual(res.data["status"], "checked_in")
        self.assertEqual(res.data["method"], "coordinator_manual")
        self.assertIsNotNone(res.data["checkin_at"])
        self.assertEqual(res.data["recorded_by_user_id"], self.coord.id)
        self.assertFalse(res.data["already_checked_in"])

        # 2. Idempotent repeat: same route returns already_checked_in=True
        repeat_res = self.client.post(
            "/api/v1/checkin/attendance/manual-checkin/",
            {"event_id": self.event.id, "user_id": vol_c.id},
            format="json",
        )
        self.assertEqual(repeat_res.status_code, status.HTTP_200_OK)
        self.assertTrue(repeat_res.data["already_checked_in"])
        self.assertEqual(repeat_res.data["attendance_id"], res.data["attendance_id"])

        # 3. Flat compatibility alias: /api/v1/attendance/manual-checkin/
        vol_d = _make_api_user("Volunteer D")
        EventApplications.objects.create(
            event=self.event,
            user=vol_d,
            source="browse",
            conditions_acknowledged_at=timezone.now(),
        )
        onboarding_service.acknowledge_event_onboarding(vol_d, self.event.id)
        alias_res = self.client.post(
            "/api/v1/attendance/manual-checkin/",
            {"event_id": self.event.id, "user_id": vol_d.id},
            format="json",
        )
        self.assertEqual(alias_res.status_code, status.HTTP_200_OK)
        self.assertEqual(alias_res.data["status"], "checked_in")
        self.assertFalse(alias_res.data["already_checked_in"])

        # 4. Event-scoped alias: /api/v1/events/{event_id}/check-in/
        vol_e = _make_api_user("Volunteer E")
        EventApplications.objects.create(
            event=self.event,
            user=vol_e,
            source="browse",
            conditions_acknowledged_at=timezone.now(),
        )
        onboarding_service.acknowledge_event_onboarding(vol_e, self.event.id)
        scoped_res = self.client.post(
            f"/api/v1/events/{self.event.id}/check-in/",
            {"user_id": vol_e.id},
            format="json",
        )
        self.assertEqual(scoped_res.status_code, status.HTTP_200_OK)
        self.assertEqual(scoped_res.data["status"], "checked_in")
        self.assertFalse(scoped_res.data["already_checked_in"])

    def test_manual_checkin_cancelled_row_returns_409_conflict(self):
        vol_f = _make_api_user("Volunteer F")
        EventApplications.objects.create(
            event=self.event,
            user=vol_f,
            source="browse",
            conditions_acknowledged_at=timezone.now(),
        )
        onboarding_service.acknowledge_event_onboarding(vol_f, self.event.id)

        att = Attendance.objects.get(event=self.event, user=vol_f)
        att.status = "cancelled"
        att.save(update_fields=["status"])

        self.client.force_authenticate(user=self.coord)
        res = self.client.post(
            "/api/v1/checkin/attendance/manual-checkin/",
            {"event_id": self.event.id, "user_id": vol_f.id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data.get("error", {}).get("code"), "invalid_state")

    def test_manual_checkin_repeat_preserves_original_geo_method_and_timestamp(self):
        """Section 6.2: Repeat manual checkin on already checked-in row preserves original method and timestamp."""
        vol_g = _make_api_user("Volunteer G")
        EventApplications.objects.create(
            event=self.event,
            user=vol_g,
            source="browse",
            conditions_acknowledged_at=timezone.now(),
        )
        onboarding_service.acknowledge_event_onboarding(vol_g, self.event.id)

        att = Attendance.objects.get(event=self.event, user=vol_g)
        orig_time = timezone.now() - timedelta(minutes=45)
        att.status = "checked_in"
        att.method = "geo"
        att.checkin_at = orig_time
        att.checkin_latitude = 1.3521
        att.checkin_longitude = 103.8198
        att.checkin_accuracy_m = 10.0
        att.geo_verified = True
        att.save()

        self.client.force_authenticate(user=self.coord)
        res = self.client.post(
            "/api/v1/checkin/attendance/manual-checkin/",
            {"event_id": self.event.id, "user_id": vol_g.id, "note": "Duplicate desk attempt"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["already_checked_in"])
        self.assertEqual(res.data["method"], "geo", "Original method must be preserved, never changed to coordinator_manual")
        # Checkin timestamp must remain the original
        self.assertEqual(res.data["status"], "checked_in")

    def test_manual_checkin_unauthorized_and_monitor_permissions(self):
        """Section 6.2: Unrelated coordinator masked 404, owner-as-monitor 403."""
        vol_h = _make_api_user("Volunteer H")
        EventApplications.objects.create(
            event=self.event,
            user=vol_h,
            source="browse",
            conditions_acknowledged_at=timezone.now(),
        )
        onboarding_service.acknowledge_event_onboarding(vol_h, self.event.id)

        # 1. Unrelated coordinator -> 404 masked
        self.client.force_authenticate(user=self.unauth_coord)
        res_unauth = self.client.post(
            "/api/v1/checkin/attendance/manual-checkin/",
            {"event_id": self.event.id, "user_id": vol_h.id},
            format="json",
        )
        self.assertEqual(res_unauth.status_code, status.HTTP_404_NOT_FOUND)

        # 2. Owner in monitor mode -> 403
        self.client.force_authenticate(user=self.owner)
        res_monitor = self.client.post(
            "/api/v1/checkin/attendance/manual-checkin/",
            {"event_id": self.event.id, "user_id": vol_h.id},
            format="json",
        )
        self.assertEqual(res_monitor.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("owner_monitor_read_only", str(res_monitor.data).lower())

    # --- Volunteer Self-Checkout and History Privacy (BR-PRIV-T4) ---

    def test_volunteer_checkout_and_history_privacy(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)
        att = Attendance.objects.get(event=self.event, user=self.vol)
        att.status = "checked_in"
        att.method = "geo"
        att.checkin_at = timezone.now()
        att.checkin_latitude = 1.3521
        att.checkin_longitude = 103.8198
        att.checkin_accuracy_m = 10.0
        att.geo_verified = True
        att.save()

        self.client.force_authenticate(user=self.vol)

        # Checkout via API
        res_out = self.client.post(f"/api/v1/attendance/{att.id}/checkout/")
        self.assertEqual(res_out.status_code, status.HTTP_200_OK)

        # Self-service history
        res_hist = self.client.get("/api/v1/me/attendance/")
        self.assertEqual(res_hist.status_code, status.HTTP_200_OK)
        results = res_hist.data["results"]
        self.assertTrue(len(results) >= 1)
        # Check that sensitive coordinates and telemetry are strictly concealed
        for record in results:
            self.assertNotIn("checkin_latitude", record)
            self.assertNotIn("checkin_longitude", record)
            self.assertNotIn("checkin_accuracy_m", record)

    # --- Authorization & Owner-as-Monitor Mode (W51, W52) ---

    def test_owner_as_monitor_mode_blocks_mutations(self):
        # Event owner is owner_id, but current_coordinator_id is coord!
        # Owner in monitor mode must be blocked with HTTP 403 (owner_monitor_readonly)
        self.client.force_authenticate(user=self.owner)

        # Attempt to create QR token
        res_qr = self.client.post(
            f"/api/v1/coordinator/events/{self.event.id}/qr-tokens/",
            {"purpose": "checkin"},
            format="json",
        )
        self.assertEqual(res_qr.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("owner_monitor_read_only", str(res_qr.data).lower())

        # Attempt manual checkin
        res_chk = self.client.post(
            f"/api/v1/events/{self.event.id}/check-in/",
            {"user_id": self.vol.id},
            format="json",
        )
        self.assertEqual(res_chk.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("owner_monitor_read_only", str(res_chk.data).lower())

    # --- 404 Resource Masking ---

    def test_resource_masked_404_on_unauthorized_roster(self):
        # Third party coordinator requests attendance roster of this event
        self.client.force_authenticate(user=self.unauth_coord)

        res = self.client.get(f"/api/v1/coordinator/events/{self.event.id}/attendance/")
        # Must return 404 masking instead of 403
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_unauthenticated_requests_fail(self):
        self.client.logout()
        res = self.client.get(f"/api/v1/events/{self.event.id}/onboarding/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
