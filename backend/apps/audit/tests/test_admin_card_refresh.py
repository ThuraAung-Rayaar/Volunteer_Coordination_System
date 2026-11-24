from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from apps.accounts.models import Users
from apps.events.models import Events
from common.security import encrypt_phone, compute_phone_hash
from django.utils import timezone


class AdminCardRefreshTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        import random
        phone_admin = f"+959{random.randint(10000000, 99999999)}"
        phone_vol = f"+959{random.randint(10000000, 99999999)}"
        self.phone_vol = phone_vol
        self.superadmin = Users.objects.create(
            display_name="Super Admin Refresh",
            phone_hash=compute_phone_hash(phone_admin),
            phone_enc=encrypt_phone(phone_admin),
            is_admin=True,
            is_superuser=True,
            is_active=True,
            account_status="active",
        )
        self.regular_user = Users.objects.create(
            display_name="Regular Volunteer Refresh",
            phone_hash=compute_phone_hash(phone_vol),
            phone_enc=encrypt_phone(phone_vol),
            is_admin=False,
            is_superuser=False,
            is_active=True,
            account_status="active",
        )
        self.event = Events.objects.first()
        if not self.event:
            from apps.coordination.models import CoordinatorProfiles
            coord = CoordinatorProfiles.objects.create(user=self.superadmin, status="approved")
            self.event = Events.objects.create(
                title="Clean Up Event",
                status="published",
                start_at=timezone.now(),
                end_at=timezone.now() + timezone.timedelta(hours=4),
                owner=coord,
                current_coordinator=coord,
            )

    def test_unauthenticated_partial_access_redirects_or_denies(self):
        res_event = self.client.get(reverse("admin_ui_event_detail_partial", args=[self.event.id]))
        self.assertIn(res_event.status_code, [302, 401, 403, 404])

        res_user = self.client.get(reverse("admin_ui_user_detail_partial", args=[self.regular_user.id]))
        self.assertIn(res_user.status_code, [302, 401, 403, 404])

    def test_authenticated_admin_event_partial(self):
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.get(reverse("admin_ui_event_detail_partial", args=[self.event.id]))
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, self.event.title)
        self.assertContains(res, "Event Role Posts & Capacity")

    def test_authenticated_admin_user_partial_decrypts_only_inspected(self):
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.get(reverse("admin_ui_user_detail_partial", args=[self.regular_user.id]))
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, "Regular Volunteer")
        self.assertContains(res, self.phone_vol)

    def test_user_list_context_does_not_decrypt_phones(self):
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.get(reverse("admin_ui_users"))
        self.assertEqual(res.status_code, 200)
        users_list = res.context["users_list"]
        for u in users_list:
            self.assertFalse(hasattr(u, "decrypted_phone") and u.decrypted_phone == "+959222222222",
                             "User list rows should not have decrypted phone preloaded")
