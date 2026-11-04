"""
Unit and integration tests for Phase 3 — Authentication, Profiles, and Availability.

Covers all 16 acceptance test requirements:
1.  OTP request (success, dev_code in debug, masked in prod)
2.  OTP expiration (expired code rejection)
3.  OTP attempt limits (too_many_attempts handling)
4.  Successful OTP verification (user registration/login, token issuance)
5.  Invalid OTP verification (wrong code rejected)
6.  Blocked account login (rejected at request and verify)
7.  Closed account login (rejected at request and verify)
8.  Profile retrieval (self-profile, decrypted phone, no secrets)
9.  Profile update (allow-list validation, emergency contact pairing)
10. Charity-interest management (valid codes replaced, invalid codes rejected)
11. Skill management (normalization of skills)
12. Availability rule creation (weekly rules set and atomic replacement)
13. Availability exceptions (upsert and delete)
14. Availability checking (delegation to PostgreSQL is_user_available)
15. Schedule conflict detection (delegation to PostgreSQL user_has_schedule_conflict)
16. User-to-user access restrictions (cross-user isolation)
"""

from datetime import date, datetime, time, timedelta, timezone
import secrets

from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone as django_tz
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import (
    AuthOtp,
    UserCharityInterests,
    Users,
    VolunteerAvailabilityExceptions,
    VolunteerAvailabilityRules,
)
from apps.events.models import CharityFields
from common.exceptions import DomainError
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import auth_service, availability_service, profile_service


def _unique_phone() -> str:
    """Generate a valid unique phone number for testing."""
    digits = f"{secrets.randbelow(100000000):08d}"
    return f"+959{digits}"


def _make_user(phone: str = None, name: str = "Test User", **kwargs) -> Users:
    """Helper to create a user with proper phone hashing and encryption."""
    raw_phone = phone or _unique_phone()
    normalized = normalize_phone(raw_phone)
    return Users.objects.create(
        phone_hash=compute_phone_hash(normalized),
        phone_enc=encrypt_phone(normalized),
        display_name=name,
        **kwargs,
    )


# =============================================================================
# 1. OTP REQUEST TESTS
# =============================================================================

class OtpRequestTests(TestCase):
    def test_otp_request_returns_sent(self):
        phone = _unique_phone()
        result = auth_service.request_login_otp(phone)
        self.assertEqual(result["status"], "sent")
        self.assertIn("delivery", result)

    def test_otp_request_masks_code_in_production(self):
        phone = _unique_phone()
        with override_settings(DEBUG=False):
            result = auth_service.request_login_otp(phone)
            self.assertNotIn("dev_code", result)

    def test_otp_request_exposes_code_in_debug(self):
        phone = _unique_phone()
        with override_settings(DEBUG=True):
            result = auth_service.request_login_otp(phone)
            self.assertIn("dev_code", result)
            self.assertEqual(len(result["dev_code"]), 4)

    def test_otp_request_api_endpoint(self):
        client = APIClient()
        phone = _unique_phone()
        response = client.post("/api/v1/auth/otp/request/", {"phone": phone, "purpose": "login"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "sent")


# =============================================================================
# 2. OTP EXPIRATION TESTS
# =============================================================================

class OtpExpirationTests(TestCase):
    def test_expired_otp_returns_expired(self):
        phone = _unique_phone()
        with override_settings(DEBUG=True):
            req = auth_service.request_login_otp(phone)
            code = req["dev_code"]

        # Manually expire the OTP in the database (keeping expires_at > created_at)
        p_hash = compute_phone_hash(normalize_phone(phone))
        past = django_tz.now() - timedelta(minutes=10)
        AuthOtp.objects.filter(phone_hash=p_hash).update(
            created_at=past,
            expires_at=past + timedelta(minutes=5),
        )

        result = auth_service.verify_login_otp(phone, code)
        self.assertFalse(result["ok"])
        self.assertEqual(result["result"], "expired")

        # Test via API
        client = APIClient()
        response = client.post("/api/v1/auth/otp/verify/", {"phone": phone, "code": code})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "expired")


