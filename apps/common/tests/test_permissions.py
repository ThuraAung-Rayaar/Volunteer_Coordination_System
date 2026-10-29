# apps/common/tests/test_permissions.py
from datetime import timedelta
from types import SimpleNamespace
from django.test import SimpleTestCase
from django.utils import timezone

from apps.common.constants import (
    ACCOUNT_ACTIVE,
    ACCOUNT_BLOCKED,
    ACCOUNT_CLOSED,
    COORDINATOR_APPROVED,
    COORDINATOR_PENDING,
    COORDINATOR_SUSPENDED,
)
from apps.common.exceptions import (
    AccountBlockedError,
    AccountClosedError,
    PermissionDeniedError,
)
from apps.common.permissions import (
    IsActiveAccount,
    IsAdminRole,
    IsApprovedCoordinatorRole,
    ensure_active_account,
    ensure_admin,
    ensure_approved_coordinator,
    ensure_event_manager,
    is_admin,
    is_approved_coordinator,
    is_event_manager,
)


class PermissionsTests(SimpleTestCase):
    def _create_user(self, **kwargs):
        defaults = {
            "id": 1,
            "is_authenticated": True,
            "is_admin": False,
            "is_superuser": False,
            "account_status": ACCOUNT_ACTIVE,
            "blocked_until": None,
            "coordinator_profile": None,
        }
        defaults.update(kwargs)
        return SimpleNamespace(**defaults)

    def test_ensure_active_account_allows_active(self):
        user = self._create_user(account_status=ACCOUNT_ACTIVE)
        result = ensure_active_account(user)
        self.assertEqual(result, user)

        # Unauthenticated user raises PermissionDeniedError
        unauth_user = self._create_user(is_authenticated=False)
        with self.assertRaises(PermissionDeniedError):
            ensure_active_account(unauth_user)

        with self.assertRaises(PermissionDeniedError):
            ensure_active_account(None)

    def test_ensure_active_account_blocks_suspended_user(self):
        # Indefinite block (blocked_until is None)
        indefinite_blocked = self._create_user(
            account_status=ACCOUNT_BLOCKED,
            blocked_until=None,
        )
        with self.assertRaises(AccountBlockedError):
            ensure_active_account(indefinite_blocked)

        # Future block (blocked_until in future)
        future_blocked = self._create_user(
            account_status=ACCOUNT_BLOCKED,
            blocked_until=timezone.now() + timedelta(days=2),
        )
        with self.assertRaises(AccountBlockedError):
            ensure_active_account(future_blocked)

        # Closed account
        closed_user = self._create_user(account_status=ACCOUNT_CLOSED)
        with self.assertRaises(AccountClosedError):
            ensure_active_account(closed_user)

    def test_ensure_active_account_allows_expired_blocked_user(self):
        past_blocked = self._create_user(
            account_status=ACCOUNT_BLOCKED,
            blocked_until=timezone.now() - timedelta(hours=1),
        )
        result = ensure_active_account(past_blocked)
        self.assertEqual(result, past_blocked)

    def test_ensure_event_manager_checks_ownership(self):
        coord_user = self._create_user(id=10)
        other_user = self._create_user(id=20)
        admin_user = self._create_user(id=99, is_admin=True)

        event = SimpleNamespace(id=100, coordinator_id=10)

        # 1. Event coordinator is allowed
        self.assertTrue(is_event_manager(coord_user, event))
        self.assertEqual(ensure_event_manager(coord_user, event), coord_user)

        # 2. Admin is allowed regardless of coordinator_id
        self.assertTrue(is_event_manager(admin_user, event))
        self.assertEqual(ensure_event_manager(admin_user, event), admin_user)

        # 3. Non-owner non-admin is rejected
        self.assertFalse(is_event_manager(other_user, event))
        with self.assertRaises(PermissionDeniedError):
            ensure_event_manager(other_user, event)

    def test_ensure_approved_coordinator(self):
        profile_approved = SimpleNamespace(status=COORDINATOR_APPROVED)
        profile_pending = SimpleNamespace(status=COORDINATOR_PENDING)
        profile_suspended = SimpleNamespace(status=COORDINATOR_SUSPENDED)

        user_approved = self._create_user(id=1, coordinator_profile=profile_approved)
        user_pending = self._create_user(id=2, coordinator_profile=profile_pending)
        user_suspended = self._create_user(id=3, coordinator_profile=profile_suspended)
        user_no_profile = self._create_user(id=4, coordinator_profile=None)

        self.assertTrue(is_approved_coordinator(user_approved))
        self.assertEqual(ensure_approved_coordinator(user_approved), user_approved)

        self.assertFalse(is_approved_coordinator(user_pending))
        with self.assertRaises(PermissionDeniedError):
            ensure_approved_coordinator(user_pending)

        self.assertFalse(is_approved_coordinator(user_suspended))
        with self.assertRaises(PermissionDeniedError):
            ensure_approved_coordinator(user_suspended)

        self.assertFalse(is_approved_coordinator(user_no_profile))
        with self.assertRaises(PermissionDeniedError):
            ensure_approved_coordinator(user_no_profile)

    def test_ensure_admin(self):
        admin_user = self._create_user(id=1, is_admin=True)
        super_user = self._create_user(id=2, is_superuser=True)
        regular_user = self._create_user(id=3, is_admin=False, is_superuser=False)

        self.assertTrue(is_admin(admin_user))
        self.assertEqual(ensure_admin(admin_user), admin_user)

        self.assertTrue(is_admin(super_user))
        self.assertEqual(ensure_admin(super_user), super_user)

        self.assertFalse(is_admin(regular_user))
        with self.assertRaises(PermissionDeniedError):
            ensure_admin(regular_user)

    def test_drf_permission_classes(self):
        active_user = self._create_user(account_status=ACCOUNT_ACTIVE)
        closed_user = self._create_user(account_status=ACCOUNT_CLOSED)
        admin_user = self._create_user(account_status=ACCOUNT_ACTIVE, is_admin=True)
        coord_user = self._create_user(
            account_status=ACCOUNT_ACTIVE,
            coordinator_profile=SimpleNamespace(status=COORDINATOR_APPROVED),
        )

        dummy_view = None

        # IsActiveAccount
        perm_active = IsActiveAccount()
        self.assertTrue(perm_active.has_permission(SimpleNamespace(user=active_user), dummy_view))
        self.assertFalse(perm_active.has_permission(SimpleNamespace(user=closed_user), dummy_view))

        # IsAdminRole
        perm_admin = IsAdminRole()
        self.assertTrue(perm_admin.has_permission(SimpleNamespace(user=admin_user), dummy_view))
        self.assertFalse(perm_admin.has_permission(SimpleNamespace(user=active_user), dummy_view))

        # IsApprovedCoordinatorRole
        perm_coord = IsApprovedCoordinatorRole()
        self.assertTrue(perm_coord.has_permission(SimpleNamespace(user=coord_user), dummy_view))
        self.assertFalse(perm_coord.has_permission(SimpleNamespace(user=active_user), dummy_view))

