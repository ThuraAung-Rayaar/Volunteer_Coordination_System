"""
Service-level Integration Tests for Phase 5: Event Lifecycle, Handover, Retake & Event Role Posts.

Covers Business Rules:
- W41: Event creation (draft status, version 1, owner = current_coordinator, initial history).
- W42: Manager event editing, onboarding_version bumps, immutability of frozen events.
- W43: Publish gates (draft only, post required, future start_at).
- W44: Event activation (published -> active).
- W45: Event completion (active -> completed).
- W46: Event cancellation (cascades).
- W50-W55: Coordinator handover, Owner-as-Monitor (W51, W52), Retake (W53), audit history.
- W57-W63: Event role posts, validation, capacity calculations, closure.
- W124: Charity taxonomy tags deduplication & assignment atomicity.
"""
import secrets
from datetime import timedelta
from unittest.mock import patch

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Users
from apps.coordination.models import CoordinatorProfiles, EventCoordinatorHistory
from apps.events.models import EventCharityFields, EventPosts, Events
from common.exceptions import (
    DomainError,
    OwnerMonitorReadOnlyError,
    PermissionDeniedError,
    ResourceMaskedNotFound,
    ValidationError,
)
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import coordinator_service, event_post_service, event_service


def _unique_phone():
    return f"+959{secrets.randbelow(900000000) + 100000000}"


def _create_user(name, is_admin=False, verified=True):
    phone = normalize_phone(_unique_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
        account_status="active",
    )


def _create_approved_coordinator(admin, name="Coordinator"):
    user = _create_user(name, verified=True)
    coordinator_service.apply_for_coordinator(user, "Organization notes")
    coordinator_service.approve_coordinator(admin, user.id, "Approved coordinator")
    user.refresh_from_db()
    return user


def _default_event_payload(**overrides):
    base = {
        "title": "Clean Up Community Park",
        "description": "Cleaning up Central Park with volunteers.",
        "start_at": timezone.now() + timedelta(days=7),
        "end_at": timezone.now() + timedelta(days=7, hours=4),
        "location_name": "Central Park Main Gate",
        "latitude": 16.805,
        "longitude": 96.155,
        "geo_radius_m": 150,
        "onboarding_text": "Please bring gloves and comfortable footwear.",
        "require_onboarding_ack": True,
    }
    base.update(overrides)
    return base


