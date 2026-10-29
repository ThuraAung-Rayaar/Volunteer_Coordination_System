# apps/audit/tests/test_moderation.py
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import CoordinatorProfile, User
from apps.audit.models import AuditLog, ModerationAction
from apps.audit.services import (
    block_user,
    close_account,
    dashboard_stats,
    delete_event,
    hide_feedback,
    reinstate_account,
    restore_event,
    unblock_user,
    warn_user,
)
from apps.common.constants import (
    COORDINATOR_APPROVED,
    FEEDBACK_VOLUNTEER_TO_EVENT,
    VERIFICATION_VERIFIED,
)
from apps.common.exceptions import PermissionDeniedError
from apps.events.models import Event
from apps.events.services import (
    activate_event,
    add_post,
    complete_event,
    create_event,
    publish_event,
)
from apps.ops.models import Feedback
from apps.ops.services import (
    create_assignment_from_application,
    submit_feedback,
)
from apps.events.models import EventApplication


class ModerationServicesTests(TestCase):
    def setUp(self):
        # 1. Setup Admin
        self.admin = User.objects.create(
            phone_hash="hash_admin_mod",
            display_name="Super Admin",
            is_admin=True,
        )

        # 2. Setup regular user
        self.user = User.objects.create(
            phone_hash="hash_regular_user",
            display_name="Regular Volunteer",
            account_status="active",
        )

        # 3. Setup coordinator & event
        self.coordinator = User.objects.create(
            phone_hash="hash_coord_mod",
            display_name="Coordinator Mod",
            verification_status=VERIFICATION_VERIFIED,
        )
        CoordinatorProfile.objects.create(
            user=self.coordinator,
            status=COORDINATOR_APPROVED,
            approved_at=timezone.now(),
        )

        now = timezone.now()
        self.event = create_event(
            self.coordinator,
            {
                "title": "Clean River Event",
                "start_at": now + timedelta(days=3),
                "end_at": now + timedelta(days=3, hours=5),
            },
        )
        self.post = add_post(
            self.coordinator,
            self.event,
            {"title": "Water Collector", "required_headcount": 5},
        )
        publish_event(self.coordinator, self.event)

    def test_block_user_updates_state_and_writes_moderation_and_audit(self):
        expires_at = timezone.now() + timedelta(days=7)
        mod_action = block_user(
            admin=self.admin,
            target_user=self.user,
            reason="Violation of safety policies.",
            expires_at=expires_at,
        )

        # Check user state
        self.user.refresh_from_db()
        self.assertEqual(self.user.account_status, "blocked")
        self.assertIsNotNone(self.user.blocked_until)

        # Check moderation action
        self.assertEqual(mod_action.action_type, "user_block")
        self.assertEqual(mod_action.admin_user, self.admin)
        self.assertEqual(mod_action.target_user, self.user)
        self.assertEqual(mod_action.reason, "Violation of safety policies.")

        # Check audit log written
        audit = AuditLog.objects.filter(entity_type="user", entity_id=self.user.id, action="block_user").first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor_user, self.admin)
        self.assertEqual(audit.after_data["account_status"], "blocked")

    def test_delete_event_sets_soft_delete_and_hides_from_queries(self):
        mod_action = delete_event(
            admin=self.admin,
            event=self.event,
            reason="Event violates terms of service.",
        )

        self.event.refresh_from_db()
        self.assertIsNotNone(self.event.deleted_at)
        self.assertEqual(self.event.deleted_by, self.admin)

        # Event visible() queryset hides soft-deleted events
        visible_events = Event.objects.visible()
        self.assertNotIn(self.event, visible_events)

        # Restore event
        restore_event(admin=self.admin, event=self.event, reason="Resolved appeal.")
        self.event.refresh_from_db()
        self.assertIsNone(self.event.deleted_at)
        self.assertIsNone(self.event.deleted_by)
        self.assertIn(self.event, Event.objects.visible())

    def test_non_admin_cannot_execute_moderation(self):
        with self.assertRaises(PermissionDeniedError):
            block_user(admin=self.user, target_user=self.coordinator, reason="Unauthorized block")

        with self.assertRaises(PermissionDeniedError):
            delete_event(admin=self.user, event=self.event, reason="Unauthorized delete")

        with self.assertRaises(PermissionDeniedError):
            warn_user(admin=self.user, target_user=self.coordinator, reason="Unauthorized warn")

    def test_user_lifecycle_moderations(self):
        # 1. Warn
        warn = warn_user(self.admin, self.user, reason="Minor warning.")
        self.assertEqual(warn.action_type, "user_warning")

        # 2. Block and Unblock
        block_user(self.admin, self.user, reason="Temp block.")
        self.user.refresh_from_db()
        self.assertEqual(self.user.account_status, "blocked")

        unblock_user(self.admin, self.user, reason="Appeal granted.")
        self.user.refresh_from_db()
        self.assertEqual(self.user.account_status, "active")

        # 3. Close and Reinstate
        close_account(self.admin, self.user, reason="Permanent violation.")
        self.user.refresh_from_db()
        self.assertEqual(self.user.account_status, "closed")

        reinstate_account(self.admin, self.user, reason="Reinstated after review.")
        self.user.refresh_from_db()
        self.assertEqual(self.user.account_status, "active")

    def test_hide_feedback_and_dashboard_stats(self):
        app = EventApplication.objects.create(
            event=self.event,
            post=self.post,
            user=self.user,
            status="accepted",
            decided_at=timezone.now(),
        )
        create_assignment_from_application(app)
        activate_event(self.coordinator, self.event)
        complete_event(self.coordinator, self.event)

        fb = submit_feedback(
            user=self.user,
            event=self.event,
            direction=FEEDBACK_VOLUNTEER_TO_EVENT,
            score=1,
            comment="Inappropriate comment content.",
        )

        mod = hide_feedback(self.admin, fb, reason="Contains abusive language.")
        self.assertEqual(mod.action_type, "feedback_hide")
        fb.refresh_from_db()
        self.assertEqual(fb.status, "hidden")

        stats = dashboard_stats()
        self.assertIn("active_users", stats)
        self.assertIn("blocked_users", stats)
        self.assertIn("events_completed", stats)
        self.assertGreaterEqual(stats["events_completed"], 1)

    def test_cancel_event_by_admin(self):
        from apps.audit.services import cancel_event_by_admin
        mod = cancel_event_by_admin(self.admin, self.event, reason="Severe flood warning.")
        self.assertEqual(mod.action_type, "event_cancel")
        self.assertEqual(mod.admin_user, self.admin)
        self.event.refresh_from_db()
        self.assertEqual(self.event.status, "cancelled")

