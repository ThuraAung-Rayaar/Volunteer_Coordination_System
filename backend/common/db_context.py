"""
Database request context management.

PostgreSQL triggers read `app_user_id()` and `app_ip()` which resolve to
`current_setting('app.user_id', true)` and `current_setting('app.ip', true)`.

These settings are transaction-local (SET LOCAL) and must be set inside an
active transaction. With ATOMIC_REQUESTS=True in Django settings, every
request runs inside a transaction, so SET LOCAL persists for the request
and is automatically discarded on commit/rollback.

Security rules:
- The user ID is derived from trusted authentication (DRF Token / Session), never from
  client-supplied parameters.
- Anonymous requests get no app.user_id (triggers treat NULL as trusted system).
- Background tasks can set a system actor explicitly.
"""

from __future__ import annotations

import ipaddress
import logging
from typing import Optional

from django.db import connection

logger = logging.getLogger(__name__)


def get_client_ip(request) -> str:
    """
    Extract the client IP address from a Django request.

    Checks X-Forwarded-For first (for proxied requests), then REMOTE_ADDR.
    Validates the IP syntax to prevent invalid strings from causing
    PostgreSQL ::INET cast errors.

    Returns empty string if no valid IP can be determined.
    """
    if request is None:
        return ""

    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded_for:
        candidate = forwarded_for.split(",")[0].strip()
    else:
        candidate = request.META.get("REMOTE_ADDR", "").strip()

    if not candidate:
        return ""

    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        logger.warning("Invalid client IP address: %r", candidate)
        return ""


def set_db_session_context(
    user_id: Optional[int] = None,
    ip_address: Optional[str] = None,
) -> None:
    """
    Set transaction-local PostgreSQL session context.

    This must be called inside an active database transaction.
    With ATOMIC_REQUESTS=True, every request is wrapped in a transaction,
    so SET LOCAL values persist for the duration of the request and are
    automatically discarded when the transaction commits or rolls back.

    Args:
        user_id: The authenticated user's database ID, or None for anonymous/system.
        ip_address: The client IP address string, or None/empty to skip.
    """
    with connection.cursor() as cursor:
        if user_id is not None:
            cursor.execute(
                "SELECT set_config('app.user_id', %s, true)",
                [str(user_id)],
            )
        else:
            cursor.execute(
                "SELECT set_config('app.user_id', '', true)",
            )

        if ip_address:
            cursor.execute(
                "SELECT set_config('app.ip', %s, true)",
                [ip_address],
            )
        else:
            cursor.execute(
                "SELECT set_config('app.ip', '', true)",
            )


def clear_db_session_context() -> None:
    """
    Explicitly clear the session context.

    Normally not needed since SET LOCAL is transaction-scoped,
    but useful for background tasks or connection re-use.
    """
    set_db_session_context(user_id=None, ip_address=None)


def set_system_actor_context() -> None:
    """
    Set context for background/scheduled tasks.

    When app.user_id is NULL, PostgreSQL triggers treat the session as
    trusted system/maintenance work. This is the correct behavior for
    cron jobs, management commands, and background tasks.
    """
    set_db_session_context(user_id=None, ip_address=None)


class DbContextMiddleware:
    """
    Django middleware that sets PostgreSQL session context for authenticated requests.

    Runs after AuthenticationMiddleware for session-based authentication (such as admin portal).
    For DRF token-authenticated requests, BlockedAwareTokenAuthentication also sets the context
    upon authenticating credentials.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "_force_auth_user", None) or getattr(request, "user", None)
        if user and getattr(user, "is_authenticated", False):
            client_ip = get_client_ip(request)
            set_db_session_context(user_id=user.id, ip_address=client_ip)
        else:
            set_db_session_context(user_id=None, ip_address=None)

        response = self.get_response(request)
        return response
