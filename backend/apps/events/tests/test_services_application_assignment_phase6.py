"""
Service-level Integration Tests for Phase 6: Recruitment Applications & Smart Assignment Engine.

Covers Business Rules:
- W64-W68: Application submission, sources, duplicate checks, volunteer withdrawal, invite.
- W69-W75: Application decisions (accept/reject/waitlist), privacy tier segregation (T1 vs T2), capacity gates.
- W76-W85: Smart auto-assignment engine orchestration, exclusion constraint checks, conflict validation.
- W86-W90: Manual assignment, post capacity validation, group codes & leader allocation, unassigned pool.
- W91-W95: Volunteer assignment confirmation (self-only), cancellation (self vs coordinator), immutability.
- Privacy & Transactions: BR-PRIV-T1, BR-PRIV-T2, BR-SEC-MASK, BR-TX-01 (@transaction.atomic).
"""
import secrets
from datetime import timedelta
from unittest.mock import patch

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Users
from apps.coordination.models import Assignments, CoordinatorProfiles
from apps.events.models import EventApplications, EventPosts, Events
from common.exceptions import (
    DomainError,
    OwnerMonitorReadOnlyError,
    PermissionDeniedError,
    ResourceMaskedNotFound,
    ValidationError,
)
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import (
    application_service,
    assignment_service,
    coordinator_service,
    event_post_service,
    event_service,
)


def _unique_phone():
    return f"+959{secrets.randbelow(900000000) + 100000000}"


def _make_user(name, is_admin=False, verified=True, **kwargs):
    phone = normalize_phone(_unique_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
        account_status="active",
        **kwargs,
    )


def _make_approved_coordinator(admin, name="Coordinator"):
    user = _make_user(name, verified=True)
    coordinator_service.apply_for_coordinator(user, "Organization notes")
    coordinator_service.approve_coordinator(admin, user.id, "Approved")
    user.refresh_from_db()
    return user


def _make_event(coord, title="Phase 6 Event", **kwargs):
    start = timezone.now() + timedelta(days=5)
    end = start + timedelta(hours=4)
    return Events.objects.create(
        owner_id=coord.id,
        current_coordinator_id=coord.id,
        title=title,
        start_at=start,
        end_at=end,
        **kwargs,
    )


def _publish_and_activate(event):
    Events.objects.filter(id=event.id).update(status="published")
    Events.objects.filter(id=event.id).update(status="active")
    event.refresh_from_db()
    return event


