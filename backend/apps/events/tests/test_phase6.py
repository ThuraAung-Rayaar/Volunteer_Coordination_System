from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.coordination.models import Assignments, CoordinatorProfiles
from apps.events.models import EventApplications, EventPosts, Events
from common.exceptions import DomainError
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import application_service, assignment_service, coordinator_service

_phone_seq = 0


def _phone():
    global _phone_seq
    _phone_seq += 1
    return f"+959{_phone_seq:08d}"


def _make_user(name, is_admin=False, verified=False, **kwargs):
    phone = normalize_phone(_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
        **kwargs,
    )


def _make_approved_coordinator(admin, name="Coordinator"):
    user = _make_user(name, verified=True)
    coordinator_service.apply_for_coordinator(user, "Organization notes")
    coordinator_service.approve_coordinator(admin, user.id, "Approved")
    user.refresh_from_db()
    return user


def _make_event(coord, title="Test Event", **kwargs):
    start = timezone.now() + timedelta(days=7)
    end = start + timedelta(hours=4)
    return Events.objects.create(
        owner_id=coord.id,
        current_coordinator_id=coord.id,
        title=title,
        start_at=start,
        end_at=end,
        **kwargs,
    )


def _make_post(event, title="Helper", headcount=5, **kwargs):
    return EventPosts.objects.create(
        event=event, title=title, required_headcount=headcount, **kwargs
    )


def _publish_and_activate(event):
    Events.objects.filter(id=event.id).update(status="published")
    Events.objects.filter(id=event.id).update(status="active")
    event.refresh_from_db()
    return event


class ApplicationPhase6Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin", is_admin=True)
        cls.coord = _make_approved_coordinator(cls.admin, "Coordinator")
        cls.vol1 = _make_user("Volunteer 1")
        cls.vol2 = _make_user("Volunteer 2")
        cls.vol3 = _make_user("Volunteer 3")


class ApplicationSubmitTests(ApplicationPhase6Base):
    def setUp(self):
        self.event = _make_event(self.coord, acceptance_mode="manual")
        self.post = _make_post(self.event)
        _publish_and_activate(self.event)

    def test_submit_application(self):
        app = application_service.apply_to_event(self.vol1, self.event.id)
        self.assertEqual(app.status, "pending")
        self.assertEqual(app.source, "browse")
        self.assertEqual(app.user_id, self.vol1.id)

    def test_submit_with_post(self):
        app = application_service.apply_to_event(
            self.vol1, self.event.id, post_id=self.post.id
        )
        self.assertEqual(app.post_id, self.post.id)

    def test_duplicate_application_rejected(self):
        application_service.apply_to_event(self.vol1, self.event.id)
        with self.assertRaises(Exception):
            application_service.apply_to_event(self.vol1, self.event.id)

    def test_auto_accept_mode(self):
        event = _make_event(self.coord, title="Auto Event", acceptance_mode="auto")
        _make_post(event)
        _publish_and_activate(event)
        app = application_service.apply_to_event(self.vol1, event.id)
        self.assertEqual(app.status, "accepted")

    def test_auto_waitlist_when_full(self):
        event = _make_event(
            self.coord, title="Full Event",
            acceptance_mode="auto", max_participants=1,
        )
        _make_post(event, headcount=1)
        _publish_and_activate(event)
        # First application gets accepted
        app1 = application_service.apply_to_event(self.vol1, event.id)
        self.assertEqual(app1.status, "accepted")
        # Second application gets waitlisted
        app2 = application_service.apply_to_event(self.vol2, event.id)
        self.assertEqual(app2.status, "waitlisted")

    def test_application_to_draft_event_rejected(self):
        draft_event = _make_event(self.coord, title="Draft Event")
        with self.assertRaises(Exception):
            application_service.apply_to_event(self.vol1, draft_event.id)

    def test_blocked_user_cannot_apply(self):
        blocked_user = _make_user("Blocked", account_status="blocked")
        blocked_user.is_active = False
        blocked_user.save(update_fields=["is_active"])
        with self.assertRaises(Exception):
            application_service.apply_to_event(blocked_user, self.event.id)


