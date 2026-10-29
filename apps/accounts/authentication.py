# apps/accounts/authentication.py
from rest_framework.authentication import TokenAuthentication
from apps.common.permissions import ensure_active_account


class BlockedAwareTokenAuthentication(TokenAuthentication):
    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)
        ensure_active_account(user)
        return (user, token)

