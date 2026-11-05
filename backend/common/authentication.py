"""
Custom DRF authentication for the Volunteer Coordination System.

BlockedAwareTokenAuthentication:
- Resolves DRF Token to user
- Handles lazy block expiry (release_expired_blocks)
- Rejects blocked/closed accounts
- Sets PostgreSQL session context (app.user_id, app.ip)
"""

from __future__ import annotations

import logging

from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .db_context import get_client_ip, set_db_session_context

logger = logging.getLogger(__name__)


class BlockedAwareTokenAuthentication(TokenAuthentication):
    """
    Token authentication that checks account status and sets DB session context.

    Flow:
    1. Resolve token to user (standard DRF TokenAuthentication)
    2. If user is blocked and blocked_until has passed, run release_expired_blocks()
    3. If user is still blocked or closed, reject with AuthenticationFailed
    4. Set PostgreSQL session context (app.user_id, app.ip)
    5. Return (user, token)
    """

    def authenticate_credentials(self, key):
        from django.db import connection

        model = self.get_model()
        try:
            token = model.objects.select_related("user").get(key=key)
        except model.DoesNotExist:
            raise AuthenticationFailed("Invalid token.")

        user = token.user

        # Lazy block expiry: if blocked_until has passed, release the block in PostgreSQL
        if getattr(user, "account_status", "") == "blocked" and getattr(user, "blocked_until", None) is not None:
            if user.blocked_until <= timezone.now():
                with connection.cursor() as cursor:
                    cursor.execute("SELECT release_expired_blocks()")
                user.refresh_from_db()

        # Reject inactive/blocked/closed accounts
        if not getattr(user, "is_active", False) or getattr(user, "account_status", "") != "active":
            raise AuthenticationFailed(
                "This account is blocked or closed. "
                "Contact support if you believe this is an error."
            )

        # Set PostgreSQL session context for triggers
        request = getattr(self, "_request", None)
        client_ip = get_client_ip(request) if request is not None else ""
        set_db_session_context(user_id=user.id, ip_address=client_ip)

        return user, token

    def authenticate(self, request):
        self._request = request
        return super().authenticate(request)

