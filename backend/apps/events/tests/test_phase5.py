from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.coordination.models import CoordinatorProfiles, EventCoordinatorHistory
from apps.events.models import EventPosts, Events
from common.exceptions import DomainError, OwnerMonitorReadOnlyError, PermissionDeniedError
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import coordinator_service, event_post_service, event_service

_phone_seq = 0


def _phone():
    global _phone_seq
    _phone_seq += 1
    return f"+959{_phone_seq:08d}"


def _make_user(name, is_admin=False, verified=False):
    phone = normalize_phone(_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
    )


def _make_approved_coordinator(admin, name="Coordinator"):
    user = _make_user(name, verified=True)
    coordinator_service.apply_for_coordinator(user, "Organization notes")
    coordinator_service.approve_coordinator(admin, user.id, "Approved")
    user.refresh_from_db()
    return user


def _event_data(**overrides):
    base = {
        "title": "Test Event",
        "start_at": timezone.now() + timedelta(days=7),
        "end_at": timezone.now() + timedelta(days=7, hours=4),
    }
    base.update(overrides)
    return base


class EventPhase5Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin", is_admin=True)
        cls.coord_a = _make_approved_coordinator(cls.admin, "Coordinator A")
        cls.coord_b = _make_approved_coordinator(cls.admin, "Coordinator B")
        cls.regular_user = _make_user("Regular User")


class EventCreationTests(EventPhase5Base):
    def test_create_event(self):
        event = event_service.create_event(self.coord_a, _event_data())
        self.assertEqual(event.status, "draft")
        self.assertEqual(event.owner_id, self.coord_a.id)
        self.assertEqual(event.current_coordinator_id, self.coord_a.id)
        self.assertEqual(event.onboarding_version, 1)

    def test_create_event_invalid_dates(self):
        data = _event_data(
            start_at=timezone.now() + timedelta(days=7),
            end_at=timezone.now() + timedelta(days=6),  # end before start
        )
        with self.assertRaises(Exception):
            event_service.create_event(self.coord_a, data)

    def test_unauthorized_event_creation(self):
        with self.assertRaises(Exception):
            event_service.create_event(self.regular_user, _event_data())

    def test_create_event_with_charity_fields(self):
        event = event_service.create_event(
            self.coord_a, _event_data(), charity_codes=["teaching", "cooking"]
        )
        self.assertEqual(event.charity_fields.count(), 2)


class EventLifecycleTests(EventPhase5Base):
    def _create_with_post(self):
        event = event_service.create_event(self.coord_a, _event_data())
        event_post_service.create_event_post(
            self.coord_a, event.id,
            {"title": "Helper", "required_headcount": 5},
        )
        return event

    def test_valid_transitions(self):
        event = self._create_with_post()
        event = event_service.publish_event(self.coord_a, event.id)
        self.assertEqual(event.status, "published")
        event = event_service.activate_event(self.coord_a, event.id)
        self.assertEqual(event.status, "active")
        event = event_service.complete_event(self.coord_a, event.id)
        self.assertEqual(event.status, "completed")

    def test_publish_without_post_fails(self):
        event = event_service.create_event(self.coord_a, _event_data())
        with self.assertRaises(Exception):
            event_service.publish_event(self.coord_a, event.id)

    def test_invalid_transition_draft_to_completed(self):
        event = self._create_with_post()
        with self.assertRaises(DomainError):
            event_service.complete_event(self.coord_a, event.id)

    def test_cancel_from_draft(self):
        event = event_service.create_event(self.coord_a, _event_data())
        event = event_service.cancel_event(self.coord_a, event.id, "test cancel")
        self.assertEqual(event.status, "cancelled")

    def test_frozen_event_cannot_be_edited(self):
        event = self._create_with_post()
        event_service.publish_event(self.coord_a, event.id)
        event_service.activate_event(self.coord_a, event.id)
        event_service.complete_event(self.coord_a, event.id)
        with self.assertRaises(Exception):
            event_service.update_event(self.coord_a, event.id, {"title": "New Title"})

    def test_onboarding_version_bumps_on_text_change(self):
        event = event_service.create_event(self.coord_a, _event_data(onboarding_text="v1"))
        self.assertEqual(event.onboarding_version, 1)
        event = event_service.update_event(self.coord_a, event.id, {"onboarding_text": "v2"})
        self.assertEqual(event.onboarding_version, 2)


