"""
Database Trigger & Stored Procedure Integration Tests for Phase 5.

Direct PostgreSQL verification for:
- change_event_coordinator(p_event, p_new_coordinator, p_actor, p_reason) stored procedure.
- trg_01_events_before_insert (forces draft, onboarding_version=1, resets lifecycle timestamps).
- trg_01_events_before_update:
  * Owner immutability ('immutable: the owner of an event can never be changed').
  * State machine transitions ('invalid_transition: event status % -> %').
  * Publish gates ('publish_requires_post', 'publish_requires_future_start').
  * Onboarding version increment on text change.
  * Event freeze on terminal states ('event_frozen: a % event can no longer be changed').
- trg_50_events_after_update:
  * Audit logging in event_coordinator_history.
- Event post constraints & v_event_post_capacity view:
  * Headcount bounds, physical level bounds.
  * View math: required_headcount, assigned_count, remaining.
"""
import secrets
from datetime import timedelta

from django.db import connection, transaction
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Users
from apps.coordination.models import CoordinatorProfiles, EventCoordinatorHistory
from apps.events.models import EventPosts, Events
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import coordinator_service


def _unique_phone():
    return f"+959{secrets.randbelow(900000000) + 100000000}"


def _make_user(name, is_admin=False, verified=True):
    phone = normalize_phone(_unique_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
        account_status="active",
    )


def _make_coordinator(admin, name="Coordinator"):
    user = _make_user(name, verified=True)
    coordinator_service.apply_for_coordinator(user, "Application statement")
    coordinator_service.approve_coordinator(admin, user.id, "Approved")
    user.refresh_from_db()
    return user


class StoredProcedureChangeEventCoordinatorTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("DB Admin", is_admin=True)
        cls.owner = _make_coordinator(cls.admin, "Owner Coordinator")
        cls.new_coord = _make_coordinator(cls.admin, "New Coordinator")
        cls.regular_user = _make_user("Regular User", verified=True)

    def setUp(self):
        self.event = Events.objects.create(
            owner_id=self.owner.id,
            current_coordinator_id=self.owner.id,
            title="SQL Handover Event",
            start_at=timezone.now() + timedelta(days=10),
            end_at=timezone.now() + timedelta(days=10, hours=4),
        )

    def test_direct_stored_proc_handover_success(self):
        """change_event_coordinator changes current_coordinator_id and logs history."""
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT change_event_coordinator(%s, %s, %s, %s)",
                [self.event.id, self.new_coord.id, self.owner.id, "Emergency handover"],
            )

        self.event.refresh_from_db()
        self.assertEqual(self.event.current_coordinator_id, self.new_coord.id)
        self.assertEqual(self.event.owner_id, self.owner.id)

        history = EventCoordinatorHistory.objects.filter(event_id=self.event.id).order_by("id")
        self.assertEqual(history.count(), 2)
        latest = history.last()
        self.assertEqual(latest.from_coordinator_id, self.owner.id)
        self.assertEqual(latest.to_coordinator_id, self.new_coord.id)
        self.assertEqual(latest.reason, "Emergency handover")

    def test_stored_proc_rejects_unapproved_target(self):
        """change_event_coordinator fails if target has no approved coordinator profile."""
        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT change_event_coordinator(%s, %s, %s, %s)",
                    [self.event.id, self.regular_user.id, self.owner.id, "Invalid Target"],
                )
        self.assertIn("coordinator_not_approved", str(ctx.exception))

    def test_stored_proc_rejects_unauthorized_actor(self):
        """Unauthorized volunteer cannot call change_event_coordinator."""
        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT change_event_coordinator(%s, %s, %s, %s)",
                    [self.event.id, self.new_coord.id, self.regular_user.id, "Malicious attempt"],
                )
        self.assertIn("permission_denied", str(ctx.exception))

    def test_stored_proc_rejects_handover_on_frozen_event(self):
        """Finished/cancelled events cannot change coordinator."""
        self.event.status = "cancelled"
        self.event.save()

        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT change_event_coordinator(%s, %s, %s, %s)",
                    [self.event.id, self.new_coord.id, self.owner.id, "Post-cancellation attempt"],
                )
        self.assertIn("event_frozen", str(ctx.exception))


class EventsTableTriggersTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin User", is_admin=True)
        cls.coord = _make_coordinator(cls.admin, "Primary Coord")
        cls.other_coord = _make_coordinator(cls.admin, "Secondary Coord")

    def test_trg_events_before_insert_forces_draft_and_defaults(self):
        """Trigger forces status='draft' and onboarding_version=1 on INSERT even if caller provides other values."""
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO events (owner_id, current_coordinator_id, title, status, onboarding_version, start_at, end_at)
                VALUES (%s, %s, 'Direct Insert', 'active', 5, now() + interval '3 days', now() + interval '3 days 2 hours')
                RETURNING id, status, onboarding_version;
                """,
                [self.coord.id, self.coord.id],
            )
            row = cursor.fetchone()

        event_id, status_val, onboarding_v = row
        self.assertEqual(status_val, "draft")
        self.assertEqual(onboarding_v, 1)

    def test_trg_events_before_update_owner_immutability(self):
        """Trigger prevents altering owner_id."""
        event = Events.objects.create(
            owner_id=self.coord.id,
            current_coordinator_id=self.coord.id,
            title="Owner Immutability Test",
            start_at=timezone.now() + timedelta(days=5),
            end_at=timezone.now() + timedelta(days=5, hours=2),
        )

        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE events SET owner_id = %s WHERE id = %s",
                    [self.other_coord.id, event.id],
                )
        self.assertIn("immutable: the owner of an event can never be changed", str(ctx.exception))

    def test_trg_events_before_update_invalid_state_transition(self):
        """Trigger blocks illegal transition directly from draft to completed."""
        event = Events.objects.create(
            owner_id=self.coord.id,
            current_coordinator_id=self.coord.id,
            title="Illegal Transition Test",
            start_at=timezone.now() + timedelta(days=5),
            end_at=timezone.now() + timedelta(days=5, hours=2),
        )

        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE events SET status = 'completed' WHERE id = %s",
                    [event.id],
                )
        self.assertIn("invalid_transition: event status draft -> completed", str(ctx.exception))

    def test_trg_events_before_update_publish_requires_post(self):
        """Publish fails if event has 0 open role posts."""
        event = Events.objects.create(
            owner_id=self.coord.id,
            current_coordinator_id=self.coord.id,
            title="No Post Publish Test",
            start_at=timezone.now() + timedelta(days=5),
            end_at=timezone.now() + timedelta(days=5, hours=2),
        )

        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE events SET status = 'published' WHERE id = %s",
                    [event.id],
                )
        self.assertIn("publish_requires_post: add at least one open post before publishing", str(ctx.exception))

    def test_trg_events_before_update_publish_requires_future_start(self):
        """Publish fails if start_at is in the past."""
        event = Events.objects.create(
            owner_id=self.coord.id,
            current_coordinator_id=self.coord.id,
            title="Past Start Publish Test",
            start_at=timezone.now() - timedelta(hours=2),
            end_at=timezone.now() + timedelta(hours=2),
        )
        # Create an open post
        EventPosts.objects.create(event=event, title="Helper", required_headcount=2)

        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE events SET status = 'published' WHERE id = %s",
                    [event.id],
                )
        self.assertIn("publish_requires_future_start: the start time must be in the future", str(ctx.exception))

    def test_trg_events_before_update_onboarding_version_bump(self):
        """Trigger auto-increments onboarding_version when onboarding_text changes."""
        event = Events.objects.create(
            owner_id=self.coord.id,
            current_coordinator_id=self.coord.id,
            title="Onboarding Bump Test",
            onboarding_text="Version 1 instructions",
            start_at=timezone.now() + timedelta(days=5),
            end_at=timezone.now() + timedelta(days=5, hours=2),
        )
        self.assertEqual(event.onboarding_version, 1)

        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE events SET onboarding_text = 'Version 2 instructions' WHERE id = %s",
                [event.id],
            )
        event.refresh_from_db()
        self.assertEqual(event.onboarding_version, 2)

    def test_trg_events_before_update_event_frozen(self):
        """Trigger blocks any update once status is 'completed'."""
        event = Events.objects.create(
            owner_id=self.coord.id,
            current_coordinator_id=self.coord.id,
            title="Frozen Event Test",
            start_at=timezone.now() + timedelta(days=5),
            end_at=timezone.now() + timedelta(days=5, hours=2),
        )
        EventPosts.objects.create(event=event, title="Crew", required_headcount=1)

        # Move through draft -> published -> active -> completed
        with connection.cursor() as cursor:
            cursor.execute("UPDATE events SET status = 'published' WHERE id = %s", [event.id])
            cursor.execute("UPDATE events SET status = 'active' WHERE id = %s", [event.id])
            cursor.execute("UPDATE events SET status = 'completed' WHERE id = %s", [event.id])

        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute("UPDATE events SET title = 'Frozen Modified' WHERE id = %s", [event.id])
        self.assertIn("event_frozen: a completed event can no longer be changed", str(ctx.exception))


class EventPostTriggersAndCapacityViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("DB Admin User", is_admin=True)
        cls.coord = _make_coordinator(cls.admin, "Post Coordinator")

    def setUp(self):
        self.event = Events.objects.create(
            owner_id=self.coord.id,
            current_coordinator_id=self.coord.id,
            title="Posts Test Event",
            start_at=timezone.now() + timedelta(days=5),
            end_at=timezone.now() + timedelta(days=5, hours=3),
        )

    def test_post_check_constraint_headcount(self):
        """Database enforces headcount >= 1."""
        with self.assertRaises(Exception) as ctx:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "INSERT INTO event_posts (event_id, title, required_headcount) VALUES (%s, 'Zero Headcount', 0)",
                        [self.event.id],
                    )
        self.assertIn("ck_event_posts_headcount", str(ctx.exception))

    def test_post_check_constraint_physical_level(self):
        """Database enforces physical level choice."""
        with self.assertRaises(Exception) as ctx:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO event_posts (event_id, title, required_headcount, physical_level)
                        VALUES (%s, 'Super Level', 2, 'extreme')
                        """,
                        [self.event.id],
                    )
        self.assertIn("ck_event_posts_physical_level", str(ctx.exception))

    def test_post_event_unique_title_constraint(self):
        """Cannot have two posts with duplicate titles in the same event."""
        EventPosts.objects.create(event=self.event, title="Logistics Lead", required_headcount=2)
        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO event_posts (event_id, title, required_headcount) VALUES (%s, 'Logistics Lead', 1)",
                    [self.event.id],
                )
        self.assertIn("uq_event_posts_event_title", str(ctx.exception))

    def test_v_event_post_capacity_view(self):
        """v_event_post_capacity view returns correct headcount, assigned_count, and remaining."""
        post = EventPosts.objects.create(event=self.event, title="Stage Hand", required_headcount=5)

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT post_id, event_id, required_headcount, assigned_count, remaining FROM v_event_post_capacity WHERE post_id = %s",
                [post.id],
            )
            row = cursor.fetchone()

        self.assertIsNotNone(row)
        post_id, event_id, required, assigned, remaining = row
        self.assertEqual(post_id, post.id)
        self.assertEqual(event_id, self.event.id)
        self.assertEqual(required, 5)
        self.assertEqual(assigned, 0)
        self.assertEqual(remaining, 5)
