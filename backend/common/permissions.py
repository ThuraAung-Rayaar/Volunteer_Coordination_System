"""
Permission infrastructure for the Volunteer Coordination System.

All permission checks align with the PostgreSQL trigger definitions:
- is_admin_user(p_user): checks users.is_admin AND users.is_active
- is_approved_coordinator(p_user): checks coordinator_profiles.status = 'approved' AND users.is_active
- is_event_manager(p_event, p_user): admin OR (owner/current_coordinator AND approved)

The BFF layer adds:
- Owner-as-Monitor read-only enforcement (owner != current_coordinator -> read-only)
- 404-Not-403 resource masking (hidden resources return 404, not 403)

IMPORTANT: These helpers use actual model fields. There is no `user.role` field.
Coordinator status lives in CoordinatorProfiles.status.
Admin status lives in Users.is_admin.
"""

from __future__ import annotations

import logging
from typing import Optional

from rest_framework.permissions import BasePermission

from .exceptions import (
    OwnerMonitorReadOnlyError,
    PermissionDeniedError,
    ResourceMaskedNotFound,
    log_security_event,
)

logger = logging.getLogger(__name__)


# =============================================================================
# GUARD FUNCTIONS (raise on failure)
# =============================================================================

def ensure_active_user(user) -> None:
    """
    Verify the user is authenticated and has an active account.

    Raises:
        PermissionDeniedError: If user is not authenticated or not active.
    """
    if not user or not user.is_authenticated:
        raise PermissionDeniedError(
            message="Authentication required.",
            code="authentication_required",
            status_code=401,
        )
    if not user.is_active or user.account_status != "active":
        raise PermissionDeniedError(
            message="This account is not active.",
            code="account_not_active",
        )


def ensure_admin(request, require_superuser: bool = False) -> None:
    """
    Verify the requesting user is an active admin (or super admin).

    On failure, logs a security red-alert and raises ResourceMaskedNotFound (404)
    to prevent information leakage about admin endpoint existence.

    Args:
        request: The DRF request object.
        require_superuser: If True, requires is_superuser in addition to is_admin.

    Raises:
        ResourceMaskedNotFound: Always on failure (404 masking).
    """
    user = getattr(request, "user", None)

    if not user or not user.is_authenticated:
        log_security_event(request, "security.red_alert.admin_route_denied", "admin_route")
        raise ResourceMaskedNotFound()

    is_valid_admin = user.is_admin and user.is_active
    if require_superuser:
        is_valid_admin = is_valid_admin and user.is_superuser

    if not is_valid_admin:
        log_security_event(
            request,
            "security.red_alert.admin_route_denied",
            "admin_route",
            details={"user_id": user.id, "require_superuser": require_superuser},
        )
        raise ResourceMaskedNotFound()


def ensure_approved_coordinator(user) -> None:
    """
    Verify the user has an approved coordinator profile and is active.

    This mirrors the SQL function is_approved_coordinator(p_user).

    Raises:
        PermissionDeniedError: If user is not an approved coordinator.
    """
    ensure_active_user(user)

    try:
        profile = getattr(user, "coordinator_profile", None)
        if profile is None or profile.status != "approved":
            raise PermissionDeniedError(
                message="Coordinator approval is required for this action.",
                code="coordinator_not_approved",
            )
    except Exception:
        raise PermissionDeniedError(
            message="Coordinator approval is required for this action.",
            code="coordinator_not_approved",
        )


def get_event_for_manager_or_404(user, event_id: int, require_write: bool = True):
    """
    Load an event and verify the user has manager access.

    Implements both 404 masking (for non-managers) and Owner-as-Monitor
    read-only enforcement (for owners when coordination is delegated).

    Args:
        user: The requesting user.
        event_id: The event ID to load.
        require_write: If True, enforces Owner-as-Monitor write block.

    Returns:
        The Events model instance.

    Raises:
        ResourceMaskedNotFound: If event doesn't exist, is deleted, or user is not a manager.
        OwnerMonitorReadOnlyError: If owner tries to write while coordination is delegated.
    """
    from apps.events.models import Events

    try:
        event = Events.objects.get(id=event_id, deleted_at__isnull=True)
    except Events.DoesNotExist:
        raise ResourceMaskedNotFound()

    is_manager = _is_event_manager(user, event)
    if not is_manager:
        raise ResourceMaskedNotFound()

    if require_write and not user.is_admin:
        if user.id == event.owner_id and event.owner_id != event.current_coordinator_id:
            raise OwnerMonitorReadOnlyError()

    if require_write and not user.is_admin:
        try:
            ensure_approved_coordinator(user)
        except PermissionDeniedError:
            raise ResourceMaskedNotFound()

    return event


