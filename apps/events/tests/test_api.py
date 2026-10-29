# apps/events/tests/test_api.py
from datetime import timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import CoordinatorProfile, User
from apps.accounts.services import issue_token_for_user
from apps.common.constants import (
    APPLICATION_ACCEPTED,
    APPLICATION_PENDING,
    COORDINATOR_APPROVED,
    EVENT_ACTIVE,
    EVENT_DRAFT,
    EVENT_PUBLISHED,
    VERIFICATION_VERIFIED,
)
from apps.events.models import Event, EventApplication, EventPost
from apps.events.services import add_post, create_event, publish_event


class EventsApiTests(APITestCase):
    def setUp(self):
        # 1. Setup approved coordinator
        self.coordinator = User.objects.create(
            phone_hash="hash_coord_api",
            display_name="Coord Api",
            verification_status=VERIFICATION_VERIFIED,
        )
        CoordinatorProfile.objects.create(
            user=self.coordinator,
            status=COORDINATOR_APPROVED,
            approved_at=timezone.now(),
        )
        self.coord_token = issue_token_for_user(self.coordinator)

        # 2. Setup volunteer
        self.volunteer = User.objects.create(
            phone_hash="hash_vol_api",
            display_name="Vol Api",
            physical_ok=True,
            skills=["first_aid"],
        )
        self.vol_token = issue_token_for_user(self.volunteer)

        now = timezone.now()
        self.start_at = now + timedelta(days=5)
        self.end_at = self.start_at + timedelta(hours=4)

    def test_public_events_list_hides_draft_and_deleted(self):
        # Create a published event
        pub_event = create_event(
            self.coordinator,
            {
                "title": "Visible Published Event",
                "start_at": self.start_at,
                "end_at": self.end_at,
            },
        )
        add_post(self.coordinator, pub_event, {"title": "Post 1", "required_headcount": 5})
        publish_event(self.coordinator, pub_event)

        # Create a draft event
        draft_event = create_event(
            self.coordinator,
            {
                "title": "Hidden Draft Event",
                "start_at": self.start_at,
                "end_at": self.end_at,
            },
        )

        # Create a deleted published event
        del_event = create_event(
            self.coordinator,
            {
                "title": "Hidden Deleted Event",
                "start_at": self.start_at,
                "end_at": self.end_at,
                "deleted_at": timezone.now(),
                "deleted_by": self.coordinator,
            },
        )

        # Fetch public list (unauthenticated)
        resp = self.client.get("/api/v1/events/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        titles = [e["title"] for e in resp.data]
        self.assertIn("Visible Published Event", titles)
        self.assertNotIn("Hidden Draft Event", titles)
        self.assertNotIn("Hidden Deleted Event", titles)

    def test_coordinator_publish_action_endpoint(self):
        # 1. Coordinator creates draft event
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.coord_token.key}")
        create_resp = self.client.post(
            "/api/v1/coordinator/events/",
            {
                "title": "New Coordinator Event",
                "start_at": self.start_at.isoformat(),
                "end_at": self.end_at.isoformat(),
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        event_id = create_resp.data["id"]
        self.assertEqual(create_resp.data["status"], EVENT_DRAFT)

        # 2. Attempt publish without post -> 400 DomainError (post_required)
        pub_fail = self.client.post(f"/api/v1/events/{event_id}/publish/")
        self.assertEqual(pub_fail.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(pub_fail.data["error"]["code"], "post_required")

        # 3. Add post
        post_resp = self.client.post(
            f"/api/v1/events/{event_id}/posts/",
            {"title": "Helper", "required_headcount": 2},
            format="json",
        )
        self.assertEqual(post_resp.status_code, status.HTTP_201_CREATED)

        # 4. Publish event succeeds
        pub_ok = self.client.post(f"/api/v1/events/{event_id}/publish/")
        self.assertEqual(pub_ok.status_code, status.HTTP_200_OK)
        self.assertEqual(pub_ok.data["status"], EVENT_PUBLISHED)

    def test_apply_endpoint_returns_application_status(self):
        # Setup published event
        event = create_event(
            self.coordinator,
            {
                "title": "Health Checkup",
                "start_at": self.start_at,
                "end_at": self.end_at,
                "acceptance_mode": "auto",
                "max_participants": 5,
            },
        )
        post = add_post(self.coordinator, event, {"title": "Registrar", "required_headcount": 2})
        publish_event(self.coordinator, event)

        # Volunteer applies via API
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.vol_token.key}")
        apply_resp = self.client.post(
            f"/api/v1/events/{event.id}/apply/",
            {"post_id": post.id, "source": "browse"},
            format="json",
        )
        self.assertEqual(apply_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(apply_resp.data["status"], APPLICATION_ACCEPTED)
        self.assertEqual(apply_resp.data["post"], post.id)
        self.assertEqual(apply_resp.data["event"], event.id)

    def test_application_accept_and_roster_endpoints(self):
        event = create_event(
            self.coordinator,
            {
                "title": "Manual Event",
                "start_at": self.start_at,
                "end_at": self.end_at,
                "acceptance_mode": "manual",
            },
        )
        post = add_post(self.coordinator, event, {"title": "Guide", "required_headcount": 2})
        publish_event(self.coordinator, event)

        # Volunteer applies -> status pending
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.vol_token.key}")
        app_resp = self.client.post(f"/api/v1/events/{event.id}/apply/", {"post_id": post.id}, format="json")
        self.assertEqual(app_resp.data["status"], APPLICATION_PENDING)
        app_id = app_resp.data["id"]

        # Coordinator accepts application
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.coord_token.key}")
        accept_resp = self.client.post(f"/api/v1/applications/{app_id}/accept/", format="json")
        self.assertEqual(accept_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(accept_resp.data["application"]["status"], APPLICATION_ACCEPTED)

        # Coordinator checks roster
        roster_resp = self.client.get(f"/api/v1/events/{event.id}/roster/")
        self.assertEqual(roster_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(roster_resp.data["roster"]), 1)
        self.assertEqual(roster_resp.data["roster"][0]["display_name"], self.volunteer.display_name)

