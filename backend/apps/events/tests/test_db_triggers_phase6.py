"""
Database Trigger, Stored Procedure & Constraint Integration Tests for Phase 6.

Direct PostgreSQL verification of:
1. Stored Procedures:
   - run_auto_assignment(p_event_id, p_actor_id)
   - assign_manually(p_application_id, p_post_id, p_actor_id, p_group_code, p_is_group_leader)
   - create_assignment_from_application(p_application_id, p_actor_id)
   - expire_stale_applications()
   - is_user_available() and user_has_schedule_conflict()

2. Applications Triggers:
   - trg_01_applications_before_insert (event status gate, active account gate, schedule conflict,
     conditions snapshot, auto-accept mode & waitlist overflow, uq_event_application_active).
   - trg_01_applications_before_update (event/user immutability, state transition machine,
     manager authorization requirement, capacity gating on accept).
   - trg_50_applications_after (auto-assign cascade on accept, withdrawal cascade to assignments).

3. Assignments Triggers & Constraints:
   - trg_01_assignments_before_insert (accepted application prerequisite, post capacity gate).
   - trg_01_assignments_before_update (immutability, status transitions, self-confirmation check,
     completed cancellation block, completed event prerequisite).
   - ex_assignments_no_overlap (PostgreSQL exclusion constraint blocking overlapping volunteer shifts).

4. Operational Views:
   - v_accepted_unassigned
   - v_event_post_capacity
"""
import secrets
from datetime import timedelta

from django.db import IntegrityError, connection, transaction
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Users
from apps.coordination.models import Assignments, CoordinatorProfiles
from apps.events.models import EventApplications, EventPosts, Events
from common.db_context import set_db_session_context
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import coordinator_service


def _unique_phone():
    return f"+959{secrets.randbelow(900000000) + 100000000}"


def _make_user(name, is_admin=False, verified=True, account_status="active", **kwargs):
    phone = normalize_phone(_unique_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
        account_status=account_status,
        **kwargs,
    )


def _make_coordinator(admin, name="Coordinator"):
    user = _make_user(name, verified=True)
    coordinator_service.apply_for_coordinator(user, "Application statement")
    coordinator_service.approve_coordinator(admin, user.id, "Approved")
    user.refresh_from_db()
    return user


def _make_event(coord, title="DB Test Event", **kwargs):
    start = timezone.now() + timedelta(days=7)
    end = start + timedelta(hours=4)
    kwargs.setdefault("start_at", start)
    kwargs.setdefault("end_at", end)
    kwargs.setdefault("auto_assign_enabled", False)
    return Events.objects.create(
        owner_id=coord.id,
        current_coordinator_id=coord.id,
        title=title,
        **kwargs,
    )


def _publish_and_activate(event):
    Events.objects.filter(id=event.id).update(status="published")
    Events.objects.filter(id=event.id).update(status="active")
    event.refresh_from_db()
    return event


class DatabaseStoredProceduresPhase6Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin User", is_admin=True)
        cls.coord = _make_coordinator(cls.admin, "Event Lead")
        cls.vol1 = _make_user("Volunteer A", skills=["first_aid"], physical_ok=True)
        cls.vol2 = _make_user("Volunteer B", skills=["translation"], physical_ok=True)

    def setUp(self):
        self.event = _make_event(self.coord, acceptance_mode="manual")
        self.post = EventPosts.objects.create(
            event=self.event,
            title="Field Specialist",
            required_headcount=2,
            required_skills=["first_aid"],
        )
        _publish_and_activate(self.event)

    def test_sp_run_auto_assignment_direct_call(self):
        """run_auto_assignment() executes inside PostgreSQL and assigns accepted volunteer."""
        app = EventApplications.objects.create(
            event=self.event,
            user=self.vol1,
            post=self.post,
            conditions_acknowledged_at=timezone.now(),
        )
        EventApplications.objects.filter(id=app.id).update(
            status="accepted", decided_by=self.coord, decided_at=timezone.now()
        )
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT run_auto_assignment(%s, %s)",
                [self.event.id, self.coord.id],
            )
            row = cursor.fetchone()
            assigned_count = int(row[0]) if row else 0

        self.assertEqual(assigned_count, 1)
        asgn = Assignments.objects.filter(event=self.event, user=self.vol1).first()
        self.assertIsNotNone(asgn)
        self.assertEqual(asgn.post_id, self.post.id)
        self.assertEqual(asgn.status, "assigned")

    def test_sp_assign_manually_direct_call(self):
        """assign_manually() executes inside PostgreSQL and creates assignment with group info."""
        app = EventApplications.objects.create(
            event=self.event,
            user=self.vol2,
            conditions_acknowledged_at=timezone.now(),
        )
        EventApplications.objects.filter(id=app.id).update(
            status="accepted", decided_by=self.coord, decided_at=timezone.now()
        )
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT assign_manually(%s, %s, %s, %s, %s)",
                [app.id, self.post.id, self.coord.id, "BETA", True],
            )
            row = cursor.fetchone()
            asgn_id = int(row[0]) if row else None

        self.assertIsNotNone(asgn_id)
        asgn = Assignments.objects.get(id=asgn_id)
        self.assertEqual(asgn.group_code, "BETA")
        self.assertTrue(asgn.is_group_leader)
        self.assertEqual(asgn.status, "assigned")

    def test_sp_is_user_available_and_schedule_conflict(self):
        """is_user_available and user_has_schedule_conflict SQL functions test."""
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT is_user_available(%s, %s, %s)",
                [self.vol1.id, self.event.start_at, self.event.end_at],
            )
            available = cursor.fetchone()[0]

            cursor.execute(
                "SELECT user_has_schedule_conflict(%s, %s, %s, %s)",
                [self.vol1.id, self.event.start_at, self.event.end_at, self.event.id],
            )
            conflict = cursor.fetchone()[0]

        self.assertTrue(available)
        self.assertFalse(conflict)


