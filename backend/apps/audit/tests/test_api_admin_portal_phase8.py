import uuid
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.attendance.models import Attendance
from apps.audit.models import AuditLogs, Feedback
from apps.events.models import EventApplications, EventPosts, Events
from common.exceptions import InsufficientPrivilegeError
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import event_service


def _phone():
    return f"+959{uuid.uuid4().int % 900000000 + 100000000}"


def _make_user(name, is_admin=False, is_superuser=False, verified=False, **kwargs):
    phone = normalize_phone(_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        is_superuser=is_superuser,
        verification_status="verified" if verified else "none",
        **kwargs,
    )


def _make_coordinator(admin, name="Coordinator"):
    from services import coordinator_service
    user = _make_user(name, is_admin=True, verified=True)
    coordinator_service.apply_for_coordinator(user, "Coord notes")
    coordinator_service.approve_coordinator(admin, user.id, "Approved")
    user.refresh_from_db()
    return user


def _make_completed_event(coord, volunteer):
    """Create an event, assign the volunteer, and complete it so feedback is allowed."""
    start = timezone.now() + timedelta(hours=1)
    end = timezone.now() + timedelta(hours=4)
    event = Events.objects.create(
        owner_id=coord.id,
        current_coordinator_id=coord.id,
        title="API Portal Event",
        start_at=start,
        end_at=end,
        acceptance_mode="auto",
        auto_assign_enabled=True,
        require_onboarding_ack=False,
    )
    EventPosts.objects.create(event=event, title="Helper", required_headcount=5)
    Events.objects.filter(id=event.id).update(status="published")
    Events.objects.filter(id=event.id).update(status="active")
    EventApplications.objects.create(
        event=event,
        user=volunteer,
        source="browse",
        conditions_acknowledged_at=timezone.now(),
    )
    past_start = timezone.now() - timedelta(hours=4)
    past_end = timezone.now() - timedelta(hours=1)
    Attendance.objects.filter(event=event, user=volunteer).update(
        status="checked_in",
        checkin_at=past_start,
        method="coordinator_manual",
        recorded_by_user_id=coord.id,
    )
    Attendance.objects.filter(event=event, user=volunteer).update(
        status="completed",
        checkout_at=past_end,
    )
    Events.objects.filter(id=event.id).update(
        start_at=past_start,
        end_at=past_end,
        status="completed",
    )
    event.refresh_from_db()
    return event