class EventEditAuthorizationTests(EventPhase5Base):
    def test_non_manager_cannot_edit(self):
        event = event_service.create_event(self.coord_a, _event_data())
        with self.assertRaises(Exception):
            event_service.update_event(self.coord_b, event.id, {"title": "Hacked"})

    def test_regular_user_cannot_edit(self):
        event = event_service.create_event(self.coord_a, _event_data())
        with self.assertRaises(Exception):
            event_service.update_event(self.regular_user, event.id, {"title": "Hacked"})


class EventPostTests(EventPhase5Base):
    def setUp(self):
        self.event = event_service.create_event(self.coord_a, _event_data())

    def test_create_post(self):
        post = event_post_service.create_event_post(
            self.coord_a, self.event.id,
            {"title": "Packer", "required_headcount": 3, "physical_level": "medium"},
        )
        self.assertEqual(post.status, "open")
        self.assertEqual(post.required_headcount, 3)

    def test_update_post(self):
        post = event_post_service.create_event_post(
            self.coord_a, self.event.id,
            {"title": "Packer", "required_headcount": 3},
        )
        updated = event_post_service.update_event_post(
            self.coord_a, post.id, {"required_headcount": 5}
        )
        self.assertEqual(updated.required_headcount, 5)

    def test_close_post(self):
        post = event_post_service.create_event_post(
            self.coord_a, self.event.id,
            {"title": "Packer", "required_headcount": 3},
        )
        closed = event_post_service.close_event_post(self.coord_a, post.id)
        self.assertEqual(closed.status, "closed")

    def test_post_capacity_from_view(self):
        post = event_post_service.create_event_post(
            self.coord_a, self.event.id,
            {"title": "Packer", "required_headcount": 3},
        )
        remaining = event_post_service.get_post_remaining_capacity(post.id)
        self.assertEqual(remaining, 3)

    def test_invalid_physical_level_rejected(self):
        with self.assertRaises(DomainError):
            event_post_service.create_event_post(
                self.coord_a, self.event.id,
                {"title": "X", "required_headcount": 1, "physical_level": "extreme"},
            )


class CoordinatorHandoverTests(EventPhase5Base):
    def setUp(self):
        self.event = event_service.create_event(self.coord_a, _event_data())
        event_post_service.create_event_post(
            self.coord_a, self.event.id,
            {"title": "Helper", "required_headcount": 5},
        )

    def test_handover(self):
        event = event_service.handover_event_coordinator(
            self.coord_a, self.event.id, self.coord_b.id, "handover"
        )
        self.assertEqual(event.current_coordinator_id, self.coord_b.id)
        self.assertEqual(event.owner_id, self.coord_a.id)  # owner unchanged

    def test_handover_history_preserved(self):
        event_service.handover_event_coordinator(
            self.coord_a, self.event.id, self.coord_b.id, "handover"
        )
        history = EventCoordinatorHistory.objects.filter(event_id=self.event.id)
        # 1 initial + 1 handover = 2
        self.assertEqual(history.count(), 2)

    def test_invalid_handover_to_non_coordinator(self):
        with self.assertRaises(DomainError):
            event_service.handover_event_coordinator(
                self.coord_a, self.event.id, self.regular_user.id, "bad"
            )

    def test_non_manager_cannot_handover(self):
        with self.assertRaises(Exception):
            event_service.handover_event_coordinator(
                self.regular_user, self.event.id, self.coord_b.id, "bad"
            )

    def test_owner_retake(self):
        event_service.handover_event_coordinator(
            self.coord_a, self.event.id, self.coord_b.id, "handover"
        )
        event = event_service.retake_event_coordinator(self.coord_a, self.event.id)
        self.assertEqual(event.current_coordinator_id, self.coord_a.id)

    def test_owner_read_only_while_delegated(self):
        event_service.handover_event_coordinator(
            self.coord_a, self.event.id, self.coord_b.id, "handover"
        )
        # Owner (coord_a) is now in monitor mode; write should be blocked
        with self.assertRaises(OwnerMonitorReadOnlyError):
            event_service.update_event(self.coord_a, self.event.id, {"title": "Blocked"})

    def test_current_coordinator_can_edit_after_handover(self):
        event_service.handover_event_coordinator(
            self.coord_a, self.event.id, self.coord_b.id, "handover"
        )
        event = event_service.update_event(self.coord_b, self.event.id, {"title": "Updated by B"})
        self.assertEqual(event.title, "Updated by B")


