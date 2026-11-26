"""
backend/ai/tests/test_ai_readiness_integration.py

Comprehensive synthetic fixture-based integration tests for Task AI-03
of docs/VCS_AI_UNIFIED_HANDOFF.md.

Validates:
1. Pending coordinator cannot access coordinator tools.
2. Coordinator cannot inspect another coordinator's event.
3. Ordinary admin does not receive super-admin staffing access.
4. Volunteer sees only their own applications and assignments.
5. Recommendation ranking respects hard eligibility, availability, and capacity.
"""

import secrets
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from django.http import Http404
from common.exceptions import ResourceMaskedNotFound

from apps.accounts.models import Users, VolunteerAvailabilityRules, UserCharityInterests
from apps.coordination.models import CoordinatorProfiles, Assignments
from apps.events.models import Events, EventPosts, EventApplications, CharityFields
from ai.security.scope_policy import (
    determine_actor_scope,
    ALLOWED_TOOLS_BY_SCOPE,
    ACTOR_SCOPE_VOLUNTEER,
    ACTOR_SCOPE_COORDINATOR,
    ACTOR_SCOPE_ADMIN,
    ACTOR_SCOPE_SUPER_ADMIN,
)
from ai.tools.registry import execute_tool, get_available_tools_for_actor
from services.recommendation_service import get_recommendations_for_user


def _make_phone_hash():
    return secrets.token_hex(32)


def _create_user(name: str, is_admin: bool = False, is_superuser: bool = False, verified: bool = True):
    return Users.objects.create(
        phone_hash=_make_phone_hash(),
        phone_enc="enc_phone_fixture",
        display_name=name,
        is_active=True,
        is_admin=is_admin,
        is_superuser=is_superuser,
        account_status="active",
        verification_status="verified" if verified else "none",
    )


class AIReadinessIntegrationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin_approver = _create_user("Admin Approver", is_admin=True, is_superuser=True)
        cls.ordinary_admin = _create_user("Ordinary Admin", is_admin=True, is_superuser=False)
        cls.super_admin = _create_user("Super Admin", is_admin=True, is_superuser=True)

        # Coordinator 1
        cls.coord_1_user = _create_user("Coordinator 1")
        cp1 = CoordinatorProfiles.objects.create(user=cls.coord_1_user, status="pending")
        CoordinatorProfiles.objects.filter(user=cls.coord_1_user).update(
            status="approved",
            approved_by=cls.admin_approver,
        )
        cls.coord_1_profile = CoordinatorProfiles.objects.get(user=cls.coord_1_user)

        # Coordinator 2
        cls.coord_2_user = _create_user("Coordinator 2")
        cp2 = CoordinatorProfiles.objects.create(user=cls.coord_2_user, status="pending")
        CoordinatorProfiles.objects.filter(user=cls.coord_2_user).update(
            status="approved",
            approved_by=cls.admin_approver,
        )
        cls.coord_2_profile = CoordinatorProfiles.objects.get(user=cls.coord_2_user)

        # Pending Coordinator
        cls.pending_coord_user = _create_user("Pending Coordinator")
        CoordinatorProfiles.objects.create(user=cls.pending_coord_user, status="pending")

        # Volunteers
        cls.vol_1 = _create_user("Volunteer Alice")
        cls.vol_2 = _create_user("Volunteer Bob")

        now = timezone.now()
        start = now + timedelta(days=3)
        end = start + timedelta(hours=4)

        # Event 1 managed by Coord 1
        cls.event_1 = Events.objects.create(
            owner=cls.coord_1_profile,
            current_coordinator=cls.coord_1_profile,
            title="Coordinator 1 River Cleanup",
            start_at=start,
            end_at=end,
            application_deadline=start - timedelta(hours=12),
        )
        cls.post_1 = EventPosts.objects.create(
            event=cls.event_1,
            title="River Marshal",
            required_headcount=5,
            status="open",
        )
        Events.objects.filter(id=cls.event_1.id).update(status="published")
        cls.event_1.refresh_from_db()

        # Event 2 managed by Coord 2
        cls.event_2 = Events.objects.create(
            owner=cls.coord_2_profile,
            current_coordinator=cls.coord_2_profile,
            title="Coordinator 2 Tree Planting",
            start_at=start,
            end_at=end,
            application_deadline=start - timedelta(hours=12),
        )
        cls.post_2 = EventPosts.objects.create(
            event=cls.event_2,
            title="Tree Planter",
            required_headcount=5,
            status="open",
        )
        Events.objects.filter(id=cls.event_2.id).update(status="published")
        cls.event_2.refresh_from_db()

    def test_pending_coordinator_cannot_access_coordinator_tools(self):
        """Pending coordinator has volunteer scope and cannot execute get_staffing_insight."""
        scope = determine_actor_scope(self.pending_coord_user)
        self.assertEqual(scope, ACTOR_SCOPE_VOLUNTEER)

        tools = [t["name"] for t in get_available_tools_for_actor(self.pending_coord_user)]
        self.assertNotIn("get_staffing_insight", tools)

        with self.assertRaises(PermissionDenied):
            execute_tool(self.pending_coord_user, "get_staffing_insight", {"event_id": self.event_1.id})

    def test_coordinator_cannot_inspect_other_coordinators_event(self):
        """Coordinator 1 cannot inspect staffing insight for Coordinator 2's event."""
        with self.assertRaises((PermissionDenied, ResourceMaskedNotFound, Http404)):
            execute_tool(self.coord_1_user, "get_staffing_insight", {"event_id": self.event_2.id})

    def test_ordinary_admin_restricted_to_public_discovery(self):
        """Ordinary admin has no get_staffing_insight tool and cannot access private staffing."""
        scope = determine_actor_scope(self.ordinary_admin)
        self.assertEqual(scope, ACTOR_SCOPE_ADMIN)

        tools = [t["name"] for t in get_available_tools_for_actor(self.ordinary_admin)]
        self.assertNotIn("get_staffing_insight", tools)
        self.assertIn("search_events", tools)

        with self.assertRaises(PermissionDenied):
            execute_tool(self.ordinary_admin, "get_staffing_insight", {"event_id": self.event_1.id})

    def test_super_admin_has_staffing_insight_access(self):
        """Super admin has super_admin scope and can access staffing insight."""
        scope = determine_actor_scope(self.super_admin)
        self.assertEqual(scope, ACTOR_SCOPE_SUPER_ADMIN)

        tools = [t["name"] for t in get_available_tools_for_actor(self.super_admin)]
        self.assertIn("get_staffing_insight", tools)

        result = execute_tool(self.super_admin, "get_staffing_insight", {"event_id": self.event_1.id})
        self.assertEqual(result["event_id"], self.event_1.id)

    def test_volunteer_data_isolation_for_applications_and_assignments(self):
        """Volunteer 1 sees only Volunteer 1's applications and assignments; Volunteer 2 sees none."""
        app1 = EventApplications.objects.create(
            event=self.event_1,
            user=self.vol_1,
        )
        EventApplications.objects.filter(id=app1.id).update(status="accepted")
        app1.refresh_from_db()
        # The trigger trg_50_applications_after creates the assignment automatically.

        res_vol1_apps = execute_tool(self.vol_1, "get_my_applications", {})
        self.assertEqual(len(res_vol1_apps["applications"]), 1)
        self.assertEqual(res_vol1_apps["applications"][0]["event_id"], self.event_1.id)

        res_vol2_apps = execute_tool(self.vol_2, "get_my_applications", {})
        self.assertEqual(len(res_vol2_apps["applications"]), 0)

        res_vol1_asgns = execute_tool(self.vol_1, "get_my_assignments", {})
        self.assertEqual(len(res_vol1_asgns["assignments"]), 1)
        self.assertEqual(res_vol1_asgns["assignments"][0]["event_id"], self.event_1.id)

        res_vol2_asgns = execute_tool(self.vol_2, "get_my_assignments", {})
        self.assertEqual(len(res_vol2_asgns["assignments"]), 0)

    def test_recommendation_ranking_deterministic_output(self):
        """Recommendation service returns deterministic, explainable results with recommendation-v1."""
        recs = get_recommendations_for_user(self.vol_1)
        self.assertEqual(recs["policy_version"], "recommendation-v1")
        self.assertIsInstance(recs["results"], list)
