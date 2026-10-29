# apps/events/tests/test_models.py
from datetime import timedelta
from types import SimpleNamespace
from django.core.exceptions import ValidationError
from django.db.models import F, Q
from django.test import SimpleTestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.common.constants import (
    APPLICATION_ACCEPTED,
    APPLICATION_PENDING,
    APPLICATION_REJECTED,
    EVENT_DRAFT,
)
from apps.events.models import (
    CharityField,
    Event,
    EventApplication,
    EventCharityField,
    EventPost,
    EventQuerySet,
)


class EventModelConstraintTests(SimpleTestCase):
    def _create_dummy_user(self, user_id=1):
        return User(id=user_id, phone_hash=f"hash_{user_id}", display_name=f"User {user_id}")

    def test_event_time_constraint(self):
        coordinator = self._create_dummy_user(1)
        now = timezone.now()

        # 1. end_at earlier than start_at MUST raise ValidationError
        invalid_event = Event(
            coordinator=coordinator,
            title="Time Inverted Event",
            start_at=now + timedelta(days=2),
            end_at=now + timedelta(days=1),
        )
        with self.assertRaises(ValidationError):
            invalid_event.clean()

        # 2. end_at equal to start_at MUST raise ValidationError
        invalid_equal_event = Event(
            coordinator=coordinator,
            title="Equal Time Event",
            start_at=now + timedelta(days=1),
            end_at=now + timedelta(days=1),
        )
        with self.assertRaises(ValidationError):
            invalid_equal_event.clean()

        # 3. end_at > start_at is valid
        valid_event = Event(
            coordinator=coordinator,
            title="Valid Time Event",
            start_at=now + timedelta(days=1),
            end_at=now + timedelta(days=2),
        )
        try:
            valid_event.clean()
        except ValidationError as e:
            self.assertNotIn("end_at", e.message_dict)

        # 4. application_deadline > start_at MUST raise ValidationError
        invalid_deadline_event = Event(
            coordinator=coordinator,
            title="Late Deadline Event",
            start_at=now + timedelta(days=1),
            end_at=now + timedelta(days=2),
            application_deadline=now + timedelta(days=3),
        )
        with self.assertRaises(ValidationError):
            invalid_deadline_event.clean()

        # 5. Verify CheckConstraint definitions in Meta
        time_constraint = next(c for c in Event._meta.constraints if c.name == "ck_events_time")
        self.assertEqual(time_constraint.condition, Q(end_at__gt=F("start_at")))

        deadline_constraint = next(c for c in Event._meta.constraints if c.name == "ck_events_deadline")
        self.assertEqual(
            deadline_constraint.condition,
            Q(application_deadline__isnull=True) | Q(application_deadline__lte=F("start_at")),
        )

    def test_event_soft_delete_both_fields_required(self):
        coordinator = self._create_dummy_user(1)
        admin_user = self._create_dummy_user(99)
        now = timezone.now()

        # 1. deleted_at set without deleted_by MUST raise ValidationError
        orphan_deleted_at = Event(
            coordinator=coordinator,
            title="Orphan Deleted At Event",
            start_at=now + timedelta(days=1),
            end_at=now + timedelta(days=2),
            deleted_at=now,
            deleted_by=None,
        )
        with self.assertRaises(ValidationError):
            orphan_deleted_at.clean()

        # 2. deleted_by set without deleted_at MUST raise ValidationError
        orphan_deleted_by = Event(
            coordinator=coordinator,
            title="Orphan Deleted By Event",
            start_at=now + timedelta(days=1),
            end_at=now + timedelta(days=2),
            deleted_at=None,
            deleted_by=admin_user,
        )
        with self.assertRaises(ValidationError):
            orphan_deleted_by.clean()

        # 3. Both set is valid
        valid_soft_deleted = Event(
            coordinator=coordinator,
            title="Properly Deleted Event",
            start_at=now + timedelta(days=1),
            end_at=now + timedelta(days=2),
            deleted_at=now,
            deleted_by=admin_user,
        )
        try:
            valid_soft_deleted.clean()
        except ValidationError as e:
            self.assertNotIn("deleted_at", str(e))
            self.assertNotIn("deleted_by", str(e))

        # 4. Both None is valid (active event)
        valid_active_event = Event(
            coordinator=coordinator,
            title="Active Not Deleted Event",
            start_at=now + timedelta(days=1),
            end_at=now + timedelta(days=2),
            deleted_at=None,
            deleted_by=None,
        )
        try:
            valid_active_event.clean()
        except ValidationError as e:
            self.assertNotIn("deleted_at", str(e))
            self.assertNotIn("deleted_by", str(e))

        # 5. Verify CheckConstraint definition
        soft_delete_constraint = next(c for c in Event._meta.constraints if c.name == "ck_events_soft_delete")
        self.assertEqual(
            soft_delete_constraint.condition,
            (Q(deleted_at__isnull=True) & Q(deleted_by__isnull=True))
            | (Q(deleted_at__isnull=False) & Q(deleted_by__isnull=False)),
        )

    def test_event_post_unique_title_per_event(self):
        # 1. Verify UniqueConstraint on (event, title)
        unique_title_constraint = next(
            c for c in EventPost._meta.constraints if c.name == "uq_event_post_event_title"
        )
        self.assertEqual(list(unique_title_constraint.fields), ["event", "title"])

        # 2. Verify headcount check constraint
        headcount_constraint = next(
            c for c in EventPost._meta.constraints if c.name == "ck_event_posts_headcount"
        )
        self.assertEqual(headcount_constraint.condition, Q(required_headcount__gt=0))

        # 3. required_headcount <= 0 MUST raise ValidationError
        event = Event(id=10, title="Event")
        invalid_post = EventPost(
            event=event,
            title="Zero Headcount Post",
            required_headcount=0,
        )
        with self.assertRaises(ValidationError):
            invalid_post.clean()

    def test_event_application_unique_active_constraint(self):
        # 1. Verify UniqueConstraint on active applications
        unique_active_constraint = next(
            c for c in EventApplication._meta.constraints
            if c.name == "uq_event_application_active"
        )
        self.assertEqual(list(unique_active_constraint.fields), ["event", "user"])
        self.assertEqual(
            unique_active_constraint.condition,
            Q(status__in=["pending", "accepted", "waitlisted"]),
        )

        # 2. qr_walkin source without qr_token MUST raise ValidationError
        dummy_event = Event(id=1, title="Test Event")
        dummy_user = self._create_dummy_user(2)

        invalid_walkin = EventApplication(
            event=dummy_event,
            user=dummy_user,
            source="qr_walkin",
            qr_token=None,
        )
        with self.assertRaises(ValidationError):
            invalid_walkin.clean()

        # 3. Accepted/rejected application without decided_at MUST raise ValidationError
        invalid_accepted = EventApplication(
            event=dummy_event,
            user=dummy_user,
            source="browse",
            status=APPLICATION_ACCEPTED,
            decided_at=None,
        )
        with self.assertRaises(ValidationError):
            invalid_accepted.clean()

        invalid_rejected = EventApplication(
            event=dummy_event,
            user=dummy_user,
            source="browse",
            status=APPLICATION_REJECTED,
            decided_at=None,
        )
        with self.assertRaises(ValidationError):
            invalid_rejected.clean()

        # 4. Verify CheckConstraints in Meta
        walkin_constraint = next(
            c for c in EventApplication._meta.constraints
            if c.name == "ck_application_walkin_token"
        )
        self.assertEqual(
            walkin_constraint.condition,
            ~Q(source="qr_walkin") | Q(qr_token__isnull=False),
        )

        decided_constraint = next(
            c for c in EventApplication._meta.constraints
            if c.name == "ck_application_decided"
        )
        self.assertEqual(
            decided_constraint.condition,
            ~Q(status__in=["accepted", "rejected"]) | Q(decided_at__isnull=False),
        )

    def test_event_objects_visible_excludes_deleted(self):
        # 1. EventQuerySet has visible() method
        self.assertTrue(hasattr(Event.objects, "visible"))

        # 2. Verify that visible() adds deleted_at__isnull=True to queryset
        visible_qs = Event.objects.visible()
        self.assertIsInstance(visible_qs, EventQuerySet)

        # Inspect where clause filters
        where_children = visible_qs.query.where.children
        # The filter must contain deleted_at__isnull
        has_deleted_at_filter = any(
            "deleted_at" in str(child) for child in where_children
        )
        self.assertTrue(
            has_deleted_at_filter,
            f"Expected deleted_at__isnull=True filter in queryset, got: {where_children}",
        )