class CoordinatorBFFAPITests(EventPhase5Base):
    def setUp(self):
        self.client = APIClient()

    def test_coordinator_events_list_and_create_api(self):
        self.client.force_authenticate(user=self.coord_a)
        start_time = (timezone.now() + timedelta(days=7)).isoformat()
        end_time = (timezone.now() + timedelta(days=7, hours=4)).isoformat()
        resp = self.client.post(
            "/api/v1/coordinator/events/",
            {
                "title": "API Event",
                "start_at": start_time,
                "end_at": end_time,
                "charity_field_codes": ["teaching"],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        event_id = resp.data["id"]

        list_resp = self.client.get("/api/v1/coordinator/events/")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        results = list_resp.data["results"]
        self.assertTrue(any(e["id"] == event_id for e in results))

    def test_coordinator_event_patch_and_lifecycle_api(self):
        self.client.force_authenticate(user=self.coord_a)
        event = event_service.create_event(self.coord_a, _event_data())
        event_post_service.create_event_post(self.coord_a, event.id, {"title": "Post 1", "required_headcount": 2})

        # Patch event
        patch_resp = self.client.patch(
            f"/api/v1/coordinator/events/{event.id}/",
            {"title": "Patched Title", "onboarding_text": "Read carefully"},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_resp.data["onboarding_version"], 2)

        # Publish event
        pub_resp = self.client.post(f"/api/v1/events/{event.id}/publish/")
        self.assertEqual(pub_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(pub_resp.data["status"], "published")

        # Activate event
        act_resp = self.client.post(f"/api/v1/events/{event.id}/activate/")
        self.assertEqual(act_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(act_resp.data["status"], "active")

        # Complete event
        comp_resp = self.client.post(f"/api/v1/events/{event.id}/complete/")
        self.assertEqual(comp_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(comp_resp.data["status"], "completed")

    def test_coordinator_handover_and_retake_api(self):
        self.client.force_authenticate(user=self.coord_a)
        event = event_service.create_event(self.coord_a, _event_data())

        # Handover
        ho_resp = self.client.post(
            f"/api/v1/events/{event.id}/handover/",
            {"new_coordinator_user_id": self.coord_b.id, "reason": "Going on leave"},
            format="json",
        )
        self.assertEqual(ho_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(ho_resp.data["current_coordinator_id"], self.coord_b.id)

        # Retake
        retake_resp = self.client.post(
            f"/api/v1/events/{event.id}/retake/",
            {"reason": "Back from leave"},
            format="json",
        )
        self.assertEqual(retake_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(retake_resp.data["current_coordinator_id"], self.coord_a.id)

    def test_event_posts_and_closure_api(self):
        self.client.force_authenticate(user=self.coord_a)
        event = event_service.create_event(self.coord_a, _event_data())

        # Create post
        create_resp = self.client.post(
            f"/api/v1/coordinator/events/{event.id}/posts/",
            {"title": "Logistics Helper", "required_headcount": 4},
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        post_id = create_resp.data["id"]

        # List posts
        list_resp = self.client.get(f"/api/v1/coordinator/events/{event.id}/posts/")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_resp.data["results"]), 1)
        self.assertEqual(list_resp.data["results"][0]["remaining"], 4)

        # Patch post
        patch_resp = self.client.patch(
            f"/api/v1/posts/{post_id}/",
            {"required_headcount": 6},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)

        # Close post
        close_resp = self.client.post(f"/api/v1/posts/{post_id}/close/")
        self.assertEqual(close_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(close_resp.data["status"], "closed")
