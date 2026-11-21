"""
Service integration tests for Phase 7:
- onboarding_service.py
- qr_service.py
- attendance_service.py
- geo_service.py
- Multi-step transaction rollback verification
"""
from datetime import timedelta
import secrets
import threading
from unittest.mock import patch

from django.db import connection, transaction
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from apps.accounts.models import OnboardingAcknowledgments, Users
from apps.attendance.models import Attendance, AttendanceGeoAttempts, QrTokens
from apps.coordination.models import Assignments
from apps.events.models import EventApplications, EventPosts, Events
from common.exceptions import (
    DomainError,
    InvalidStateError,
    OwnerMonitorReadOnlyError,
    ResourceMaskedNotFound,
)
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import (
    application_service,
    attendance_service,
    coordinator_service,
    geo_service,
    onboarding_service,
    profile_service,
    qr_service,
)

def _new_phone():
    return f"+959{secrets.randbelow(900000000) + 100000000}"


def _make_usr(name, is_admin=False, verified=False):
    ph = normalize_phone(_new_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(ph),
        phone_enc=encrypt_phone(ph),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
    )


def _setup_coordinator(admin, name="Lead Coordinator"):
    user = _make_usr(name, verified=True)
    coordinator_service.apply_for_coordinator(user, "Organization vetting")
    coordinator_service.approve_coordinator(admin, user.id, "Approved")
    user.refresh_from_db()
    return user