class ApplicationDecisionTests(ApplicationPhase6Base):
    def setUp(self):
        self.event = _make_event(self.coord, acceptance_mode="manual")
        self.post = _make_post(self.event)
        _publish_and_activate(self.event)
        self.app = application_service.apply_to_event(self.vol1, self.event.id)

    def test_accept_application(self):
        result = application_service.accept_application(self.coord, self.app.id)
        self.assertEqual(result.status, "accepted")
        self.assertEqual(result.decided_by_id, self.coord.id)

    def test_reject_application(self):
        result = application_service.reject_application(self.coord, self.app.id)
        self.assertEqual(result.status, "rejected")

    def test_waitlist_application(self):
        result = application_service.waitlist_application(self.coord, self.app.id)
        self.assertEqual(result.status, "waitlisted")

    def test_non_manager_cannot_accept(self):
        with self.assertRaises(Exception):
            application_service.accept_application(self.vol2, self.app.id)

    def test_cannot_accept_already_rejected(self):
        application_service.reject_application(self.coord, self.app.id)
        with self.assertRaises(Exception):
            application_service.accept_application(self.coord, self.app.id)


class ApplicationWithdrawTests(ApplicationPhase6Base):
    def setUp(self):
        self.event = _make_event(self.coord, acceptance_mode="manual")
        _make_post(self.event)
        _publish_and_activate(self.event)
        self.app = application_service.apply_to_event(self.vol1, self.event.id)

    def test_withdraw_own_application(self):
        result = application_service.withdraw_application(self.vol1, self.app.id)
        self.assertEqual(result.status, "withdrawn")

    def test_other_user_cannot_withdraw(self):
        with self.assertRaises(Exception):
            application_service.withdraw_application(self.vol2, self.app.id)

    def test_cannot_withdraw_rejected(self):
        application_service.reject_application(self.coord, self.app.id)
        with self.assertRaises(Exception):
            application_service.withdraw_application(self.vol1, self.app.id)


class AutoAssignTests(ApplicationPhase6Base):
    def setUp(self):
        self.event = _make_event(
            self.coord, acceptance_mode="auto", auto_assign_enabled=True,
            group_size=2,
        )
        self.post = _make_post(self.event, headcount=5)
        _publish_and_activate(self.event)

    def test_auto_assignment_on_accept(self):
        app = application_service.apply_to_event(self.vol1, self.event.id)
        self.assertEqual(app.status, "accepted")
        # Auto-assign should have created an assignment
        assignments = Assignments.objects.filter(
            application_id=app.id
        ).exclude(status="cancelled")
        self.assertEqual(assignments.count(), 1)

    def test_run_auto_assignment_explicit(self):
        # Create a manual-accept event to test explicit auto-assign
        event2 = _make_event(
            self.coord, title="Manual Event",
            acceptance_mode="manual", auto_assign_enabled=True,
        )
        _make_post(event2, headcount=5)
        _publish_and_activate(event2)
        app = application_service.apply_to_event(self.vol1, event2.id)
        application_service.accept_application(self.coord, app.id)

        result = assignment_service.run_event_auto_assignment(self.coord, event2.id)
        self.assertGreaterEqual(result["newly_assigned"], 0)
        self.assertIn("remaining_unassigned", result)

    def test_non_manager_cannot_auto_assign(self):
        with self.assertRaises(Exception):
            assignment_service.run_event_auto_assignment(self.vol1, self.event.id)


class ManualAssignTests(ApplicationPhase6Base):
    def setUp(self):
        self.event = _make_event(self.coord, acceptance_mode="manual")
        self.post = _make_post(self.event, headcount=2)
        _publish_and_activate(self.event)
        self.app = application_service.apply_to_event(self.vol1, self.event.id)
        application_service.accept_application(self.coord, self.app.id)

    def test_manual_assignment(self):
        result = assignment_service.assign_volunteer_manually(
            self.coord, self.app.id, post_id=self.post.id
        )
        self.assertIn("assignment_id", result)
        self.assertIsNotNone(result["assignment_id"])

    def test_manual_assignment_capacity_enforced(self):
        # Assign vol1
        assignment_service.assign_volunteer_manually(
            self.coord, self.app.id, post_id=self.post.id
        )
        # Accept vol2
        app2 = application_service.apply_to_event(self.vol2, self.event.id)
        application_service.accept_application(self.coord, app2.id)
        assignment_service.assign_volunteer_manually(
            self.coord, app2.id, post_id=self.post.id
        )
        # Accept vol3 - should fail capacity
        app3 = application_service.apply_to_event(self.vol3, self.event.id)
        application_service.accept_application(self.coord, app3.id)
        with self.assertRaises(Exception):
            assignment_service.assign_volunteer_manually(
                self.coord, app3.id, post_id=self.post.id
            )

    def test_cannot_assign_pending_application(self):
        event2 = _make_event(self.coord, title="Pending Event", acceptance_mode="manual")
        _make_post(event2)
        _publish_and_activate(event2)
        app = application_service.apply_to_event(self.vol2, event2.id)
        with self.assertRaises(Exception):
            assignment_service.assign_volunteer_manually(self.coord, app.id)


