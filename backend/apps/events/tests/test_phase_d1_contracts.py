"""
Automated tests for Phase D1: Backend Business Contract, Service & Attendance Consistency.

Covers Sections 6.2, 6.3, 6.5, 6.7, 6.8, and 6.10:
1. Manual Assignment Event Validation (Section 6.3)
   - Matches URL event_id -> success
   - Cross-event mismatch -> stable 400 (event_mismatch)
   - Missing application -> 404 masked
   - Unauthorized manager -> 404 masked
   - Owner-as-monitor -> 403
2. Attendance Metric Semantics (Section 6.5)
   - All-time count vs daily count with multi-date fixtures
   - query_service.get_event_attendance_metrics
   - EventSummarySerializer checked_in_count vs checked_in_today_count
3. Donation Preferences Partial PATCH Transition Matrix (Section 6.7)
   - 8-case matrix for master flag vs blood/items sub-flags
4. Invite Round-Trip Attribution (Section 6.8)
   - Coordinator invite -> volunteer see -> volunteer accept/reject -> coordinator see same application_id
   - Zero duplicate browse applications
"""
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.attendance.models import Attendance
from apps.events.models import EventApplications, EventPosts, Events
from common.exceptions import DomainError, OwnerMonitorReadOnlyError, PermissionDeniedError, ResourceMaskedNotFound
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import (
    application_service,
    assignment_service,
    coordinator_service,
    onboarding_service,
    profile_service,
    query_service,
)

_d1_phone_counter = 10000


def _next_phone():
    global _d1_phone_counter
    _d1_phone_counter += 1
    return f"+959{_d1_phone_counter:08d}"


def _create_user(name="User", is_admin=False, verified=False) -> Users:
    ph = normalize_phone(_next_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(ph),
        phone_enc=encrypt_phone(ph),
        display_name=name,
        is_admin=is_admin,
        is_active=True,
        account_status="active",
        verification_status="verified" if verified else "none",
    )