class EventServiceLifecyclePhase5Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _create_user("Admin User", is_admin=True)
        cls.coord1 = _create_approved_coordinator(cls.admin, "Lead Coordinator")
        cls.coord2 = _create_approved_coordinator(cls.admin, "Deputy Coordinator")
        cls.regular_user = _create_user("Regular Volunteer", verified=True)

    def test_w41_create_event_success_and_initial_state(self):
        """W41: Creator is owner and current_coordinator, status is draft, version is 1."""
        payload = _default_event_payload(title="Youth Mentoring Workshop")
        event = event_service.create_event(
            self.coord1,
            payload,
            charity_codes=["teaching", "cleaning"],
        )

        self.assertIsNotNone(event.id)
        self.assertEqual(event.title, "Youth Mentoring Workshop")
        self.assertEqual(event.status, "draft")
        self.assertEqual(event.onboarding_version, 1)
        self.assertEqual(event.owner_id, self.coord1.id)
        self.assertEqual(event.current_coordinator_id, self.coord1.id)

        # Initial history record created automatically
        history = EventCoordinatorHistory.objects.filter(event_id=event.id)
        self.assertEqual(history.count(), 1)
        h0 = history.first()
        self.assertEqual(h0.to_coordinator_id, self.coord1.id)
        self.assertIsNone(h0.from_coordinator_id)
        self.assertEqual(h0.reason, "initial coordinator")

        # Taxonomy tags mapped
        tags = set(event.charity_fields.values_list("field_code_id", flat=True))
        self.assertTrue({"teaching", "cleaning"}.issubset(tags))

    def test_w124_create_event_deduplicates_charity_codes(self):
        """W124: Duplicate taxonomy codes in list are safely deduplicated."""
        payload = _default_event_payload(title="Tree Planting")
        event = event_service.create_event(
            self.coord1,
            payload,
            charity_codes=["environment", "environment", "teaching", "environment"],
        )
        tag_codes = list(event.charity_fields.values_list("field_code_id", flat=True))
        self.assertEqual(len(tag_codes), len(set(tag_codes)))
        self.assertIn("environment", tag_codes)
        self.assertIn("teaching", tag_codes)

    def test_create_event_transaction_atomic_rollback(self):
        """Ensure create_event is atomic; fails cleanly without partial record creation."""
        payload = _default_event_payload(title="Failing Event")
        initial_event_count = Events.objects.count()

        with patch("services.event_service._replace_charity_fields", side_effect=IntegrityError("DB Error")):
            with self.assertRaises(IntegrityError):
                event_service.create_event(self.coord1, payload, charity_codes=["teaching"])

        self.assertEqual(Events.objects.count(), initial_event_count)

    def test_w41_non_coordinator_cannot_create_event(self):
        """Regular unapproved user cannot create events."""
        with self.assertRaises(PermissionDeniedError):
            event_service.create_event(self.regular_user, _default_event_payload())

    def test_w42_update_event_mutable_fields_and_versioning(self):
        """W42: Manager can update fields; onboarding_text update increments onboarding_version."""
        event = event_service.create_event(self.coord1, _default_event_payload())
        self.assertEqual(event.onboarding_version, 1)

        updated = event_service.update_event(
            self.coord1,
            event.id,
            {"title": "Updated Title", "onboarding_text": "Bring water bottles and snacks"},
            charity_codes=["cooking"],
        )
        self.assertEqual(updated.title, "Updated Title")
        self.assertEqual(updated.onboarding_version, 2)
        self.assertIn("cooking", list(updated.charity_fields.values_list("field_code_id", flat=True)))

    def test_w42_non_manager_cannot_update_event(self):
        """Coordinator B cannot update an event managed by Coordinator A."""
        event = event_service.create_event(self.coord1, _default_event_payload())
        with self.assertRaises(ResourceMaskedNotFound):
            event_service.update_event(self.coord2, event.id, {"title": "Unauthorized Change"})

    def test_w43_publish_event_gates(self):
        """W43: Publish gates require status=draft, at least 1 post, and future start_at."""
        event = event_service.create_event(self.coord1, _default_event_payload())

        # Gate 1: Fails without role posts
        with self.assertRaises(Exception) as ctx:
            event_service.publish_event(self.coord1, event.id)
        self.assertIn("publish_requires_post", str(ctx.exception).lower())

        # Create a post
        event_post_service.create_event_post(
            self.coord1, event.id, {"title": "Tree Planter", "required_headcount": 5}
        )

        # Gate 2: Success when post exists and start_at is in future
        published_event = event_service.publish_event(self.coord1, event.id)
        self.assertEqual(published_event.status, "published")

        # Cannot publish again from 'published'
        with self.assertRaises(DomainError):
            event_service.publish_event(self.coord1, event.id)

    def test_w44_w45_activate_and_complete_lifecycle(self):
        """W44 & W45: Valid state transitions draft -> published -> active -> completed."""
        event = event_service.create_event(self.coord1, _default_event_payload())
        event_post_service.create_event_post(
            self.coord1, event.id, {"title": "General Crew", "required_headcount": 3}
        )
        event_service.publish_event(self.coord1, event.id)

        # Activate
        active_event = event_service.activate_event(self.coord1, event.id)
        self.assertEqual(active_event.status, "active")

        # Complete
        completed_event = event_service.complete_event(self.coord1, event.id)
        self.assertEqual(completed_event.status, "completed")

        # Frozen: completed event cannot be modified
        with self.assertRaises(Exception):
            event_service.update_event(self.coord1, event.id, {"title": "Post-completion edit"})

    def test_w46_cancel_event_from_any_active_state(self):
        """W46: Cancellation sets status to cancelled and records timestamp."""
        event = event_service.create_event(self.coord1, _default_event_payload())
        event_post_service.create_event_post(
            self.coord1, event.id, {"title": "First Aid Lead", "required_headcount": 2}
        )

        # Cancel from draft
        cancelled_event = event_service.cancel_event(
            self.coord1, event.id, reason="Bad weather expected"
        )
        self.assertEqual(cancelled_event.status, "cancelled")
        self.assertIsNotNone(cancelled_event.cancelled_at)
        self.assertEqual(cancelled_event.cancel_reason, "Bad weather expected")


class CoordinatorHandoverAndRetakeServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _create_user("Admin User", is_admin=True)
        cls.owner_coord = _create_approved_coordinator(cls.admin, "Owner Coordinator")
        cls.deputy_coord = _create_approved_coordinator(cls.admin, "Deputy Coordinator")
        cls.unapproved_coord = _create_user("Unapproved User", verified=True)

    def setUp(self):
        self.event = event_service.create_event(self.owner_coord, _default_event_payload())
        event_post_service.create_event_post(
            self.owner_coord, self.event.id, {"title": "Assistant", "required_headcount": 2}
        )

    def test_w50_w54_handover_success_and_audit_history(self):
        """W50 & W54: Handover updates current_coordinator_id and logs history."""
        updated = event_service.handover_event_coordinator(
            self.owner_coord,
            self.event.id,
            self.deputy_coord.id,
            reason="Medical leave handover",
        )
        self.assertEqual(updated.current_coordinator_id, self.deputy_coord.id)
        self.assertEqual(updated.owner_id, self.owner_coord.id)

        # Check history
        history_records = list(
            EventCoordinatorHistory.objects.filter(event_id=self.event.id).order_by("changed_at")
        )
        self.assertEqual(len(history_records), 2)
        latest = history_records[-1]
        self.assertEqual(latest.to_coordinator_id, self.deputy_coord.id)
        self.assertEqual(latest.from_coordinator_id, self.owner_coord.id)
        self.assertEqual(latest.changed_by_user_id, self.owner_coord.id)
        self.assertEqual(latest.reason, "Medical leave handover")

    def test_w51_w52_owner_as_monitor_read_only_protection(self):
        """W51 & W52: While handed over, owner has read-only monitor access; writes raise OwnerMonitorReadOnlyError."""
        event_service.handover_event_coordinator(
            self.owner_coord, self.event.id, self.deputy_coord.id, reason="Delegating"
        )

        # Owner cannot update event properties
        with self.assertRaises(OwnerMonitorReadOnlyError):
            event_service.update_event(
                self.owner_coord, self.event.id, {"title": "Forbidden Owner Edit"}
            )

        # Owner cannot create event posts
        with self.assertRaises(OwnerMonitorReadOnlyError):
            event_post_service.create_event_post(
                self.owner_coord, self.event.id, {"title": "New Post", "required_headcount": 1}
            )

        # Deputy coordinator (current_coordinator) CAN edit
        edited = event_service.update_event(
            self.deputy_coord, self.event.id, {"title": "Deputy Updated Title"}
        )
        self.assertEqual(edited.title, "Deputy Updated Title")

    def test_w53_owner_retake_success(self):
        """W53: Owner can retake coordination; current_coordinator restored to owner."""
        event_service.handover_event_coordinator(
            self.owner_coord, self.event.id, self.deputy_coord.id, reason="Delegating"
        )

        retaken = event_service.retake_event_coordinator(
            self.owner_coord, self.event.id, reason="Returned to duties"
        )
        self.assertEqual(retaken.current_coordinator_id, self.owner_coord.id)
        self.assertEqual(retaken.owner_id, self.owner_coord.id)

        # Now owner can write again
        updated = event_service.update_event(
            self.owner_coord, self.event.id, {"title": "Owner Restored Edit"}
        )
        self.assertEqual(updated.title, "Owner Restored Edit")

    def test_w53_non_owner_cannot_retake(self):
        """Deputy cannot call retake."""
        event_service.handover_event_coordinator(
            self.owner_coord, self.event.id, self.deputy_coord.id, reason="Delegating"
        )
        with self.assertRaises(PermissionDeniedError):
            event_service.retake_event_coordinator(self.deputy_coord, self.event.id)

    def test_w55_handover_to_non_approved_coordinator_fails(self):
        """Cannot handover to a user without active approved coordinator profile."""
        with self.assertRaises(DomainError):
            event_service.handover_event_coordinator(
                self.owner_coord, self.event.id, self.unapproved_coord.id, reason="Invalid target"
            )


class EventPostServicePhase5Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _create_user("Admin User", is_admin=True)
        cls.coord = _create_approved_coordinator(cls.admin, "Post Coordinator")

    def setUp(self):
        self.event = event_service.create_event(self.coord, _default_event_payload())

    def test_w57_w58_create_and_update_event_post(self):
        """W57 & W58: Create role post with required headcount and physical level, then update."""
        post = event_post_service.create_event_post(
            self.coord,
            self.event.id,
            {
                "title": "Logistics Dispatcher",
                "description": "Coordinate equipment distribution",
                "required_headcount": 4,
                "physical_level": "medium",
            },
        )
        self.assertEqual(post.title, "Logistics Dispatcher")
        self.assertEqual(post.required_headcount, 4)
        self.assertEqual(post.physical_level, "medium")
        self.assertEqual(post.status, "open")

        # Update headcount and description
        updated = event_post_service.update_event_post(
            self.coord,
            post.id,
            {"required_headcount": 6, "description": "Updated logistics requirements"},
        )
        self.assertEqual(updated.required_headcount, 6)
        self.assertEqual(updated.description, "Updated logistics requirements")

    def test_w57_create_post_validation_rules(self):
        """Headcount must be positive and physical_level must be in allowed choices."""
        # Headcount 0 fails
        with self.assertRaises(DomainError):
            event_post_service.create_event_post(
                self.coord,
                self.event.id,
                {"title": "Zero Headcount", "required_headcount": 0},
            )

        # Invalid physical level fails
        with self.assertRaises(DomainError):
            event_post_service.create_event_post(
                self.coord,
                self.event.id,
                {"title": "Heavy Lifter", "required_headcount": 2, "physical_level": "extreme"},
            )

    def test_w62_close_event_post(self):
        """W62: Post closure transitions status to 'closed'."""
        post = event_post_service.create_event_post(
            self.coord, self.event.id, {"title": "Registration Desk", "required_headcount": 2}
        )
        closed_post = event_post_service.close_event_post(self.coord, post.id)
        self.assertEqual(closed_post.status, "closed")

    def test_w60_remaining_capacity_query(self):
        """W60: Remaining capacity is calculated correctly from v_event_post_capacity."""
        post = event_post_service.create_event_post(
            self.coord, self.event.id, {"title": "Sound Engineer", "required_headcount": 3}
        )
        capacity = event_post_service.get_post_remaining_capacity(post.id)
        self.assertEqual(capacity, 3)
