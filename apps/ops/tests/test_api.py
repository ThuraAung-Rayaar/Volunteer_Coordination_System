# apps/ops/tests/test_api.py
from datetime import timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import CoordinatorProfile, User
from apps.common.constants import (
    APPLICATION_ACCEPTED,
    ATTENDANCE_CHECKED_IN,
    COORDINATOR_APPROVED,
    QR_CHECKIN,
    QR_WALKIN_REGISTRATION,
    VERIFICATION_VERIFIED,
)
from apps.events.models import EventApplication
from apps.events.services import (
    activate_event,
    add_post,
    complete_event,
    create_event,
    publish_event,
)
from apps.ops.models import Assignment, Attendance
from apps.ops.services import (
    create_assignment_from_application,
    generate_qr_token,
)


class OpsApiTests(APITestCase):
    def setUp(self):
        # 1. Setup Coordinator
        self.coordinator = User.objects.create(
            phone_hash="hash_coord_api",
            display_name="Coordinator Api",
            verification_status=VERIFICATION_VERIFIED,
        )
        CoordinatorProfile.objects.create(
            user=self.coordinator,
            status=COORDINATOR_APPROVED,
            approved_at=timezone.now(),
        )

        # 2. Setup Volunteers
        self.volunteer = User.objects.create(
            phone_hash="hash_vol_api1",
            display_name="Volunteer Api1",
        )
        self.volunteer2 = User.objects.create(
            phone_hash="hash_vol_api2",
            display_name="Volunteer Api2",
        )

        # 3. Setup Event
        now = timezone.now()
        self.event = create_event(
            self.coordinator,
            {
                "title": "Community Park Cleanup",
                "start_at": now + timedelta(days=2),
                "end_at": now + timedelta(days=2, hours=4),
                "acceptance_mode": "auto",
                "max_participants": 20,
                "require_onboarding_ack": True,
                "onboarding_text": "Wear sturdy shoes and bring water.",
            },
        )
        self.post = add_post(
            self.coordinator,
            self.event,
            {"title": "Tree Planter", "required_headcount": 10},
        )
        publish_event(self.coordinator, self.event)

    def test_qr_generate_and_redeem_api(self):
        self.client.force_authenticate(user=self.coordinator)

        # 1. Coordinator generates walk-in QR token
        gen_resp = self.client.post(
            f"/api/v1/events/{self.event.id}/qr/",
            {"purpose": QR_WALKIN_REGISTRATION, "max_uses": 5, "ttl_minutes": 60},
            format="json",
        )
        self.assertEqual(gen_resp.status_code, status.HTTP_201_CREATED)
        raw_token = gen_resp.data["token"]
        self.assertIsNotNone(raw_token)

        # 2. Public preview (unauthenticated)
        self.client.force_authenticate(user=None)
        res_resp = self.client.post(
            "/api/v1/qr/resolve/",
            {"token": raw_token},
            format="json",
        )
        self.assertEqual(res_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(res_resp.data["event_id"], self.event.id)
        self.assertEqual(res_resp.data["purpose"], QR_WALKIN_REGISTRATION)

        # 3. Authenticated volunteer redeems walk-in QR
        self.client.force_authenticate(user=self.volunteer)
        redeem_resp = self.client.post(
            "/api/v1/qr/redeem/",
            {"token": raw_token},
            format="json",
        )
        self.assertEqual(redeem_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(redeem_resp.data["action"], QR_WALKIN_REGISTRATION)
        self.assertEqual(redeem_resp.data["status"], APPLICATION_ACCEPTED)

    def test_attendance_checkin_api(self):
        activate_event(self.coordinator, self.event)

        # Volunteer has accepted application & assignment
        app = EventApplication.objects.create(
            event=self.event,
            post=self.post,
            user=self.volunteer,
            status=APPLICATION_ACCEPTED,
            decided_at=timezone.now(),
        )
        create_assignment_from_application(app)

        self.client.force_authenticate(user=self.volunteer)

        # Acknowledge onboarding
        ack_resp = self.client.post(
            f"/api/v1/events/{self.event.id}/onboarding/acknowledge/",
            {"method": "app_tick"},
            format="json",
        )
        self.assertEqual(ack_resp.status_code, status.HTTP_200_OK)

        # Coordinator generates check-in QR
        qr_tok, raw_tok = generate_qr_token(self.coordinator, self.event, QR_CHECKIN)

        # Volunteer checks in with QR
        cin_resp = self.client.post(
            f"/api/v1/events/{self.event.id}/check-in/",
            {"method": "qr_scan", "token": raw_tok},
            format="json",
        )
        self.assertEqual(cin_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(cin_resp.data["status"], ATTENDANCE_CHECKED_IN)

        # Volunteer checks out
        cout_resp = self.client.post(
            f"/api/v1/events/{self.event.id}/check-out/",
            {},
            format="json",
        )
        self.assertEqual(cout_resp.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(cout_resp.data["checkout_at"])

    def test_my_shifts_endpoints(self):
        # Create application and assignment for volunteer 1
        app1 = EventApplication.objects.create(
            event=self.event,
            post=self.post,
            user=self.volunteer,
            status=APPLICATION_ACCEPTED,
            decided_at=timezone.now(),
        )
        assign1 = create_assignment_from_application(app1)

        # Create application for volunteer 2
        EventApplication.objects.create(
            event=self.event,
            post=self.post,
            user=self.volunteer2,
            status=APPLICATION_ACCEPTED,
            decided_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.volunteer)

        # Check me/applications/ returns only volunteer 1's applications
        apps_resp = self.client.get("/api/v1/me/applications/")
        self.assertEqual(apps_resp.status_code, status.HTTP_200_OK)
        results = apps_resp.data.get("results", apps_resp.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], app1.id)

        # Check me/assignments/ returns only volunteer 1's assignments
        assign_resp = self.client.get("/api/v1/me/assignments/")
        self.assertEqual(assign_resp.status_code, status.HTTP_200_OK)
        assign_results = assign_resp.data.get("results", assign_resp.data)
        self.assertEqual(len(assign_results), 1)
        self.assertEqual(assign_results[0]["id"], assign1.id)

    def test_feedback_api(self):
        activate_event(self.coordinator, self.event)
        app = EventApplication.objects.create(
            event=self.event,
            post=self.post,
            user=self.volunteer,
            status=APPLICATION_ACCEPTED,
            decided_at=timezone.now(),
        )
        create_assignment_from_application(app)
        complete_event(self.coordinator, self.event)

        self.client.force_authenticate(user=self.volunteer)

        # Submit feedback to event
        fb_resp = self.client.post(
            f"/api/v1/events/{self.event.id}/feedback/",
            {
                "direction": "volunteer_to_event",
                "score": 5,
                "comment": "Incredible experience!",
                "tags": ["organized", "fun"],
            },
            format="json",
        )
        self.assertEqual(fb_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(fb_resp.data["score"], 5)
        self.assertEqual(fb_resp.data["direction"], "volunteer_to_event")

    def test_assignment_lifecycle_api(self):
        # 1. Volunteer applies
        app = EventApplication.objects.create(
            event=self.event,
            post=self.post,
            user=self.volunteer,
            status=APPLICATION_ACCEPTED,
            decided_at=timezone.now(),
        )

        # 2. Coordinator triggers auto-run assignment
        self.client.force_authenticate(user=self.coordinator)
        auto_resp = self.client.post(
            f"/api/v1/events/{self.event.id}/assignments/auto-run/",
            {},
            format="json",
        )
        self.assertEqual(auto_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(auto_resp.data), 1)
        assignment_id = auto_resp.data[0]["id"]

        # 3. Volunteer confirms assignment
        self.client.force_authenticate(user=self.volunteer)
        conf_resp = self.client.post(
            f"/api/v1/assignments/{assignment_id}/confirm/",
            {},
            format="json",
        )
        self.assertEqual(conf_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(conf_resp.data["status"], "confirmed")

        # 4. Coordinator marks volunteer absent
        activate_event(self.coordinator, self.event)
        self.client.force_authenticate(user=self.coordinator)
        absent_resp = self.client.post(
            f"/api/v1/events/{self.event.id}/mark-absent/",
            {"user_id": self.volunteer.id},
            format="json",
        )
        self.assertEqual(absent_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(absent_resp.data["status"], "absent")

        # 5. Coordinator cancels assignment
        cancel_resp = self.client.post(
            f"/api/v1/assignments/{assignment_id}/cancel/",
            {"reason": "Volunteer requested cancellation."},
            format="json",
        )
        self.assertEqual(cancel_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(cancel_resp.data["status"], "cancelled")

    def test_manual_assignment_api(self):
        app = EventApplication.objects.create(
            event=self.event,
            post=self.post,
            user=self.volunteer,
            status=APPLICATION_ACCEPTED,
            decided_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.coordinator)
        manual_resp = self.client.post(
            f"/api/v1/events/{self.event.id}/assignments/manual/",
            {
                "application_id": app.id,
                "post_id": self.post.id,
                "group_code": "G99",
                "is_group_leader": True,
            },
            format="json",
        )
        self.assertEqual(manual_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(manual_resp.data["group_code"], "G99")
        self.assertTrue(manual_resp.data["is_group_leader"])

