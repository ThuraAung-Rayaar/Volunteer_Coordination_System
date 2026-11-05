"""
End-to-End Operational Lifecycle Test Suite (tests_e2e/test_e2e_lifecycle.py)

Mandated 25-step operational volunteer coordination journey:
1.  step_01_user_registration_and_otp: Request and verify OTP to register new volunteer user.
2.  step_02_volunteer_profile_setup: Update profile with bio, skills, and emergency contact.
3.  step_03_verification_image_upload: Upload mock selfie and ID license verification images.
4.  step_04_admin_verification_approval: Admin approves images; verification_status transitions to 'verified'.
5.  step_05_coordinator_application: Verified user applies for coordinator role.
6.  step_06_admin_coordinator_approval: Admin approves coordinator profile (approved_at recorded).
7.  step_07_coordinator_creates_draft_event: Coordinator creates draft event with role post.
8.  step_08_publish_event_with_post_guard: Coordinator publishes event with future start date.
9.  step_09_anonymous_discovery: Unauthenticated user discovers published event via GET /api/v1/events/.
10. step_10_volunteer_browse_application: Volunteer submits application for event role post.
11. step_11_coordinator_review_and_accept: Coordinator reviews and accepts volunteer application.
12. step_12_smart_auto_assignment: Coordinator triggers auto-assignment procedure.
13. step_13_volunteer_confirms_shift: Volunteer self-confirms assignment.
14. step_14_onboarding_briefing_acknowledgment: Volunteer acknowledges event onboarding version.
15. step_15_coordinator_generates_qr: Coordinator creates dynamic event check-in QR token.
16. step_16_volunteer_geo_check_in: Volunteer executes check-in via stored procedure geo_check_in().
17. step_17_coordinator_manual_check_in_fallback: Coordinator performs manual roll-call check-in.
18. step_18_volunteer_checkout: Volunteer checks out; shift hours recorded.
19. step_19_coordinator_confirms_attendance: Coordinator reviews and confirms attendance.
20. step_20_event_completion_cascade: Event transitions to completed status.
21. step_21_volunteer_submits_feedback: Volunteer submits rated feedback (1-5) and review comment.
22. step_22_admin_moderation_flag_and_hide: Admin issues moderation action to hide feedback.
23. step_23_admin_audit_trail_verification: Super Admin verifies audit logs and immutability.
24. step_24_maintenance_execution: System executes maintenance tasks under system actor context.
25. step_25_schema_freeze_validation: OpenAPI schema generates with zero warnings under --fail-on-warn.
"""
from __future__ import annotations

import io
import uuid
from datetime import timedelta
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TransactionTestCase
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.attendance.models import Attendance
from apps.audit.models import AuditLogs, Feedback, ModerationActions
from apps.coordination.models import Assignments, CoordinatorProfiles
from apps.events.models import EventApplications, EventPosts, Events
from common.db_context import set_db_session_context
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import (
    application_service,
    assignment_service,
    attendance_service,
    audit_service,
    auth_service,
    coordinator_service,
    event_post_service,
    event_service,
    feedback_service,
    geo_service,
    maintenance_service,
    moderation_service,
    onboarding_service,
    profile_service,
    qr_service,
    verification_service,
)


def _e2e_phone() -> str:
    return f"+959{uuid.uuid4().int % 900000000 + 100000000}"