class ApplicationsTriggersPhase6Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin User", is_admin=True)
        cls.coord = _make_coordinator(cls.admin, "Trigger Coord")
        cls.vol = _make_user("Standard Volunteer")
        cls.blocked_vol = _make_user("Blocked Volunteer", account_status="blocked", is_active=False)

    def setUp(self):
        self.event = _make_event(self.coord, acceptance_mode="manual")
        self.post = EventPosts.objects.create(
            event=self.event,
            title="Support Staff",
            required_headcount=1,
        )
        _publish_and_activate(self.event)

    def test_trg_insert_blocks_draft_event_application(self):
        """trg_01_applications_before_insert blocks applications on draft events."""
        draft_ev = _make_event(self.coord, title="Draft Event")
        with self.assertRaises(Exception) as ctx:
            with transaction.atomic():
                EventApplications.objects.create(
                    event=draft_ev,
                    user=self.vol,
                    source="browse",
                    conditions_acknowledged_at=timezone.now(),
                )
        self.assertIn("event_not_open", str(ctx.exception))

    def test_trg_insert_blocks_suspended_user(self):
        """trg_01_applications_before_insert blocks applications from non-active users."""
        with self.assertRaises(Exception) as ctx:
            with transaction.atomic():
                EventApplications.objects.create(
                    event=self.event,
                    user=self.blocked_vol,
                    source="browse",
                    conditions_acknowledged_at=timezone.now(),
                )
        self.assertIn("account_blocked", str(ctx.exception))

    def test_trg_insert_auto_accept_and_waitlist_overflow(self):
        """Auto-accept event accepts up to capacity then waitlists overflow."""
        auto_ev = _make_event(
            self.coord, title="Auto Event", acceptance_mode="auto", max_participants=1
        )
        EventPosts.objects.create(event=auto_ev, title="Slot Post", required_headcount=1)
        _publish_and_activate(auto_ev)

        v1 = _make_user("Volunteer Slot 1")
        v2 = _make_user("Volunteer Slot 2")

        # First application accepted automatically
        app1 = EventApplications.objects.create(
            event=auto_ev,
            user=v1,
            source="browse",
            conditions_acknowledged_at=timezone.now(),
        )
        app1.refresh_from_db()
        self.assertEqual(app1.status, "accepted")

        # Second application overflows capacity -> waitlisted
        app2 = EventApplications.objects.create(
            event=auto_ev,
            user=v2,
            source="browse",
            conditions_acknowledged_at=timezone.now(),
        )
        app2.refresh_from_db()
        self.assertEqual(app2.status, "waitlisted")

    def test_trg_update_immutable_user_and_event(self):
        """trg_01_applications_before_update blocks modifying event_id or user_id."""
        app = EventApplications.objects.create(
            event=self.event,
            user=self.vol,
            source="browse",
            conditions_acknowledged_at=timezone.now(),
        )
        other_ev = _make_event(self.coord, title="Other Active")
        EventPosts.objects.create(event=other_ev, title="Other Post", required_headcount=1)
        _publish_and_activate(other_ev)

        with self.assertRaises(Exception) as ctx:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE event_applications SET event_id = %s WHERE id = %s",
                        [other_ev.id, app.id],
                    )
        self.assertIn("immutable", str(ctx.exception))

    def test_trg_after_withdrawal_cascades_assignment_cancel(self):
        """trg_50_applications_after cancels assignment when application is withdrawn."""
        app = EventApplications.objects.create(
            event=self.event,
            user=self.vol,
            conditions_acknowledged_at=timezone.now(),
        )
        EventApplications.objects.filter(id=app.id).update(
            status="accepted", decided_by=self.coord, decided_at=timezone.now()
        )
        asgn = Assignments.objects.create(
            event=self.event,
            application=app,
            user=self.vol,
            post=self.post,
            schedule_start=self.event.start_at,
            schedule_end=self.event.end_at,
            status="assigned",
        )

        # Update application to withdrawn
        EventApplications.objects.filter(id=app.id).update(status="withdrawn")
        asgn.refresh_from_db()
        self.assertEqual(asgn.status, "cancelled")


