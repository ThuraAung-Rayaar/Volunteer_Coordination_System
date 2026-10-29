# apps/common/tests/test_foundation.py
from django.test import SimpleTestCase
from rest_framework import status
from rest_framework.exceptions import APIException

from apps.common import constants
from apps.common.exceptions import (
    AccountBlockedError,
    AccountClosedError,
    ApplicationNotAllowedError,
    CapacityFullError,
    DomainError,
    InvalidOtpError,
    InvalidStateError,
    NotFoundError,
    OnboardingRequiredError,
    PermissionDeniedError,
    QrTokenInvalidError,
    TooManyAttemptsError,
    VerificationRequiredError,
    domain_exception_handler,
)
from apps.common.pagination import StandardPagination


class FoundationTests(SimpleTestCase):
    def test_constants_tuples_membership(self):
        # Application active statuses
        self.assertIn(constants.APPLICATION_PENDING, constants.ACTIVE_APPLICATION_STATUSES)
        self.assertIn(constants.APPLICATION_ACCEPTED, constants.ACTIVE_APPLICATION_STATUSES)
        self.assertIn(constants.APPLICATION_WAITLISTED, constants.ACTIVE_APPLICATION_STATUSES)
        self.assertNotIn(constants.APPLICATION_REJECTED, constants.ACTIVE_APPLICATION_STATUSES)
        self.assertNotIn(constants.APPLICATION_WITHDRAWN, constants.ACTIVE_APPLICATION_STATUSES)
        self.assertNotIn(constants.APPLICATION_EXPIRED, constants.ACTIVE_APPLICATION_STATUSES)

        # Assignment active statuses
        self.assertIn(constants.ASSIGNMENT_ASSIGNED, constants.ACTIVE_ASSIGNMENT_STATUSES)
        self.assertIn(constants.ASSIGNMENT_CONFIRMED, constants.ACTIVE_ASSIGNMENT_STATUSES)
        self.assertIn(constants.ASSIGNMENT_COMPLETED, constants.ACTIVE_ASSIGNMENT_STATUSES)
        self.assertNotIn(constants.ASSIGNMENT_CANCELLED, constants.ACTIVE_ASSIGNMENT_STATUSES)

        # Visible event statuses
        self.assertIn(constants.EVENT_PUBLISHED, constants.EVENT_VISIBLE_STATUSES)
        self.assertIn(constants.EVENT_ACTIVE, constants.EVENT_VISIBLE_STATUSES)
        self.assertNotIn(constants.EVENT_DRAFT, constants.EVENT_VISIBLE_STATUSES)
        self.assertNotIn(constants.EVENT_COMPLETED, constants.EVENT_VISIBLE_STATUSES)
        self.assertNotIn(constants.EVENT_CANCELLED, constants.EVENT_VISIBLE_STATUSES)

        # Numerical constants
        self.assertEqual(constants.OTP_MAX_ATTEMPTS, 5)
        self.assertEqual(constants.OTP_TTL_SECONDS, 300)
        self.assertEqual(constants.QR_DEFAULT_TTL_MINUTES, 240)

    def test_domain_exception_handler_formats_payload_correctly(self):
        # 1. Default CapacityFullError
        exc = CapacityFullError()
        response = domain_exception_handler(exc, context={})
        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(
            response.data,
            {
                "error": {
                    "code": "capacity_full",
                    "message": "No remaining capacity.",
                }
            },
        )

        # 2. PermissionDeniedError (403)
        p_exc = PermissionDeniedError()
        p_res = domain_exception_handler(p_exc, context={})
        self.assertEqual(p_res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(p_res.data["error"]["code"], "permission_denied")

        # 3. AccountBlockedError (403)
        b_exc = AccountBlockedError()
        b_res = domain_exception_handler(b_exc, context={})
        self.assertEqual(b_res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(b_res.data["error"]["code"], "account_blocked")

        # 4. AccountClosedError (403)
        c_exc = AccountClosedError()
        c_res = domain_exception_handler(c_exc, context={})
        self.assertEqual(c_res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(c_res.data["error"]["code"], "account_closed")

        # 5. InvalidStateError (409)
        s_exc = InvalidStateError()
        s_res = domain_exception_handler(s_exc, context={})
        self.assertEqual(s_res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(s_res.data["error"]["code"], "invalid_state")

        # 6. OnboardingRequiredError (409)
        o_exc = OnboardingRequiredError()
        o_res = domain_exception_handler(o_exc, context={})
        self.assertEqual(o_res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(o_res.data["error"]["code"], "onboarding_required")

        # 7. VerificationRequiredError (409)
        v_exc = VerificationRequiredError()
        v_res = domain_exception_handler(v_exc, context={})
        self.assertEqual(v_res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(v_res.data["error"]["code"], "verification_required")

        # 8. ApplicationNotAllowedError (400)
        a_exc = ApplicationNotAllowedError()
        a_res = domain_exception_handler(a_exc, context={})
        self.assertEqual(a_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(a_res.data["error"]["code"], "application_not_allowed")

        # 9. QrTokenInvalidError (400)
        q_exc = QrTokenInvalidError()
        q_res = domain_exception_handler(q_exc, context={})
        self.assertEqual(q_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(q_res.data["error"]["code"], "qr_token_invalid")

        # 10. NotFoundError (404)
        n_exc = NotFoundError()
        n_res = domain_exception_handler(n_exc, context={})
        self.assertEqual(n_res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(n_res.data["error"]["code"], "not_found")

        # 11. InvalidOtpError (400)
        otp_exc = InvalidOtpError()
        otp_res = domain_exception_handler(otp_exc, context={})
        self.assertEqual(otp_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(otp_res.data["error"]["code"], "invalid_otp")

        # 12. TooManyAttemptsError (429)
        tm_exc = TooManyAttemptsError()
        tm_res = domain_exception_handler(tm_exc, context={})
        self.assertEqual(tm_res.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(tm_res.data["error"]["code"], "too_many_attempts")

        # 13. Custom override message and code
        custom_exc = DomainError(message="Custom error detail.", code="custom_error_code")
        custom_res = domain_exception_handler(custom_exc, context={})
        self.assertEqual(custom_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            custom_res.data,
            {
                "error": {
                    "code": "custom_error_code",
                    "message": "Custom error detail.",
                }
            },
        )

        # 14. Non-domain exception returns standard DRF handling
        drf_exc = APIException("Generic API error")
        drf_res = domain_exception_handler(drf_exc, context={})
        self.assertIsNotNone(drf_res)
        self.assertEqual(drf_res.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)

    def test_pagination_defaults(self):
        paginator = StandardPagination()
        self.assertEqual(paginator.page_size, 20)
        self.assertEqual(paginator.page_size_query_param, "page_size")
        self.assertEqual(paginator.max_page_size, 100)

