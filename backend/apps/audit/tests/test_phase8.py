from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.audit.models import AuditLogs, Feedback, ModerationActions
from apps.coordination.models import CoordinatorProfiles, EventCoordinatorHistory
from apps.events.models import EventPosts, Events
from common.exceptions import DomainError, PermissionDeniedError, ResourceMaskedNotFound
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import (
    audit_service,
    coordinator_service,
    feedback_service,
    maintenance_service,
    moderation_service,
    query_service,
)

_phone_seq = 0


def _phone():
    global _phone_seq
    _phone_seq += 1
    return f"+959{_phone_seq:08d}"


def _make_user(name, is_admin=False, is_superuser=False, verified=False, **kwargs):
    phone = normalize_phone(_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        is_superuser=is_superuser,
        verification_status="verified" if verified else "none",
        **kwargs,
    )


def _make_coordinator(admin, name="Coordinator"):
    user = _make_user(name, verified=True)
    coordinator_service.apply_for_coordinator(user, "Organization notes")
    coordinator_service.approve_coordinator(admin, user.id, "Approved")
    user.refresh_from_db()
    return user


def _make_completed_event(coord, volunteer):
    """Create an event, assign the volunteer, and complete it so feedback is allowed."""
    start = timezone.now() + timedelta(hours=1)
    end = timezone.now() + timedelta(hours=4)
    event = Events.objects.create(
        owner_id=coord.id,
        current_coordinator_id=coord.id,
        title="Feedback Event",
        start_at=start,
        end_at=end,
        acceptance_mode="auto",
        auto_assign_enabled=True,
        require_onboarding_ack=False,
    )
    EventPosts.objects.create(event=event, title="Helper", required_headcount=5)
    Events.objects.filter(id=event.id).update(status="published")
    Events.objects.filter(id=event.id).update(status="active")
    from apps.events.models import EventApplications
    EventApplications.objects.create(
        event=event,
        user=volunteer,
        source="browse",
        conditions_acknowledged_at=timezone.now(),
    )
    # Mark attendance checked_in then completed so volunteer feedback is permitted
    from apps.attendance.models import Attendance
    past_start = timezone.now() - timedelta(hours=4)
    past_end = timezone.now() - timedelta(hours=1)
    Attendance.objects.filter(event=event, user=volunteer).update(
        status="checked_in",
        checkin_at=past_start,
        method="coordinator_manual",
        recorded_by_user_id=coord.id,
    )
    Attendance.objects.filter(event=event, user=volunteer).update(
        status="completed",
        checkout_at=past_end,
    )
    Events.objects.filter(id=event.id).update(
        start_at=past_start,
        end_at=past_end,
        status="completed",
    )
    event.refresh_from_db()
    return event


class FeedbackTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin", is_admin=True)
        cls.coord = _make_coordinator(cls.admin, "Coordinator")
        cls.vol = _make_user("Volunteer")
        cls.event = _make_completed_event(cls.coord, cls.vol)

    def test_submit_volunteer_to_event_feedback(self):
        fb = feedback_service.submit_event_feedback(
            self.vol, self.event.id, "volunteer_to_event", score=5, tags=["Great", "fun"]
        )
        self.assertEqual(fb.status, "active")
        self.assertEqual(fb.direction, "volunteer_to_event")
        self.assertIsNone(fb.target_user_id)
        self.assertEqual(fb.tags, ["great", "fun"])

    def test_submit_coordinator_to_volunteer_feedback(self):
        fb = feedback_service.submit_event_feedback(
            self.coord,
            self.event.id,
            "coordinator_to_volunteer",
            score=4,
            target_user_id=self.vol.id,
        )
        self.assertEqual(fb.target_user_id, self.vol.id)

    def test_feedback_requires_completed_event(self):
        # Create a non-completed event
        event2 = Events.objects.create(
            owner_id=self.coord.id,
            current_coordinator_id=self.coord.id,
            title="Active Event",
            start_at=timezone.now() + timedelta(hours=1),
            end_at=timezone.now() + timedelta(hours=3),
        )
        with self.assertRaises(DomainError):
            feedback_service.submit_event_feedback(
                self.vol, event2.id, "volunteer_to_event", score=5
            )

    def test_invalid_score_rejected(self):
        with self.assertRaises(DomainError):
            feedback_service.submit_event_feedback(
                self.vol, self.event.id, "volunteer_to_event", score=10
            )

    def test_duplicate_feedback_rejected(self):
        feedback_service.submit_event_feedback(self.vol, self.event.id, "volunteer_to_event", score=5)
        with self.assertRaises(Exception):
            feedback_service.submit_event_feedback(self.vol, self.event.id, "volunteer_to_event", score=4)

    def test_retrieve_event_feedback(self):
        feedback_service.submit_event_feedback(self.vol, self.event.id, "volunteer_to_event", score=5)
        rows = feedback_service.get_event_feedback(self.coord, self.event.id)
        self.assertGreaterEqual(len(rows), 1)

    def test_feedback_visibility_for_rater(self):
        feedback_service.submit_event_feedback(self.vol, self.event.id, "volunteer_to_event", score=5)
        own = feedback_service.get_own_feedback(self.vol)
        self.assertEqual(len(own), 1)

    def test_hide_feedback_via_moderation(self):
        fb = feedback_service.submit_event_feedback(self.vol, self.event.id, "volunteer_to_event", score=5)
        moderation_service.record_moderation_action(
            self.admin, action_type="feedback_hide", feedback_id=fb.id, reason="spam"
        )
        fb.refresh_from_db()
        self.assertEqual(fb.status, "hidden")

    def test_non_admin_cannot_hide_feedback(self):
        fb = feedback_service.submit_event_feedback(self.vol, self.event.id, "volunteer_to_event", score=5)
        with self.assertRaises((PermissionDeniedError, ResourceMaskedNotFound)):
            moderation_service.record_moderation_action(
                self.vol, action_type="feedback_hide", feedback_id=fb.id, reason="x"
            )


class ModerationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin", is_admin=True)
        cls.superadmin = _make_user("SuperAdmin", is_admin=True, is_superuser=True)
        cls.target = _make_user("Target User")

    def test_valid_block_action_applies_via_trigger(self):
        moderation_service.record_moderation_action(
            self.admin, action_type="user_block", target_user_id=self.target.id, reason="abuse"
        )
        self.target.refresh_from_db()
        self.assertEqual(self.target.account_status, "blocked")
        self.assertFalse(self.target.is_active)

    def test_unblock_action(self):
        moderation_service.record_moderation_action(
            self.admin, action_type="user_block", target_user_id=self.target.id, reason="abuse"
        )
        moderation_service.record_moderation_action(
            self.admin, action_type="user_unblock", target_user_id=self.target.id, reason="resolved"
        )
        self.target.refresh_from_db()
        self.assertEqual(self.target.account_status, "active")
        self.assertTrue(self.target.is_active)

    def test_invalid_action_type_rejected(self):
        with self.assertRaises(DomainError):
            moderation_service.record_moderation_action(
                self.admin, action_type="make_admin", target_user_id=self.target.id, reason="x"
            )

    def test_missing_reason_for_block_rejected(self):
        with self.assertRaises(DomainError):
            moderation_service.record_moderation_action(
                self.admin, action_type="user_block", target_user_id=self.target.id, reason=""
            )

    def test_non_admin_cannot_moderate(self):
        with self.assertRaises((PermissionDeniedError, ResourceMaskedNotFound)):
            moderation_service.record_moderation_action(
                self.target, action_type="user_warning", target_user_id=self.admin.id, reason="x"
            )

    def test_self_moderation_rejected(self):
        with self.assertRaises(PermissionDeniedError):
            moderation_service.record_moderation_action(
                self.admin, action_type="user_warning", target_user_id=self.admin.id, reason="x"
            )

    def test_account_close_requires_superuser(self):
        # Regular admin cannot close accounts (A10)
        with self.assertRaises(ResourceMaskedNotFound):
            moderation_service.record_moderation_action(
                self.admin, action_type="account_close", target_user_id=self.target.id, reason="x"
            )
        # Super admin can
        moderation_service.record_moderation_action(
            self.superadmin, action_type="account_close", target_user_id=self.target.id, reason="closed"
        )
        self.target.refresh_from_db()
        self.assertEqual(self.target.account_status, "closed")

    def test_moderation_recorded_in_database(self):
        moderation_service.record_moderation_action(
            self.admin, action_type="user_warning", target_user_id=self.target.id, reason="minor"
        )
        self.assertTrue(
            ModerationActions.objects.filter(action_type="user_warning", target_user_id=self.target.id).exists()
        )


class AuditTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin", is_admin=True)
        cls.superadmin = _make_user("SuperAdmin", is_admin=True, is_superuser=True)
        cls.user = _make_user("Regular User")

    def test_audit_records_written_by_triggers(self):
        # Creating a user triggers trg_95_users_audit
        count_before = AuditLogs.objects.filter(entity_type="users").count()
        _make_user("Audited User")
        count_after = AuditLogs.objects.filter(entity_type="users").count()
        self.assertGreater(count_after, count_before)

    def test_super_admin_can_read_audit(self):
        records = audit_service.get_audit_records(self.superadmin)
        self.assertIsInstance(records, list)

    def test_regular_admin_cannot_read_audit(self):
        with self.assertRaises(ResourceMaskedNotFound):
            audit_service.get_audit_records(self.admin)

    def test_non_admin_cannot_read_audit(self):
        with self.assertRaises(ResourceMaskedNotFound):
            audit_service.get_audit_records(self.user)

    def test_audit_immutability(self):
        _make_user("Immutable Test")
        log = AuditLogs.objects.first()
        with self.assertRaises(Exception):
            AuditLogs.objects.filter(id=log.id).update(action="tampered")

    def test_coordinator_history_retrieval(self):
        coord = _make_coordinator(self.admin, "Coord A")
        event = Events.objects.create(
            owner_id=coord.id,
            current_coordinator_id=coord.id,
            title="History Event",
            start_at=timezone.now() + timedelta(hours=1),
            end_at=timezone.now() + timedelta(hours=3),
        )
        # Trigger wrote the initial history row on insert
        rows = audit_service.get_event_coordinator_history(self.admin, event_id=event.id)
        self.assertGreaterEqual(len(rows), 1)


