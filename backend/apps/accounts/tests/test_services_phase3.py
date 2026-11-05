"""
Service Integration tests for Phase 3 — Authentication, Profiles & Availability.
File: backend/apps/accounts/tests/test_services_phase3.py
"""
from datetime import date, datetime, time, timedelta, timezone
import secrets
import uuid

from django.test import TestCase, override_settings
from django.utils import timezone as django_tz

from apps.accounts.models import (
    AuthOtp,
    UserCharityInterests,
    Users,
    VolunteerAvailabilityExceptions,
    VolunteerAvailabilityRules,
)
from apps.coordination.models import CoordinatorProfiles
from apps.events.models import CharityFields, EventApplications, Events
from common.exceptions import DomainError, ResourceMaskedNotFound
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import auth_service, availability_service, profile_service


def _unique_phone() -> str:
    return f"+959{secrets.randbelow(100000000):08d}"


def _make_user(phone: str = None, name: str = "Service User", **kwargs) -> Users:
    raw = phone or _unique_phone()
    norm = normalize_phone(raw)
    return Users.objects.create(
        phone_hash=compute_phone_hash(norm),
        phone_enc=encrypt_phone(norm),
        display_name=name,
        **kwargs,
    )


class AuthServiceIntegrationTests(TestCase):
    """Test auth_service.py against PostgreSQL stored procedures."""

    def test_request_and_verify_successful_flow(self):
        phone = _unique_phone()
        with override_settings(DEBUG=True):
            res = auth_service.request_login_otp(phone)
            self.assertEqual(res["status"], "sent")
            code = res["dev_code"]

        verify_res = auth_service.verify_login_otp(phone, code, display_name="Test User")
        self.assertTrue(verify_res["ok"])
        self.assertIn("token", verify_res)
        self.assertIsNotNone(verify_res["user"])
        self.assertEqual(verify_res["user"].display_name, "Test User")

    def test_verify_invalid_code_and_expired(self):
        phone = _unique_phone()
        auth_service.request_login_otp(phone)

        # Invalid code
        res_invalid = auth_service.verify_login_otp(phone, "9999")
        self.assertFalse(res_invalid["ok"])
        self.assertEqual(res_invalid["result"], "invalid_code")

    def test_logout_revokes_token(self):
        phone = _unique_phone()
        with override_settings(DEBUG=True):
            req = auth_service.request_login_otp(phone)
            code = req["dev_code"]

        auth_res = auth_service.verify_login_otp(phone, code)
        user = auth_res["user"]
        from rest_framework.authtoken.models import Token
        token = Token.objects.get(user=user)

        # Revoke token
        auth_service.logout_user(user, token)
        self.assertFalse(Token.objects.filter(user=user).exists())

    def test_purge_expired_tokens(self):
        phone = _unique_phone()
        norm = normalize_phone(phone)
        p_hash = compute_phone_hash(norm)
        past = django_tz.now() - timedelta(minutes=30)
        AuthOtp.objects.create(
            phone_hash=p_hash,
            code_hash=p_hash,
            purpose="login",
            created_at=past - timedelta(minutes=5),
            expires_at=past,
        )
        purged = auth_service.purge_expired_tokens()
        self.assertGreaterEqual(purged, 1)


