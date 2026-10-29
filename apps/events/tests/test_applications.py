# apps/events/tests/test_applications.py
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import CoordinatorProfile, User
from apps.common.constants import (
    APPLICATION_ACCEPTED,
    APPLICATION_PENDING,
    APPLICATION_WAITLISTED,
    APPLICATION_WITHDRAWN,
    ASSIGNMENT_ASSIGNED,
    ASSIGNMENT_CANCELLED,
    COORDINATOR_APPROVED,
    EVENT_ACTIVE,
    EVENT_PUBLISHED,
    VERIFICATION_VERIFIED,
)
from apps.common.exceptions import CapacityFullError, DomainError
from apps.events.models import Event, EventApplication, EventPost
from apps.events.services import (
    accept_application,
    add_post,
    apply_to_event,
    create_event,
    publish_event,
    reject_application,
    withdraw_application,
)
from apps.ops.models import Assignment


class EventApplicationsTests(TestCase):
    def setUp(self):
        self.coordinator = User.objects.create(
            phone_hash="coord_hash_apps",
            display_name="Coordinator Apps",
            verification_status=VERIFICATION_VERIFIED,
        )
        CoordinatorProfile.objects.create(
            user=self.coordinator,
            status=COORDINATOR_APPROVED,
            approved_at=timezone.now(),
        )

        self.volunteer1 = User.objects.create(
            phone_hash="vol_hash_1",
            display_name="Volunteer 1",
            physical_ok=True,
            can_lift_heavy=True,
            skills=["first_aid", "driving"],
        )
        self.volunteer2 = User.objects.create(
            phone_hash="vol_hash_2",
            display_name="Volunteer 2",
            physical_ok=True,
            skills=["first_aid"],
        )

        now = timezone.now()
        self.event = create_event(
            self.coordinator,
            {
                "title": "Medical Camp",
                "start_at": now + timedelta(days=7),
                "end_at": now + timedelta(days=7, hours=5),
                "application_deadline": now + timedelta(days=3),
                "acceptance_mode": "auto",
                "max_participants": 2,
            },
        )
        self.post = add_post(
            self.coordinator,
            self.event,
            {
                "title": "First Aid Responder",
                "required_headcount": 1,
                "required_skills": ["first_aid"],
            },
        )
        publish_event(self.coordinator, self.event)

    def test_duplicate_active_application_blocked(self):
        # 1. Apply to event
        app1 = apply_to_event(self.volunteer1, self.event, post=self.post)
        self.assertEqual(app1.status, APPLICATION_ACCEPTED)

        # 2. Applying again must raise duplicate application error
        with self.assertRaises(DomainError) as ctx:
            apply_to_event(self.volunteer1, self.event, post=self.post)
        self.assertEqual(ctx.exception.code, "duplicate_application")

    def test_auto_acceptance_with_capacity_creates_accepted(self):
        # Capacity is 1 on post, volunteer1 applies
        app = apply_to_event(self.volunteer1, self.event, post=self.post)
        self.assertEqual(app.status, APPLICATION_ACCEPTED)
        self.assertIsNotNone(app.decided_at)

        # Because auto_assign_enabled is True, assignment should be created automatically
        assignment = Assignment.objects.filter(application=app, user=self.volunteer1).first()
        self.assertIsNotNone(assignment)
        self.assertEqual(assignment.status, ASSIGNMENT_ASSIGNED)
        self.assertEqual(assignment.assigned_by, "auto")

    def test_auto_acceptance_full_capacity_waitlists(self):
        # Fill capacity
        app1 = apply_to_event(self.volunteer1, self.event, post=self.post)
        self.assertEqual(app1.status, APPLICATION_ACCEPTED)

        # Second volunteer applies for the same post whose capacity is 1
        app2 = apply_to_event(self.volunteer2, self.event, post=self.post)
        self.assertEqual(app2.status, APPLICATION_WAITLISTED)
        self.assertIsNotNone(app2.decided_at)

    def test_past_deadline_application_fails(self):
        # Set deadline to 1 hour in the past
        self.event.application_deadline = timezone.now() - timedelta(hours=1)
        self.event.save()

        with self.assertRaises(DomainError) as ctx:
            apply_to_event(self.volunteer1, self.event, post=self.post)
        self.assertEqual(ctx.exception.code, "deadline_passed")

    def test_manual_application_and_accept_creates_assignment(self):
        # Set event to manual acceptance mode
        self.event.acceptance_mode = "manual"
        self.event.save()

        # Apply -> status should be pending
        app = apply_to_event(self.volunteer1, self.event, post=self.post)
        self.assertEqual(app.status, APPLICATION_PENDING)
        self.assertIsNone(app.decided_at)

        # Coordinator accepts application
        accepted_app, assignment = accept_application(self.coordinator, app)
        self.assertEqual(accepted_app.status, APPLICATION_ACCEPTED)
        self.assertEqual(accepted_app.decided_by, self.coordinator)
        self.assertIsNotNone(accepted_app.decided_at)
        self.assertIsNotNone(assignment)
        self.assertEqual(assignment.assigned_by, "coordinator")
        self.assertEqual(assignment.assigned_by_user, self.coordinator)

    def test_withdraw_application_cancels_assignment(self):
        app = apply_to_event(self.volunteer1, self.event, post=self.post)
        self.assertEqual(app.status, APPLICATION_ACCEPTED)
        assignment = Assignment.objects.get(application=app)

        # Volunteer withdraws
        withdrawn_app = withdraw_application(self.volunteer1, app)
        self.assertEqual(withdrawn_app.status, APPLICATION_WITHDRAWN)

        assignment.refresh_from_db()
        self.assertEqual(assignment.status, ASSIGNMENT_CANCELLED)