def get_visible_event_or_404(user, event_id: int):
    """
    Load an event for viewing, applying visibility rules.

    Public events (published/active) are visible to anyone.
    Draft/completed/cancelled events are visible only to managers and admins.
    Deleted events are visible only to admins.

    Args:
        user: The requesting user (may be anonymous).
        event_id: The event ID to load.

    Returns:
        The Events model instance.

    Raises:
        ResourceMaskedNotFound: If event is not visible to this user.
    """
    from apps.events.models import Events

    try:
        eid = int(event_id)
        event = Events.objects.get(id=eid)
    except (ValueError, TypeError, Events.DoesNotExist):
        raise ResourceMaskedNotFound()

    # Deleted events: admin only
    if event.deleted_at is not None:
        if not (user and user.is_authenticated and user.is_admin and user.is_active):
            raise ResourceMaskedNotFound()
        return event

    # Published/active: visible to everyone
    if event.status in ("published", "active"):
        return event

    # Draft/completed/cancelled: managers, admins, and active participants
    if user and user.is_authenticated:
        if user.is_admin and user.is_active:
            return event
        if _is_event_manager(user, event):
            return event

        from apps.events.models import EventApplications
        from apps.coordination.models import Assignments
        has_participation = (
            EventApplications.objects.filter(event_id=event_id, user_id=user.id).exists()
            or Assignments.objects.filter(event_id=event_id, user_id=user.id).exclude(status="cancelled").exists()
        )
        if has_participation:
            return event

    raise ResourceMaskedNotFound()


def can_coordinator_read_t2(actor, target_user_id: int, event) -> bool:
    """
    Check if an actor can read T2 event-scoped semi-private data for a target user.

    T2 access requires:
    - Actor is an event manager (owner, current_coordinator, or admin)
    - Event is published or active
    - Target user has an accepted application OR active assignment on this event
    """
    if not actor or not actor.is_authenticated:
        return False

    if actor.is_admin and actor.is_active:
        return True

    if not _is_event_manager(actor, event):
        return False

    if event.status not in ("published", "active"):
        return False

    from apps.events.models import EventApplications
    from apps.coordination.models import Assignments

    has_accepted_app = EventApplications.objects.filter(
        event_id=event.id,
        user_id=target_user_id,
        status="accepted",
    ).exists()

    has_active_assignment = Assignments.objects.filter(
        event_id=event.id,
        user_id=target_user_id,
    ).exclude(status="cancelled").exists()

    return has_accepted_app or has_active_assignment


# =============================================================================
# DRF PERMISSION CLASSES
# =============================================================================

class IsActiveUser(BasePermission):
    """Requires authenticated user with active account."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and getattr(user, "account_status", "") == "active"
        )


class IsAdminUser(BasePermission):
    """Requires active admin user."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "is_admin", False)
            and getattr(user, "is_active", False)
        )


class IsSuperAdminUser(BasePermission):
    """Requires active super admin user."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "is_admin", False)
            and getattr(user, "is_superuser", False)
            and getattr(user, "is_active", False)
        )


class IsApprovedCoordinator(BasePermission):
    """Requires user with approved coordinator profile."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and getattr(user, "is_active", False)):
            return False
        try:
            profile = getattr(user, "coordinator_profile", None)
            return bool(profile and profile.status == "approved")
        except Exception:
            return False


class AllowAnyReadOnly(BasePermission):
    """Allow any access for safe methods, require auth for mutations."""

    def has_permission(self, request, view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return bool(request.user and request.user.is_authenticated)


# Legacy backward-compatible aliases
IsAdmin = IsAdminUser
IsCoordinator = IsApprovedCoordinator


# =============================================================================
# SERIALIZER MIXINS
# =============================================================================

class AllowListSerializerMixin:
    """
    Mixin for DRF serializers that strictly enforces allow-listing of input fields.
    Rejects any input key that is not explicitly declared on the serializer,
    as well as incoming payload updates on read_only=True fields.
    """

    def to_internal_value(self, data):
        from rest_framework.exceptions import ValidationError as DRFValidationError

        if hasattr(data, "keys"):
            errors = {}
            declared_fields = set(self.fields.keys())
            incoming_keys = set(data.keys())

            # Check for unknown / undeclared fields
            unknown_keys = incoming_keys - declared_fields
            for key in sorted(unknown_keys):
                errors[key] = ["Unexpected or forbidden field."]

            # Check for read_only fields sent in request body
            for key in incoming_keys & declared_fields:
                field = self.fields[key]
                if getattr(field, "read_only", False):
                    errors[key] = ["Read-only field cannot be modified."]

            if errors:
                raise DRFValidationError(errors)

        return super().to_internal_value(data)


# =============================================================================
# INTERNAL HELPERS
# =============================================================================

def _is_event_manager(user, event) -> bool:
    """
    Check if user is an event manager (mirrors SQL is_event_manager).

    Manager = admin, OR owner/current_coordinator who is still an approved coordinator.
    """
    if not user or not user.is_authenticated:
        return False

    if getattr(user, "is_admin", False) and getattr(user, "is_active", False):
        return True

    if user.id not in (event.owner_id, event.current_coordinator_id):
        return False

    try:
        profile = getattr(user, "coordinator_profile", None)
        return bool(profile and profile.status == "approved" and getattr(user, "is_active", False))
    except Exception:
        return False
