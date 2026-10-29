# apps/common/permissions.py
from django.utils import timezone
from rest_framework.permissions import BasePermission

from apps.common.constants import (
    ACCOUNT_BLOCKED,
    ACCOUNT_CLOSED,
    COORDINATOR_APPROVED,
)
from apps.common.exceptions import (
    AccountBlockedError,
    AccountClosedError,
    PermissionDeniedError,
)


def is_admin(user) -> bool:
    return bool(user and user.is_authenticated and (getattr(user, "is_admin", False) or getattr(user, "is_superuser", False)))


def is_approved_coordinator(user) -> bool:
    profile = getattr(user, "coordinator_profile", None)
    return bool(profile and getattr(profile, "status", None) == COORDINATOR_APPROVED)


def is_event_manager(user, event) -> bool:
    if not (user and user.is_authenticated):
        return False
    if is_admin(user):
        return True
    coordinator_id = getattr(event, "coordinator_id", None)
    if coordinator_id is None and hasattr(event, "coordinator"):
        coordinator_id = getattr(event.coordinator, "user_id", getattr(event.coordinator, "id", None))
    return bool(coordinator_id == getattr(user, "id", None))


def ensure_active_account(user):
    if not user or not user.is_authenticated:
        raise PermissionDeniedError("Authentication is required.")

    if getattr(user, "account_status", None) == ACCOUNT_CLOSED:
        raise AccountClosedError()

    if getattr(user, "account_status", None) == ACCOUNT_BLOCKED:
        blocked_until = getattr(user, "blocked_until", None)
        if blocked_until is None or blocked_until > timezone.now():
            raise AccountBlockedError()
        # Expired block is treated as unblocked for request purposes.

    return user


def ensure_admin(user):
    ensure_active_account(user)
    if not is_admin(user):
        raise PermissionDeniedError("Admin permission is required.")
    return user


def ensure_approved_coordinator(user):
    ensure_active_account(user)
    if not is_approved_coordinator(user):
        raise PermissionDeniedError("Approved coordinator permission is required.")
    return user


def ensure_event_manager(user, event):
    ensure_active_account(user)
    if not is_event_manager(user, event):
        raise PermissionDeniedError("You are not a manager of this event.")
    return user


class IsActiveAccount(BasePermission):
    def has_permission(self, request, view):
        try:
            ensure_active_account(request.user)
            return True
        except Exception:
            return False


class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        try:
            ensure_admin(request.user)
            return True
        except Exception:
            return False


class IsApprovedCoordinatorRole(BasePermission):
    def has_permission(self, request, view):
        try:
            ensure_approved_coordinator(request.user)
            return True
        except Exception:
            return False

