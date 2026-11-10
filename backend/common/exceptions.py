"""
Application exception hierarchy for the Volunteer Coordination System.

Design principles:
- Every exception carries a machine-readable `code` for client handling.
- User-facing messages are safe (no raw SQL, no stack traces, no internal paths).
- PostgreSQL trigger errors (format: "code_prefix: detail") and constraint
  violations are translated into these exceptions.
- The `extra` dict carries structured diagnostic data for logging but is
  never sent to API clients.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from django.db import connection, IntegrityError, InternalError, OperationalError, ProgrammingError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_default_exception_handler

logger = logging.getLogger(__name__)


# =============================================================================
# BASE EXCEPTION
# =============================================================================

class DomainError(Exception):
    """
    Base exception for all business-rule violations.

    Attributes:
        code: Machine-readable error code (e.g., 'capacity_full').
        message: User-safe error message.
        status_code: HTTP status code for API responses.
        extra: Structured diagnostic data (never sent to client).
    """

    default_code = "domain_error"
    default_message = "An error occurred."
    default_status = status.HTTP_400_BAD_REQUEST

    def __init__(
        self,
        message: Optional[str] = None,
        code: Optional[str] = None,
        status_code: Optional[int] = None,
        extra: Optional[dict[str, Any]] = None,
    ):
        self.code = code or self.default_code
        self.message = message or self.default_message
        self.status_code = status_code or self.default_status
        self.extra = extra or {}
        super().__init__(self.message)


# =============================================================================
# AUTHENTICATION ERRORS (401)
# =============================================================================

class AuthenticationError(DomainError):
    """Identity verification failed."""
    default_code = "authentication_failed"
    default_message = "Authentication failed."
    default_status = status.HTTP_401_UNAUTHORIZED


class AccountBlockedError(AuthenticationError):
    """Account is blocked."""
    default_code = "account_blocked"
    default_message = "This account is currently blocked."
    default_status = status.HTTP_403_FORBIDDEN


class AccountClosedError(AuthenticationError):
    """Account is closed."""
    default_code = "account_closed"
    default_message = "This account has been closed."
    default_status = status.HTTP_403_FORBIDDEN


class TokenInvalidError(AuthenticationError):
    """Authentication token is invalid or expired."""
    default_code = "token_invalid"
    default_message = "Invalid authentication token."
    default_status = status.HTTP_401_UNAUTHORIZED


# =============================================================================
# AUTHORIZATION ERRORS (403)
# =============================================================================

class PermissionDeniedError(DomainError):
    """Actor lacks permission for the requested action."""
    default_code = "permission_denied"
    default_message = "This action is not available for your account."
    default_status = status.HTTP_403_FORBIDDEN


class InsufficientPrivilegeError(PermissionDeniedError):
    """Operation requires superuser privilege."""
    default_code = "insufficient_privilege"
    default_message = "Only a Super Admin can create events via the Admin Portal."
    default_status = status.HTTP_403_FORBIDDEN


class OwnerMonitorReadOnlyError(DomainError):
    """Event owner is in read-only monitor mode (coordination delegated)."""
    default_code = "owner_monitor_read_only"
    default_message = (
        "You are in read-only monitor mode while coordination is delegated. "
        "Retake coordination authority first to make changes."
    )
    default_status = status.HTTP_403_FORBIDDEN


# =============================================================================
# NOT FOUND / RESOURCE MASKING (404)
# =============================================================================

class ResourceMaskedNotFound(DomainError):
    """
    Resource not found OR access denied (privacy masking).

    Per the 404-Not-403 masking rule: if a user requests a resource they
    are not allowed to know exists, return 404 instead of 403.
    """
    default_code = "not_found"
    default_message = "The requested resource was not found."
    default_status = status.HTTP_404_NOT_FOUND


# =============================================================================
# VALIDATION ERRORS (400)
# =============================================================================

class ValidationError(DomainError, ValueError):
    """Input validation failed."""
    default_code = "validation_error"
    default_message = "The provided data is invalid."
    default_status = status.HTTP_400_BAD_REQUEST


class DomainValidationError(ValidationError):
    """Legacy alias for domain validation errors."""
    default_code = "invalid_domain_operation"
    default_message = "Domain validation failed."


class GeofenceViolationError(ValidationError):
    """Location check violation."""
    default_code = "outside_geofence"
    default_message = "User location outside designated geofence radius."
    default_status = status.HTTP_403_FORBIDDEN


class InvalidStateError(DomainError):
    """Operation not valid for the current state."""
    default_code = "invalid_state"
    default_message = "This action is not valid for the current status."
    default_status = status.HTTP_400_BAD_REQUEST


# =============================================================================
# CONFLICT ERRORS (409)
# =============================================================================

class ConflictError(DomainError):
    """State conflict: duplicate, capacity, schedule overlap."""
    default_code = "conflict"
    default_message = "A conflict occurred with the current state."
    default_status = status.HTTP_409_CONFLICT


class CapacityFullError(ConflictError):
    """No remaining capacity."""
    default_code = "capacity_full"
    default_message = "No places remaining for this role or event."


class ScheduleConflictError(ConflictError):
    """Overlapping schedule detected."""
    default_code = "schedule_conflict"
    default_message = "You already have an overlapping shift during this time window."


class DuplicateError(ConflictError):
    """Duplicate record detected."""
    default_code = "duplicate"
    default_message = "This record already exists."


# =============================================================================
# RATE LIMITING (429)
# =============================================================================

class RateLimitError(DomainError):
    """Too many requests."""
    default_code = "rate_limited"
    default_message = "Too many requests. Please try again later."
    default_status = status.HTTP_429_TOO_MANY_REQUESTS


class OtpRateLimitError(RateLimitError):
    """OTP request rate limit exceeded."""
    default_code = "otp_rate_limited"
    default_message = "Too many verification codes requested. Please try again in an hour."


# =============================================================================
# SECURITY LOGGING
# =============================================================================

def log_security_event(
    request,
    action: str,
    entity_type: str = "",
    entity_id: Optional[int] = None,
    details: Optional[dict] = None,
) -> None:
    """
    Log a security-relevant event to audit_logs.

    Used when unauthorized access attempts are detected, admin routes are
    probed by non-admins, or private data access is attempted without
    authorization.
    """
    from .db_context import get_client_ip

    try:
        actor_id = None
        if hasattr(request, "user") and getattr(request.user, "is_authenticated", False):
            actor_id = getattr(request.user, "id", None)

        raw_ip = get_client_ip(request) if request else None
        ip_address = raw_ip if raw_ip else None

        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after_data, ip_address)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                [
                    actor_id,
                    action,
                    entity_type,
                    entity_id,
                    json.dumps(details) if details else None,
                    ip_address,
                ],
            )
    except Exception as e:
        logger.error("Failed to write security event: %s", e)


# =============================================================================
# POSTGRESQL ERROR TRANSLATION
# =============================================================================

_PG_ERROR_MAP: dict[str, tuple[type, int]] = {
    # Permission / authorization
    "permission_denied": (PermissionDeniedError, 403),
    "account_blocked": (AccountBlockedError, 403),
    "append_only": (PermissionDeniedError, 403),
    # Not found
    "event_not_found": (ResourceMaskedNotFound, 404),
    "application_not_found": (ResourceMaskedNotFound, 404),
    "attendance_not_found": (ResourceMaskedNotFound, 404),
    # State / validation
    "invalid_transition": (InvalidStateError, 400),
    "invalid_state": (InvalidStateError, 400),
    "immutable": (InvalidStateError, 400),
    "event_frozen": (InvalidStateError, 400),
    "event_not_open": (InvalidStateError, 400),
    "event_not_active": (InvalidStateError, 400),
    "event_not_editable": (InvalidStateError, 400),
    "event_not_completed": (InvalidStateError, 400),
    "event_deleted": (InvalidStateError, 400),
    "event_ended": (InvalidStateError, 400),
    "post_closed": (InvalidStateError, 400),
    "walkin_disabled": (InvalidStateError, 400),
    "deadline_passed": (InvalidStateError, 400),
    "not_assigned": (InvalidStateError, 400),
    "not_applicant": (InvalidStateError, 400),
    "not_verified": (InvalidStateError, 400),
    "coordinator_not_approved": (InvalidStateError, 400),
    "stale_onboarding_version": (InvalidStateError, 400),
    "onboarding_required": (InvalidStateError, 400),
    "checkin_window_closed": (InvalidStateError, 400),
    "checkin_method_required": (InvalidStateError, 400),
    "geo_checkin_unavailable": (InvalidStateError, 400),
    "invalid_geo_fix": (ValidationError, 400),
    "low_accuracy": (ValidationError, 400),
    "outside_geofence": (ValidationError, 400),
    "qr_token_invalid": (ValidationError, 400),
    "reason_required": (ValidationError, 400),
    "publish_requires_post": (ValidationError, 400),
    "publish_requires_future_start": (ValidationError, 400),
    # Capacity / conflicts
    "capacity_full": (CapacityFullError, 409),
    "capacity_conflict": (CapacityFullError, 409),
    "schedule_conflict": (ScheduleConflictError, 409),
    # Rate limiting
    "otp_rate_limited": (OtpRateLimitError, 429),
}

_CONSTRAINT_ERROR_MAP: dict[str, tuple[type, int, str, str]] = {
    "uq_event_application_active": (DuplicateError, 409, "duplicate_application", "You already have an active application for this event."),
    "uq_assignment_active": (DuplicateError, 409, "duplicate_assignment", "This volunteer is already assigned to this event."),
    "uq_assignment_application": (DuplicateError, 409, "duplicate_assignment", "This application already has an active assignment."),
    "uq_assignment_group_leader": (DuplicateError, 409, "duplicate_group_leader", "This group already has an assigned team leader."),
    "uq_feedback_event_once": (DuplicateError, 409, "duplicate_feedback", "You have already submitted feedback for this shift."),
    "uq_feedback_user_once": (DuplicateError, 409, "duplicate_feedback", "You have already submitted feedback for this person."),
    "uq_onboarding_ack_user_event_ver": (DuplicateError, 409, "already_acknowledged", "You have already acknowledged this version of the briefing."),
    "uq_attendance_event_user": (DuplicateError, 409, "duplicate_attendance", "Attendance record already exists for this event."),
    "uq_users_phone_hash": (DuplicateError, 409, "duplicate_user", "A user with this phone number already exists."),
    "uq_availability_rule": (DuplicateError, 409, "duplicate_availability_rule", "This availability rule already exists."),
    "uq_availability_exception": (DuplicateError, 409, "duplicate_availability_exception", "An exception for this date already exists."),
    "ex_assignments_no_overlap": (ScheduleConflictError, 409, "schedule_conflict", "You already have an overlapping shift during this time window."),
}


def translate_db_exception(exc: Exception) -> DomainError:
    """
    Translate a PostgreSQL exception into a DomainError.

    Parses the error message for trigger-raised codes (format: "code: detail")
    and constraint names from IntegrityError. Strips internal PL/pgSQL call stacks (CONTEXT:).
    """
    error_msg = str(exc)
    first_line = error_msg.split("\n")[0].strip()

    # Check for trigger-raised errors (format: "code_prefix: detail message")
    for prefix, (exc_class, status_code) in _PG_ERROR_MAP.items():
        if first_line.startswith(f"{prefix}:") or first_line.startswith(f"{prefix} "):
            detail = first_line[len(prefix):].lstrip(": ").strip()
            return exc_class(message=detail or exc_class.default_message, code=prefix, status_code=status_code)

    # Check for constraint violations in IntegrityError
    if isinstance(exc, IntegrityError):
        for constraint_name, (exc_class, status_code, domain_code, message) in _CONSTRAINT_ERROR_MAP.items():
            if constraint_name in error_msg:
                return exc_class(message=message, code=domain_code, status_code=status_code)

        logger.warning("Unhandled IntegrityError: %s", error_msg)
        return ConflictError(
            message="A data integrity conflict occurred.",
            code="integrity_error",
            status_code=409,
        )

    # Check for OperationalError / InternalError
    if isinstance(exc, (OperationalError, InternalError)):
        logger.error("Database operational error: %s", error_msg)
        return DomainError(
            message="A temporary service issue occurred. Please try again.",
            code="service_unavailable",
            status_code=503,
        )

    logger.error("Unhandled database exception: %s: %s", type(exc).__name__, error_msg)
    return DomainError(
        message="An unexpected error occurred.",
        code="internal_error",
        status_code=500,
    )


# =============================================================================
# CUSTOM DRF EXCEPTION HANDLER
# =============================================================================

def custom_exception_handler(exc, context):
    """
    Custom DRF exception handler that translates domain and database errors
    into clean JSON responses without leaking internal details.

    Response format:
    {
        "error": {
            "code": "capacity_full",
            "message": "No places remaining for this role or event."
        }
    }
    """
    response = drf_default_exception_handler(exc, context)

    if response is not None:
        if hasattr(response, "data"):
            detail = response.data.get("detail", response.data)
            if isinstance(detail, list):
                detail = "; ".join(str(d) for d in detail)
            elif isinstance(detail, dict):
                messages = []
                for field, errors in detail.items():
                    if isinstance(errors, list):
                        messages.append(f"{field}: {'; '.join(str(e) for e in errors)}")
                    else:
                        messages.append(f"{field}: {errors}")
                detail = "; ".join(messages)

            response.data = {
                "error": {
                    "code": getattr(exc, "code", getattr(exc, "default_code", "validation_error")),
                    "message": str(detail),
                }
            }
        return response

    if isinstance(exc, DomainError):
        return Response(
            {"error": {"code": exc.code, "message": exc.message}},
            status=exc.status_code,
        )

    if isinstance(exc, (IntegrityError, InternalError, OperationalError, ProgrammingError)):
        domain_error = translate_db_exception(exc)
        return Response(
            {"error": {"code": domain_error.code, "message": domain_error.message}},
            status=domain_error.status_code,
        )

    logger.exception("Unhandled exception in view: %s", context.get("view", "unknown"))
    return Response(
        {"error": {"code": "internal_error", "message": "An unexpected error occurred."}},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
