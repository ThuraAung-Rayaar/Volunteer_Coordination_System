import uuid
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Users
from apps.attendance.models import Attendance
from apps.audit.models import AuditLogs, Feedback, ModerationActions
from apps.events.models import EventApplications, EventPosts, Events
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


def _phone():
    return f"+959{uuid.uuid4().int % 900000000 + 100000000}"


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


def _make_completed_event(coord, volunteer):
    """Create an event, assign the volunteer, and complete it so feedback is allowed."""
    start = timezone.now() + timedelta(hours=1)
    end = timezone.now() + timedelta(hours=4)
    event = Events.objects.create(
        owner_id=coord.id,
        current_coordinator_id=coord.id,
        title="Service Verification Event",
        start_at=start,
        end_at=end,
        acceptance_mode="auto",
        auto_assign_enabled=True,
        require_onboarding_ack=False,
    )
    EventPosts.objects.create(event=event, title="Service Volunteer", required_headcount=5)
    Events.objects.filter(id=event.id).update(status="published")
    Events.objects.filter(id=event.id).update(status="active")
    EventApplications.objects.create(
        event=event,
        user=volunteer,
        source="browse",
        conditions_acknowledged_at=timezone.now(),
    )
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


class Phase8ServiceIntegrationTests(TestCase):
    """Integration tests for Phase 8 service methods, boundaries, and transaction rollbacks."""

    @classmethod
    def setUpTestData(cls):
        cls.super_admin = _make_user("SuperAdmin", is_admin=True, is_superuser=True)
        cls.standard_admin = _make_user("StdAdmin", is_admin=True, is_superuser=False)
        cls.coord = _make_user("CoordinatorUser", verified=True)
        coordinator_service.apply_for_coordinator(cls.coord, "Coord notes")
        coordinator_service.approve_coordinator(cls.super_admin, cls.coord.id, "Approved")
        cls.coord.refresh_from_db()

        cls.vol = _make_user("VolunteerUser")
        cls.event = _make_completed_event(cls.coord, cls.vol)

    def test_feedback_service_lifecycle(self):
        # 1. Volunteer to Event
        fb1 = feedback_service.submit_event_feedback(
            self.vol,
            self.event.id,
            "volunteer_to_event",
            score=5,
            tags=["fun", "well_organized"],
            comment="Awesome experience",
        )
        self.assertEqual(fb1.status, "active")
        self.assertIsNone(fb1.target_user_id)

        # 2. Coordinator to Volunteer
        fb2 = feedback_service.submit_event_feedback(
            self.coord,
            self.event.id,
            "coordinator_to_volunteer",
            score=4,
            tags=["punctual"],
            comment="Great initiative",
            target_user_id=self.vol.id,
        )
        self.assertEqual(fb2.target_user_id, self.vol.id)

        # 3. List feedback
        event_fbs = feedback_service.list_event_feedback(self.coord, self.event.id)
        self.assertEqual(len(event_fbs), 2)

        # 4. Volunteer history
        vol_history = feedback_service.get_user_feedback_history(self.vol)
        self.assertEqual(len(vol_history), 1)
        self.assertEqual(vol_history[0]["id"], fb1.id)

        # 5. Hide feedback via moderation
        feedback_service.hide_feedback(self.standard_admin, fb1.id, reason="Inappropriate language")
        fb1.refresh_from_db()
        self.assertEqual(fb1.status, "hidden")

    def test_feedback_service_validation_errors(self):
        # Invalid direction
        with self.assertRaises(DomainError) as ctx:
            feedback_service.submit_event_feedback(self.vol, self.event.id, "invalid_dir", 5)
        self.assertEqual(ctx.exception.code, "invalid_feedback_direction")

        # Invalid score bounds
        with self.assertRaises(DomainError) as ctx:
            feedback_service.submit_event_feedback(self.vol, self.event.id, "volunteer_to_event", 0)
        self.assertEqual(ctx.exception.code, "invalid_feedback_score")

        with self.assertRaises(DomainError) as ctx:
            feedback_service.submit_event_feedback(self.vol, self.event.id, "volunteer_to_event", 6)
        self.assertEqual(ctx.exception.code, "invalid_feedback_score")

    def test_moderation_service_super_admin_gating(self):
        # Standard admin attempting super-admin action (account_close) must receive ResourceMaskedNotFound
        with self.assertRaises(ResourceMaskedNotFound):
            moderation_service.record_moderation_action(
                self.standard_admin,
                action_type="account_close",
                target_user_id=self.vol.id,
                reason="Terms of service violation",
            )

        # Super Admin executes successfully
        action = moderation_service.record_moderation_action(
            self.super_admin,
            action_type="account_close",
            target_user_id=self.vol.id,
            reason="Confirmed TOS violation",
        )
        self.assertEqual(action.action_type, "account_close")

    def test_moderation_service_self_moderation_guard(self):
        with self.assertRaises(PermissionDeniedError) as ctx:
            moderation_service.record_moderation_action(
                self.standard_admin,
                action_type="user_warning",
                target_user_id=self.standard_admin.id,
                reason="Self test",
            )
        self.assertEqual(ctx.exception.code, "no_self_moderation")

    def test_moderation_service_reason_required(self):
        with self.assertRaises(DomainError) as ctx:
            moderation_service.record_moderation_action(
                self.standard_admin,
                action_type="user_block",
                target_user_id=self.vol.id,
                reason="",  # reason required for user_block
            )
        self.assertEqual(ctx.exception.code, "reason_required")

    def test_moderation_service_detail_and_list(self):
        action = moderation_service.record_moderation_action(
            self.standard_admin,
            action_type="user_warning",
            target_user_id=self.vol.id,
            reason="Verbal warning issued",
        )
        detail = moderation_service.get_moderation_action_detail(self.standard_admin, action.id)
        self.assertEqual(detail["id"], action.id)
        self.assertEqual(detail["action_type"], "user_warning")

        history = moderation_service.list_moderation_actions(self.standard_admin, target_user_id=self.vol.id)
        self.assertTrue(any(item["id"] == action.id for item in history))

    def test_audit_service_super_admin_restriction(self):
        # Standard admin querying full audit records gets 404 masked
        with self.assertRaises(ResourceMaskedNotFound):
            audit_service.get_audit_records(self.standard_admin)

        # Super Admin retrieves audit records successfully
        logs = audit_service.get_audit_records(self.super_admin)
        self.assertIsInstance(logs, list)

        # Detail query
        if logs:
            detail = audit_service.get_audit_log_detail(self.super_admin, logs[0]["id"])
            self.assertEqual(detail["id"], logs[0]["id"])

    def test_maintenance_service_execution(self):
        summary = maintenance_service.run_all_maintenance()
        self.assertIn("released_expired_blocks", summary)
        self.assertIn("expired_stale_applications", summary)
        self.assertIn("purged_expired_otps", summary)
        self.assertIn("purged_geo_evidence", summary)
        # Idempotent execution
        summary2 = maintenance_service.run_all_maintenance()
        self.assertIn("released_expired_blocks", summary2)

    def test_transaction_rollback_atomicity(self):
        """Simulate unexpected failure during moderation to verify atomic rollback."""
        initial_count = ModerationActions.objects.count()
        with patch.object(ModerationActions.objects, "create", side_effect=RuntimeError("Simulated DB Crash")):
            with self.assertRaises(RuntimeError):
                moderation_service.record_moderation_action(
                    self.standard_admin,
                    action_type="user_warning",
                    target_user_id=self.vol.id,
                    reason="Test crash",
                )
        self.assertEqual(ModerationActions.objects.count(), initial_count)
