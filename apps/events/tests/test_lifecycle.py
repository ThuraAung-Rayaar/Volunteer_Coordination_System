# apps/events/tests/test_lifecycle.py
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import CoordinatorProfile, User
from apps.common.constants import (
    ASSIGNMENT_ASSIGNED,
    ASSIGNMENT_CANCELLED,
    ASSIGNMENT_COMPLETED,
    ASSIGNMENT_CONFIRMED,
    ATTENDANCE_ABSENT,
    ATTENDANCE_CHECKED_IN,
    ATTENDANCE_COMPLETED,
    ATTENDANCE_EXPECTED,
    COORDINATOR_APPROVED,
    EVENT_ACTIVE,
    EVENT_CANCELLED,
    EVENT_COMPLETED,
    EVENT_DRAFT,
    EVENT_PUBLISHED,
    VERIFICATION_VERIFIED,
)
from apps.common.exceptions import DomainError, InvalidStateError, PermissionDeniedError
from apps.events.models import Event, EventApplication, EventPost
from apps.events.services import (
    activate_event,
    add_post,
    cancel_event,
    close_post,
    complete_event,
    create_event,
    publish_event,
    update_event,
    update_post,
)
from apps.ops.models import Assignment, Attendance


class EventLifecycleTests(TestCase):
    def setUp(self):
        self.coordinator = User.objects.create(
            phone_hash="coord_hash_1",
            display_name="Coordinator One",
            verification_status=VERIFICATION_VERIFIED,
        )
        CoordinatorProfile.objects.create(
            user=self.coordinator,
            status=COORDINATOR_APPROVED,
            approved_at=timezone.now(),
        )

        self.volunteer = User.objects.create(
            phone_hash="vol_hash_1",
            display_name="Volunteer One",
        )

        now = timezone.now()
        self.start_at = now + timedelta(days=5)
        self.end_at = self.start_at + timedelta(hours=4)

    def test_publish_requires_at_least_one_post(self):
        # 1. Create draft event
        event = create_event(
            self.coordinator,
            {
                "title": "Beach Cleanup",
                "start_at": self.start_at,
                "end_at": self.end_at,
            },
        )
        self.assertEqual(event.status, EVENT_DRAFT)

        # 2. Attempt publish without posts -> fails
        with self.assertRaises(DomainError) as ctx:
            publish_event(self.coordinator, event)
        self.assertEqual(ctx.exception.code, "post_required")

        # 3. Add post and publish -> succeeds
        add_post(self.coordinator, event, {"title": "Trash Collector", "required_headcount": 10})
        published_event = publish_event(self.coordinator, event)
        self.assertEqual(published_event.status, EVENT_PUBLISHED)

    def test_invalid_lifecycle_transition_raises_error(self):
        event = create_event(
            self.coordinator,
            {
                "title": "Park Tree Planting",
                "start_at": self.start_at,
                "end_at": self.end_at,
            },
        )
        add_post(self.coordinator, event, {"title": "Planter", "required_headcount": 5})

        # Cannot directly complete or activate draft
        with self.assertRaises(InvalidStateError):
            activate_event(self.coordinator, event)

        with self.assertRaises(InvalidStateError):
            complete_event(self.coordinator, event)

        # Valid: draft -> published
        publish_event(self.coordinator, event)
        self.assertEqual(event.status, EVENT_PUBLISHED)

        # Valid: published -> active
        activate_event(self.coordinator, event)
        self.assertEqual(event.status, EVENT_ACTIVE)

        # Cannot activate already active event
        with self.assertRaises(InvalidStateError):
            activate_event(self.coordinator, event)

        # Valid: active -> completed
        complete_event(self.coordinator, event)
        self.assertEqual(event.status, EVENT_COMPLETED)

        # Cannot cancel completed event
        with self.assertRaises(InvalidStateError):
            cancel_event(self.coordinator, event)

    def test_onboarding_text_change_increments_version(self):
        event = create_event(
            self.coordinator,
            {
                "title": "Soup Kitchen",
                "start_at": self.start_at,
                "end_at": self.end_at,
                "onboarding_text": "Please bring a clean apron.",
            },
        )
        self.assertEqual(event.onboarding_version, 1)

        # Update without changing onboarding text
        update_event(self.coordinator, event, {"location_name": "Community Center"})
        event.refresh_from_db()
        self.assertEqual(event.onboarding_version, 1)

        # Update onboarding text -> increments version to 2
        update_event(self.coordinator, event, {"onboarding_text": "Please bring clean apron and closed shoes."})
        event.refresh_from_db()
        self.assertEqual(event.onboarding_version, 2)

    def test_complete_event_cascades_status_to_assignments(self):
        event = create_event(
            self.coordinator,
            {
                "title": "Charity Marathon",
                "start_at": self.start_at,
                "end_at": self.end_at,
            },
        )
        post = add_post(self.coordinator, event, {"title": "Water Station", "required_headcount": 2})
        publish_event(self.coordinator, event)
        activate_event(self.coordinator, event)

        # Create accepted application and active assignment
        app = EventApplication.objects.create(
            event=event,
            post=post,
            user=self.volunteer,
            status="accepted",
            decided_at=timezone.now(),
        )
        assign = Assignment.objects.create(
            event=event,
            post=post,
            user=self.volunteer,
            application=app,
            status=ASSIGNMENT_CONFIRMED,
            assigned_by="coordinator",
            assigned_by_user=self.coordinator,
        )
        attend = Attendance.objects.create(
            event=event,
            user=self.volunteer,
            assignment=assign,
            status=ATTENDANCE_CHECKED_IN,
            checkin_at=timezone.now(),
        )

        # Complete event
        complete_event(self.coordinator, event)
        self.assertEqual(event.status, EVENT_COMPLETED)

        # Assignment and attendance must be completed
        assign.refresh_from_db()
        attend.refresh_from_db()
        self.assertEqual(assign.status, ASSIGNMENT_COMPLETED)
        self.assertEqual(attend.status, ATTENDANCE_COMPLETED)

    def test_cancel_event_cascades_status(self):
        event = create_event(
            self.coordinator,
            {
                "title": "Outdoor Concert Aid",
                "start_at": self.start_at,
                "end_at": self.end_at,
            },
        )
        post = add_post(self.coordinator, event, {"title": "Usher", "required_headcount": 2})
        publish_event(self.coordinator, event)
        activate_event(self.coordinator, event)

        app = EventApplication.objects.create(
            event=event,
            post=post,
            user=self.volunteer,
            status="accepted",
            decided_at=timezone.now(),
        )
        assign = Assignment.objects.create(
            event=event,
            post=post,
            user=self.volunteer,
            application=app,
            status=ASSIGNMENT_ASSIGNED,
            assigned_by="coordinator",
            assigned_by_user=self.coordinator,
        )
        attend = Attendance.objects.create(
            event=event,
            user=self.volunteer,
            assignment=assign,
            status=ATTENDANCE_EXPECTED,
        )

        cancel_event(self.coordinator, event, reason="Storm warning")
        self.assertEqual(event.status, EVENT_CANCELLED)

        assign.refresh_from_db()
        attend.refresh_from_db()
        self.assertEqual(assign.status, ASSIGNMENT_CANCELLED)
        self.assertEqual(attend.status, ATTENDANCE_ABSENT)