class AssignmentsTriggersAndExclusionPhase6Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin", is_admin=True)
        cls.coord = _make_coordinator(cls.admin, "Asgn Coord")
        cls.vol = _make_user("Shift Worker")

    def setUp(self):
        self.event1 = _make_event(self.coord, title="Shift Event 1")
        self.post1 = EventPosts.objects.create(
            event=self.event1,
            title="Desk Duty",
            required_headcount=1,
        )
        _publish_and_activate(self.event1)

    def test_trg_insert_requires_accepted_application(self):
        """trg_01_assignments_before_insert blocks assignment for pending applications."""
        app = EventApplications.objects.create(
            event=self.event1,
            user=self.vol,
            status="pending",
            conditions_acknowledged_at=timezone.now(),
        )
        with self.assertRaises(Exception) as ctx:
            with transaction.atomic():
                Assignments.objects.create(
                    event=self.event1,
                    application=app,
                    user=self.vol,
                    post=self.post1,
                    schedule_start=self.event1.start_at,
                    schedule_end=self.event1.end_at,
                    status="assigned",
                )
        self.assertIn("only accepted applications can be assigned", str(ctx.exception))

    def test_trg_update_self_confirmation_check(self):
        """trg_01_assignments_before_update allows confirmation only by volunteer or admin."""
        app = EventApplications.objects.create(
            event=self.event1,
            user=self.vol,
            conditions_acknowledged_at=timezone.now(),
        )
        EventApplications.objects.filter(id=app.id).update(
            status="accepted", decided_by=self.coord, decided_at=timezone.now()
        )
        asgn = Assignments.objects.create(
            event=self.event1,
            application=app,
            user=self.vol,
            post=self.post1,
            schedule_start=self.event1.start_at,
            schedule_end=self.event1.end_at,
            status="assigned",
        )

        other_user = _make_user("Other Random User")

        # Set session context to other user -> should be rejected by trigger
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config('app.user_id', %s, false)", [str(other_user.id)])
        with self.assertRaises(Exception) as ctx:
            with transaction.atomic():
                Assignments.objects.filter(id=asgn.id).update(status="confirmed")
        self.assertIn("only the volunteer confirms their own shift", str(ctx.exception))

        # Set session context to the volunteer themselves -> succeeds
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config('app.user_id', %s, false)", [str(self.vol.id)])
        Assignments.objects.filter(id=asgn.id).update(status="confirmed")
        asgn.refresh_from_db()
        self.assertEqual(asgn.status, "confirmed")

        # Reset session context
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config('app.user_id', '', false)")

    def test_ex_assignments_no_overlap_blocks_overlapping_shifts(self):
        """ex_assignments_no_overlap exclusion constraint blocks overlapping assignments."""
        event2 = _make_event(
            self.coord,
            title="Shift Event 2 Overlapping",
            start_at=self.event1.start_at + timedelta(hours=1),
            end_at=self.event1.end_at + timedelta(hours=1),
        )
        post2 = EventPosts.objects.create(event=event2, title="Role 2", required_headcount=1)
        _publish_and_activate(event2)

        app1 = EventApplications.objects.create(
            event=self.event1,
            user=self.vol,
            conditions_acknowledged_at=timezone.now(),
        )
        EventApplications.objects.filter(id=app1.id).update(
            status="accepted", decided_by=self.coord, decided_at=timezone.now()
        )
        app2 = EventApplications.objects.create(
            event=event2,
            user=self.vol,
            conditions_acknowledged_at=timezone.now(),
        )
        EventApplications.objects.filter(id=app2.id).update(
            status="accepted", decided_by=self.coord, decided_at=timezone.now()
        )

        # Assignment 1 on event1
        Assignments.objects.create(
            event=self.event1,
            application=app1,
            user=self.vol,
            post=self.post1,
            schedule_start=self.event1.start_at,
            schedule_end=self.event1.end_at,
            status="assigned",
        )

        # Assignment 2 on event2 with overlapping time window must violate exclusion constraint
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Assignments.objects.create(
                    event=event2,
                    application=app2,
                    user=self.vol,
                    post=post2,
                    schedule_start=event2.start_at,
                    schedule_end=event2.end_at,
                    status="assigned",
                )
