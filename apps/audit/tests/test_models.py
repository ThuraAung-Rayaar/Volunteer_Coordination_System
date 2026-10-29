# apps/audit/tests/test_models.py
from datetime import timedelta
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.test import SimpleTestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.audit.models import AuditLog, ModerationAction
from apps.events.models import Event
from apps.ops.models import Feedback


class AuditModelConstraintTests(SimpleTestCase):
    def _create_dummy_user(self, user_id=1):
        return User(id=user_id, phone_hash=f"hash_{user_id}", display_name=f"User {user_id}")

    def test_audit_log_append_only(self):
        actor = self._create_dummy_user(1)
        log = AuditLog(
            id=10,
            actor_user=actor,
            action="user_created",
            entity_type="user",
            entity_id=1,
        )
        # Mark as already persisted
        log._state.adding = False

        # 1. Updating existing AuditLog MUST raise ValidationError
        with self.assertRaises(ValidationError) as ctx:
            log.save()
        self.assertIn("append-only", str(ctx.exception))

        # 2. Deleting AuditLog MUST raise ValidationError
        with self.assertRaises(ValidationError) as ctx:
            log.delete()
        self.assertIn("append-only", str(ctx.exception))

    def test_moderation_action_subject_validation(self):
        admin_user = self._create_dummy_user(99)
        target_user = self._create_dummy_user(10)
        event = Event(id=1, title="Test Event")
        feedback = Feedback(id=1, event=event, rater_user=target_user)

        # 1. User action without target_user MUST raise ValidationError
        invalid_user_mod = ModerationAction(
            admin_user=admin_user,
            action_type="user_block",
            target_user=None,
        )
        with self.assertRaises(ValidationError):
            invalid_user_mod.clean()

        # User action with target_user is valid
        valid_user_mod = ModerationAction(
            admin_user=admin_user,
            action_type="user_warning",
            target_user=target_user,
        )
        try:
            valid_user_mod.clean()
        except ValidationError as e:
            self.assertNotIn("target_user", str(e))

        # 2. Event action without event MUST raise ValidationError
        invalid_event_mod = ModerationAction(
            admin_user=admin_user,
            action_type="event_cancel",
            event=None,
        )
        with self.assertRaises(ValidationError):
            invalid_event_mod.clean()

        # Event action with event is valid
        valid_event_mod = ModerationAction(
            admin_user=admin_user,
            action_type="event_delete",
            event=event,
        )
        try:
            valid_event_mod.clean()
        except ValidationError as e:
            self.assertNotIn("event", str(e))

        # 3. Feedback action without feedback MUST raise ValidationError
        invalid_feedback_mod = ModerationAction(
            admin_user=admin_user,
            action_type="feedback_hide",
            feedback=None,
        )
        with self.assertRaises(ValidationError):
            invalid_feedback_mod.clean()

        # Feedback action with feedback is valid
        valid_feedback_mod = ModerationAction(
            admin_user=admin_user,
            action_type="feedback_hide",
            feedback=feedback,
        )
        try:
            valid_feedback_mod.clean()
        except ValidationError as e:
            self.assertNotIn("feedback", str(e))

        # 4. Verify CheckConstraint in Meta
        subject_constraint = next(
            c for c in ModerationAction._meta.constraints
            if c.name == "ck_moderation_subject"
        )
        self.assertIsNotNone(subject_constraint)

    def test_moderation_action_expiry_only_on_user_block(self):
        admin_user = self._create_dummy_user(99)
        target_user = self._create_dummy_user(10)
        event = Event(id=1, title="Test Event")
        now = timezone.now()

        # 1. user_block with expires_at is valid
        valid_expiring_block = ModerationAction(
            admin_user=admin_user,
            action_type="user_block",
            target_user=target_user,
            expires_at=now + timedelta(days=7),
        )
        try:
            valid_expiring_block.clean()
        except ValidationError as e:
            self.assertNotIn("expires_at", str(e))

        # 2. user_warning with expires_at MUST raise ValidationError
        invalid_warning = ModerationAction(
            admin_user=admin_user,
            action_type="user_warning",
            target_user=target_user,
            expires_at=now + timedelta(days=7),
        )
        with self.assertRaises(ValidationError):
            invalid_warning.clean()

        # 3. event_cancel with expires_at MUST raise ValidationError
        invalid_event_cancel = ModerationAction(
            admin_user=admin_user,
            action_type="event_cancel",
            event=event,
            expires_at=now + timedelta(days=7),
        )
        with self.assertRaises(ValidationError):
            invalid_event_cancel.clean()

        # 4. Verify CheckConstraint in Meta
        expiry_constraint = next(
            c for c in ModerationAction._meta.constraints
            if c.name == "ck_moderation_expiry"
        )
        self.assertEqual(
            expiry_constraint.condition,
            Q(expires_at__isnull=True) | Q(action_type="user_block"),
        )

