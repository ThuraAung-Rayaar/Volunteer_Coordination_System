# apps/ops/tests/test_attendance_feedback.py
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import CoordinatorProfile, User
from apps.common.constants import (
    APPLICATION_ACCEPTED,
    ATTENDANCE_CHECKED_IN,
    COORDINATOR_APPROVED,
    FEEDBACK_COORDINATOR_TO_VOLUNTEER,
    FEEDBACK_VOLUNTEER_TO_COORDINATOR,
    FEEDBACK_VOLUNTEER_TO_EVENT,
    QR_CHECKIN,
    VERIFICATION_VERIFIED,
)
from apps.common.exceptions import (
    DomainError,
    InvalidStateError,
    OnboardingRequiredError,
    PermissionDeniedError,
)
from apps.events.models import EventApplication
from apps.events.services import (
    activate_event,
    add_post,
    complete_event,
    create_event,
    publish_event,
)
from apps.ops.models import Feedback, OnboardingAcknowledgment
from apps.ops.services import (
    acknowledge_onboarding,
    check_in,
    check_out,
    create_assignment_from_application,
    generate_qr_token,
    mark_absent,
    submit_feedback,
)


class AttendanceAndFeedbackTests(TestCase):
    def setUp(self):
        # 1. Setup Coordinator
        self.coordinator = User.objects.create(
            phone_hash="hash_coord_att",
            display_name="Coordinator Att",
            verification_status=VERIFICATION_VERIFIED,
        )
        CoordinatorProfile.objects.create(
            user=self.coordinator,
            status=COORDINATOR_APPROVED,
            approved_at=timezone.now(),
        )

        # 2. Setup Volunteers
        self.volunteer = User.objects.create(
            phone_hash="hash_vol_att1",
            display_name="Volunteer Att1",
        )
        self.volunteer2 = User.objects.create(
            phone_hash="hash_vol_att2",
            display_name="Volunteer Att2",
        )

        # 3. Setup Event & Post
        now = timezone.now()
        self.event = create_event(
            self.coordinator,
            {
                "title": "Beach Cleanup",
                "start_at": now + timedelta(days=1),
                "end_at": now + timedelta(days=1, hours=4),
                "acceptance_mode": "auto",
                "max_participants": 10,
                "require_onboarding_ack": True,
                "onboarding_text": "Please bring gloves and water.",
            },
        )
        self.post = add_post(
            self.coordinator,
            self.event,
            {"title": "Trash Collector", "required_headcount": 5},
        )
        publish_event(self.coordinator, self.event)

        # 4. Accepted Application & Assignment
        self.application = EventApplication.objects.create(
            event=self.event,
            post=self.post,
            user=self.volunteer,
            status=APPLICATION_ACCEPTED,
            decided_at=timezone.now(),
        )
        self.assignment = create_assignment_from_application(self.application)

    def test_checkin_requires_onboarding_ack_when_enabled(self):
        activate_event(self.coordinator, self.event)
        qr_token, raw_token = generate_qr_token(self.coordinator, self.event, QR_CHECKIN)

        # Checkin without onboarding acknowledgment should fail
        with self.assertRaises(OnboardingRequiredError):
            check_in(
                actor=self.volunteer,
                event=self.event,
                user=self.volunteer,
                method="qr_scan",
                qr_token=qr_token,
            )

        # Acknowledge onboarding
        ack = acknowledge_onboarding(self.volunteer, self.event)
        self.assertIsNotNone(ack.id)
        self.assertEqual(ack.onboarding_version, self.event.onboarding_version)

        # Checkin succeeds
        att = check_in(
            actor=self.volunteer,
            event=self.event,
            user=self.volunteer,
            method="qr_scan",
            qr_token=qr_token,
        )
        self.assertEqual(att.status, ATTENDANCE_CHECKED_IN)
        self.assertIsNotNone(att.checkin_at)

    def test_checkin_requires_active_event(self):
        qr_token, raw_token = generate_qr_token(self.coordinator, self.event, QR_CHECKIN)
        acknowledge_onboarding(self.volunteer, self.event)

        # Event is in 'published' status, not 'active'
        with self.assertRaises(InvalidStateError):
            check_in(
                actor=self.volunteer,
                event=self.event,
                user=self.volunteer,
                method="qr_scan",
                qr_token=qr_token,
            )

    def test_volunteer_cannot_checkin_without_qr(self):
        activate_event(self.coordinator, self.event)
        acknowledge_onboarding(self.volunteer, self.event)

        # Volunteer trying to check in without qr_scan method
        with self.assertRaises(DomainError) as ctx:
            check_in(
                actor=self.volunteer,
                event=self.event,
                user=self.volunteer,
                method="coordinator_manual",
            )
        self.assertEqual(ctx.exception.code, "invalid_checkin_method")

        # Coordinator can check in volunteer manually
        att = check_in(
            actor=self.coordinator,
            event=self.event,
            user=self.volunteer,
            method="coordinator_manual",
        )
        self.assertEqual(att.status, ATTENDANCE_CHECKED_IN)
        self.assertEqual(att.method, "coordinator_manual")

    def test_checkout_and_mark_absent(self):
        activate_event(self.coordinator, self.event)
        acknowledge_onboarding(self.volunteer, self.event)

        # Check in volunteer
        att = check_in(
            actor=self.coordinator,
            event=self.event,
            user=self.volunteer,
            method="coordinator_manual",
        )

        # Check out volunteer
        att_checked_out = check_out(actor=self.volunteer, event=self.event, user=self.volunteer)
        self.assertIsNotNone(att_checked_out.checkout_at)

        # Cannot mark absent after checked in
        with self.assertRaises(InvalidStateError):
            mark_absent(actor=self.coordinator, event=self.event, user=self.volunteer)

    def test_feedback_requires_completed_event(self):
        # Event is not completed
        with self.assertRaises(InvalidStateError) as ctx:
            submit_feedback(
                user=self.volunteer,
                event=self.event,
                direction=FEEDBACK_VOLUNTEER_TO_EVENT,
                score=5,
            )
        self.assertEqual(ctx.exception.code, "event_not_completed")

    def test_feedback_volunteer_to_coordinator_forces_target(self):
        activate_event(self.coordinator, self.event)
        acknowledge_onboarding(self.volunteer, self.event)
        check_in(self.coordinator, self.event, self.volunteer, method="coordinator_manual")
        complete_event(self.coordinator, self.event)

        # Volunteer submits feedback with target_user passed as volunteer2 or None
        fb = submit_feedback(
            user=self.volunteer,
            event=self.event,
            direction=FEEDBACK_VOLUNTEER_TO_COORDINATOR,
            target_user=self.volunteer2,  # Should be overridden to event.coordinator
            score=5,
            comment="Awesome coordinator!",
        )
        self.assertEqual(fb.target_user, self.coordinator)
        self.assertEqual(fb.direction, FEEDBACK_VOLUNTEER_TO_COORDINATOR)
        self.assertEqual(fb.score, 5)

        # Duplicate feedback is rejected
        with self.assertRaises(DomainError) as ctx:
            submit_feedback(
                user=self.volunteer,
                event=self.event,
                direction=FEEDBACK_VOLUNTEER_TO_COORDINATOR,
                score=4,
            )
        self.assertEqual(ctx.exception.code, "duplicate_feedback")

    def test_feedback_volunteer_to_event_and_coordinator_to_volunteer(self):
        activate_event(self.coordinator, self.event)
        acknowledge_onboarding(self.volunteer, self.event)
        check_in(self.coordinator, self.event, self.volunteer, method="coordinator_manual")
        complete_event(self.coordinator, self.event)

        # Volunteer submits feedback to event
        fb_event = submit_feedback(
            user=self.volunteer,
            event=self.event,
            direction=FEEDBACK_VOLUNTEER_TO_EVENT,
            score=4,
            comment="Great event!",
        )
        self.assertIsNone(fb_event.target_user)
        self.assertEqual(fb_event.score, 4)

        # Coordinator submits feedback to volunteer
        fb_vol = submit_feedback(
            user=self.coordinator,
            event=self.event,
            direction=FEEDBACK_COORDINATOR_TO_VOLUNTEER,
            target_user=self.volunteer,
            score=5,
            comment="Very hard working!",
        )
        self.assertEqual(fb_vol.target_user, self.volunteer)
        self.assertEqual(fb_vol.rater_user, self.coordinator)

        # Non-participating user cannot give event feedback
        with self.assertRaises(PermissionDeniedError):
            submit_feedback(
                user=self.volunteer2,
                event=self.event,
                direction=FEEDBACK_VOLUNTEER_TO_EVENT,
                score=3,
            )