class Phase7ServicesIntegrationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_usr("Admin User", is_admin=True)
        cls.coord = _setup_coordinator(cls.admin, "Lead Coord")
        cls.vol = _make_usr("Volunteer A")
        cls.vol_b = _make_usr("Volunteer B")

    def setUp(self):
        start = timezone.now() + timedelta(hours=2)
        end = start + timedelta(hours=4)
        self.event = Events.objects.create(
            owner_id=self.coord.id,
            current_coordinator_id=self.coord.id,
            title="Service Test Event",
            start_at=start,
            end_at=end,
            acceptance_mode="auto",
            auto_assign_enabled=True,
            require_onboarding_ack=True,
            onboarding_text="Please wear closed-toe shoes and bring hydration.",
            latitude=1.3521,
            longitude=103.8198,
            geo_radius_m=500,
            geo_checkin_enabled=True,
            require_checkin_confirmation=False,
        )
        self.post = EventPosts.objects.create(
            event=self.event,
            title="Greeter",
            required_headcount=10,
        )
        Events.objects.filter(id=self.event.id).update(status="published")
        Events.objects.filter(id=self.event.id).update(status="active")
        start_active = timezone.now() - timedelta(minutes=10)
        Events.objects.filter(id=self.event.id).update(start_at=start_active)
        self.event.refresh_from_db()

        # Apply to event -> auto-accepted and assigned
        self.app = EventApplications.objects.create(
            event=self.event,
            user=self.vol,
            source="browse",
            conditions_acknowledged_at=timezone.now(),
        )

    # --- Onboarding Service Tests ---

    def test_onboarding_service_lifecycle_and_status(self):
        # Initial status before acknowledgment
        status = onboarding_service.get_event_onboarding_status(self.vol, self.event.id)
        self.assertEqual(status["event_id"], self.event.id)
        self.assertTrue(status["require_onboarding_ack"])
        self.assertFalse(status["acknowledged"])

        # Acknowledge
        ack = onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)
        self.assertEqual(ack.event_id, self.event.id)
        self.assertEqual(ack.user_id, self.vol.id)

        # Re-fetch status
        status_after = onboarding_service.get_event_onboarding_status(self.vol, self.event.id)
        self.assertTrue(status_after["acknowledged"])

        # Idempotency
        ack2 = onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)
        self.assertEqual(ack.id, ack2.id)

    # --- QR Service Tests ---

    def test_qr_service_create_preview_redeem_and_revoke(self):
        # Create token
        token_data = qr_service.create_event_qr_token(
            self.coord,
            self.event.id,
            purpose="checkin",
            max_uses=2,
            ttl_minutes=60,
        )
        raw_token = token_data["raw_token"]
        self.assertIsNotNone(raw_token)
        qr_id = token_data["id"]

        # Preview token (consumes nothing)
        preview = qr_service.preview_qr_token(raw_token)
        self.assertTrue(preview["is_valid"])
        self.assertEqual(preview["event_id"], self.event.id)
        self.assertEqual(preview["purpose"], "checkin")

        # First volunteer acknowledges onboarding
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)

        # Redeem token for checkin
        redeem_result = qr_service.redeem_qr_token(self.vol, raw_token)
        self.assertEqual(redeem_result["result"], "checked_in")
        self.assertEqual(redeem_result["event_id"], self.event.id)

        # Check used count in DB
        qr_obj = QrTokens.objects.get(id=qr_id)
        self.assertEqual(qr_obj.used_count, 1)

        # Revoke token
        revoked = qr_service.revoke_event_qr_token(self.coord, qr_id)
        self.assertIsNotNone(revoked.revoked_at)

        # Preview after revocation
        preview_revoked = qr_service.preview_qr_token(raw_token)
        self.assertFalse(preview_revoked["is_valid"])
        self.assertEqual(preview_revoked["reason"], "revoked")

    def test_qr_service_rollback_on_multi_step_join(self):
        # Create join_event token
        token_data = qr_service.create_event_qr_token(
            self.coord,
            self.event.id,
            purpose="join_event",
            max_uses=1,
            ttl_minutes=60,
        )
        raw_token = token_data["raw_token"]
        qr_id = token_data["id"]

        # Simulate exception during EventApplications.objects.create
        with patch("services.qr_service.EventApplications.objects.create", side_effect=RuntimeError("Simulated DB Crash")):
            with self.assertRaises(RuntimeError):
                qr_service.redeem_qr_token(self.vol_b, raw_token)

        # Verify transaction rolled back completely: used_count is still 0!
        qr_obj = QrTokens.objects.get(id=qr_id)
        self.assertEqual(qr_obj.used_count, 0)
        self.assertFalse(EventApplications.objects.filter(user=self.vol_b, event=self.event).exists())

    # --- Attendance Service Tests ---

    def test_manual_checkin_and_checkout_lifecycle(self):
        # Onboarding acknowledged first
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)

        # Manual check in by coordinator
        att = attendance_service.manual_check_in(
            self.coord, self.event.id, self.vol.id, note="Checked in by coordinator desk"
        )
        self.assertEqual(att.status, "checked_in")
        self.assertEqual(att.method, "coordinator_manual")
        self.assertEqual(att.recorded_by_user_id, self.coord.id)
        self.assertIsNotNone(att.checkin_at)

        # Check out by volunteer
        att_out = attendance_service.check_out(self.vol, att.id)
        self.assertIsNotNone(att_out.checkout_at)
        self.assertGreaterEqual(att_out.checkout_at, att.checkin_at)

        # Self-service history conceals T4 coordinates
        history = attendance_service.get_user_attendance_history(self.vol)
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["status"], "checked_in")
        self.assertNotIn("checkin_latitude", history[0])
        self.assertNotIn("checkin_longitude", history[0])

    def test_manual_checkin_transaction_rollback(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)
        att = Attendance.objects.get(event=self.event, user=self.vol)

        # Simulate an exception after select_for_update() inside save()
        with patch.object(Attendance, "save", side_effect=RuntimeError("Lock failure simulation")):
            with self.assertRaises(RuntimeError):
                attendance_service.manual_check_in(self.coord, self.event.id, self.vol.id)

        # Status must still be 'expected'
        att.refresh_from_db()
        self.assertEqual(att.status, "expected")

    # --- Geo Service Tests ---

    def test_geo_checkin_accepted_and_attempt_logged(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)

        res = geo_service.process_geo_check_in(
            user=self.vol,
            event_id=self.event.id,
            latitude=1.3521,
            longitude=103.8198,
            accuracy_m=10.0,
            is_mocked=False,
        )
        self.assertTrue(res["success"])
        self.assertEqual(res["result"], "accepted")

        # Telemetry logged to attendance_geo_attempts
        attempt = AttendanceGeoAttempts.objects.filter(event=self.event, user=self.vol).last()
        self.assertIsNotNone(attempt)
        self.assertEqual(attempt.result, "accepted")
        self.assertFalse(attempt.device_mocked)


# ===========================================================================
# Section 5 Manual Check-in Acceptance & P1 Invariant Tests (v0.12.0)
# ===========================================================================

