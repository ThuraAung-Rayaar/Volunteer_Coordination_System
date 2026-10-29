# apps/ops/tests/test_qr.py
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import CoordinatorProfile, User
from apps.common.constants import (
    APPLICATION_ACCEPTED,
    ATTENDANCE_CHECKED_IN,
    COORDINATOR_APPROVED,
    EVENT_ACTIVE,
    EVENT_PUBLISHED,
    QR_CHECKIN,
    QR_WALKIN_REGISTRATION,
    VERIFICATION_VERIFIED,
)
from apps.common.exceptions import CapacityFullError, DomainError, PermissionDeniedError
from apps.common.security import hash_token
from apps.events.models import EventApplication
from apps.events.services import activate_event, add_post, create_event, publish_event
from apps.ops.models import OnboardingAcknowledgment, QrToken
from apps.ops.services import (
    create_assignment_from_application,
    generate_qr_token,
    redeem_qr_token,
    resolve_qr_token,
)


class QrTokenTests(TestCase):
    def setUp(self):
        # 1. Setup approved coordinator
        self.coordinator = User.objects.create(
            phone_hash="hash_coord_qr",
            display_name="Coordinator QR",
            verification_status=VERIFICATION_VERIFIED,
        )
        CoordinatorProfile.objects.create(
            user=self.coordinator,
            status=COORDINATOR_APPROVED,
            approved_at=timezone.now(),
        )

        # 2. Setup volunteers
        self.volunteer = User.objects.create(
            phone_hash="hash_vol_qr1",
            display_name="Volunteer QR1",
        )
        self.volunteer2 = User.objects.create(
            phone_hash="hash_vol_qr2",
            display_name="Volunteer QR2",
        )

        now = timezone.now()
        self.event = create_event(
            self.coordinator,
            {
                "title": "Clean City Festival",
                "start_at": now + timedelta(days=2),
                "end_at": now + timedelta(days=2, hours=6),
                "acceptance_mode": "auto",
                "max_participants": 10,
                "require_onboarding_ack": False,
            },
        )
        self.post = add_post(
            self.coordinator,
            self.event,
            {"title": "General Helper", "required_headcount": 10},
        )
        publish_event(self.coordinator, self.event)

    def test_qr_generation_returns_raw_token_and_stores_hash(self):
        qr_token, raw_token = generate_qr_token(
            actor=self.coordinator,
            event=self.event,
            purpose=QR_WALKIN_REGISTRATION,
            max_uses=5,
            ttl_minutes=120,
        )

        self.assertIsNotNone(raw_token)
        self.assertNotEqual(qr_token.token_hash, raw_token)
        self.assertEqual(qr_token.token_hash, hash_token(raw_token))
        self.assertEqual(qr_token.used_count, 0)
        self.assertEqual(qr_token.max_uses, 5)

        # Non-manager cannot generate token
        with self.assertRaises(PermissionDeniedError):
            generate_qr_token(self.volunteer, self.event, QR_WALKIN_REGISTRATION)

    def test_resolve_does_not_increment_used_count(self):
        qr_token, raw_token = generate_qr_token(
            actor=self.coordinator,
            event=self.event,
            purpose=QR_WALKIN_REGISTRATION,
            max_uses=3,
        )

        preview = resolve_qr_token(raw_token)
        self.assertEqual(preview["event_id"], self.event.id)
        self.assertEqual(preview["title"], self.event.title)
        self.assertEqual(preview["purpose"], QR_WALKIN_REGISTRATION)
        self.assertEqual(preview["used_count"], 0)

        # used_count in DB must remain 0
        qr_token.refresh_from_db()
        self.assertEqual(qr_token.used_count, 0)

    def test_redeem_increments_used_count_and_enforces_max_uses(self):
        qr_token, raw_token = generate_qr_token(
            actor=self.coordinator,
            event=self.event,
            purpose=QR_WALKIN_REGISTRATION,
            max_uses=1,
        )

        # 1. First redemption succeeds
        res1 = redeem_qr_token(self.volunteer, raw_token)
        self.assertEqual(res1["action"], QR_WALKIN_REGISTRATION)
        self.assertEqual(res1["status"], APPLICATION_ACCEPTED)

        qr_token.refresh_from_db()
        self.assertEqual(qr_token.used_count, 1)

        # 2. Second redemption exceeds max_uses -> CapacityFullError
        with self.assertRaises(CapacityFullError):
            redeem_qr_token(self.volunteer2, raw_token)

    def test_expired_or_revoked_qr_fails(self):
        # 1. Expired token
        qr_expired, raw_expired = generate_qr_token(
            self.coordinator,
            self.event,
            QR_WALKIN_REGISTRATION,
            ttl_minutes=60,
        )
        qr_expired.expires_at = timezone.now() - timedelta(minutes=5)
        qr_expired.save(update_fields=["expires_at"])

        with self.assertRaises(DomainError) as ctx_exp:
            resolve_qr_token(raw_expired)
        self.assertEqual(ctx_exp.exception.code, "expired_token")

        with self.assertRaises(DomainError):
            redeem_qr_token(self.volunteer, raw_expired)

        # 2. Revoked token
        qr_revoked, raw_revoked = generate_qr_token(
            self.coordinator,
            self.event,
            QR_WALKIN_REGISTRATION,
        )
        qr_revoked.revoked_at = timezone.now()
        qr_revoked.save(update_fields=["revoked_at"])

        with self.assertRaises(DomainError) as ctx_rev:
            resolve_qr_token(raw_revoked)
        self.assertEqual(ctx_rev.exception.code, "revoked_token")

        with self.assertRaises(DomainError):
            redeem_qr_token(self.volunteer, raw_revoked)

    def test_checkin_qr_token_redemption(self):
        # Activate event
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

        # Generate checkin QR
        qr_checkin, raw_checkin = generate_qr_token(
            actor=self.coordinator,
            event=self.event,
            purpose=QR_CHECKIN,
        )

        # Volunteer scans and redeems
        res = redeem_qr_token(self.volunteer, raw_checkin)
        self.assertEqual(res["action"], QR_CHECKIN)
        self.assertEqual(res["status"], "checked_in")
        self.assertIsNotNone(res["checkin_at"])