class MaintenanceTests(TestCase):
    def test_release_expired_blocks(self):
        user = _make_user("Blocked User", account_status="blocked")
        Users.objects.filter(id=user.id).update(
            account_status="blocked",
            is_active=False,
            blocked_until=timezone.now() - timedelta(hours=1),
        )
        count = maintenance_service.release_expired_blocks()
        user.refresh_from_db()
        self.assertEqual(user.account_status, "active")
        self.assertTrue(user.is_active)

    def test_purge_expired_otps(self):
        from apps.accounts.models import AuthOtp
        AuthOtp.objects.create(
            phone_hash="x" * 64,
            code_hash="y" * 64,
            purpose="login",
            created_at=timezone.now() - timedelta(days=3),
            expires_at=timezone.now() - timedelta(days=2),
        )
        count = maintenance_service.purge_expired_otps()
        self.assertGreaterEqual(count, 1)

    def test_repeated_maintenance_is_safe(self):
        maintenance_service.run_all_maintenance()
        summary = maintenance_service.run_all_maintenance()
        self.assertIn("released_expired_blocks", summary)

    def test_run_all_maintenance_returns_summary(self):
        summary = maintenance_service.run_all_maintenance()
        for key in [
            "released_expired_blocks",
            "expired_stale_applications",
            "purged_expired_otps",
            "purged_geo_evidence",
        ]:
            self.assertIn(key, summary)


class DashboardTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin", is_admin=True)
        cls.user = _make_user("Regular User")

    def test_admin_dashboard_returns_data(self):
        data = query_service.get_admin_dashboard()
        self.assertIn("active_users", data)
        self.assertIn("events_active", data)

    def test_dashboard_not_exposed_to_regular_user(self):
        from common.permissions import ensure_admin
        from rest_framework.test import APIRequestFactory
        factory = APIRequestFactory()
        request = factory.get("/api/v1/admin/dashboard/")
        request.user = self.user
        with self.assertRaises(ResourceMaskedNotFound):
            ensure_admin(request)


class AdminPortalAndBFFTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin", is_admin=True)
        cls.superadmin = _make_user("SuperAdmin", is_admin=True, is_superuser=True)
        cls.coord = _make_coordinator(cls.admin, "Coordinator")
        cls.vol = _make_user("Volunteer")
        cls.event = _make_completed_event(cls.coord, cls.vol)

    def setUp(self):
        self.client = APIClient()

    def test_admin_dashboard_api(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/v1/admin/dashboard/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("active_users", res.data)

    def test_admin_moderation_warn_and_block_api(self):
        self.client.force_authenticate(user=self.admin)
        res_warn = self.client.post(
            f"/api/v1/admin/users/{self.vol.id}/warn/",
            {"reason": "Minor guideline infraction"},
        )
        self.assertEqual(res_warn.status_code, 200)

        res_sum = self.client.get(f"/api/v1/admin/users/{self.vol.id}/moderation-summary/")
        self.assertEqual(res_sum.status_code, 200)
        self.assertGreaterEqual(res_sum.data["warning_count"], 1)

    def test_admin_audit_logs_and_maintenance_api(self):
        # Super admin accesses audit
        self.client.force_authenticate(user=self.superadmin)
        res_audit = self.client.get("/api/v1/admin/audit/")
        self.assertEqual(res_audit.status_code, 200)
        self.assertIn("results", res_audit.data)

        # Super admin runs maintenance
        res_maint = self.client.post("/api/v1/admin/maintenance/run/")
        self.assertEqual(res_maint.status_code, 200)
        self.assertIn("released_expired_blocks", res_maint.data)

    def test_feedback_submit_list_and_hide_api(self):
        self.client.force_authenticate(user=self.vol)
        res_sub = self.client.post(
            f"/api/v1/events/{self.event.id}/feedback/",
            {
                "direction": "volunteer_to_event",
                "score": 5,
                "tags": ["organized", "impactful"],
                "comment": "Had a great experience!",
            },
        )
        self.assertEqual(res_sub.status_code, 201)
        fb_id = res_sub.data["id"]

        # View my feedback
        res_my = self.client.get("/api/v1/me/feedback/")
        self.assertEqual(res_my.status_code, 200)
        self.assertGreaterEqual(len(res_my.data["results"]), 1)

        # Admin hides feedback
        self.client.force_authenticate(user=self.admin)
        res_hide = self.client.post(f"/api/v1/admin/feedback/{fb_id}/hide/", {"reason": "Policy violation"})
        self.assertEqual(res_hide.status_code, 200)
        self.assertEqual(res_hide.data["status"], "hidden")