class AssignmentLifecycleTests(ApplicationPhase6Base):
    def setUp(self):
        self.event = _make_event(self.coord, acceptance_mode="auto", auto_assign_enabled=True)
        self.post = _make_post(self.event, headcount=5)
        _publish_and_activate(self.event)
        self.app = application_service.apply_to_event(self.vol1, self.event.id)
        self.assignment = Assignments.objects.get(application_id=self.app.id)

    def test_confirm_own_assignment(self):
        result = assignment_service.confirm_assignment(self.vol1, self.assignment.id)
        self.assertEqual(result.status, "confirmed")
        self.assertIsNotNone(result.confirmed_at)

    def test_other_user_cannot_confirm(self):
        with self.assertRaises(Exception):
            assignment_service.confirm_assignment(self.vol2, self.assignment.id)

    def test_cancel_assignment(self):
        result = assignment_service.cancel_assignment(
            self.vol1, self.assignment.id, reason="personal"
        )
        self.assertEqual(result.status, "cancelled")

    def test_cannot_cancel_completed(self):
        # Complete the event first
        Events.objects.filter(id=self.event.id).update(status="completed")
        self.assignment.refresh_from_db()
        with self.assertRaises(Exception):
            assignment_service.cancel_assignment(self.coord, self.assignment.id)


class ScheduleConflictTests(ApplicationPhase6Base):
    def test_overlapping_event_application_rejected(self):
        event1 = _make_event(self.coord, title="Event 1", acceptance_mode="auto")
        _make_post(event1)
        _publish_and_activate(event1)

        event2 = _make_event(self.coord, title="Event 2", acceptance_mode="auto")
        _make_post(event2)
        _publish_and_activate(event2)

        # Apply to event1 (auto-accept creates assignment)
        app1 = application_service.apply_to_event(self.vol1, event1.id)
        self.assertEqual(app1.status, "accepted")

        # Apply to event2 (overlapping time) should fail with schedule conflict
        with self.assertRaises(Exception):
            application_service.apply_to_event(self.vol1, event2.id)


class Phase6BFFAPITests(ApplicationPhase6Base):
    def setUp(self):
        self.client = APIClient()
        self.event = _make_event(self.coord, acceptance_mode="manual")
        self.post = _make_post(self.event, headcount=3)
        _publish_and_activate(self.event)

    def test_apply_and_withdraw_api(self):
        self.client.force_authenticate(user=self.vol1)
        # Apply via API
        resp = self.client.post(
            f"/api/v1/events/{self.event.id}/apply/",
            {"post_id": self.post.id, "source": "browse", "note": "Interested"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        app_id = resp.data["id"]
        self.assertEqual(resp.data["status"], "pending")

        # Check own applications
        my_apps = self.client.get("/api/v1/me/applications/")
        self.assertEqual(my_apps.status_code, status.HTTP_200_OK)
        self.assertEqual(len(my_apps.data["results"]), 1)

        # Withdraw application
        with_resp = self.client.post(f"/api/v1/applications/{app_id}/withdraw/")
        self.assertEqual(with_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(with_resp.data["status"], "withdrawn")

    def test_coordinator_decide_and_manual_assign_api(self):
        # Volunteer applies
        app = application_service.apply_to_event(self.vol1, self.event.id, post_id=self.post.id)

        # Coordinator views applications
        self.client.force_authenticate(user=self.coord)
        apps_resp = self.client.get(f"/api/v1/coordinator/events/{self.event.id}/applications/")
        self.assertEqual(apps_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(apps_resp.data["results"]), 1)

        # Coordinator accepts application
        accept_resp = self.client.post(f"/api/v1/applications/{app.id}/accept/", format="json")
        self.assertEqual(accept_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(accept_resp.data["status"], "accepted")

        # Coordinator assigns manually
        assign_resp = self.client.post(
            f"/api/v1/coordinator/events/{self.event.id}/manual-assign/",
            {"application_id": app.id, "post_id": self.post.id, "group_code": "Team A"},
            format="json",
        )
        self.assertEqual(assign_resp.status_code, status.HTTP_201_CREATED)
        assignment_id = assign_resp.data["assignment_id"]

        # Volunteer checks own assignments and confirms
        self.client.force_authenticate(user=self.vol1)
        my_assign = self.client.get("/api/v1/me/assignments/")
        self.assertEqual(my_assign.status_code, status.HTTP_200_OK)
        self.assertEqual(len(my_assign.data["results"]), 1)

        confirm_resp = self.client.post(f"/api/v1/assignments/{assignment_id}/confirm/")
        self.assertEqual(confirm_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(confirm_resp.data["status"], "confirmed")