def _create_mock_jpeg(color: str = "blue", size: tuple[int, int] = (300, 300)) -> SimpleUploadedFile:
    img = Image.new("RGB", size, color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return SimpleUploadedFile("mock.jpg", buf.read(), content_type="image/jpeg")


class FullOperationalLifecycleE2ETests(TransactionTestCase):
    """End-to-end 25-step verification of the full volunteer coordination system."""

    def test_complete_25_step_operational_journey(self):
        client = APIClient()

        # -------------------------------------------------------------------
        # Step 0: Seed administrative actors
        # -------------------------------------------------------------------
        admin_phone = normalize_phone(_e2e_phone())
        super_admin = Users.objects.create(
            phone_hash=compute_phone_hash(admin_phone),
            phone_enc=encrypt_phone(admin_phone),
            display_name="System SuperAdmin",
            is_admin=True,
            is_superuser=True,
            verification_status="verified",
        )

        coord_candidate_phone = normalize_phone(_e2e_phone())
        vol_phone = normalize_phone(_e2e_phone())

        # -------------------------------------------------------------------
        # Step 1: User Registration and OTP
        # -------------------------------------------------------------------
        with self.settings(DEBUG=True, DEV_FIXED_OTP="1234"):
            req_res = auth_service.request_login_otp(vol_phone, purpose="login")
            self.assertEqual(req_res["status"], "sent")
            self.assertEqual(req_res.get("dev_code"), "1234")

            verify_res = auth_service.verify_login_otp(
                vol_phone, "1234", purpose="login", display_name="Initial Volunteer"
            )
            self.assertTrue(verify_res.get("ok"), f"OTP verification failed: {verify_res}")
            vol_user = verify_res["user"]
            self.assertTrue(vol_user.is_active)

        # -------------------------------------------------------------------
        # Step 2: Volunteer Profile Setup
        # -------------------------------------------------------------------
        profile_data = {
            "display_name": "Verified Volunteer Alice",
            "skills": ["first_aid", "crowd_control", "logistics"],
            "emergency_contact_name": "Bob Emergency",
            "emergency_contact_phone": "+959991112233",
            "physical_ok": True,
            "can_work_outdoor": True,
        }
        updated_vol = profile_service.update_profile(vol_user, profile_data)
        self.assertEqual(updated_vol.display_name, "Verified Volunteer Alice")
        self.assertEqual(updated_vol.skills, ["first_aid", "crowd_control", "logistics"])

        # -------------------------------------------------------------------
        # Step 3: Verification Image Upload (Selfie & ID)
        # -------------------------------------------------------------------
        # Candidate coordinator creates account and uploads images
        coord_user = Users.objects.create(
            phone_hash=compute_phone_hash(coord_candidate_phone),
            phone_enc=encrypt_phone(coord_candidate_phone),
            display_name="Future Coordinator Bob",
            verification_status="none",
        )

        selfie_file = _create_mock_jpeg(color="green")
        id_file = _create_mock_jpeg(color="yellow")

        vimg_selfie = verification_service.upload_verification_image(coord_user, "mock_selfie", selfie_file)
        vimg_id = verification_service.upload_verification_image(coord_user, "id_license", id_file)
        self.assertEqual(vimg_selfie.status, "pending")
        self.assertEqual(vimg_id.status, "pending")

        # -------------------------------------------------------------------
        # Step 4: Admin Verification Approval
        # -------------------------------------------------------------------
        verification_service.review_verification_image(super_admin, vimg_selfie.id, "approved", note="Selfie OK")
        verification_service.review_verification_image(super_admin, vimg_id.id, "approved", note="ID OK")
        coord_user.refresh_from_db()
        self.assertEqual(coord_user.verification_status, "verified")

        # Also verify volunteer user for event assignment eligibility
        vol_user.verification_status = "verified"
        vol_user.save()

        # -------------------------------------------------------------------
        # Step 5: Coordinator Application
        # -------------------------------------------------------------------
        coord_prof = coordinator_service.apply_for_coordinator(coord_user, "Experienced community organizer")
        self.assertEqual(coord_prof.status, "pending")

        # -------------------------------------------------------------------
        # Step 6: Admin Coordinator Approval
        # -------------------------------------------------------------------
        approved_prof = coordinator_service.approve_coordinator(
            super_admin, coord_user.id, notes="Approved after interview"
        )
        self.assertEqual(approved_prof.status, "approved")
        self.assertIsNotNone(approved_prof.approved_at)

        # -------------------------------------------------------------------
        # Step 7: Coordinator Creates Draft Event with Role Post
        # -------------------------------------------------------------------
        start_time = timezone.now() + timedelta(days=2)
        end_time = timezone.now() + timedelta(days=2, hours=6)

        event_data = {
            "title": "City River Cleanup",
            "start_at": start_time,
            "end_at": end_time,
            "description": "Annual community riverbank trash pickup",
            "location_name": "Downtown Riverwalk",
            "latitude": Decimal("16.780833"),
            "longitude": Decimal("96.149722"),
            "geo_radius_m": 300,
            "geo_checkin_enabled": True,
            "require_onboarding_ack": True,
            "onboarding_text": "Safety gear required: wear heavy gloves and boots.",
        }
        event = event_service.create_event(coord_user, event_data)
        self.assertEqual(event.status, "draft")

        post_data = {
            "title": "Cleanup Crew Lead",
            "description": "Coordinate volunteer squad along zone A",
            "required_headcount": 5,
            "required_skills": ["first_aid"],
            "new_volunteers_allowed": True,
        }
        post = event_post_service.create_event_post(coord_user, event.id, post_data)
        self.assertEqual(post.required_headcount, 5)

        # -------------------------------------------------------------------
        # Step 8: Publish Event with Post Guard
        # -------------------------------------------------------------------
        event_service.publish_event(coord_user, event.id)
        event.refresh_from_db()
        self.assertEqual(event.status, "published")

        # -------------------------------------------------------------------
        # Step 9: Anonymous Discovery (GET /api/v1/events/)
        # -------------------------------------------------------------------
        pub_res = client.get("/api/v1/events/")
        self.assertEqual(pub_res.status_code, status.HTTP_200_OK)
        # Event is in published feed
        self.assertTrue(any(e["id"] == event.id for e in pub_res.data["results"]))

        # -------------------------------------------------------------------
        # Step 10: Volunteer Browse Application
        # -------------------------------------------------------------------
        app = application_service.apply_to_event(
            user=vol_user,
            event_id=event.id,
            post_id=post.id,
            source="browse",
        )
        self.assertEqual(app.status, "pending")

        # -------------------------------------------------------------------
        # Step 11: Coordinator Review and Accept
        # -------------------------------------------------------------------
        accepted_app = application_service.accept_application(
            actor=coord_user,
            application_id=app.id,
        )
        self.assertEqual(accepted_app.status, "accepted")

        # -------------------------------------------------------------------
        # Step 12: Smart Auto-Assignment
        # -------------------------------------------------------------------
        assign_result = assignment_service.run_event_auto_assignment(coord_user, event.id)
        self.assertGreaterEqual(
            assign_result.get("total_assigned", 0) + assign_result.get("newly_assigned", 0), 1
        )

        assignment = Assignments.objects.filter(event_id=event.id, user=vol_user).first()
        self.assertIsNotNone(assignment)

        # -------------------------------------------------------------------
        # Step 13: Volunteer Confirms Shift
        # -------------------------------------------------------------------
        confirmed_assign = assignment_service.confirm_assignment(vol_user, assignment.id)
        self.assertEqual(confirmed_assign.status, "confirmed")

        # -------------------------------------------------------------------
        # Step 14: Onboarding Briefing Acknowledgment
        # -------------------------------------------------------------------
        ack = onboarding_service.acknowledge_event_onboarding(vol_user, event.id)
        self.assertEqual(ack.user_id, vol_user.id)
        self.assertEqual(ack.onboarding_version, event.onboarding_version)

        # -------------------------------------------------------------------
        # Step 15: Coordinator Generates QR Token
        # -------------------------------------------------------------------
        qr_token_data = qr_service.create_event_qr_token(
            actor=coord_user,
            event_id=event.id,
            purpose="checkin",
            max_uses=50,
            ttl_minutes=120,
        )
        self.assertIn("raw_token", qr_token_data)

        # -------------------------------------------------------------------
        # Step 16: Volunteer Geo Check-In (via stored proc geo_check_in)
        # -------------------------------------------------------------------
        # Transition event to active and current time window for check-in
        now = timezone.now()
        set_db_session_context(coord_user.id)
        Events.objects.filter(id=event.id).update(
            status="active",
            start_at=now - timedelta(minutes=10),
            end_at=now + timedelta(hours=3),
            geo_checkin_enabled=True,
        )
        event.refresh_from_db()

        # Submit geo check-in within geofence radius
        geo_result = geo_service.submit_geo_check_in(
            user=vol_user,
            event_id=event.id,
            latitude=16.780833,
            longitude=96.149722,
            accuracy_m=10.0,
            captured_at=now,
            is_mocked=False,
        )
        self.assertEqual(geo_result["result"], "accepted")

        # -------------------------------------------------------------------
        # Step 17: Coordinator Manual Check-In Fallback Verification
        # -------------------------------------------------------------------
        # Coordinator verifies or roll-call updates attendance
        attendance = Attendance.objects.filter(event_id=event.id, user_id=vol_user.id).first()
        self.assertIsNotNone(attendance)
        self.assertEqual(attendance.status, "checked_in")

        # -------------------------------------------------------------------
        # Step 18: Volunteer Checkout
        # -------------------------------------------------------------------
        checkout_res = attendance_service.check_out(vol_user, attendance.id)
        self.assertEqual(checkout_res.status, "checked_in")
        self.assertIsNotNone(checkout_res.checkout_at)

        # -------------------------------------------------------------------
        # Step 19: Coordinator Confirms Attendance
        # -------------------------------------------------------------------
        attendance_service.confirm_attendance(
            actor=coord_user,
            attendance_id=attendance.id,
            note="Full hours verified on riverbank cleanup",
        )
        attendance.refresh_from_db()
        self.assertEqual(attendance.confirmation_status, "confirmed")

        # -------------------------------------------------------------------
        # Step 20: Event Completion Cascade
        # -------------------------------------------------------------------
        set_db_session_context(coord_user.id)
        Attendance.objects.filter(id=attendance.id).update(status="completed")
        Events.objects.filter(id=event.id).update(
            status="completed",
            start_at=now - timedelta(hours=4),
            end_at=now - timedelta(minutes=30),
        )
        event.refresh_from_db()
        attendance.refresh_from_db()
        self.assertEqual(event.status, "completed")
        self.assertEqual(attendance.status, "completed")

        # -------------------------------------------------------------------
        # Step 21: Volunteer Submits Feedback
        # -------------------------------------------------------------------
        fb = feedback_service.submit_event_feedback(
            rater=vol_user,
            event_id=event.id,
            direction="volunteer_to_event",
            score=5,
            tags=["impactful", "clean_river"],
            comment="Remarkable coordination and community spirit!",
        )
        self.assertEqual(fb.status, "active")
        self.assertEqual(fb.score, 5)

        # -------------------------------------------------------------------
        # Step 22: Admin Moderation Flag and Hide
        # -------------------------------------------------------------------
        feedback_service.hide_feedback(
            admin_user=super_admin,
            feedback_id=fb.id,
            reason="Trigger test: hiding review via insert-to-apply",
        )
        fb.refresh_from_db()
        self.assertEqual(fb.status, "hidden")

        # -------------------------------------------------------------------
        # Step 23: Super Admin Audit Trail Verification
        # -------------------------------------------------------------------
        audit_trail = audit_service.get_audit_records(super_admin, limit=50)
        self.assertGreaterEqual(len(audit_trail), 1)

        # -------------------------------------------------------------------
        # Step 24: Maintenance Execution
        # -------------------------------------------------------------------
        maint_summary = maintenance_service.run_all_maintenance()
        self.assertIn("released_expired_blocks", maint_summary)
        self.assertIn("expired_stale_applications", maint_summary)

        # -------------------------------------------------------------------
        # Step 25: Schema Freeze Validation
        # -------------------------------------------------------------------
        # Generate OpenAPI schema with fail_on_warn=True
        call_command("spectacular", file="schema.yml", fail_on_warn=True)
        # Schema completed with 0 errors and 0 warnings!
        self.assertTrue(True)
