# apps/ops/tests/test_assignment.py
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import CoordinatorProfile, User
from apps.common.constants import (
    APPLICATION_ACCEPTED,
    ASSIGNMENT_ASSIGNED,
    ASSIGNMENT_CANCELLED,
    ASSIGNMENT_CONFIRMED,
    ATTENDANCE_EXPECTED,
    COORDINATOR_APPROVED,
    VERIFICATION_VERIFIED,
)
from apps.common.exceptions import DomainError, InvalidStateError, PermissionDeniedError
from apps.events.models import Event, EventApplication, EventPost
from apps.events.services import add_post, create_event, publish_event
from apps.ops.models import Assignment, Attendance
from apps.ops.services import (
    assign_manually,
    cancel_assignment,
    confirm_assignment,
    create_assignment_from_application,
    run_auto_assignment,
)


class AssignmentEngineTests(TestCase):
    def setUp(self):
        # 1. Setup coordinator
        self.coordinator = User.objects.create(
            phone_hash="hash_coord_assign",
            display_name="Coord Assign",
            verification_status=VERIFICATION_VERIFIED,
        )
        CoordinatorProfile.objects.create(
            user=self.coordinator,
            status=COORDINATOR_APPROVED,
            approved_at=timezone.now(),
        )

        # 2. Setup volunteers with distinct skill/physical profiles
        self.heavy_skilled_volunteer = User.objects.create(
            phone_hash="vol_heavy",
            display_name="Heavy Skilled Vol",
            physical_ok=True,
            can_lift_heavy=True,
            skills=["first_aid", "carpentry"],
            has_leader_experience=True,
        )
        self.unskilled_light_volunteer = User.objects.create(
            phone_hash="vol_light",
            display_name="Light Unskilled Vol",
            physical_ok=False,
            can_lift_heavy=False,
            skills=[],
            has_leader_experience=False,
        )

        now = timezone.now()
        self.event = create_event(
            self.coordinator,
            {
                "title": "Disaster Relief Build",
                "start_at": now + timedelta(days=5),
                "end_at": now + timedelta(days=5, hours=8),
                "acceptance_mode": "manual",
                "group_size": 2,
                "leader_strategy": "first_experienced",
            },
        )

    def test_create_assignment_filters_by_skills_and_physical(self):
        # Post requiring heavy lifting and carpentry
        heavy_post = add_post(
            self.coordinator,
            self.event,
            {
                "title": "Heavy Construction",
                "required_headcount": 2,
                "physical_level": "heavy",
                "required_skills": ["carpentry"],
                "priority": 10,
            },
        )
        publish_event(self.coordinator, self.event)

        # Unskilled/light volunteer applies
        light_app = EventApplication.objects.create(
            event=self.event,
            user=self.unskilled_light_volunteer,
            status=APPLICATION_ACCEPTED,
            decided_at=timezone.now(),
        )
        # Should return None because volunteer does not satisfy physical/skill requirements
        light_assign = create_assignment_from_application(light_app)
        self.assertIsNone(light_assign)

        # Skilled heavy volunteer applies
        heavy_app = EventApplication.objects.create(
            event=self.event,
            user=self.heavy_skilled_volunteer,
            status=APPLICATION_ACCEPTED,
            decided_at=timezone.now(),
        )
        heavy_assign = create_assignment_from_application(heavy_app)
        self.assertIsNotNone(heavy_assign)
        self.assertEqual(heavy_assign.post, heavy_post)
        self.assertEqual(heavy_assign.user, self.heavy_skilled_volunteer)

    def test_create_assignment_creates_expected_attendance(self):
        post = add_post(
            self.coordinator,
            self.event,
            {
                "title": "Community Outreach",
                "required_headcount": 5,
                "physical_level": "none",
            },
        )
        publish_event(self.coordinator, self.event)

        app = EventApplication.objects.create(
            event=self.event,
            post=post,
            user=self.heavy_skilled_volunteer,
            status=APPLICATION_ACCEPTED,
            decided_at=timezone.now(),
        )
        assignment = create_assignment_from_application(app)
        self.assertIsNotNone(assignment)

        # Verify Attendance record created with status="expected"
        attendance = Attendance.objects.filter(event=self.event, user=self.heavy_skilled_volunteer).first()
        self.assertIsNotNone(attendance)
        self.assertEqual(attendance.status, ATTENDANCE_EXPECTED)
        self.assertEqual(attendance.assignment, assignment)

    def test_group_has_at_most_one_leader(self):
        # Post needing leaders
        post = add_post(
            self.coordinator,
            self.event,
            {
                "title": "Field Team",
                "required_headcount": 4,
                "leader_needed": True,
            },
        )
        publish_event(self.coordinator, self.event)

        # Create 4 volunteers with leader experience
        apps = []
        for i in range(4):
            u = User.objects.create(
                phone_hash=f"leader_vol_{i}",
                display_name=f"Leader Vol {i}",
                has_leader_experience=True,
            )
            app = EventApplication.objects.create(
                event=self.event,
                post=post,
                user=u,
                status=APPLICATION_ACCEPTED,
                decided_at=timezone.now(),
            )
            apps.append(app)

        # Run auto assignment with group_size=2
        run_auto_assignment(self.coordinator, self.event)

        # We have 4 volunteers and group_size=2 -> 2 groups
        assignments = Assignment.objects.filter(event=self.event, post=post)
        self.assertEqual(assignments.count(), 4)

        groups = {}
        for a in assignments:
            self.assertIsNotNone(a.group_code)
            groups.setdefault(a.group_code, []).append(a)

        self.assertEqual(len(groups), 2)
        for group_code, group_members in groups.items():
            self.assertEqual(len(group_members), 2)
            leaders = [m for m in group_members if m.is_group_leader]
            # Each group must have at most 1 leader
            self.assertLessEqual(len(leaders), 1)

    def test_volunteer_can_confirm_own_assignment(self):
        post = add_post(self.coordinator, self.event, {"title": "Registrar", "required_headcount": 2})
        publish_event(self.coordinator, self.event)

        app = EventApplication.objects.create(
            event=self.event,
            post=post,
            user=self.heavy_skilled_volunteer,
            status=APPLICATION_ACCEPTED,
            decided_at=timezone.now(),
        )
        assignment = create_assignment_from_application(app)
        self.assertEqual(assignment.status, ASSIGNMENT_ASSIGNED)

        # Other volunteer cannot confirm
        with self.assertRaises(PermissionDeniedError):
            confirm_assignment(self.unskilled_light_volunteer, assignment)

        # Assigned volunteer confirms own assignment
        confirmed = confirm_assignment(self.heavy_skilled_volunteer, assignment)
        self.assertEqual(confirmed.status, ASSIGNMENT_CONFIRMED)

    def test_manual_assignment_requires_group_code_if_leader(self):
        post = add_post(self.coordinator, self.event, {"title": "Special Task", "required_headcount": 2})
        publish_event(self.coordinator, self.event)

        app = EventApplication.objects.create(
            event=self.event,
            post=post,
            user=self.heavy_skilled_volunteer,
            status=APPLICATION_ACCEPTED,
            decided_at=timezone.now(),
        )

        # Leader without group code raises DomainError
        with self.assertRaises(DomainError) as ctx:
            assign_manually(self.coordinator, app, post=post, is_group_leader=True, group_code=None)
        self.assertEqual(ctx.exception.code, "group_code_required")

        # Assign with group code succeeds
        assign = assign_manually(self.coordinator, app, post=post, is_group_leader=True, group_code="TeamA")
        self.assertEqual(assign.is_group_leader, True)
        self.assertEqual(assign.group_code, "TeamA")

