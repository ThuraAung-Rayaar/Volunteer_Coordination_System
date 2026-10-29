# apps/ops/tests/test_models.py
from datetime import timedelta
from django.core.exceptions import ValidationError
from django.db.models import F, Q
from django.test import SimpleTestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.common.constants import (
    ASSIGNMENT_ASSIGNED,
    ASSIGNMENT_CANCELLED,
    ATTENDANCE_CHECKED_IN,
    ATTENDANCE_COMPLETED,
    ATTENDANCE_EXPECTED,
    FEEDBACK_COORDINATOR_TO_VOLUNTEER,
    FEEDBACK_VOLUNTEER_TO_COORDINATOR,
    FEEDBACK_VOLUNTEER_TO_EVENT,
    QR_CHECKIN,
)
from apps.events.models import Event, EventApplication
from apps.ops.models import (
    Assignment,
    Attendance,
    Feedback,
    OnboardingAcknowledgment,
    QrToken,
)


class OpsModelConstraintTests(SimpleTestCase):
    def _create_dummy_user(self, user_id=1):
        return User(id=user_id, phone_hash=f"hash_{user_id}", display_name=f"User {user_id}")

    def _create_dummy_event(self, event_id=1):
        return Event(id=event_id, title=f"Event {event_id}")

    def test_qr_max_uses_boundary(self):
        event = self._create_dummy_event(1)
        user = self._create_dummy_user(1)

        # 1. max_uses <= 0 MUST raise ValidationError
        invalid_max_uses = QrToken(
            event=event,
            created_by=user,
            purpose=QR_CHECKIN,
            token_hash="hash_invalid_max",
            max_uses=0,
            used_count=0,
            expires_at=timezone.now() + timedelta(hours=1),
        )
        with self.assertRaises(ValidationError):
            invalid_max_uses.clean()

        # 2. used_count < 0 MUST raise ValidationError
        invalid_negative_used = QrToken(
            event=event,
            created_by=user,
            purpose=QR_CHECKIN,
            token_hash="hash_negative_used",
            max_uses=10,
            used_count=-1,
            expires_at=timezone.now() + timedelta(hours=1),
        )
        with self.assertRaises(ValidationError):
            invalid_negative_used.clean()

        # 3. used_count > max_uses MUST raise ValidationError
        invalid_over_used = QrToken(
            event=event,
            created_by=user,
            purpose=QR_CHECKIN,
            token_hash="hash_over_used",
            max_uses=5,
            used_count=6,
            expires_at=timezone.now() + timedelta(hours=1),
        )
        with self.assertRaises(ValidationError):
            invalid_over_used.clean()

        # 4. used_count <= max_uses is valid
        valid_qr = QrToken(
            event=event,
            created_by=user,
            purpose=QR_CHECKIN,
            token_hash="hash_valid_qr",
            max_uses=5,
            used_count=3,
            expires_at=timezone.now() + timedelta(hours=1),
        )
        try:
            valid_qr.clean()
        except ValidationError as e:
            self.assertNotIn("used_count", str(e))
            self.assertNotIn("max_uses", str(e))

        # 5. Verify CheckConstraints in Meta
        c_max = next(c for c in QrToken._meta.constraints if c.name == "ck_qr_max_uses")
        self.assertEqual(c_max.condition, Q(max_uses__isnull=True) | Q(max_uses__gt=0))

        c_nonneg = next(c for c in QrToken._meta.constraints if c.name == "ck_qr_used_count_nonnegative")
        self.assertEqual(c_nonneg.condition, Q(used_count__gte=0))

        c_limit = next(c for c in QrToken._meta.constraints if c.name == "ck_qr_used_count")
        self.assertEqual(c_limit.condition, Q(max_uses__isnull=True) | Q(used_count__lte=F("max_uses")))

    def test_assignment_unique_active_per_event_and_application(self):
        # 1. Verify UniqueConstraints
        uq_active = next(c for c in Assignment._meta.constraints if c.name == "uq_assignment_active")
        self.assertEqual(list(uq_active.fields), ["event", "user"])
        self.assertEqual(uq_active.condition, ~Q(status="cancelled"))

        uq_app = next(c for c in Assignment._meta.constraints if c.name == "uq_assignment_application")
        self.assertEqual(list(uq_app.fields), ["application"])
        self.assertEqual(uq_app.condition, ~Q(status="cancelled"))

        # 2. Actor check constraint: auto assignment with assigned_by_user MUST raise ValidationError
        event = self._create_dummy_event(1)
        user = self._create_dummy_user(1)
        app = EventApplication(id=1, event=event, user=user)

        invalid_auto_actor = Assignment(
            event=event,
            application=app,
            user=user,
            assigned_by="auto",
            assigned_by_user=user,
        )
        with self.assertRaises(ValidationError):
            invalid_auto_actor.clean()

        # 3. Manual assignment without assigned_by_user MUST raise ValidationError
        invalid_manual_actor = Assignment(
            event=event,
            application=app,
            user=user,
            assigned_by="coordinator",
            assigned_by_user=None,
        )
        with self.assertRaises(ValidationError):
            invalid_manual_actor.clean()

        # 4. Schedule check constraint: schedule_end <= schedule_start MUST raise ValidationError
        now = timezone.now()
        invalid_schedule = Assignment(
            event=event,
            application=app,
            user=user,
            assigned_by="auto",
            assigned_by_user=None,
            schedule_start=now + timedelta(hours=2),
            schedule_end=now + timedelta(hours=1),
        )
        with self.assertRaises(ValidationError):
            invalid_schedule.clean()

    def test_single_group_leader_constraint(self):
        # 1. Verify UniqueConstraint on group leader
        uq_leader = next(c for c in Assignment._meta.constraints if c.name == "uq_assignment_group_leader")
        self.assertEqual(list(uq_leader.fields), ["event", "group_code"])
        self.assertEqual(uq_leader.condition, Q(is_group_leader=True) & ~Q(status="cancelled"))

        # 2. Leader without group_code MUST raise ValidationError
        event = self._create_dummy_event(1)
        user = self._create_dummy_user(1)
        app = EventApplication(id=1, event=event, user=user)

        invalid_leader = Assignment(
            event=event,
            application=app,
            user=user,
            is_group_leader=True,
            group_code=None,
            assigned_by="auto",
            assigned_by_user=None,
        )
        with self.assertRaises(ValidationError):
            invalid_leader.clean()

        # 3. Leader with group_code is valid
        valid_leader = Assignment(
            event=event,
            application=app,
            user=user,
            is_group_leader=True,
            group_code="SQUAD_ALPHA",
            assigned_by="auto",
            assigned_by_user=None,
        )
        try:
            valid_leader.clean()
        except ValidationError as e:
            self.assertNotIn("group_code", str(e))

    def test_attendance_checkin_checkout_ordering(self):
        event = self._create_dummy_event(1)
        user = self._create_dummy_user(1)
        now = timezone.now()

        # 1. UniqueConstraint on (event, user)
        uq_attend = next(c for c in Attendance._meta.constraints if c.name == "uq_attendance_event_user")
        self.assertEqual(list(uq_attend.fields), ["event", "user"])

        # 2. Status checked_in without checkin_at MUST raise ValidationError
        invalid_checked_in = Attendance(
            event=event,
            user=user,
            status=ATTENDANCE_CHECKED_IN,
            checkin_at=None,
        )
        with self.assertRaises(ValidationError):
            invalid_checked_in.clean()

        # 3. checkout_at set without checkin_at MUST raise ValidationError
        orphan_checkout = Attendance(
            event=event,
            user=user,
            status=ATTENDANCE_EXPECTED,
            checkin_at=None,
            checkout_at=now,
        )
        with self.assertRaises(ValidationError):
            orphan_checkout.clean()

        # 4. checkout_at < checkin_at MUST raise ValidationError
        inverted_checkout = Attendance(
            event=event,
            user=user,
            status=ATTENDANCE_COMPLETED,
            checkin_at=now + timedelta(hours=2),
            checkout_at=now + timedelta(hours=1),
        )
        with self.assertRaises(ValidationError):
            inverted_checkout.clean()

        # 5. checkout_at >= checkin_at is valid
        valid_completed = Attendance(
            event=event,
            user=user,
            status=ATTENDANCE_COMPLETED,
            checkin_at=now,
            checkout_at=now + timedelta(hours=4),
        )
        try:
            valid_completed.clean()
        except ValidationError as e:
            self.assertNotIn("checkin_at", str(e))
            self.assertNotIn("checkout_at", str(e))

    def test_feedback_direction_target_constraint(self):
        event = self._create_dummy_event(1)
        rater = self._create_dummy_user(1)
        target = self._create_dummy_user(2)

        # 1. volunteer_to_event with target_user MUST raise ValidationError
        invalid_event_feedback = Feedback(
            event=event,
            rater_user=rater,
            target_user=target,
            direction=FEEDBACK_VOLUNTEER_TO_EVENT,
            score=5,
        )
        with self.assertRaises(ValidationError):
            invalid_event_feedback.clean()

        # 2. volunteer_to_event without target_user is valid
        valid_event_feedback = Feedback(
            event=event,
            rater_user=rater,
            target_user=None,
            direction=FEEDBACK_VOLUNTEER_TO_EVENT,
            score=5,
        )
        try:
            valid_event_feedback.clean()
        except ValidationError as e:
            self.assertNotIn("target_user", str(e))

        # 3. coordinator_to_volunteer without target_user MUST raise ValidationError
        invalid_coord_feedback = Feedback(
            event=event,
            rater_user=rater,
            target_user=None,
            direction=FEEDBACK_COORDINATOR_TO_VOLUNTEER,
            score=4,
        )
        with self.assertRaises(ValidationError):
            invalid_coord_feedback.clean()

        # 4. volunteer_to_coordinator without target_user MUST raise ValidationError
        invalid_vol_coord_feedback = Feedback(
            event=event,
            rater_user=rater,
            target_user=None,
            direction=FEEDBACK_VOLUNTEER_TO_COORDINATOR,
            score=4,
        )
        with self.assertRaises(ValidationError):
            invalid_vol_coord_feedback.clean()

        # 5. score out of bounds (< 1 or > 5) MUST raise ValidationError
        low_score = Feedback(
            event=event,
            rater_user=rater,
            target_user=target,
            direction=FEEDBACK_COORDINATOR_TO_VOLUNTEER,
            score=0,
        )
        with self.assertRaises(ValidationError):
            low_score.clean()

        high_score = Feedback(
            event=event,
            rater_user=rater,
            target_user=target,
            direction=FEEDBACK_COORDINATOR_TO_VOLUNTEER,
            score=6,
        )
        with self.assertRaises(ValidationError):
            high_score.clean()

        # 6. Verify unique constraints in Meta
        uq_event_fb = next(c for c in Feedback._meta.constraints if c.name == "uq_feedback_event_once")
        self.assertEqual(list(uq_event_fb.fields), ["event", "rater_user", "direction"])
        self.assertEqual(uq_event_fb.condition, Q(target_user__isnull=True))

        uq_user_fb = next(c for c in Feedback._meta.constraints if c.name == "uq_feedback_user_once")
        self.assertEqual(list(uq_user_fb.fields), ["event", "rater_user", "direction", "target_user"])
        self.assertEqual(uq_user_fb.condition, Q(target_user__isnull=False))