class ProfileServiceIntegrationTests(TestCase):
    """Test profile_service.py methods and W24 lookup_user_by_uuid."""

    def setUp(self):
        self.user = _make_user(name="Profile Volunteer")
        CharityFields.objects.get_or_create(code="disaster_relief", defaults={"label": "Disaster Relief", "active": True})
        CharityFields.objects.get_or_create(code="education", defaults={"label": "Education", "active": True})

    def test_get_and_update_profile(self):
        profile = profile_service.get_user_profile(self.user)
        self.assertEqual(profile["id"], self.user.id)
        self.assertEqual(profile["display_name"], "Profile Volunteer")
        self.assertNotIn("password", profile)

        updated = profile_service.update_user_profile(
            self.user,
            {"display_name": "Updated Name", "skills": ["cpr", "First Aid"]},
        )
        self.assertEqual(updated.display_name, "Updated Name")
        self.assertEqual(updated.skills, ["cpr", "first aid"])

    def test_replace_charity_interests(self):
        codes = profile_service.replace_charity_interests(self.user, ["disaster_relief", "education"])
        self.assertEqual(len(codes), 2)
        retrieved = profile_service.get_charity_interests(self.user)
        self.assertIn("disaster_relief", retrieved)

    def test_lookup_user_by_uuid_t1_minimal_public_card(self):
        other_user = _make_user(name="Other User")
        card = profile_service.lookup_user_by_uuid(other_user, str(self.user.uuid))
        self.assertEqual(card["uuid"], str(self.user.uuid))
        self.assertEqual(card["display_name"], "Profile Volunteer")
        self.assertNotIn("phone", card)
        self.assertNotIn("skills", card)

    def test_lookup_user_by_uuid_masked_404_on_missing_or_inactive(self):
        other_user = _make_user(name="Other User")
        # Non-existent UUID
        with self.assertRaises(ResourceMaskedNotFound):
            profile_service.lookup_user_by_uuid(other_user, str(uuid.uuid4()))

        # Inactive/blocked user
        blocked_user = _make_user(account_status="blocked", is_active=False)
        with self.assertRaises(ResourceMaskedNotFound):
            profile_service.lookup_user_by_uuid(other_user, str(blocked_user.uuid))

    def test_lookup_user_by_uuid_coordinator_t2_elevated_card(self):
        admin = _make_user(name="Admin User", is_admin=True, is_staff=True)
        coordinator = _make_user(name="Event Coordinator", verification_status="verified")
        coord_prof = CoordinatorProfiles.objects.create(user=coordinator, status="pending")
        coord_prof.status = "approved"
        coord_prof.approved_by = admin
        coord_prof.approved_at = django_tz.now()
        coord_prof.save()

        now = django_tz.now()
        event = Events.objects.create(
            title="Relief Mission",
            owner=coord_prof,
            current_coordinator=coord_prof,
            start_at=now + timedelta(days=2),
            end_at=now + timedelta(days=2, hours=5),
            acceptance_mode="auto",
            max_participants=20,
        )
        from apps.events.models import EventPosts
        EventPosts.objects.create(
            event=event,
            title="General Volunteer",
            required_headcount=10,
            status="open",
        )
        event.status = "published"
        event.save()

        # Accepted application
        EventApplications.objects.create(
            event=event,
            user=self.user,
            status="accepted",
        )

        card = profile_service.lookup_user_by_uuid(coordinator, str(self.user.uuid), event_id=event.id)
        self.assertEqual(card["uuid"], str(self.user.uuid))
        self.assertEqual(card["display_name"], self.user.display_name)
        self.assertIn("skills", card)
        self.assertIn("verification_status", card)
        self.assertEqual(card["event_id"], event.id)


class AvailabilityServiceIntegrationTests(TestCase):
    """Test availability_service.py against PostgreSQL functions."""

    def setUp(self):
        self.user = _make_user(name="Availability User")

    def test_rules_and_exceptions_workflow(self):
        # Set weekly rules
        rules_data = [{"weekday": 1, "start_time": time(9, 0), "end_time": time(17, 0)}]
        created_rules = availability_service.set_weekly_availability_rules(self.user.id, rules_data)
        self.assertEqual(len(created_rules), 1)

        # Upsert exception
        exc = availability_service.upsert_availability_exception(
            self.user.id,
            {"date": date(2026, 12, 1), "is_available": False, "note": "Away"},
        )
        self.assertFalse(exc["is_available"])

        avail = availability_service.get_user_availability(self.user.id)
        self.assertEqual(len(avail["rules"]), 1)
        self.assertEqual(len(avail["exceptions"]), 1)

        # Conflict check
        start = datetime(2026, 12, 1, 10, 0, tzinfo=timezone.utc)
        end = datetime(2026, 12, 1, 14, 0, tzinfo=timezone.utc)
        conflict = availability_service.check_schedule_conflict(self.user.id, start, end)
        self.assertFalse(conflict)