class Phase8ApiAdminPortalTests(TestCase):
    """API integration tests for admin portal endpoints, routing parity, and privilege gating."""

    @classmethod
    def setUpTestData(cls):
        cls.super_admin = _make_user("SuperAdminAPI", is_admin=True, is_superuser=True)
        cls.standard_admin = _make_user("StdAdminAPI", is_admin=True, is_superuser=False)
        cls.coord = _make_coordinator(cls.super_admin, "CoordAPI")
        cls.vol = _make_user("VolunteerAPI")
        cls.event = _make_completed_event(cls.coord, cls.vol)

        # Create a feedback row
        from services import feedback_service
        cls.feedback = feedback_service.submit_event_feedback(
            cls.vol, cls.event.id, "volunteer_to_event", score=5, comment="Initial Feedback"
        )

    def setUp(self):
        self.client = APIClient()

    def test_admin_dashboard_metrics_privileges(self):
        # 1. Unauthenticated -> 401
        res = self.client.get("/api/v1/admin/dashboard/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. Regular volunteer -> 404 masked
        self.client.force_authenticate(user=self.vol)
        res = self.client.get("/api/v1/admin/dashboard/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # 3. Standard admin -> 200
        self.client.force_authenticate(user=self.standard_admin)
        res = self.client.get("/api/v1/admin/dashboard/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("active_users", res.data)

    def test_admin_audit_logs_super_admin_restriction_and_aliases(self):
        # Standard admin blocked with 404 masked
        self.client.force_authenticate(user=self.standard_admin)
        res1 = self.client.get("/api/v1/admin/audit-logs/")
        self.assertEqual(res1.status_code, status.HTTP_404_NOT_FOUND)

        # Super Admin succeeds on canonical route
        self.client.force_authenticate(user=self.super_admin)
        res2 = self.client.get("/api/v1/admin/audit-logs/")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertIn("results", res2.data)

        # Super Admin succeeds on legacy alias route
        res3 = self.client.get("/api/v1/admin/audit/")
        self.assertEqual(res3.status_code, status.HTTP_200_OK)

    def test_admin_geo_attempts_routing_and_access(self):
        self.client.force_authenticate(user=self.standard_admin)
        res = self.client.get("/api/v1/admin/geo-attempts/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("results", res.data)

    def test_admin_moderation_warn_and_block(self):
        self.client.force_authenticate(user=self.standard_admin)
        # Warning
        payload_warn = {
            "action_type": "user_warning",
            "target_user_id": self.vol.id,
            "reason": "Warning via API",
        }
        res_warn = self.client.post("/api/v1/admin/moderation/", data=payload_warn, format="json")
        self.assertEqual(res_warn.status_code, status.HTTP_201_CREATED)

        # Block user via user-scoped action
        payload_block = {
            "reason": "Suspended for test",
            "expires_at": (timezone.now() + timedelta(days=1)).isoformat(),
        }
        res_block = self.client.post(
            f"/api/v1/admin/users/{self.vol.id}/block/", data=payload_block, format="json"
        )
        self.assertEqual(res_block.status_code, status.HTTP_200_OK)
        self.vol.refresh_from_db()
        self.assertEqual(self.vol.account_status, "blocked")

    def test_admin_feedback_list_and_hide(self):
        self.client.force_authenticate(user=self.standard_admin)
        # List feedback
        res_list = self.client.get("/api/v1/admin/feedback/")
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(res_list.data["results"]), 1)

        # Hide feedback
        res_hide = self.client.post(
            f"/api/v1/admin/feedback/{self.feedback.id}/hide/",
            data={"reason": "Contains defamatory text"},
            format="json",
        )
        self.assertEqual(res_hide.status_code, status.HTTP_200_OK)
        self.feedback.refresh_from_db()
        self.assertEqual(self.feedback.status, "hidden")

    def test_admin_maintenance_run_privileges(self):
        # Standard admin blocked from maintenance with 404 masked
        self.client.force_authenticate(user=self.standard_admin)
        res_std = self.client.post("/api/v1/admin/maintenance/run/")
        self.assertEqual(res_std.status_code, status.HTTP_404_NOT_FOUND)

        # Super Admin executes maintenance
        self.client.force_authenticate(user=self.super_admin)
        res_sup = self.client.post("/api/v1/admin/maintenance/run/")
        self.assertEqual(res_sup.status_code, status.HTTP_200_OK)
        self.assertIn("released_expired_blocks", res_sup.data)

    def test_admin_allow_list_rejection(self):
        self.client.force_authenticate(user=self.standard_admin)
        payload = {
            "action_type": "user_warning",
            "target_user_id": self.vol.id,
            "reason": "Valid reason",
            "injected_untrusted_field": "exploit",
        }
        res = self.client.post("/api/v1/admin/moderation/", data=payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_super_admin_create_event_success(self):
        self.client.force_authenticate(user=self.super_admin)
        start = timezone.now() + timedelta(days=2)
        end = start + timedelta(hours=4)
        payload = {
            "title": "Super Admin Gala",
            "description": "Event created directly by Super Admin",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "charity_field_ids": [1],
            "venue_name": "Grand Hall",
            "venue_address": "123 Main St",
            "venue_lat": 16.80528,
            "venue_lng": 96.15611,
            "geofence_radius_m": 150,
            "checkin_open_minutes_before": 30,
            "checkin_close_minutes_after": 60,
        }
        res = self.client.post("/api/v1/admin/events/", data=payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn("id", res.data)
        self.assertEqual(res.data["title"], "Super Admin Gala")
        self.assertEqual(res.data["status"], "draft")

        event_id = res.data["id"]
        event = Events.objects.get(pk=event_id)
        self.assertEqual(event.owner_id, self.super_admin.id)
        self.assertEqual(event.current_coordinator_id, self.super_admin.id)
        self.assertEqual(event.charity_fields.count(), 1)

        # Verify audit log is recorded
        audit_log = AuditLogs.objects.filter(
            action="admin.event_create",
            entity_type="event",
            entity_id=event_id,
        ).first()
        self.assertIsNotNone(audit_log)
        self.assertEqual(audit_log.actor_user_id, self.super_admin.id)

    def test_standard_admin_create_event_masked_404(self):
        self.client.force_authenticate(user=self.standard_admin)
        start = timezone.now() + timedelta(days=2)
        end = start + timedelta(hours=4)
        payload = {
            "title": "Unauthorized Event Attempt",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "charity_field_ids": ["teaching"],
        }
        res = self.client.post("/api/v1/admin/events/", data=payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_create_event_validation_errors(self):
        self.client.force_authenticate(user=self.super_admin)
        start = timezone.now() + timedelta(days=2)
        end = start + timedelta(hours=4)

        # 1. 0 charity fields -> 400 Bad Request
        payload_zero_fields = {
            "title": "No Charity Fields",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "charity_field_ids": [],
        }
        res_zero = self.client.post("/api/v1/admin/events/", data=payload_zero_fields, format="json")
        self.assertEqual(res_zero.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. 4 charity fields -> 400 Bad Request
        payload_four_fields = {
            "title": "Too Many Charity Fields",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "charity_field_ids": ["teaching", "environment", "elderly_care", "animal_welfare"],
        }
        res_four = self.client.post("/api/v1/admin/events/", data=payload_four_fields, format="json")
        self.assertEqual(res_four.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. end_time <= start_time -> 400 Bad Request
        payload_invalid_time = {
            "title": "Invalid End Time",
            "start_time": start.isoformat(),
            "end_time": (start - timedelta(hours=1)).isoformat(),
            "charity_field_ids": ["teaching"],
        }
        res_time = self.client.post("/api/v1/admin/events/", data=payload_invalid_time, format="json")
        self.assertEqual(res_time.status_code, status.HTTP_400_BAD_REQUEST)

        # 4. Out-of-range integer charity field ID -> 400 Bad Request
        payload_invalid_field = {
            "title": "Invalid Charity Field ID",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "charity_field_ids": [999],
        }
        res_field = self.client.post("/api/v1/admin/events/", data=payload_invalid_field, format="json")
        self.assertEqual(res_field.status_code, status.HTTP_400_BAD_REQUEST)

        # 5. Service-layer direct call by non-superuser raises InsufficientPrivilegeError
        with self.assertRaises(InsufficientPrivilegeError):
            event_service.admin_create_event(
                self.standard_admin,
                data={
                    "title": "Direct Call Fail",
                    "start_time": start,
                    "end_time": end,
                    "charity_field_ids": ["teaching"],
                },
            )

    def test_admin_events_list(self):
        self.client.force_authenticate(user=self.standard_admin)
        res = self.client.get("/api/v1/admin/events/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("results", res.data)

    def test_admin_html_views_unauthorized_blocked(self):
        ui_endpoints = [
            "/api/v1/admin/ui/dashboard/",
            "/api/v1/admin/ui/geo-monitoring/",
            "/api/v1/admin/ui/coordinators/",
        ]
        # 1. Anonymous requests -> blocked (404 or 302 redirect)
        for url in ui_endpoints:
            res = self.client.get(url)
            self.assertIn(
                res.status_code,
                [status.HTTP_404_NOT_FOUND, status.HTTP_302_FOUND],
                f"Expected 404 or 302 for anonymous request to {url}, got {res.status_code}",
            )

        # 2. Non-admin volunteer request -> 404 masked
        self.client.force_authenticate(user=self.vol)
        for url in ui_endpoints:
            res = self.client.get(url)
            self.assertEqual(
                res.status_code,
                status.HTTP_404_NOT_FOUND,
                f"Expected 404 for non-admin request to {url}, got {res.status_code}",
            )

    def test_admin_html_views_authenticated_success_with_context(self):
        self.client.force_authenticate(user=self.standard_admin)

        # 1. Dashboard UI
        res_dash = self.client.get("/api/v1/admin/ui/dashboard/")
        self.assertEqual(res_dash.status_code, status.HTTP_200_OK)
        self.assertIn("kpis", res_dash.context)
        self.assertIn("recent_events", res_dash.context)

        # 2. Geo Monitoring UI
        res_geo = self.client.get("/api/v1/admin/ui/geo-monitoring/")
        self.assertEqual(res_geo.status_code, status.HTTP_200_OK)
        self.assertIn("geo_attempts", res_geo.context)

        # 3. Coordinator Board UI
        res_coord = self.client.get("/api/v1/admin/ui/coordinators/")
        self.assertEqual(res_coord.status_code, status.HTTP_200_OK)
        self.assertIn("pending_coordinators", res_coord.context)

    def test_super_admin_create_event_from_dashboard_ui(self):
        self.client.force_authenticate(user=self.super_admin)
        start = timezone.now() + timedelta(days=5)
        end = start + timedelta(hours=3)
        payload = {
            "title": "Dashboard Created Event",
            "description": "Created from admin dashboard HTML form",
            "start_time": start.strftime("%Y-%m-%dT%H:%M"),
            "end_time": end.strftime("%Y-%m-%dT%H:%M"),
            "venue_name": "City Sports Center",
            "venue_address": "123 Stadium Way",
            "venue_lat": "16.805280",
            "venue_lng": "96.156110",
            "geofence_radius_m": "200",
            "charity_field_ids": ["teaching"],
        }
        res = self.client.post("/api/v1/admin/ui/dashboard/", data=payload)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        if res.context.get("error_message"):
            self.fail(f"Form submission error: {res.context.get('error_message')}")
        self.assertIn("success_message", res.context)
        self.assertTrue(Events.objects.filter(title="Dashboard Created Event").exists())

    def test_myanmar_phone_normalization_variants(self):
        from admin_portal.phone_utils import normalize_myanmar_phone
        from common.security import compute_phone_hash

        variants = ["+959100000001", "+9509100000001", "09100000001", "9100000001", "959100000001", "9509100000001"]
        expected_canonical = "+959100000001"
        expected_hash = compute_phone_hash(expected_canonical)

        for v in variants:
            norm = normalize_myanmar_phone(v)
            self.assertEqual(norm, expected_canonical, f"Failed for {v}")
            self.assertEqual(compute_phone_hash(norm), expected_hash, f"Hash mismatch for {v}")

    def test_custom_admin_login_with_myanmar_phone_and_logout(self):
        from common.security import compute_phone_hash, encrypt_phone

        canonical = "+959123456789"
        p_hash = compute_phone_hash(canonical)
        admin = Users.objects.create(
            phone_hash=p_hash,
            phone_enc=encrypt_phone(canonical),
            display_name="LoginTestAdmin",
            is_admin=True,
            is_active=True,
            account_status="active",
        )
        admin.set_password("AdminDemo123!")
        admin.save()

        # Login via local format 09123456789
        login_res = self.client.post(
            "/api/v1/admin/ui/login/",
            data={"phone": "09123456789", "password": "AdminDemo123!"},
        )
        self.assertEqual(login_res.status_code, status.HTTP_302_FOUND)
        self.assertIn("/api/v1/admin/ui/dashboard/", login_res.url)

        # Access guarded dashboard view as authenticated admin
        dash_res = self.client.get("/api/v1/admin/ui/dashboard/")
        self.assertEqual(dash_res.status_code, status.HTTP_200_OK)

        # Logout
        logout_res = self.client.get("/api/v1/admin/ui/logout/")
        self.assertEqual(logout_res.status_code, status.HTTP_302_FOUND)
        self.assertEqual(logout_res.url, "/api/v1/admin/ui/login/")

    def test_admin_phone_hash_lookup_api(self):
        from common.security import compute_phone_hash, encrypt_phone

        canonical = "+959987654321"
        Users.objects.create(
            phone_hash=compute_phone_hash(canonical),
            phone_enc=encrypt_phone(canonical),
            display_name="LookupAdmin",
            is_admin=True,
            is_active=True,
            account_status="active",
        )

        res = self.client.get("/api/v1/admin/ui/phone-lookup/?phone=09987654321")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertTrue(data["valid"])
        self.assertEqual(data["normalized_phone"], canonical)
        self.assertTrue(data["account_found"])

        # Invalid phone format
        res_invalid = self.client.get("/api/v1/admin/ui/phone-lookup/?phone=invalid")
        self.assertEqual(res_invalid.status_code, status.HTTP_200_OK)
        data_invalid = res_invalid.json()
        self.assertFalse(data_invalid["valid"])
        self.assertIn("error", data_invalid)

    def test_unauthenticated_html_redirects_to_custom_login(self):
        res = self.client.get("/api/v1/admin/ui/dashboard/", HTTP_ACCEPT="text/html")
        self.assertEqual(res.status_code, status.HTTP_302_FOUND)
        self.assertIn("/api/v1/admin/ui/login/?next=/api/v1/admin/ui/dashboard/", res.url)

    def test_resolve_user_by_phone_or_hash_coverage(self):
        from admin_portal.phone_utils import resolve_user_by_phone_or_hash
        from common.security import compute_phone_hash, encrypt_phone

        canonical = "+959777888999"
        p_hash = compute_phone_hash(canonical)
        u = Users.objects.create(
            phone_hash=p_hash,
            phone_enc=encrypt_phone(canonical),
            display_name="ResolveCoverageUser",
            is_admin=True,
            is_active=True,
        )

        # 1. Resolve by phone number
        user1, hash1, can1 = resolve_user_by_phone_or_hash("09777888999")
        self.assertEqual(user1.id, u.id)
        self.assertEqual(hash1, p_hash)
        self.assertEqual(can1, canonical)

        # 2. Resolve by 64-char hex hash
        user2, hash2, can2 = resolve_user_by_phone_or_hash(p_hash)
        self.assertEqual(user2.id, u.id)
        self.assertEqual(hash2, p_hash)
        self.assertEqual(can2, "")

        # 3. Fallback scan on phone_enc when phone_hash is dummy/external
        u_fallback = Users.objects.create(
            phone_hash="external_psql_seeded_hash_placeholder_not_hmac_sha256_at_all_x",
            phone_enc=encrypt_phone("+959555666777"),
            display_name="FallbackSeededUser",
            is_admin=True,
            is_active=True,
        )
        user3, hash3, can3 = resolve_user_by_phone_or_hash("09555666777")
        self.assertEqual(user3.id, u_fallback.id)
        self.assertEqual(hash3, u_fallback.phone_hash)
        self.assertEqual(can3, "+959555666777")

        # 4. Unknown phone
        user4, hash4, can4 = resolve_user_by_phone_or_hash("09111222333")
        self.assertIsNone(user4)
        self.assertEqual(can4, "+959111222333")

        # 5. Empty phone raises ValueError
        with self.assertRaises(ValueError):
            resolve_user_by_phone_or_hash("")

    def test_dashboard_ui_v2_metrics_and_context(self):
        import json
        self.client.force_authenticate(user=self.standard_admin)
        res = self.client.get("/api/v1/admin/ui/dashboard/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # 1. Tab check
        self.assertEqual(res.context.get("active_tab"), "dashboard")

        # 2. User composition metrics
        uc = res.context.get("user_composition")
        self.assertIsNotNone(uc)
        self.assertIn("total_users", uc)
        self.assertIn("total_coordinators", uc)
        self.assertIn("regular_volunteers", uc)
        self.assertIn("coord_pct", uc)
        self.assertIn("vol_pct", uc)
        self.assertIn("coord_ratio", uc)
        self.assertIn("vol_active", uc)
        self.assertIn("vol_blocked", uc)
        self.assertIn("vol_closed", uc)
        self.assertIn("ver_verified", uc)
        self.assertIn("ver_pending", uc)
        self.assertIn("coord_approved", uc)
        self.assertIn("coord_pending", uc)

        # 3. Map events JSON
        map_json = res.context.get("map_events_json")
        self.assertIsNotNone(map_json)
        events_data = json.loads(map_json)
        self.assertIsInstance(events_data, list)

        # 4. Past events
        past_events = res.context.get("past_events")
        self.assertIsNotNone(past_events)
        for pe in past_events:
            self.assertIn(pe.status, ["completed", "cancelled"])
            self.assertTrue(hasattr(pe, "feedback_count"))

        # 5. Feedback overview
        fo = res.context.get("feedback_overview")
        self.assertIsNotNone(fo)
        self.assertIn("total_active", fo)
        self.assertIn("total_hidden", fo)
        self.assertIn("avg_score", fo)
        self.assertIn("by_direction", fo)
        self.assertIn("star_distribution", fo)
        self.assertEqual(len(fo["star_distribution"]), 5)

    def test_event_create_tab_view_and_super_admin_create(self):
        # 1. Standard admin access GET
        self.client.force_authenticate(user=self.standard_admin)
        res_get = self.client.get("/api/v1/admin/ui/event-create/")
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)
        self.assertEqual(res_get.context.get("active_tab"), "event_create")
        self.assertIn("charity_fields", res_get.context)
        self.assertIn("all_events", res_get.context)

        # 2. Super admin creates event via POST with initial role post
        self.client.force_authenticate(user=self.super_admin)
        start = timezone.now() + timedelta(days=6)
        end = start + timedelta(hours=4)
        payload = {
            "title": "Tab Dedicated Created Event",
            "description": "Created from dedicated event-create tab",
            "start_time": start.strftime("%Y-%m-%dT%H:%M"),
            "end_time": end.strftime("%Y-%m-%dT%H:%M"),
            "venue_name": "Kandawgyi Lake Park",
            "venue_lat": "16.795000",
            "venue_lng": "96.160000",
            "geofence_radius_m": "250",
            "charity_field_ids": ["teaching"],
            "role_title": "Field Volunteer",
            "role_headcount": "8",
        }
        res_post = self.client.post("/api/v1/admin/ui/event-create/", data=payload)
        self.assertEqual(res_post.status_code, status.HTTP_200_OK)
        self.assertIn("success_message", res_post.context)
        created = Events.objects.filter(title="Tab Dedicated Created Event").first()
        self.assertIsNotNone(created)
        self.assertTrue(EventPosts.objects.filter(event=created, title="Field Volunteer", required_headcount=8).exists())

    def test_events_detail_and_geo_view_inspection_and_moderation(self):
        self.client.force_authenticate(user=self.super_admin)

        # 1. Base view without event_id
        res_list = self.client.get("/api/v1/admin/ui/events/")
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        self.assertEqual(res_list.context.get("active_tab"), "events")
        self.assertIn("events_list", res_list.context)
        self.assertIn("geo_map_json", res_list.context)

        # 2. Inspect specific event via ?event_id=
        res_detail = self.client.get(f"/api/v1/admin/ui/events/?event_id={self.event.id}")
        self.assertEqual(res_detail.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res_detail.context.get("selected_event"))
        self.assertEqual(res_detail.context.get("selected_event").id, self.event.id)
        self.assertIn("selected_posts", res_detail.context)

        # 3. Moderation action: create active event and cancel it
        start = timezone.now() + timedelta(days=2)
        end = start + timedelta(hours=3)
        ev_to_cancel = Events.objects.create(
            owner_id=self.coord.id,
            current_coordinator_id=self.coord.id,
            title="Event To Cancel",
            start_at=start,
            end_at=end,
            status="published",
        )
        payload_cancel = {
            "event_id": ev_to_cancel.id,
            "action": "event_cancel",
            "reason": "Cancelled by test",
        }
        res_cancel = self.client.post("/api/v1/admin/ui/events/", data=payload_cancel)
        self.assertEqual(res_cancel.status_code, status.HTTP_200_OK)
        self.assertIn("success_message", res_cancel.context)
        ev_to_cancel.refresh_from_db()
        self.assertEqual(ev_to_cancel.status, "cancelled")

    def test_geo_monitoring_view_shared_experience(self):
        self.client.force_authenticate(user=self.standard_admin)
        res_geo = self.client.get("/api/v1/admin/ui/geo-monitoring/")
        self.assertEqual(res_geo.status_code, status.HTTP_200_OK)
        self.assertEqual(res_geo.context.get("active_tab"), "events")
        self.assertIn("geo_map_json", res_geo.context)
        self.assertIn("geo_attempts", res_geo.context)

    def test_users_directory_view_filtering_and_inspection(self):
        self.client.force_authenticate(user=self.standard_admin)

        # 1. Base list view
        res = self.client.get("/api/v1/admin/ui/users/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.context.get("active_tab"), "users")
        self.assertIn("users_list", res.context)

        # 2. Filter tabs
        res_vol = self.client.get("/api/v1/admin/ui/users/?role=volunteers")
        self.assertEqual(res_vol.status_code, status.HTTP_200_OK)
        self.assertEqual(res_vol.context.get("role_filter"), "volunteers")

        res_coord = self.client.get("/api/v1/admin/ui/users/?role=coordinators")
        self.assertEqual(res_coord.status_code, status.HTTP_200_OK)
        self.assertEqual(res_coord.context.get("role_filter"), "coordinators")

        res_admins = self.client.get("/api/v1/admin/ui/users/?role=admins")
        self.assertEqual(res_admins.status_code, status.HTTP_200_OK)

        res_blocked = self.client.get("/api/v1/admin/ui/users/?role=blocked")
        self.assertEqual(res_blocked.status_code, status.HTTP_200_OK)

        # 3. Search query
        res_search = self.client.get("/api/v1/admin/ui/users/?q=VolunteerAPI")
        self.assertEqual(res_search.status_code, status.HTTP_200_OK)
        found_names = [u.display_name for u in res_search.context["users_list"]]
        self.assertIn("VolunteerAPI", found_names)

        # 4. User detail inspection
        res_detail = self.client.get(f"/api/v1/admin/ui/users/?user_id={self.vol.id}")
        self.assertEqual(res_detail.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res_detail.context.get("selected_user"))
        self.assertEqual(res_detail.context.get("selected_user").id, self.vol.id)
        self.assertIn("selected_images", res_detail.context)
        self.assertIn("selected_assignments", res_detail.context)
        self.assertIn("selected_attendance", res_detail.context)
        self.assertIn("selected_moderations", res_detail.context)

    def test_users_directory_moderation_and_image_review_post(self):
        from apps.accounts.models import UserVerificationImages
        from apps.audit.models import ModerationActions

        self.client.force_authenticate(user=self.super_admin)

        # 1. Moderation action POST
        mod_payload = {
            "action": "moderation_action",
            "action_type": "user_warning",
            "target_user_id": self.vol.id,
            "reason": "Test warning issued from admin portal",
        }
        res_mod = self.client.post("/api/v1/admin/ui/users/", data=mod_payload)
        self.assertEqual(res_mod.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res_mod.context.get("success_message"))
        self.assertTrue(
            ModerationActions.objects.filter(
                target_user_id=self.vol.id,
                action_type="user_warning",
            ).exists()
        )

        # 2. Image review POST
        vimg = UserVerificationImages.objects.create(
            user=self.vol,
            image_type="id_license",
            image_path="verification/test_license.jpg",
            file_format="jpeg",
            status="pending",
        )
        img_payload = {
            "action": "review_image",
            "image_id": vimg.id,
            "decision": "approved",
            "review_note": "Verified by super admin test",
        }
        res_img = self.client.post("/api/v1/admin/ui/users/", data=img_payload)
        self.assertEqual(res_img.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res_img.context.get("success_message"))
        vimg.refresh_from_db()
        self.assertEqual(vimg.status, "approved")

    def test_user_provision_view_access_and_super_admin_provisioning(self):
        from apps.coordination.models import CoordinatorProfiles

        # 1. Standard admin (non-superuser) is blocked (404 masked)
        self.client.force_authenticate(user=self.standard_admin)
        res_std = self.client.get("/api/v1/admin/ui/user-create/")
        self.assertEqual(res_std.status_code, status.HTTP_404_NOT_FOUND)

        # 2. Super admin gets provision page
        self.client.force_authenticate(user=self.super_admin)
        res_get = self.client.get("/api/v1/admin/ui/user-create/")
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)
        self.assertEqual(res_get.context.get("active_tab"), "user_create")
        self.assertIn("recent_provisioned_users", res_get.context)
        self.assertIn("eligible_volunteers", res_get.context)

        # 3. Super admin provisions a regular volunteer with Myanmar phone
        prov_vol_payload = {
            "form_action": "provision_user",
            "phone": "09778899001",
            "display_name": "Provisioned Volunteer User",
            "password": "VolPassword123!",
            "assign_role": "volunteer",
            "verification_status": "verified",
            "blood_type": "B+",
            "home_area": "Hlaing, Yangon",
            "skills": "first aid, translation, logistics",
        }
        res_prov_vol = self.client.post("/api/v1/admin/ui/user-create/", data=prov_vol_payload)
        self.assertEqual(res_prov_vol.status_code, status.HTTP_200_OK)
        self.assertIn("success_message", res_prov_vol.context)

        new_vol = Users.objects.filter(display_name="Provisioned Volunteer User").first()
        self.assertIsNotNone(new_vol)
        self.assertEqual(new_vol.blood_type, "B+")
        self.assertEqual(new_vol.home_area, "Hlaing, Yangon")
        self.assertIn("first aid", new_vol.skills)
        self.assertTrue(new_vol.check_password("VolPassword123!"))

        # 4. Super admin provisions an immediately approved coordinator
        prov_coord_payload = {
            "form_action": "provision_user",
            "phone": "+959778899002",
            "display_name": "Immediate Approved Coordinator",
            "password": "CoordPassword123!",
            "assign_role": "coordinator",
            "notes": "Directly provisioned lead coordinator",
        }
        res_prov_coord = self.client.post("/api/v1/admin/ui/user-create/", data=prov_coord_payload)
        self.assertEqual(res_prov_coord.status_code, status.HTTP_200_OK)
        self.assertIn("success_message", res_prov_coord.context)

        new_coord_user = Users.objects.filter(display_name="Immediate Approved Coordinator").first()
        self.assertIsNotNone(new_coord_user)
        coord_profile = CoordinatorProfiles.objects.filter(user=new_coord_user).first()
        self.assertIsNotNone(coord_profile)
        self.assertEqual(coord_profile.status, "approved")
        self.assertEqual(coord_profile.approved_by_id, self.super_admin.id)

        # 5. Promote existing volunteer to coordinator
        promote_payload = {
            "form_action": "promote_coordinator",
            "target_user_id": new_vol.id,
            "notes": "Promoted to coordinator in testing",
        }
        res_promote = self.client.post("/api/v1/admin/ui/user-create/", data=promote_payload)
        self.assertEqual(res_promote.status_code, status.HTTP_200_OK)
        self.assertIn("success_message", res_promote.context)

        promoted_profile = CoordinatorProfiles.objects.filter(user=new_vol).first()
        self.assertIsNotNone(promoted_profile)
        self.assertEqual(promoted_profile.status, "approved")
        self.assertEqual(promoted_profile.approved_by_id, self.super_admin.id)

    def test_coordinator_board_view_upgraded_and_actions(self):
        from apps.coordination.models import CoordinatorProfiles
        from apps.audit.models import Feedback
        from services import coordinator_service, feedback_service

        self.client.force_authenticate(user=self.super_admin)

        # 1. GET coordinator board
        res = self.client.get("/api/v1/admin/ui/coordinators/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.context.get("active_tab"), "coordinators")
        self.assertIn("pending_coordinators", res.context)
        self.assertIn("approved_coordinators", res.context)
        self.assertIn("suspended_coordinators", res.context)
        self.assertIn("complaints_and_alerts", res.context)
        self.assertIn("handover_history", res.context)

        # 2. POST action: suspend coordinator
        test_coord = _make_coordinator(self.super_admin, "ToSuspendCoord")
        res_suspend = self.client.post(
            "/api/v1/admin/ui/coordinators/",
            data={"action": "suspend_coordinator", "target_user_id": test_coord.id, "notes": "Under investigation"},
        )
        self.assertEqual(res_suspend.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res_suspend.context.get("success_message"))
        cp_suspended = CoordinatorProfiles.objects.get(user_id=test_coord.id)
        self.assertEqual(cp_suspended.status, "suspended")

        # 3. POST action: reactivate (approve) coordinator
        res_reactivate = self.client.post(
            "/api/v1/admin/ui/coordinators/",
            data={"action": "approve_coordinator", "target_user_id": test_coord.id, "notes": "Reinstated by admin"},
        )
        self.assertEqual(res_reactivate.status_code, status.HTTP_200_OK)
        cp_reactivated = CoordinatorProfiles.objects.get(user_id=test_coord.id)
        self.assertEqual(cp_reactivated.status, "approved")

        # 4. POST action: hide low-score feedback from board
        low_fb = feedback_service.submit_event_feedback(
            self.vol,
            self.event.id,
            "volunteer_to_coordinator",
            score=1,
            comment="Terrible coordination experience",
        )
        res_hide = self.client.post(
            "/api/v1/admin/ui/coordinators/",
            data={"action": "hide_feedback", "feedback_id": low_fb.id, "reason": "Abusive content hidden"},
        )
        self.assertEqual(res_hide.status_code, status.HTTP_200_OK)
        low_fb.refresh_from_db()
        self.assertEqual(low_fb.status, "hidden")

    def test_feedback_intelligence_view_analytics_filtering_and_moderation(self):
        from apps.audit.models import Feedback

        self.client.force_authenticate(user=self.standard_admin)

        # 1. Base view and analytics strip
        res = self.client.get("/api/v1/admin/ui/feedback/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.context.get("active_tab"), "feedback")
        analytics = res.context.get("analytics")
        self.assertIsNotNone(analytics)
        self.assertIn("avg_score", analytics)
        self.assertIn("total_reviews", analytics)
        self.assertIn("total_active", analytics)
        self.assertIn("total_hidden", analytics)
        self.assertIn("low_score_count", analytics)
        self.assertIn("by_direction", analytics)
        self.assertIn("feedbacks", res.context)
        self.assertIn("events_list", res.context)

        # 2. Filters
        res_filtered = self.client.get("/api/v1/admin/ui/feedback/?direction=volunteer_to_event&score=5&status=active")
        self.assertEqual(res_filtered.status_code, status.HTTP_200_OK)
        self.assertEqual(res_filtered.context.get("filter_direction"), "volunteer_to_event")
        self.assertEqual(res_filtered.context.get("filter_score"), "5")
        self.assertEqual(res_filtered.context.get("filter_status"), "active")

        # 3. POST moderation action: hide feedback
        res_hide = self.client.post(
            "/api/v1/admin/ui/feedback/",
            data={"action": "feedback_hide", "feedback_id": self.feedback.id, "reason": "Hidden in feedback view test"},
        )
        self.assertEqual(res_hide.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res_hide.context.get("success_message"))
        self.feedback.refresh_from_db()
        self.assertEqual(self.feedback.status, "hidden")

    def test_super_admin_provision_user_and_immediate_coordinator(self):
        from apps.coordination.models import CoordinatorProfiles

        self.client.force_authenticate(user=self.super_admin)
        payload = {
            "form_action": "provision_user",
            "phone": "+9509991234567",  # variant +9509
            "display_name": "TriggerGuardSafeCoord",
            "password": "Password123!",
            "assign_role": "coordinator",
            "notes": "Provisioned without trigger violation",
        }
        res = self.client.post("/api/v1/admin/ui/user-create/", data=payload)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res.context.get("success_message"))

        user = Users.objects.filter(display_name="TriggerGuardSafeCoord").first()
        self.assertIsNotNone(user)
        self.assertEqual(user.verification_status, "verified")

        profile = CoordinatorProfiles.objects.filter(user=user).first()
        self.assertIsNotNone(profile)
        self.assertEqual(profile.status, "approved")
        self.assertEqual(profile.approved_by_id, self.super_admin.id)

    def test_admin_settings_change_phone_and_password(self):
        from apps.audit.models import AuditLogs
        from common.security import compute_phone_hash, decrypt_phone

        self.client.force_authenticate(user=self.super_admin)

        # 1. Base view GET
        res_get = self.client.get("/api/v1/admin/ui/settings/")
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)
        self.assertEqual(res_get.context.get("active_tab"), "settings")
        self.assertIn("all_users", res_get.context)
        self.assertIn("app_settings", res_get.context)

        # 2. Change own password
        res_pw = self.client.post(
            "/api/v1/admin/ui/settings/",
            data={
                "form_action": "change_own_password",
                "new_password": "NewSuperAdminPass123!",
                "confirm_password": "NewSuperAdminPass123!",
            },
        )
        self.assertEqual(res_pw.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res_pw.context.get("success_message"))
        self.super_admin.refresh_from_db()
        self.assertTrue(self.super_admin.check_password("NewSuperAdminPass123!"))

        # 3. Reset user password
        res_reset = self.client.post(
            "/api/v1/admin/ui/settings/",
            data={
                "form_action": "reset_user_password",
                "target_user_id": self.vol.id,
                "new_password": "NewVolPassword456!",
            },
        )
        self.assertEqual(res_reset.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res_reset.context.get("success_message"))
        self.vol.refresh_from_db()
        self.assertTrue(self.vol.check_password("NewVolPassword456!"))

        # 4. Change user phone number (with Myanmar normalization, hash, and encryption)
        new_phone_input = "09999888777"
        expected_canonical = "+959999888777"
        expected_hash = compute_phone_hash(expected_canonical)

        res_phone = self.client.post(
            "/api/v1/admin/ui/settings/",
            data={
                "form_action": "change_user_phone",
                "target_user_id": self.vol.id,
                "new_phone": new_phone_input,
            },
        )
        self.assertEqual(res_phone.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res_phone.context.get("success_message"))

        self.vol.refresh_from_db()
        self.assertEqual(self.vol.phone_hash, expected_hash)
        self.assertEqual(decrypt_phone(self.vol.phone_enc), expected_canonical)

        # Audit log verified
        self.assertTrue(
            AuditLogs.objects.filter(
                entity_id=self.vol.id,
                action="admin.user_phone_changed",
            ).exists()
        )

        # 5. Run maintenance routines (Super Admin)
        res_maint = self.client.post(
            "/api/v1/admin/ui/settings/",
            data={"form_action": "run_maintenance"},
        )
        self.assertEqual(res_maint.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res_maint.context.get("maintenance_result"))
        self.assertIn("released_expired_blocks", res_maint.context["maintenance_result"])
        self.assertIn("expired_stale_applications", res_maint.context["maintenance_result"])
        self.assertIn("purged_expired_otps", res_maint.context["maintenance_result"])
        self.assertIn("purged_geo_evidence", res_maint.context["maintenance_result"])

    def test_users_directory_block_with_empty_and_valid_expires_at(self):
        from apps.audit.models import ModerationActions

        self.client.force_authenticate(user=self.super_admin)
        target = _make_user("BlockTargetUser")

        # 1. Moderation action with empty expires_at (should not raise DomainError, treated as None)
        payload_empty = {
            "action": "moderation_action",
            "action_type": "user_block",
            "target_user_id": target.id,
            "reason": "Test block permanent",
            "expires_at": "",
        }
        res_empty = self.client.post("/api/v1/admin/ui/users/", data=payload_empty)
        self.assertEqual(res_empty.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res_empty.context.get("success_message"))
        action_row = ModerationActions.objects.filter(target_user_id=target.id, action_type="user_block").first()
        self.assertIsNotNone(action_row)
        self.assertIsNone(action_row.expires_at)

        # 2. Moderation action with valid ISO expires_at
        exp_iso = (timezone.now() + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S")
        target2 = _make_user("BlockTargetUser2")
        payload_valid = {
            "action": "moderation_action",
            "action_type": "user_block",
            "target_user_id": target2.id,
            "reason": "Test block 7 days",
            "expires_at": exp_iso,
        }
        res_valid = self.client.post("/api/v1/admin/ui/users/", data=payload_valid)
        self.assertEqual(res_valid.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res_valid.context.get("success_message"))
        action_row2 = ModerationActions.objects.filter(target_user_id=target2.id, action_type="user_block").first()
        self.assertIsNotNone(action_row2)
        self.assertIsNotNone(action_row2.expires_at)

        # 3. Moderation action with invalid date format
        target3 = _make_user("BlockTargetUser3")
        payload_invalid = {
            "action": "moderation_action",
            "action_type": "user_block",
            "target_user_id": target3.id,
            "reason": "Test block bad date",
            "expires_at": "not-a-date",
        }
        res_invalid = self.client.post("/api/v1/admin/ui/users/", data=payload_invalid)
        self.assertEqual(res_invalid.status_code, status.HTTP_200_OK)
        self.assertIn("error_message", res_invalid.context)
        self.assertIn("Invalid expiry date/time format", res_invalid.context["error_message"])

    def test_standard_admin_cannot_reset_super_admin_password_or_phone(self):
        self.client.force_authenticate(user=self.standard_admin)

        # 1. Standard admin tries to reset super admin password
        res_pw = self.client.post(
            "/api/v1/admin/ui/settings/",
            data={
                "form_action": "reset_user_password",
                "target_user_id": self.super_admin.id,
                "new_password": "HackedPassword123!",
            },
        )
        self.assertEqual(res_pw.status_code, status.HTTP_200_OK)
        self.assertIn("error_message", res_pw.context)
        self.assertIn("Only a Super Admin can modify a Super Admin account", res_pw.context["error_message"])

        # 2. Standard admin tries to change super admin phone
        res_phone = self.client.post(
            "/api/v1/admin/ui/settings/",
            data={
                "form_action": "change_user_phone",
                "target_user_id": self.super_admin.id,
                "new_phone": "09112233445",
            },
        )
        self.assertEqual(res_phone.status_code, status.HTTP_200_OK)
        self.assertIn("error_message", res_phone.context)
        self.assertIn("Only a Super Admin can modify a Super Admin account", res_phone.context["error_message"])

    def test_user_provision_prevents_self_coordinator_promotion(self):
        self.client.force_authenticate(user=self.super_admin)

        # Attempting self-approval should be rejected
        res = self.client.post(
            "/api/v1/admin/ui/user-create/",
            data={
                "form_action": "promote_coordinator",
                "target_user_id": self.super_admin.id,
                "notes": "Trying to self-approve",
            },
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("error_message", res.context)
        self.assertIn("You cannot self-approve your own account", res.context["error_message"])

    def test_map_catalog_and_self_hosted_tile_server(self):
        # Calls GET /api/v1/maps/catalog/ -> verifies asean_macro and all 7 Myanmar regions
        res = self.client.get("/api/v1/maps/catalog/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertIn("regions", data)
        self.assertTrue("asean_macro" in data or "asean_macro" in data.get("macro", {}).get("code", ""))

        for expected_reg in [
            "yangon",
            "mandalay",
            "naypyidaw",
            "shan",
            "ayeyarwady",
            "bagan_magway",
            "mawlamyine_south",
        ]:
            self.assertIn(expected_reg, data["regions"])

        # Calls GET /api/v1/maps/tiles/12/3142/1880.png?offline=1
        tile_res = self.client.get("/api/v1/maps/tiles/12/3142/1880.png?offline=1")
        self.assertEqual(tile_res.status_code, status.HTTP_200_OK)
        self.assertIn(tile_res.headers.get("X-Map-Tile-Source"), ["local_mbtiles", "offline_svg_fallback"])
        self.assertEqual(tile_res.headers.get("Cache-Control"), "public, max-age=2592000")

    def test_map_region_download_supports_http_range_206(self):
        # Calls GET /api/v1/maps/regions/yangon/download/ with HTTP_RANGE="bytes=0-127"
        res = self.client.get("/api/v1/maps/regions/yangon/download/", HTTP_RANGE="bytes=0-127")
        self.assertEqual(res.status_code, status.HTTP_206_PARTIAL_CONTENT)
        self.assertEqual(res.headers.get("Accept-Ranges"), "bytes")
        self.assertIn("Content-Range", res.headers)
        self.assertTrue(res.headers.get("Content-Range").startswith("bytes 0-127/"))
        self.assertEqual(len(res.content), 128)

    def test_sync_offline_maps_command(self):
        from django.core.management import call_command
        from common.map_engine import get_map_catalog_status

        call_command("sync_offline_maps", region="yangon", offline_seed=True)
        catalog = get_map_catalog_status()
        self.assertGreater(catalog["total_cached_tiles"], 0)
        self.assertGreaterEqual(catalog["region_distribution"].get("yangon", 0), 1)

    def test_templates_use_self_hosted_vcs_map_engine_and_not_direct_osm(self):
        from pathlib import Path
        from django.conf import settings

        template_dir = Path(settings.BASE_DIR) / "admin_portal" / "templates" / "admin_portal"
        map_templates = [
            "dashboard.html",
            "event_create.html",
            "events_detail.html",
            "geo_monitoring.html",
        ]

        for tmpl in map_templates:
            content = (template_dir / tmpl).read_text(encoding="utf-8")
            self.assertNotIn("tile.openstreetmap.org", content, f"{tmpl} should not hit tile.openstreetmap.org")
            self.assertIn("window.VCSMapEngine.attachTileLayer", content, f"{tmpl} should use VCSMapEngine")

        base_admin = (template_dir / "base_admin.html").read_text(encoding="utf-8")
        self.assertIn("window.VCSMapEngine", base_admin)
        self.assertIn("attachTileLayer", base_admin)
        self.assertIn("attachRegionControl", base_admin)

    def test_settings_sync_offline_maps_post_action(self):
        self.client.force_authenticate(user=self.super_admin)

        # 1. HTML form submission
        res = self.client.post(
            "/api/v1/admin/ui/settings/",
            data={
                "form_action": "sync_offline_maps",
                "region_code": "yangon",
                "fetch_remote": "0",
            },
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("success_message", res.context)
        self.assertIn("Map pack 'yangon' synchronized", res.context["success_message"])
        self.assertIn("map_catalog", res.context)

        # 2. JSON API request
        res_json = self.client.post(
            "/api/v1/admin/ui/settings/",
            data={
                "form_action": "sync_offline_maps",
                "region_code": "yangon",
                "fetch_remote": "0",
            },
            HTTP_ACCEPT="application/json",
        )
        self.assertEqual(res_json.status_code, status.HTTP_200_OK)
        data = res_json.json()
        self.assertEqual(data.get("status"), "ok")
        self.assertIn("synchronized", data.get("message", ""))