class ApplicationAssignmentServicePhase6Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("System Admin", is_admin=True)
        cls.coord1 = _make_approved_coordinator(cls.admin, "Lead Coordinator")
        cls.coord2 = _make_approved_coordinator(cls.admin, "Secondary Coordinator")
        cls.other_coord = _make_approved_coordinator(cls.admin, "Unrelated Coordinator")

        cls.vol1 = _make_user(
            "Volunteer Alice",
            skills=["logistics", "first_aid"],
            physical_ok=True,
            can_lift_heavy=True,
            has_leader_experience=True,
        )
        cls.vol2 = _make_user(
            "Volunteer Bob",
            skills=["ushering"],
            physical_ok=True,
            can_lift_heavy=False,
            has_leader_experience=False,
        )
        cls.vol3 = _make_user(
            "Volunteer Charlie",
            skills=[],
            physical_ok=False,
            can_lift_heavy=False,
        )

    def setUp(self):
        self.event = _make_event(
            self.coord1,
            title="Clean Up Drive",
            acceptance_mode="manual",
            auto_assign_enabled=False,
        )
        self.post1 = EventPosts.objects.create(
            event=self.event,
            title="Heavy Lifter",
            required_headcount=2,
            physical_level="heavy",
        )
        self.post2 = EventPosts.objects.create(
            event=self.event,
            title="General Greeter",
            required_headcount=3,
            physical_level="none",
        )
        _publish_and_activate(self.event)

    # -------------------------------------------------------------------------
    # W64-W68: Application Submission & Withdrawal Tests
    # -------------------------------------------------------------------------

    def test_apply_to_event_success_browse(self):
        """W64: Volunteer applies via browse mode; status is pending in manual mode."""
        app = application_service.apply_to_event(
            self.vol1, self.event.id, post_id=self.post1.id, source="browse", note="Ready to help"
        )
        self.assertEqual(app.event_id, self.event.id)
        self.assertEqual(app.user_id, self.vol1.id)
        self.assertEqual(app.post_id, self.post1.id)
        self.assertEqual(app.source, "browse")
        self.assertEqual(app.status, "pending")
        self.assertIsNotNone(app.applied_at)

    def test_apply_to_event_invalid_source_rejected(self):
        """W64: Invalid application source rejected with DomainError."""
        with self.assertRaises(DomainError) as ctx:
            application_service.apply_to_event(
                self.vol1, self.event.id, source="invalid_src"
            )
        self.assertEqual(ctx.exception.code, "invalid_source")

    def test_apply_to_event_duplicate_rejected(self):
        """W65: Duplicate active application rejected by trigger/constraint."""
        application_service.apply_to_event(self.vol1, self.event.id)
        with self.assertRaises(Exception):
            application_service.apply_to_event(self.vol1, self.event.id)

    def test_apply_to_event_non_visible_masked_404(self):
        """BR-SEC-MASK: Applying to non-existent or draft event raises ResourceMaskedNotFound."""
        draft_event = _make_event(self.coord1, title="Hidden Draft")
        EventPosts.objects.create(event=draft_event, title="Temp Post", required_headcount=1)
        with self.assertRaises(ResourceMaskedNotFound):
            application_service.apply_to_event(self.vol1, draft_event.id)

    def test_invite_volunteer_by_coordinator_success(self):
        """W67: Coordinator invites a volunteer with source='invite'."""
        app = application_service.invite_volunteer_to_event(
            self.coord1, self.event.id, self.vol1.id, post_id=self.post2.id, note="Invited"
        )
        self.assertEqual(app.user_id, self.vol1.id)
        self.assertEqual(app.source, "invite")
        self.assertEqual(app.status, "pending")

    def test_invite_volunteer_unauthorized_masked_404(self):
        """W67 / BR-SEC-MASK: Non-manager cannot invite volunteers."""
        with self.assertRaises(ResourceMaskedNotFound):
            application_service.invite_volunteer_to_event(
                self.other_coord, self.event.id, self.vol1.id
            )

    def test_withdraw_application_by_volunteer(self):
        """W68: Volunteer can withdraw their pending application."""
        app = application_service.apply_to_event(self.vol1, self.event.id)
        withdrawn_app = application_service.withdraw_application(self.vol1, app.id)
        self.assertEqual(withdrawn_app.status, "withdrawn")

    def test_withdraw_application_cascades_assignment_cancellation(self):
        """W68 / trg_50_applications_after: Withdrawing application cancels active assignment."""
        app = application_service.apply_to_event(self.vol1, self.event.id, post_id=self.post1.id)
        application_service.accept_application(self.coord1, app.id)
        asgn_res = assignment_service.assign_volunteer_manually(
            self.coord1, app.id, post_id=self.post1.id
        )
        asgn = Assignments.objects.get(id=asgn_res["assignment_id"])
        self.assertIn(asgn.status, ["assigned", "confirmed"])

        # Withdraw application
        application_service.withdraw_application(self.vol1, app.id)
        asgn.refresh_from_db()
        self.assertEqual(asgn.status, "cancelled")

    def test_withdraw_terminal_state_rejected(self):
        """W68: Withdrawing already withdrawn application raises DomainError."""
        app = application_service.apply_to_event(self.vol1, self.event.id)
        application_service.withdraw_application(self.vol1, app.id)
        with self.assertRaises(DomainError) as ctx:
            application_service.withdraw_application(self.vol1, app.id)
        self.assertEqual(ctx.exception.code, "invalid_state")

    # -------------------------------------------------------------------------
    # W69-W75: Application Decisions & Privacy Tiers
    # -------------------------------------------------------------------------

    def test_coordinator_accept_application(self):
        """W70: Current coordinator accepts volunteer application."""
        app = application_service.apply_to_event(self.vol1, self.event.id)
        decided = application_service.accept_application(self.coord1, app.id)
        self.assertEqual(decided.status, "accepted")
        self.assertEqual(decided.decided_by_id, self.coord1.id)
        self.assertIsNotNone(decided.decided_at)

    def test_coordinator_reject_application_with_note(self):
        """W70: Coordinator rejects volunteer application with reason note."""
        app = application_service.apply_to_event(self.vol2, self.event.id)
        decided = application_service.reject_application(
            self.coord1, app.id, note="Schedule full"
        )
        self.assertEqual(decided.status, "rejected")
        self.assertEqual(decided.note, "Schedule full")
        self.assertEqual(decided.decided_by_id, self.coord1.id)

    def test_coordinator_waitlist_application(self):
        """W74: Coordinator moves volunteer application to waitlist."""
        app = application_service.apply_to_event(self.vol3, self.event.id)
        decided = application_service.waitlist_application(self.coord1, app.id)
        self.assertEqual(decided.status, "waitlisted")

    def test_owner_monitor_cannot_decide_application(self):
        """W52 / BR-AUTH: Owner who handed over coordination cannot decide applications."""
        # Hand over to coord2
        event_service.handover_event(self.coord1, self.event.id, self.coord2.id, "Delegating")
        app = application_service.apply_to_event(self.vol1, self.event.id)

        # Owner (coord1) is now Owner-as-Monitor (read-only)
        with self.assertRaises(OwnerMonitorReadOnlyError):
            application_service.accept_application(self.coord1, app.id)

        # Current coordinator (coord2) can decide
        decided = application_service.accept_application(self.coord2, app.id)
        self.assertEqual(decided.status, "accepted")

    def test_privacy_tiers_t1_vs_t2(self):
        """W71 / BR-PRIV-T1 / BR-PRIV-T2: Pending shows T1 minimal, Accepted reveals T2 profile."""
        app1 = application_service.apply_to_event(self.vol1, self.event.id)
        app2 = application_service.apply_to_event(self.vol2, self.event.id)
        application_service.accept_application(self.coord1, app1.id)

        apps_data = application_service.get_event_applications(self.coord1, self.event.id)
        by_user = {item["user_id"]: item for item in apps_data}

        # vol1 (accepted): has T2 keys
        v1_entry = by_user[self.vol1.id]
        self.assertEqual(v1_entry["status"], "accepted")
        self.assertIn("skills", v1_entry)
        self.assertIn("physical_ok", v1_entry)
        self.assertIn("can_lift_heavy", v1_entry)
        self.assertIn("has_leader_experience", v1_entry)

        # vol2 (pending): strict T1 minimal keys only
        v2_entry = by_user[self.vol2.id]
        self.assertEqual(v2_entry["status"], "pending")
        self.assertNotIn("skills", v2_entry)
        self.assertNotIn("physical_ok", v2_entry)
        self.assertNotIn("can_lift_heavy", v2_entry)
        self.assertNotIn("has_leader_experience", v2_entry)

    # -------------------------------------------------------------------------
    # W76-W85: Smart Assignment Engine & Capacity Checks
    # -------------------------------------------------------------------------

    def test_auto_assignment_run_via_stored_procedure(self):
        """W76-W85: run_event_auto_assignment invokes PostgreSQL engine and returns stats."""
        # Accept vol1 and vol2
        app1 = application_service.apply_to_event(
            self.vol1, self.event.id, post_id=self.post1.id
        )
        app2 = application_service.apply_to_event(
            self.vol2, self.event.id, post_id=self.post2.id
        )
        application_service.accept_application(self.coord1, app1.id)
        application_service.accept_application(self.coord1, app2.id)

        # Run auto-assignment
        stats = assignment_service.run_event_auto_assignment(self.coord1, self.event.id)
        self.assertEqual(stats["event_id"], self.event.id)
        self.assertGreaterEqual(stats["newly_assigned"], 1)
        self.assertGreaterEqual(stats["total_assigned"], 1)

    def test_manual_assignment_places_volunteer_on_post(self):
        """W86: Manual assignment places accepted volunteer on post with group info."""
        app = application_service.apply_to_event(self.vol1, self.event.id)
        application_service.accept_application(self.coord1, app.id)

        res = assignment_service.assign_volunteer_manually(
            self.coord1,
            app.id,
            post_id=self.post1.id,
            group_code="ALPHA",
            is_group_leader=True,
        )
        self.assertIsNotNone(res["assignment_id"])

        asgn = Assignments.objects.get(id=res["assignment_id"])
        self.assertEqual(asgn.event_id, self.event.id)
        self.assertEqual(asgn.user_id, self.vol1.id)
        self.assertEqual(asgn.post_id, self.post1.id)
        self.assertEqual(asgn.group_code, "ALPHA")
        self.assertTrue(asgn.is_group_leader)
        self.assertEqual(asgn.status, "assigned")

    def test_manual_assignment_on_unaccepted_app_fails(self):
        """W86: Assigning a volunteer with pending application fails."""
        app = application_service.apply_to_event(self.vol1, self.event.id)
        with self.assertRaises(Exception):
            assignment_service.assign_volunteer_manually(
                self.coord1, app.id, post_id=self.post1.id
            )

    def test_unassigned_accepted_pool_view(self):
        """W89 / v_accepted_unassigned: Accepted volunteers appear in unassigned pool until assigned."""
        app = application_service.apply_to_event(self.vol1, self.event.id)
        application_service.accept_application(self.coord1, app.id)

        unassigned = assignment_service.get_unassigned_accepted(self.coord1, self.event.id)
        self.assertTrue(any(u["application_id"] == app.id for u in unassigned))

        # Assign vol1
        assignment_service.assign_volunteer_manually(self.coord1, app.id, post_id=self.post1.id)

        # Should disappear from unassigned pool
        unassigned_after = assignment_service.get_unassigned_accepted(self.coord1, self.event.id)
        self.assertFalse(any(u["application_id"] == app.id for u in unassigned_after))

    def test_post_capacity_summary_view(self):
        """W90 / v_event_post_capacity: Reflects remaining headcount correctly."""
        app1 = application_service.apply_to_event(self.vol1, self.event.id)
        application_service.accept_application(self.coord1, app1.id)
        assignment_service.assign_volunteer_manually(self.coord1, app1.id, post_id=self.post1.id)

        cap = assignment_service.get_post_capacity_summary(self.event.id)
        p1_cap = next(c for c in cap if c["post_id"] == self.post1.id)
        self.assertEqual(p1_cap["required_headcount"], 2)
        self.assertEqual(p1_cap["assigned_count"], 1)
        self.assertEqual(p1_cap["remaining"], 1)

    # -------------------------------------------------------------------------
    # W91-W95: Assignment Confirmation & Cancellation Tests
    # -------------------------------------------------------------------------

    def test_confirm_assignment_by_volunteer(self):
        """W91: Assigned volunteer confirms their assignment."""
        app = application_service.apply_to_event(self.vol1, self.event.id)
        application_service.accept_application(self.coord1, app.id)
        res = assignment_service.assign_volunteer_manually(self.coord1, app.id, post_id=self.post1.id)

        asgn = assignment_service.confirm_assignment(self.vol1, res["assignment_id"])
        self.assertEqual(asgn.status, "confirmed")
        self.assertIsNotNone(asgn.confirmed_at)

    def test_confirm_assignment_by_other_user_forbidden(self):
        """W91 / BR-AUTH: Third party cannot confirm someone else's assignment."""
        app = application_service.apply_to_event(self.vol1, self.event.id)
        application_service.accept_application(self.coord1, app.id)
        res = assignment_service.assign_volunteer_manually(self.coord1, app.id, post_id=self.post1.id)

        with self.assertRaises(DomainError) as ctx:
            assignment_service.confirm_assignment(self.vol2, res["assignment_id"])
        self.assertEqual(ctx.exception.code, "permission_denied")

    def test_cancel_assignment_by_volunteer(self):
        """W93: Volunteer cancels their own assignment."""
        app = application_service.apply_to_event(self.vol1, self.event.id)
        application_service.accept_application(self.coord1, app.id)
        res = assignment_service.assign_volunteer_manually(self.coord1, app.id, post_id=self.post1.id)

        cancelled = assignment_service.cancel_assignment(
            self.vol1, res["assignment_id"], reason="Personal emergency"
        )
        self.assertEqual(cancelled.status, "cancelled")
        self.assertEqual(cancelled.cancel_reason, "Personal emergency")

    def test_cancel_assignment_by_coordinator(self):
        """W93: Coordinator cancels volunteer's assignment."""
        app = application_service.apply_to_event(self.vol1, self.event.id)
        application_service.accept_application(self.coord1, app.id)
        res = assignment_service.assign_volunteer_manually(self.coord1, app.id, post_id=self.post1.id)

        cancelled = assignment_service.cancel_assignment(
            self.coord1, res["assignment_id"], reason="Role restructured"
        )
        self.assertEqual(cancelled.status, "cancelled")
        self.assertEqual(cancelled.cancel_reason, "Role restructured")

    def test_cancel_assignment_by_unauthorized_third_party_masked(self):
        """BR-SEC-MASK: Unrelated coordinator or volunteer gets 404 masked when cancelling."""
        app = application_service.apply_to_event(self.vol1, self.event.id)
        application_service.accept_application(self.coord1, app.id)
        res = assignment_service.assign_volunteer_manually(self.coord1, app.id, post_id=self.post1.id)

        with self.assertRaises(ResourceMaskedNotFound):
            assignment_service.cancel_assignment(self.other_coord, res["assignment_id"])

    def test_cancel_completed_assignment_rejected(self):
        """W95: Completed assignment cannot be cancelled."""
        app = application_service.apply_to_event(self.vol1, self.event.id)
        application_service.accept_application(self.coord1, app.id)
        res = assignment_service.assign_volunteer_manually(self.coord1, app.id, post_id=self.post1.id)

        # To set assignment to completed, the event itself must be completed
        Events.objects.filter(id=self.event.id).update(status="completed")
        Assignments.objects.filter(id=res["assignment_id"]).update(status="completed")

        with self.assertRaises(DomainError) as ctx:
            assignment_service.cancel_assignment(self.coord1, res["assignment_id"])
        self.assertEqual(ctx.exception.code, "invalid_state")

    # -------------------------------------------------------------------------
    # BR-TX-01: Transaction Atomicity & Rollback
    # -------------------------------------------------------------------------

    def test_apply_to_event_transaction_rollback(self):
        """BR-TX-01: Exception during apply_to_event rolls back transaction cleanly."""
        initial_count = EventApplications.objects.filter(event_id=self.event.id).count()
        with patch.object(EventApplications, "refresh_from_db", side_effect=RuntimeError("Simulated DB error")):
            with self.assertRaises(RuntimeError):
                application_service.apply_to_event(self.vol1, self.event.id)
        self.assertEqual(
            EventApplications.objects.filter(event_id=self.event.id).count(),
            initial_count,
        )