class Section5ManualCheckInAcceptanceTests(TransactionTestCase):
    """
    Covers all Section 5.5 backend acceptance cases, P1-02 donation aggregate
    consistency, and P1-06 invite transaction round-trip against PostgreSQL.
    """

    def setUp(self):
        self.admin = _make_usr("Admin Super", is_admin=True)
        self.coord = _setup_coordinator(self.admin, "Lead Coordinator")
        self.vol = _make_usr("Volunteer Alice", verified=True)
        self.vol_b = _make_usr("Volunteer Bob", verified=True)

        start = timezone.now() + timedelta(hours=2)
        end = start + timedelta(hours=4)
        self.event = Events.objects.create(
            owner_id=self.coord.id,
            current_coordinator_id=self.coord.id,
            title="Section 5 Verification Event",
            start_at=start,
            end_at=end,
            acceptance_mode="auto",
            auto_assign_enabled=True,
            require_onboarding_ack=True,
            onboarding_text="Safety gear required.",
            latitude=1.3521,
            longitude=103.8198,
            geo_radius_m=500,
            geo_checkin_enabled=True,
            require_checkin_confirmation=False,
        )
        self.post = EventPosts.objects.create(
            event=self.event,
            title="Operations Assistant",
            required_headcount=10,
        )
        Events.objects.filter(id=self.event.id).update(status="published")
        Events.objects.filter(id=self.event.id).update(status="active")
        start_active = timezone.now() - timedelta(minutes=10)
        Events.objects.filter(id=self.event.id).update(start_at=start_active)
        self.event.refresh_from_db()

        # Application auto-accepted and assigned
        self.app = EventApplications.objects.create(
            event=self.event,
            user=self.vol,
            source="browse",
            conditions_acknowledged_at=timezone.now(),
        )

    def tearDown(self):
        try:
            with connection.cursor() as cur:
                cur.execute("SET session_replication_role = 'replica';")
                cur.execute("DELETE FROM attendance_geo_attempts WHERE attendance_id IN (SELECT id FROM attendance WHERE event_id = %s)", (self.event.id,))
                cur.execute("DELETE FROM qr_tokens WHERE event_id = %s", (self.event.id,))
                cur.execute("DELETE FROM attendance WHERE event_id = %s", (self.event.id,))
                cur.execute("DELETE FROM assignments WHERE event_id = %s", (self.event.id,))
                cur.execute("DELETE FROM event_applications WHERE event_id = %s", (self.event.id,))
                cur.execute("DELETE FROM event_posts WHERE event_id = %s", (self.event.id,))
                cur.execute("DELETE FROM events WHERE id = %s", (self.event.id,))
                cur.execute("SET session_replication_role = 'origin';")
        except Exception:
            pass
        super().tearDown()

    # 1. active event + onboarding -> 200, status checked_in, method coordinator_manual, already_checked_in=False
    def test_manual_checkin_success_authoritative_result(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)

        result = attendance_service.manual_check_in(
            self.coord, self.event.id, self.vol.id, note="Photo ID verified"
        )
        self.assertEqual(result.status, "checked_in")
        self.assertEqual(result.method, "coordinator_manual")
        self.assertEqual(result.recorded_by_user_id, self.coord.id)
        self.assertFalse(result.already_checked_in)
        self.assertFalse(result["already_checked_in"])
        self.assertEqual(result.attendance_id, result["attendance_id"])
        self.assertEqual(result.event_id, self.event.id)
        self.assertEqual(result.user_id, self.vol.id)
        self.assertIsNotNone(result.checkin_at)

        # Confirm note persisted
        att = Attendance.objects.get(id=result.attendance_id)
        self.assertEqual(att.note, "Photo ID verified")

    # 2. missing row -> not_assigned
    def test_manual_checkin_missing_row_raises_not_assigned(self):
        unassigned_vol = _make_usr("Unassigned Vol")
        with self.assertRaises(DomainError) as ctx:
            attendance_service.manual_check_in(self.coord, self.event.id, unassigned_vol.id)
        self.assertEqual(ctx.exception.code, "not_assigned")
        self.assertEqual(ctx.exception.status_code, 400)

    # 3. inactive event -> denied
    def test_manual_checkin_inactive_event_denied(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)
        Events.objects.filter(id=self.event.id).update(status="completed")

        with self.assertRaises(DomainError) as ctx:
            attendance_service.manual_check_in(self.coord, self.event.id, self.vol.id)
        self.assertEqual(ctx.exception.code, "event_not_active")

    # 4. cancelled assignment -> denied
    def test_manual_checkin_cancelled_assignment_denied(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)
        Assignments.objects.filter(event=self.event, user=self.vol).update(
            status="cancelled", cancel_reason="test cancellation"
        )

        with self.assertRaises(DomainError) as ctx:
            attendance_service.manual_check_in(self.coord, self.event.id, self.vol.id)
        self.assertIn(ctx.exception.code, ("not_assigned", "invalid_state"))

    # 5. missing onboarding -> denied
    def test_manual_checkin_missing_onboarding_denied(self):
        # Do not acknowledge onboarding
        with self.assertRaises(DomainError) as ctx:
            attendance_service.manual_check_in(self.coord, self.event.id, self.vol.id)
        self.assertEqual(ctx.exception.code, "onboarding_required")

    # 6. owner-as-monitor -> 403
    def test_manual_checkin_owner_as_monitor_denied_403(self):
        owner = _setup_coordinator(self.admin, "Owner Coordinator")
        lead = _setup_coordinator(self.admin, "Lead Delegated Coordinator")
        fut_start = timezone.now() + timedelta(hours=2)
        fut_end = fut_start + timedelta(hours=4)
        delegated_event = Events.objects.create(
            owner_id=owner.id,
            current_coordinator_id=lead.id,
            title="Delegated Event",
            start_at=fut_start,
            end_at=fut_end,
            acceptance_mode="auto",
            auto_assign_enabled=True,
            require_onboarding_ack=False,
        )
        EventPosts.objects.create(event=delegated_event, title="Staff", required_headcount=5)
        Events.objects.filter(id=delegated_event.id).update(status="published")
        Events.objects.filter(id=delegated_event.id).update(status="active")
        Events.objects.filter(id=delegated_event.id).update(start_at=timezone.now() - timedelta(minutes=5))
        delegated_event.refresh_from_db()
        other_vol = _make_usr("Delegated Vol")
        EventApplications.objects.create(
            event=delegated_event, user=other_vol, source="browse", conditions_acknowledged_at=timezone.now()
        )

        with self.assertRaises(OwnerMonitorReadOnlyError):
            attendance_service.manual_check_in(owner, delegated_event.id, other_vol.id)

    # 7. unrelated coordinator -> 404
    def test_manual_checkin_unrelated_coordinator_denied_404(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)
        unrelated = _setup_coordinator(self.admin, "Unrelated Coordinator")

        with self.assertRaises(ResourceMaskedNotFound):
            attendance_service.manual_check_in(unrelated, self.event.id, self.vol.id)

    # 8. repeated call -> idempotent response with original method and timestamp preserved
    def test_manual_checkin_idempotent_repeat_preserves_method_and_timestamp(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)

        first = attendance_service.manual_check_in(self.coord, self.event.id, self.vol.id, note="First pass")
        self.assertFalse(first.already_checked_in)
        orig_checkin_at = first.checkin_at

        second = attendance_service.manual_check_in(self.coord, self.event.id, self.vol.id, note="Second pass")
        self.assertTrue(second.already_checked_in)
        self.assertTrue(second["already_checked_in"])
        self.assertEqual(second.method, "coordinator_manual")
        self.assertEqual(second.checkin_at, orig_checkin_at)
        self.assertEqual(second.attendance_id, first.attendance_id)

    # 9. already checked-in by QR/GPS -> no relabel to manual and no loss of confirmation status
    def test_manual_checkin_idempotent_preserves_qr_and_geo_methods_and_confirmation(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)
        att = Attendance.objects.get(event=self.event, user=self.vol)

        # 1. Preset as QR scan via real QR token redemption
        token_data = qr_service.create_event_qr_token(
            self.coord, self.event.id, purpose="checkin", max_uses=2, ttl_minutes=60
        )
        qr_service.redeem_qr_token(self.vol, token_data["raw_token"])
        att.refresh_from_db()
        qr_checkin_at = att.checkin_at
        self.assertEqual(att.method, "qr_scan")
        self.assertEqual(att.status, "checked_in")

        res_qr = attendance_service.manual_check_in(self.coord, self.event.id, self.vol.id)
        self.assertTrue(res_qr.already_checked_in)
        self.assertEqual(res_qr.method, "qr_scan")
        self.assertEqual(res_qr.checkin_at, qr_checkin_at)

        # 2. Preset as Geo with pending confirmation on vol_b
        Events.objects.filter(id=self.event.id).update(require_checkin_confirmation=True)
        EventApplications.objects.create(
            event=self.event, user=self.vol_b, source="browse", conditions_acknowledged_at=timezone.now()
        )
        onboarding_service.acknowledge_event_onboarding(self.vol_b, self.event.id)
        geo_res = geo_service.process_geo_check_in(
            user=self.vol_b,
            event_id=self.event.id,
            latitude=1.3521,
            longitude=103.8198,
            accuracy_m=10.0,
            is_mocked=False,
        )
        self.assertTrue(geo_res["success"])
        self.assertEqual(geo_res["confirmation_status"], "pending")
        att_b = Attendance.objects.get(event=self.event, user=self.vol_b)
        self.assertEqual(att_b.method, "geo")
        self.assertEqual(att_b.confirmation_status, "pending")

        res_geo = attendance_service.manual_check_in(self.coord, self.event.id, self.vol_b.id)
        self.assertTrue(res_geo.already_checked_in)
        self.assertEqual(res_geo.method, "geo")
        att_b.refresh_from_db()
        self.assertEqual(att_b.confirmation_status, "pending")

    # 10. cancelled attendance row -> 409 invalid_state
    def test_manual_checkin_cancelled_attendance_raises_409_invalid_state(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)
        att = Attendance.objects.get(event=self.event, user=self.vol)
        Attendance.objects.filter(id=att.id).update(status="cancelled")

        with self.assertRaises(DomainError) as ctx:
            attendance_service.manual_check_in(self.coord, self.event.id, self.vol.id)
        self.assertEqual(ctx.exception.code, "invalid_state")
        self.assertEqual(ctx.exception.status_code, 409)

    # 11. concurrent duplicate calls -> one effective state transition and deterministic response
    def test_manual_checkin_concurrent_duplicate_calls(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)

        results = []
        errors = []

        def worker():
            from django.db import connection
            try:
                res = attendance_service.manual_check_in(self.coord, self.event.id, self.vol.id)
                results.append(res)
            except Exception as e:
                errors.append(e)
            finally:
                connection.close()

        t1 = threading.Thread(target=worker)
        t2 = threading.Thread(target=worker)
        t1.start()
        t2.start()
        t1.join(timeout=10)
        t2.join(timeout=10)

        self.assertEqual(len(errors), 0, f"Thread errors: {errors}")
        self.assertEqual(len(results), 2)
        already_flags = sorted([r.already_checked_in for r in results])
        self.assertEqual(already_flags, [False, True])
        self.assertEqual(Attendance.objects.filter(event=self.event, user=self.vol, status="checked_in").count(), 1)

    # 12. audit note/recorder identity appear in attendance record
    def test_manual_checkin_audit_note_and_recorder_persistence(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)
        res = attendance_service.manual_check_in(
            self.coord, self.event.id, self.vol.id, note="Manual registration desk verification"
        )
        att = Attendance.objects.get(id=res.attendance_id)
        self.assertEqual(att.note, "Manual registration desk verification")
        self.assertEqual(att.recorded_by_user_id, self.coord.id)

    # 13. donation transition matrix (P1-02)
    def test_donation_matrix_all_transitions(self):
        user = _make_usr("Donation Volunteer")
        self.assertFalse(user.is_willing_to_donate)
        self.assertFalse(user.is_willing_to_donate_blood)
        self.assertFalse(user.is_willing_to_donate_items)

        # Transition 1: blood -> True sets master -> True
        profile_service.update_user_profile(user, {"is_willing_to_donate_blood": True})
        user.refresh_from_db()
        self.assertTrue(user.is_willing_to_donate)
        self.assertTrue(user.is_willing_to_donate_blood)
        self.assertFalse(user.is_willing_to_donate_items)

        # Transition 2: items -> True keeps master and blood True
        profile_service.update_user_profile(user, {"is_willing_to_donate_items": True})
        user.refresh_from_db()
        self.assertTrue(user.is_willing_to_donate)
        self.assertTrue(user.is_willing_to_donate_blood)
        self.assertTrue(user.is_willing_to_donate_items)

        # Transition 3: blood -> False keeps master True (items is still True)
        profile_service.update_user_profile(user, {"is_willing_to_donate_blood": False})
        user.refresh_from_db()
        self.assertTrue(user.is_willing_to_donate)
        self.assertFalse(user.is_willing_to_donate_blood)
        self.assertTrue(user.is_willing_to_donate_items)

        # Transition 4: items -> False sets master False (both sub-flags now False)
        profile_service.update_user_profile(user, {"is_willing_to_donate_items": False})
        user.refresh_from_db()
        self.assertFalse(user.is_willing_to_donate)
        self.assertFalse(user.is_willing_to_donate_blood)
        self.assertFalse(user.is_willing_to_donate_items)

        # Transition 5: master -> True without sub-flags (general donor)
        profile_service.update_user_profile(user, {"is_willing_to_donate": True})
        user.refresh_from_db()
        self.assertTrue(user.is_willing_to_donate)
        self.assertFalse(user.is_willing_to_donate_blood)
        self.assertFalse(user.is_willing_to_donate_items)

        # Transition 6: master -> False cascades sub-flags to False
        user.is_willing_to_donate_blood = True
        user.save()
        profile_service.update_user_profile(user, {"is_willing_to_donate": False})
        user.refresh_from_db()
        self.assertFalse(user.is_willing_to_donate)
        self.assertFalse(user.is_willing_to_donate_blood)
        self.assertFalse(user.is_willing_to_donate_items)

        # Transition 7: contradiction rejection
        with self.assertRaises(DomainError) as ctx:
            profile_service.update_user_profile(
                user, {"is_willing_to_donate": False, "is_willing_to_donate_blood": True}
            )
        self.assertEqual(ctx.exception.code, "invalid_donation_preferences")
        self.assertEqual(ctx.exception.status_code, 400)

    # 14. invite accept/reject transaction round-trip (P1-06)
    def test_invite_round_trip_accept_and_reject(self):
        fut_start = timezone.now() + timedelta(days=1)
        fut_end = fut_start + timedelta(hours=4)
        manual_event = Events.objects.create(
            owner_id=self.coord.id,
            current_coordinator_id=self.coord.id,
            title="Invite Acceptance Event",
            start_at=fut_start,
            end_at=fut_end,
            acceptance_mode="manual",
            auto_assign_enabled=False,
            require_onboarding_ack=False,
        )
        post = EventPosts.objects.create(event=manual_event, title="Special Role", required_headcount=5)
        Events.objects.filter(id=manual_event.id).update(status="published")
        Events.objects.filter(id=manual_event.id).update(status="active")
        manual_event.refresh_from_db()

        # Coordinator invites volunteer
        app = application_service.invite_volunteer_to_event(
            self.coord, manual_event.id, volunteer_user_id=self.vol.id, post_id=post.id, note="We need you!"
        )
        self.assertEqual(app.source, "invite")
        self.assertEqual(app.status, "pending")

        # Volunteer checks own applications
        apps = application_service.get_own_applications(self.vol, manual_event.id)
        self.assertEqual(len(apps), 1)
        self.assertEqual(apps[0]["id"], app.id)
        self.assertEqual(apps[0]["source"], "invite")
        self.assertEqual(apps[0]["status"], "pending")

        # Volunteer accepts the invite
        accepted_app = application_service.accept_invite(self.vol, app.id, note="Accepted with excitement")
        self.assertEqual(accepted_app.status, "accepted")
        app.refresh_from_db()
        self.assertEqual(app.status, "accepted")

        # Coordinator sees final accepted status
        coord_apps = application_service.get_event_applications(self.coord, manual_event.id)
        self.assertTrue(any(a["id"] == app.id and a["status"] == "accepted" for a in coord_apps))

        # Second invite for decline flow
        app2 = application_service.invite_volunteer_to_event(
            self.coord, manual_event.id, volunteer_user_id=self.vol_b.id, post_id=post.id
        )
        declined_app = application_service.reject_invite(self.vol_b, app2.id, note="Cannot attend")
        self.assertEqual(declined_app.status, "withdrawn")
        app2.refresh_from_db()
        self.assertEqual(app2.status, "withdrawn")

        # Coordinator sees withdrawn status
        coord_apps_after = application_service.get_event_applications(self.coord, manual_event.id)
        self.assertTrue(any(a["id"] == app2.id and a["status"] == "withdrawn" for a in coord_apps_after))

        # Responding to already decided invite fails
        with self.assertRaises(DomainError) as ctx:
            application_service.accept_invite(self.vol, app.id)
        self.assertEqual(ctx.exception.code, "invalid_state")

        # Another user attempting to decide volunteer's invite fails
        with self.assertRaises(ResourceMaskedNotFound):
            application_service.accept_invite(self.vol_b, app.id)