class TestManualAssignmentEventValidation(TestCase):
    """Section 6.3: URL event_id consistency check during manual assignment."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = _create_user("Admin User", is_admin=True)

        cls.coord1 = _create_user("Coordinator 1", verified=True)
        coordinator_service.apply_for_coordinator(cls.coord1, "Vetting 1")
        coordinator_service.approve_coordinator(cls.admin, cls.coord1.id, "Approved")
        cls.coord1.refresh_from_db()

        cls.coord2 = _create_user("Coordinator 2", verified=True)
        coordinator_service.apply_for_coordinator(cls.coord2, "Vetting 2")
        coordinator_service.approve_coordinator(cls.admin, cls.coord2.id, "Approved")
        cls.coord2.refresh_from_db()

        cls.owner_monitor = _create_user("Owner Monitor", verified=True)
        coordinator_service.apply_for_coordinator(cls.owner_monitor, "Owner Vetting")
        coordinator_service.approve_coordinator(cls.admin, cls.owner_monitor.id, "Approved")
        cls.owner_monitor.refresh_from_db()

        cls.volunteer = _create_user("Volunteer Worker")

    def setUp(self):
        self.client = APIClient()
        now = timezone.now()

        # Event 1 managed by coord1, owned by owner_monitor (owner-as-monitor mode)
        self.event1 = Events.objects.create(
            owner_id=self.owner_monitor.id,
            current_coordinator_id=self.coord1.id,
            title="Event One",
            status="published",
            start_at=now + timedelta(hours=1),
            end_at=now + timedelta(hours=5),
            acceptance_mode="manual",
            auto_assign_enabled=False,
        )
        self.post1 = EventPosts.objects.create(
            event=self.event1,
            title="Post 1",
            required_headcount=5,
        )

        # Event 2 managed by coord2
        self.event2 = Events.objects.create(
            owner_id=self.coord2.id,
            current_coordinator_id=self.coord2.id,
            title="Event Two",
            status="published",
            start_at=now + timedelta(hours=1),
            end_at=now + timedelta(hours=5),
            acceptance_mode="manual",
            auto_assign_enabled=False,
        )
        self.post2 = EventPosts.objects.create(
            event=self.event2,
            title="Post 2",
            required_headcount=5,
        )

        # Publish events so they can accept applications (trigger forces new events to 'draft')
        Events.objects.filter(id=self.event1.id).update(status="published")
        Events.objects.filter(id=self.event2.id).update(status="published")
        self.event1.refresh_from_db()
        self.event2.refresh_from_db()

        # Volunteer applied to Event 1 and accepted while event is published
        self.app1 = EventApplications.objects.create(
            event=self.event1,
            user=self.volunteer,
            source="browse",
            status="pending",
            conditions_acknowledged_at=now,
        )
        EventApplications.objects.filter(id=self.app1.id).update(
            status="accepted",
            decided_by=self.coord1,
            decided_at=now,
        )
        self.app1.refresh_from_db()

        # Transition events to active for assignment operations
        Events.objects.filter(id=self.event1.id).update(status="active")
        Events.objects.filter(id=self.event2.id).update(status="active")
        self.event1.refresh_from_db()
        self.event2.refresh_from_db()

    def test_manual_assignment_matching_event_succeeds(self):
        """When URL event_id matches application.event_id, assignment succeeds."""
        self.client.force_authenticate(user=self.coord1)
        res = self.client.post(
            f"/api/v1/coordinator/events/{self.event1.id}/manual-assign/",
            {"application_id": self.app1.id, "post_id": self.post1.id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertIn("assignment_id", res.data)
        self.assertEqual(res.data["application_id"], self.app1.id)

    def test_manual_assignment_cross_event_mismatch_rejected_with_400(self):
        """When URL event_id does not match application.event_id, returns stable 400 event_mismatch."""
        # Coordinator 2 calls their own event URL (event2) but passes an application from Event 1
        self.client.force_authenticate(user=self.coord2)
        res = self.client.post(
            f"/api/v1/coordinator/events/{self.event2.id}/manual-assign/",
            {"application_id": self.app1.id, "post_id": self.post2.id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        error_code = res.data.get("error", {}).get("code") or res.data.get("code")
        self.assertEqual(error_code, "event_mismatch")

    def test_manual_assignment_missing_application_fails_404(self):
        """Non-existent application ID returns masked 404."""
        self.client.force_authenticate(user=self.coord1)
        res = self.client.post(
            f"/api/v1/coordinator/events/{self.event1.id}/manual-assign/",
            {"application_id": 99999999, "post_id": self.post1.id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_manual_assignment_unauthorized_manager_fails_404(self):
        """Coordinator requesting assignment on an event they do not manage receives masked 404."""
        self.client.force_authenticate(user=self.coord2)
        res = self.client.post(
            f"/api/v1/coordinator/events/{self.event1.id}/manual-assign/",
            {"application_id": self.app1.id, "post_id": self.post1.id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_manual_assignment_owner_as_monitor_fails_403(self):
        """Owner in read-only monitor mode receives 403 owner_monitor_read_only."""
        self.client.force_authenticate(user=self.owner_monitor)
        res = self.client.post(
            f"/api/v1/coordinator/events/{self.event1.id}/manual-assign/",
            {"application_id": self.app1.id, "post_id": self.post1.id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("owner_monitor_read_only", str(res.data).lower())


class TestAttendanceMetricSemantics(TestCase):
    """Section 6.5: Distinguishing all-time checked_in_count from daily checked_in_today_count."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = _create_user("Admin Metric", is_admin=True)
        cls.coord = _create_user("Coord Metric", verified=True)
        coordinator_service.apply_for_coordinator(cls.coord, "Coord Vetting")
        coordinator_service.approve_coordinator(cls.admin, cls.coord.id, "Approved")
        cls.coord.refresh_from_db()

        cls.vol_yesterday = _create_user("Vol Yesterday")
        cls.vol_today = _create_user("Vol Today")

    def setUp(self):
        self.client = APIClient()
        now = timezone.now()
        self.event = Events.objects.create(
            owner_id=self.coord.id,
            current_coordinator_id=self.coord.id,
            title="Multi-Date Event",
            status="published",
            start_at=now + timedelta(hours=1),
            end_at=now + timedelta(days=2),
            acceptance_mode="auto",
            auto_assign_enabled=True,
            require_onboarding_ack=False,
        )
        self.post = EventPosts.objects.create(event=self.event, title="Post", required_headcount=10)
        Events.objects.filter(id=self.event.id).update(status="published", require_onboarding_ack=False)
        self.event.refresh_from_db()

        # 1. Check-in 1: Application submitted while published
        EventApplications.objects.create(
            event=self.event,
            user=self.vol_yesterday,
            source="browse",
            conditions_acknowledged_at=now,
        )

        # 2. Check-in 2: Application submitted while published
        EventApplications.objects.create(
            event=self.event,
            user=self.vol_today,
            source="browse",
            conditions_acknowledged_at=now,
        )

        # Transition event to active and start_at into past
        Events.objects.filter(id=self.event.id).update(
            status="active",
            start_at=now - timedelta(days=2),
        )
        self.event.refresh_from_db()

        att_yesterday = Attendance.objects.get(event=self.event, user=self.vol_yesterday)
        att_yesterday.status = "checked_in"
        att_yesterday.method = "coordinator_manual"
        att_yesterday.recorded_by_user = self.coord
        att_yesterday.checkin_at = now - timedelta(days=1)
        att_yesterday.save()

        att_today = Attendance.objects.get(event=self.event, user=self.vol_today)
        att_today.status = "checked_in"
        att_today.method = "coordinator_manual"
        att_today.recorded_by_user = self.coord
        att_today.checkin_at = now
        att_today.save()

    def test_attendance_metric_service_and_serializer_distinguish_all_time_vs_today(self):
        """All-time count must be 2, while checked_in_today_count must be 1."""
        metrics = query_service.get_event_attendance_metrics(self.event.id)
        self.assertEqual(metrics["checked_in_count"], 2, "All-time count must include past and current dates")
        self.assertEqual(metrics["checked_in_today_count"], 1, "Today metric must strictly count check-ins recorded today")

        # Via API: GET /api/v1/coordinator/events/{event_id}/summary/
        self.client.force_authenticate(user=self.coord)
        res = self.client.get(f"/api/v1/coordinator/events/{self.event.id}/summary/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["checked_in_count"], 2)
        self.assertEqual(res.data["checked_in_today_count"], 1)


class TestDonationPreferencesTransitionMatrix(TestCase):
    """Section 6.7: Full 8-case partial PATCH donation preference transition matrix."""

    def setUp(self):
        self.user = _create_user("Donation Volunteer")

    def test_case_1_master_true_with_no_subflags(self):
        """Case 1: Master true with no sub-flags sets master to True."""
        profile_service.update_user_profile(self.user, {"is_willing_to_donate": True})
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_willing_to_donate)
        self.assertFalse(self.user.is_willing_to_donate_blood)
        self.assertFalse(self.user.is_willing_to_donate_items)

    def test_case_2_master_false_with_existing_subflags_true_cascades_false(self):
        """Case 2: Master false when sub-flags were True cascades both sub-flags to False."""
        # Pre-set sub-flags
        profile_service.update_user_profile(
            self.user,
            {"is_willing_to_donate": True, "is_willing_to_donate_blood": True, "is_willing_to_donate_items": True},
        )
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_willing_to_donate_blood)

        # Update master=False
        profile_service.update_user_profile(self.user, {"is_willing_to_donate": False})
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_willing_to_donate)
        self.assertFalse(self.user.is_willing_to_donate_blood)
        self.assertFalse(self.user.is_willing_to_donate_items)

    def test_case_3_master_false_plus_one_subflag_true_rejected(self):
        """Case 3: Master false contradictory with sub-flag true raises 400 invalid_donation_preferences."""
        with self.assertRaises(DomainError) as ctx:
            profile_service.update_user_profile(
                self.user,
                {"is_willing_to_donate": False, "is_willing_to_donate_blood": True},
            )
        self.assertEqual(ctx.exception.code, "invalid_donation_preferences")

    def test_case_4_blood_true_without_master_field_auto_enables_master(self):
        """Case 4: Blood true without master field automatically sets master to True."""
        profile_service.update_user_profile(self.user, {"is_willing_to_donate_blood": True})
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_willing_to_donate)
        self.assertTrue(self.user.is_willing_to_donate_blood)
        self.assertFalse(self.user.is_willing_to_donate_items)

    def test_case_5_items_true_without_master_field_auto_enables_master(self):
        """Case 5: Items true without master field automatically sets master to True."""
        profile_service.update_user_profile(self.user, {"is_willing_to_donate_items": True})
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_willing_to_donate)
        self.assertFalse(self.user.is_willing_to_donate_blood)
        self.assertTrue(self.user.is_willing_to_donate_items)

    def test_case_6_blood_false_while_items_remains_true(self):
        """Case 6: Blood false while items is True keeps master True."""
        profile_service.update_user_profile(
            self.user,
            {"is_willing_to_donate": True, "is_willing_to_donate_blood": True, "is_willing_to_donate_items": True},
        )
        profile_service.update_user_profile(self.user, {"is_willing_to_donate_blood": False})
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_willing_to_donate)
        self.assertFalse(self.user.is_willing_to_donate_blood)
        self.assertTrue(self.user.is_willing_to_donate_items)

    def test_case_7_both_subflags_false_sets_master_false(self):
        """Case 7: Setting both sub-flags to False sets master to False."""
        profile_service.update_user_profile(
            self.user,
            {"is_willing_to_donate": True, "is_willing_to_donate_blood": True, "is_willing_to_donate_items": True},
        )
        profile_service.update_user_profile(
            self.user,
            {"is_willing_to_donate_blood": False, "is_willing_to_donate_items": False},
        )
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_willing_to_donate)
        self.assertFalse(self.user.is_willing_to_donate_blood)
        self.assertFalse(self.user.is_willing_to_donate_items)

    def test_case_8_no_donation_keys_leaves_flags_untouched(self):
        """Case 8: Updating non-donation fields leaves existing donation flags untouched."""
        profile_service.update_user_profile(
            self.user,
            {"is_willing_to_donate": True, "is_willing_to_donate_blood": True},
        )
        profile_service.update_user_profile(self.user, {"preferred_language": "en"})
        self.user.refresh_from_db()
        self.assertEqual(self.user.preferred_language, "en")
        self.assertTrue(self.user.is_willing_to_donate)
        self.assertTrue(self.user.is_willing_to_donate_blood)