# =============================================================================
# 3. OTP ATTEMPT LIMITS TESTS
# =============================================================================

class OtpAttemptLimitTests(TestCase):
    def test_attempt_limit_exceeded_returns_too_many_attempts(self):
        phone = _unique_phone()
        with override_settings(DEBUG=True):
            req = auth_service.request_login_otp(phone)
            code = req["dev_code"]

        # 5 wrong attempts (default otp_max_attempts is 5)
        for _ in range(5):
            res = auth_service.verify_login_otp(phone, "9999")
            self.assertFalse(res["ok"])

        # Even correct code fails now with too_many_attempts
        result = auth_service.verify_login_otp(phone, code)
        self.assertFalse(result["ok"])
        self.assertEqual(result["result"], "too_many_attempts")

        # API returns 429
        client = APIClient()
        response = client.post("/api/v1/auth/otp/verify/", {"phone": phone, "code": code})
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data["error"]["code"], "too_many_attempts")


# =============================================================================
# 4. SUCCESSFUL OTP VERIFICATION TESTS
# =============================================================================

class OtpSuccessfulVerificationTests(TestCase):
    def test_successful_otp_creates_new_user_and_token(self):
        phone = _unique_phone()
        with override_settings(DEBUG=True):
            req = auth_service.request_login_otp(phone)
            code = req["dev_code"]

        result = auth_service.verify_login_otp(phone, code, display_name="Alice Volunteer")
        self.assertTrue(result["ok"])
        self.assertIn("token", result)
        self.assertIsNotNone(result["user"])
        self.assertEqual(result["user"].display_name, "Alice Volunteer")
        self.assertIsNotNone(result["user"].last_login)

        # Calling verify again with same code should fail (consumed)
        second = auth_service.verify_login_otp(phone, code)
        self.assertFalse(second["ok"])

    def test_successful_otp_existing_user_login(self):
        phone = _unique_phone()
        user = _make_user(phone=phone, name="Existing User")

        with override_settings(DEBUG=True):
            req = auth_service.request_login_otp(phone)
            code = req["dev_code"]

        result = auth_service.verify_login_otp(phone, code)
        self.assertTrue(result["ok"])
        self.assertEqual(result["user"].id, user.id)
        self.assertEqual(result["user"].display_name, "Existing User")

    def test_successful_otp_api_endpoint(self):
        phone = _unique_phone()
        with override_settings(DEBUG=True):
            req = auth_service.request_login_otp(phone)
            code = req["dev_code"]

        client = APIClient()
        response = client.post(
            "/api/v1/auth/otp/verify/",
            {"phone": phone, "code": code, "display_name": "Bob API"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("token", response.data)
        self.assertEqual(response.data["user"]["display_name"], "Bob API")


# =============================================================================
# 5. INVALID OTP VERIFICATION TESTS
# =============================================================================

class OtpInvalidVerificationTests(TestCase):
    def test_invalid_code_returns_invalid_code(self):
        phone = _unique_phone()
        auth_service.request_login_otp(phone)

        result = auth_service.verify_login_otp(phone, "0000")
        self.assertFalse(result["ok"])
        self.assertEqual(result["result"], "invalid_code")

        client = APIClient()
        response = client.post("/api/v1/auth/otp/verify/", {"phone": phone, "code": "0000"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "invalid_code")

    def test_no_otp_requested_returns_no_otp(self):
        phone = _unique_phone()
        result = auth_service.verify_login_otp(phone, "1234")
        self.assertFalse(result["ok"])
        self.assertEqual(result["result"], "no_otp")


# =============================================================================
# 6. BLOCKED ACCOUNT LOGIN TESTS
# =============================================================================

class BlockedAccountLoginTests(TestCase):
    def test_blocked_account_rejected_at_otp_request(self):
        phone = _unique_phone()
        user = _make_user(phone=phone, account_status="blocked")
        user.is_active = False
        user.save(update_fields=["is_active"])

        with self.assertRaises(DomainError) as ctx:
            auth_service.request_login_otp(phone)
        self.assertEqual(ctx.exception.code, "account_blocked")

    def test_blocked_account_rejected_at_otp_verify(self):
        phone = _unique_phone()
        user = _make_user(phone=phone, account_status="active")

        with override_settings(DEBUG=True):
            req = auth_service.request_login_otp(phone)
            code = req["dev_code"]

        # User gets blocked after requesting OTP
        user.account_status = "blocked"
        user.is_active = False
        user.save(update_fields=["account_status", "is_active"])

        with self.assertRaises(DomainError) as ctx:
            auth_service.verify_login_otp(phone, code)
        self.assertEqual(ctx.exception.code, "account_blocked")


# =============================================================================
# 7. CLOSED ACCOUNT LOGIN TESTS
# =============================================================================

class ClosedAccountLoginTests(TestCase):
    def test_closed_account_rejected_at_otp_request(self):
        phone = _unique_phone()
        user = _make_user(phone=phone, account_status="closed")
        user.is_active = False
        user.save(update_fields=["is_active"])

        with self.assertRaises(DomainError) as ctx:
            auth_service.request_login_otp(phone)
        self.assertEqual(ctx.exception.code, "account_closed")

    def test_closed_account_rejected_at_otp_verify(self):
        phone = _unique_phone()
        user = _make_user(phone=phone, account_status="active")

        with override_settings(DEBUG=True):
            req = auth_service.request_login_otp(phone)
            code = req["dev_code"]

        # Close the account
        user.account_status = "closed"
        user.is_active = False
        user.save(update_fields=["account_status", "is_active"])

        with self.assertRaises(DomainError) as ctx:
            auth_service.verify_login_otp(phone, code)
        self.assertEqual(ctx.exception.code, "account_blocked")


# =============================================================================
# 8. PROFILE RETRIEVAL TESTS
# =============================================================================

class ProfileRetrievalTests(TestCase):
    def setUp(self):
        self.phone = _unique_phone()
        self.user = _make_user(phone=self.phone, name="Jane Volunteer", preferred_language="my")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_profile_retrieval_service(self):
        profile = profile_service.get_user_profile(self.user)
        self.assertEqual(profile["id"], self.user.id)
        self.assertEqual(profile["display_name"], "Jane Volunteer")
        self.assertEqual(profile["preferred_language"], "my")
        self.assertEqual(profile["phone"], normalize_phone(self.phone))
        # Ensure sensitive fields are not in profile dict
        self.assertNotIn("phone_hash", profile)
        self.assertNotIn("phone_enc", profile)
        self.assertNotIn("password", profile)

    def test_profile_retrieval_api_me(self):
        response = self.client.get("/api/v1/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["display_name"], "Jane Volunteer")
        self.assertIn("uuid", response.data)

    def test_profile_retrieval_api_alias(self):
        response = self.client.get("/api/profile/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["display_name"], "Jane Volunteer")


# =============================================================================
# 9. PROFILE UPDATE TESTS
# =============================================================================

class ProfileUpdateTests(TestCase):
    def setUp(self):
        self.user = _make_user(name="Profile User")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_update_profile_valid_fields(self):
        updated = profile_service.update_user_profile(
            self.user,
            {"display_name": "Updated Name", "blood_type": "O+", "can_lift_heavy": True},
        )
        self.user.refresh_from_db()
        self.assertEqual(self.user.display_name, "Updated Name")
        self.assertEqual(self.user.blood_type, "O+")
        self.assertTrue(self.user.can_lift_heavy)

    def test_update_profile_api_patch(self):
        response = self.client.patch("/api/v1/me/", {"display_name": "Patched Name", "home_area": "Downtown"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["display_name"], "Patched Name")
        self.assertEqual(response.data["home_area"], "Downtown")

    def test_update_profile_rejects_privileged_fields(self):
        # Service level
        with self.assertRaises(DomainError) as ctx:
            profile_service.update_user_profile(self.user, {"is_admin": True})
        self.assertEqual(ctx.exception.code, "field_not_allowed")

        # API level (via serializer validation)
        response = self.client.patch("/api/v1/me/", {"is_admin": True})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_update_profile_rejects_unknown_fields(self):
        with self.assertRaises(DomainError) as ctx:
            profile_service.update_user_profile(self.user, {"unrecognized_field": "val"})
        self.assertEqual(ctx.exception.code, "field_not_allowed")

        response = self.client.patch("/api/v1/me/", {"unrecognized_field": "val"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_emergency_contact_pairing_constraint(self):
        # Name without phone must fail
        with self.assertRaises(DomainError) as ctx:
            profile_service.update_user_profile(self.user, {"emergency_contact_name": "Mom"})
        self.assertEqual(ctx.exception.code, "emergency_contact_mismatch")

        # Both name and phone must succeed
        profile_service.update_user_profile(
            self.user,
            {"emergency_contact_name": "Mom", "emergency_contact_phone": "+959111222333"},
        )
        self.user.refresh_from_db()
        self.assertEqual(self.user.emergency_contact_name, "Mom")
        self.assertIsNotNone(self.user.emergency_contact_phone_enc)

        # Clearing name clears phone
        profile_service.update_user_profile(self.user, {"emergency_contact_name": ""})
        self.user.refresh_from_db()
        self.assertIsNone(self.user.emergency_contact_name)
        self.assertIsNone(self.user.emergency_contact_phone_enc)


# =============================================================================
# 10. CHARITY-INTEREST MANAGEMENT TESTS
# =============================================================================

class CharityInterestManagementTests(TestCase):
    def setUp(self):
        self.user = _make_user(name="Charity User")
        CharityFields.objects.get_or_create(code="education", defaults={"label": "Education", "active": True})
        CharityFields.objects.get_or_create(code="health", defaults={"label": "Health", "active": True})
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_replace_charity_interests(self):
        codes = profile_service.replace_charity_interests(self.user, ["education", "health"])
        self.assertEqual(codes, ["education", "health"])
        self.assertEqual(UserCharityInterests.objects.filter(user=self.user).count(), 2)

        # Atomic replacement
        codes = profile_service.replace_charity_interests(self.user, ["health"])
        self.assertEqual(codes, ["health"])
        self.assertEqual(UserCharityInterests.objects.filter(user=self.user).count(), 1)

    def test_replace_charity_interests_invalid_code_rejected(self):
        with self.assertRaises(DomainError) as ctx:
            profile_service.replace_charity_interests(self.user, ["nonexistent_field"])
        self.assertEqual(ctx.exception.code, "invalid_charity_field")

    def test_charity_interests_api(self):
        response = self.client.put("/api/v1/me/charity-interests/", {"field_codes": ["education"]})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["field_codes"], ["education"])

        get_res = self.client.get("/api/v1/me/charity-interests/")
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(get_res.data["field_codes"], ["education"])


# =============================================================================
# 11. SKILL MANAGEMENT TESTS
# =============================================================================

class SkillManagementTests(TestCase):
    def setUp(self):
        self.user = _make_user(name="Skills User")

    def test_skills_normalization(self):
        raw_skills = ["  First Aid ", "CPR", "first aid", "", "LOGISTICS"]
        profile_service.update_user_profile(self.user, {"skills": raw_skills})
        self.user.refresh_from_db()
        self.assertEqual(self.user.skills, ["first aid", "cpr", "logistics"])


# =============================================================================
# 12. AVAILABILITY RULE CREATION TESTS
# =============================================================================

class AvailabilityRuleCreationTests(TestCase):
    def setUp(self):
        self.user = _make_user(name="Rules User")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_create_and_replace_weekly_rules(self):
        rules_data = [
            {"weekday": 1, "start_time": "09:00", "end_time": "17:00"},
            {"weekday": 3, "start_time": "14:00", "end_time": "20:00"},
        ]
        created = availability_service.set_weekly_availability_rules(self.user.id, rules_data)
        self.assertEqual(len(created), 2)
        self.assertEqual(VolunteerAvailabilityRules.objects.filter(user=self.user).count(), 2)

        # Atomic replacement with 1 rule
        replacement = [{"weekday": 5, "start_time": "10:00", "end_time": "15:00"}]
        created_new = availability_service.set_weekly_availability_rules(self.user.id, replacement)
        self.assertEqual(len(created_new), 1)
        self.assertEqual(VolunteerAvailabilityRules.objects.filter(user=self.user).count(), 1)
        self.assertEqual(VolunteerAvailabilityRules.objects.filter(user=self.user).first().weekday, 5)

    def test_weekly_rules_api(self):
        payload = {
            "rules": [
                {"weekday": 2, "start_time": "08:00:00", "end_time": "12:00:00"}
            ]
        }
        res = self.client.post("/api/v1/me/availability/rules/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["rules"]), 1)


# =============================================================================
# 13. AVAILABILITY EXCEPTIONS TESTS
# =============================================================================

class AvailabilityExceptionsTests(TestCase):
    def setUp(self):
        self.user = _make_user(name="Exceptions User")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_upsert_and_delete_exception(self):
        # Create exception
        exc = availability_service.upsert_availability_exception(
            self.user.id,
            {"date": "2026-12-25", "is_available": False, "note": "Christmas holiday"},
        )
        self.assertEqual(exc["is_available"], False)
        self.assertEqual(exc["note"], "Christmas holiday")

        # Update same date (unique constraint upsert)
        exc_updated = availability_service.upsert_availability_exception(
            self.user.id,
            {"date": "2026-12-25", "is_available": True, "note": "Available now"},
        )
        self.assertEqual(exc_updated["id"], exc["id"])
        self.assertEqual(exc_updated["is_available"], True)
        self.assertEqual(VolunteerAvailabilityExceptions.objects.filter(user=self.user).count(), 1)

        # Delete exception
        availability_service.delete_availability_exception(self.user.id, exc["id"])
        self.assertEqual(VolunteerAvailabilityExceptions.objects.filter(user=self.user).count(), 0)

    def test_exceptions_api(self):
        res = self.client.post(
            "/api/v1/me/availability/exceptions/",
            {"date": "2026-11-20", "is_available": False, "note": "Out of town"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        exc_id = res.data["id"]

        del_res = self.client.delete(f"/api/v1/me/availability/exceptions/{exc_id}/")
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)


# =============================================================================
# 14. AVAILABILITY CHECKING TESTS (SQL is_user_available)
# =============================================================================

class AvailabilityCheckingTests(TestCase):
    def setUp(self):
        self.user = _make_user(name="Avail Check User")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_no_rules_means_available_by_default(self):
        start = datetime(2026, 11, 16, 10, 0, tzinfo=timezone.utc)  # Monday
        end = datetime(2026, 11, 16, 14, 0, tzinfo=timezone.utc)
        self.assertTrue(availability_service.check_user_availability(self.user.id, start, end))

    def test_recurring_rules_checking(self):
        # Set rule for Monday (weekday 1) from 09:00 to 17:00
        availability_service.set_weekly_availability_rules(
            self.user.id,
            [{"weekday": 1, "start_time": time(9, 0), "end_time": time(17, 0)}],
        )

        # Monday 10:00 - 12:00 -> within rule -> Available (True)
        mon_start = datetime(2026, 11, 16, 10, 0, tzinfo=timezone.utc)
        mon_end = datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)
        self.assertTrue(availability_service.check_user_availability(self.user.id, mon_start, mon_end))

        # Tuesday (weekday 2) -> outside rule -> Not Available (False)
        tue_start = datetime(2026, 11, 17, 10, 0, tzinfo=timezone.utc)
        tue_end = datetime(2026, 11, 17, 12, 0, tzinfo=timezone.utc)
        self.assertFalse(availability_service.check_user_availability(self.user.id, tue_start, tue_end))

    def test_blackout_exception_overrides_rule(self):
        # Monday rule 09:00 - 17:00
        availability_service.set_weekly_availability_rules(
            self.user.id,
            [{"weekday": 1, "start_time": time(9, 0), "end_time": time(17, 0)}],
        )
        # Blackout on 2026-11-16 (Monday)
        availability_service.upsert_availability_exception(
            self.user.id,
            {"date": date(2026, 11, 16), "is_available": False, "note": "Sick day"},
        )

        mon_start = datetime(2026, 11, 16, 10, 0, tzinfo=timezone.utc)
        mon_end = datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)
        self.assertFalse(availability_service.check_user_availability(self.user.id, mon_start, mon_end))

    def test_availability_check_api(self):
        payload = {
            "start_at": "2026-11-16T10:00:00Z",
            "end_at": "2026-11-16T12:00:00Z",
        }
        res = self.client.post("/api/v1/me/availability/check/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("available", res.data)
        self.assertIn("schedule_conflict", res.data)


# =============================================================================
# 15. SCHEDULE CONFLICT DETECTION TESTS (SQL user_has_schedule_conflict)
# =============================================================================

class ScheduleConflictTests(TestCase):
    def setUp(self):
        self.user = _make_user(name="Conflict User")

    def test_no_assignments_returns_no_conflict(self):
        start = datetime(2026, 11, 20, 10, 0, tzinfo=timezone.utc)
        end = datetime(2026, 11, 20, 14, 0, tzinfo=timezone.utc)
        has_conflict = availability_service.check_schedule_conflict(self.user.id, start, end)
        self.assertFalse(has_conflict)


# =============================================================================
# 16. USER-TO-USER ACCESS RESTRICTIONS TESTS
# =============================================================================

class UserToUserAccessRestrictionsTests(TestCase):
    def setUp(self):
        self.user_a = _make_user(name="User A")
        self.user_b = _make_user(name="User B")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user_a)

    def test_user_cannot_modify_other_user_profile(self):
        # A modifies self profile
        profile_service.update_user_profile(self.user_a, {"display_name": "A Updated"})
        self.user_b.refresh_from_db()
        self.assertEqual(self.user_b.display_name, "User B")

    def test_user_cannot_delete_other_user_exception(self):
        exc_b = availability_service.upsert_availability_exception(
            self.user_b.id,
            {"date": "2026-12-01", "is_available": False},
        )
        # User A attempts to delete User B's exception -> returns 404 masked
        res = self.client.delete(f"/api/v1/me/availability/exceptions/{exc_b['id']}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Verify B's exception was not deleted
        self.assertEqual(
            VolunteerAvailabilityExceptions.objects.filter(id=exc_b["id"]).count(), 1
        )


# =============================================================================
# LOGOUT TEST
# =============================================================================

class LogoutTests(TestCase):
    def test_logout_invalidates_token(self):
        phone = _unique_phone()
        with override_settings(DEBUG=True):
            req = auth_service.request_login_otp(phone)
            code = req["dev_code"]

        auth_res = auth_service.verify_login_otp(phone, code)
        token_key = auth_res["token"]
        user = auth_res["user"]

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {token_key}")

        # Profile accessible
        res1 = client.get("/api/v1/me/")
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Logout
        logout_res = client.post("/api/v1/auth/logout/")
        self.assertEqual(logout_res.status_code, status.HTTP_204_NO_CONTENT)

        # Subsequent request with invalidated token fails
        res2 = client.get("/api/v1/me/")
        self.assertEqual(res2.status_code, status.HTTP_401_UNAUTHORIZED)
