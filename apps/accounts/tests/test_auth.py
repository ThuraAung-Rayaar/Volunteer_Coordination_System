# apps/accounts/tests/test_auth.py
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token

from apps.accounts.authentication import BlockedAwareTokenAuthentication
from apps.accounts.models import AuthOtp, User
from apps.accounts.services import request_otp, verify_otp
from apps.common.constants import ACCOUNT_ACTIVE, ACCOUNT_BLOCKED, ACCOUNT_CLOSED
from apps.common.exceptions import (
    AccountBlockedError,
    AccountClosedError,
    InvalidOtpError,
    TooManyAttemptsError,
)
from apps.common.security import compute_phone_hash, hash_otp


class AuthServicesTests(TestCase):
    def setUp(self):
        self.phone = "+959123456789"
        self.phone_hash = compute_phone_hash(self.phone)

    def test_otp_request_and_verify_creates_user(self):
        # Request OTP
        req_res = request_otp(self.phone, purpose="login")
        self.assertEqual(req_res.get("status"), "sent")
        code = req_res.get("dev_code")
        self.assertIsNotNone(code)

        # Verify OTP creates user and token
        user, token, created = verify_otp(self.phone, code, purpose="login")
        self.assertTrue(created)
        self.assertEqual(user.phone_hash, self.phone_hash)
        self.assertEqual(user.account_status, ACCOUNT_ACTIVE)
        self.assertIsNotNone(token)
        self.assertEqual(token.user, user)

        # Second verify for same user should not create a new user
        req_res2 = request_otp(self.phone, purpose="login")
        code2 = req_res2.get("dev_code")
        user2, token2, created2 = verify_otp(self.phone, code2, purpose="login")
        self.assertFalse(created2)
        self.assertEqual(user2.id, user.id)
        self.assertEqual(token2.key, token.key)

    def test_otp_reuse_fails(self):
        req_res = request_otp(self.phone, purpose="login")
        code = req_res.get("dev_code")

        # First verification succeeds
        verify_otp(self.phone, code, purpose="login")

        # Reusing the consumed OTP must raise InvalidOtpError
        with self.assertRaises(InvalidOtpError):
            verify_otp(self.phone, code, purpose="login")

    def test_otp_expired_fails(self):
        code = "123456"
        # Create an expired OTP directly
        AuthOtp.objects.create(
            phone_hash=self.phone_hash,
            code_hash=hash_otp(code),
            purpose="login",
            expires_at=timezone.now() - timedelta(seconds=10),
        )

        with self.assertRaises(InvalidOtpError):
            verify_otp(self.phone, code, purpose="login")

    def test_otp_max_attempts_locks(self):
        req_res = request_otp(self.phone, purpose="login")
        code = req_res.get("dev_code")
        wrong_code = "000000" if code != "000000" else "111111"

        # Fail 5 times with wrong code
        for _ in range(5):
            with self.assertRaises(InvalidOtpError):
                verify_otp(self.phone, wrong_code, purpose="login")

        # 6th attempt with correct code should fail with TooManyAttemptsError
        with self.assertRaises(TooManyAttemptsError):
            verify_otp(self.phone, code, purpose="login")

    def test_blocked_user_rejected_by_auth_class(self):
        # Create a blocked user and token
        user = User.objects.create(
            phone_hash=self.phone_hash,
            display_name="Blocked User",
            account_status=ACCOUNT_BLOCKED,
            blocked_until=timezone.now() + timedelta(days=1),
        )
        token = Token.objects.create(user=user)

        authenticator = BlockedAwareTokenAuthentication()

        with self.assertRaises(AccountBlockedError):
            authenticator.authenticate_credentials(token.key)

    def test_closed_account_cannot_request_otp(self):
        User.objects.create(
            phone_hash=self.phone_hash,
            display_name="Closed User",
            account_status=ACCOUNT_CLOSED,
        )
        with self.assertRaises(AccountClosedError):
            request_otp(self.phone, purpose="login")