class TestInviteRoundTripAttribution(TestCase):
    """Section 6.8: Coordinator invite -> volunteer accept/reject -> coordinator view (same application_id)."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = _create_user("Admin Invite", is_admin=True)
        cls.coord = _create_user("Coord Invite", verified=True)
        coordinator_service.apply_for_coordinator(cls.coord, "Coord Vetting")
        coordinator_service.approve_coordinator(cls.admin, cls.coord.id, "Approved")
        cls.coord.refresh_from_db()

        cls.vol = _create_user("Invited Volunteer")

    def setUp(self):
        self.client = APIClient()
        now = timezone.now()
        self.event = Events.objects.create(
            owner_id=self.coord.id,
            current_coordinator_id=self.coord.id,
            title="Invite Event",
            status="published",
            start_at=now + timedelta(hours=1),
            end_at=now + timedelta(hours=5),
            acceptance_mode="manual",
            auto_assign_enabled=False,
        )
        self.post = EventPosts.objects.create(event=self.event, title="Invite Post", required_headcount=10)
        Events.objects.filter(id=self.event.id).update(status="published")
        self.event.refresh_from_db()

    def test_invite_accept_round_trip_preserves_application_id_and_creates_no_duplicates(self):
        """Coordinator invites volunteer; volunteer accepts; coordinator inspects same application ID."""
        # 1. Coordinator creates invite
        invite_app = application_service.invite_volunteer_to_event(
            actor=self.coord,
            event_id=self.event.id,
            volunteer_user_id=self.vol.id,
            post_id=self.post.id,
            note="Please join our medical team",
        )
        invite_id = invite_app.id
        self.assertEqual(invite_app.source, "invite")
        self.assertEqual(invite_app.status, "pending")

        # 2. Volunteer inspects application list
        self.client.force_authenticate(user=self.vol)
        res_vol_list = self.client.get("/api/v1/me/applications/")
        self.assertEqual(res_vol_list.status_code, status.HTTP_200_OK)
        vol_apps = res_vol_list.data["results"]
        matching = [a for a in vol_apps if a["id"] == invite_id]
        self.assertEqual(len(matching), 1, "Volunteer must see the exact invite application")
        self.assertEqual(matching[0]["source"], "invite")
        self.assertEqual(matching[0]["status"], "pending")

        # 3. Volunteer accepts the invite via API
        res_accept = self.client.post(
            f"/api/v1/applications/{invite_id}/accept/",
            {"note": "Gladly accepted"},
            format="json",
        )
        self.assertEqual(res_accept.status_code, status.HTTP_200_OK)
        self.assertEqual(res_accept.data["id"], invite_id)
        self.assertEqual(res_accept.data["status"], "accepted")

        # 4. Coordinator inspects event applications
        self.client.force_authenticate(user=self.coord)
        res_coord_list = self.client.get(f"/api/v1/coordinator/events/{self.event.id}/applications/")
        self.assertEqual(res_coord_list.status_code, status.HTTP_200_OK)
        coord_apps = res_coord_list.data["results"]

        # Exactly ONE application for this volunteer exists on the event (no duplicate browse app)
        volunteer_apps = [a for a in coord_apps if a["user_id"] == self.vol.id]
        self.assertEqual(len(volunteer_apps), 1, "No duplicate application row must be created")
        self.assertEqual(volunteer_apps[0]["id"], invite_id, "Application ID must match the original invite")
        self.assertEqual(volunteer_apps[0]["status"], "accepted")
        self.assertEqual(volunteer_apps[0]["source"], "invite")

    def test_invite_reject_round_trip_transitions_to_withdrawn(self):
        """Volunteer rejects invitation; status becomes withdrawn without creating duplicates."""
        invite_app = application_service.invite_volunteer_to_event(
            actor=self.coord,
            event_id=self.event.id,
            volunteer_user_id=self.vol.id,
            post_id=self.post.id,
        )
        invite_id = invite_app.id

        # Volunteer rejects
        self.client.force_authenticate(user=self.vol)
        res_reject = self.client.post(
            f"/api/v1/applications/{invite_id}/reject/",
            {"note": "Cannot attend"},
            format="json",
        )
        self.assertEqual(res_reject.status_code, status.HTTP_200_OK)
        self.assertEqual(res_reject.data["status"], "withdrawn")

        # Coordinator sees status withdrawn
        self.client.force_authenticate(user=self.coord)
        res_coord_list = self.client.get(f"/api/v1/coordinator/events/{self.event.id}/applications/?status=withdrawn")
        self.assertEqual(res_coord_list.status_code, status.HTTP_200_OK)
        matching = [a for a in res_coord_list.data["results"] if a["id"] == invite_id]
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0]["status"], "withdrawn")
