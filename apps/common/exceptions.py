# apps/common/exceptions.py
from rest_framework import status
from rest_framework.response import Response


class DomainError(Exception):
    code = "domain_error"
    message = "A domain error occurred."
    http_status = status.HTTP_400_BAD_REQUEST

    def __init__(self, message=None, code=None, http_status=None):
        self.message = message or self.message
        self.code = code or self.code
        self.http_status = http_status or self.http_status
        super().__init__(self.message)


class PermissionDeniedError(DomainError):
    code = "permission_denied"
    message = "You do not have permission to perform this action."
    http_status = status.HTTP_403_FORBIDDEN


class AccountBlockedError(DomainError):
    code = "account_blocked"
    message = "This account is blocked."
    http_status = status.HTTP_403_FORBIDDEN


class AccountClosedError(DomainError):
    code = "account_closed"
    message = "This account is closed."
    http_status = status.HTTP_403_FORBIDDEN


class InvalidStateError(DomainError):
    code = "invalid_state"
    message = "This action is not allowed in the current state."
    http_status = status.HTTP_409_CONFLICT


class CapacityFullError(DomainError):
    code = "capacity_full"
    message = "No remaining capacity."
    http_status = status.HTTP_409_CONFLICT


class OnboardingRequiredError(DomainError):
    code = "onboarding_required"
    message = "Onboarding must be acknowledged before this action."
    http_status = status.HTTP_409_CONFLICT


class ApplicationNotAllowedError(DomainError):
    code = "application_not_allowed"
    message = "Application is not allowed."
    http_status = status.HTTP_400_BAD_REQUEST


class QrTokenInvalidError(DomainError):
    code = "qr_token_invalid"
    message = "QR token is invalid."
    http_status = status.HTTP_400_BAD_REQUEST


class NotFoundError(DomainError):
    code = "not_found"
    message = "Resource not found."
    http_status = status.HTTP_404_NOT_FOUND


class InvalidOtpError(DomainError):
    code = "invalid_otp"
    message = "Invalid OTP."
    http_status = status.HTTP_400_BAD_REQUEST


class TooManyAttemptsError(DomainError):
    code = "too_many_attempts"
    message = "Too many attempts."
    http_status = status.HTTP_429_TOO_MANY_REQUESTS


class VerificationRequiredError(DomainError):
    code = "verification_required"
    message = "Identity verification is required."
    http_status = status.HTTP_409_CONFLICT


def domain_exception_handler(exc, context):
    if isinstance(exc, DomainError):
        return Response(
            {
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                }
            },
            status=exc.http_status,
        )

    from rest_framework.views import exception_handler
    return exception_handler(exc, context)

