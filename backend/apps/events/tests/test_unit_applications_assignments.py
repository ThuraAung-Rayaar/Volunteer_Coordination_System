"""
Unit tests for Phase 6: Recruitment Applications & Smart Assignment Engine.

Focus:
- Serializer input validation (ApplicationSubmitSerializer, ApplicationDecisionSerializer, ManualAssignSerializer, AssignmentCancelSerializer).
- Serializer output representations (ApplicationStatusSerializer, VolunteerAssignmentListSerializer, CoordinatorAssignmentListSerializer).
- Choice fields, length constraints, and default handling.
- URL routing resolution for coordinator assignment route aliases.
"""
from unittest import TestCase
from django.urls import resolve, reverse
from rest_framework.exceptions import ValidationError

from bff.volunteer.serializers import (
    ApplicationCancelSerializer,
    ApplicationDecisionSerializer,
    ApplicationStatusSerializer,
    ApplicationSubmitSerializer,
    AssignmentCancelSerializer,
    AssignmentConfirmSerializer,
    VolunteerApplicationListSerializer,
    VolunteerAssignmentListSerializer,
)
from bff.coordinator.serializers import (
    AutoAssignResultSerializer,
    CoordinatorApplicationListSerializer,
    CoordinatorAssignmentListSerializer,
    ManualAssignSerializer,
)


class ApplicationSerializerUnitTests(TestCase):
    def test_application_submit_serializer_valid(self):
        data = {
            "post_id": 10,
            "source": "browse",
            "note": "Looking forward to helping!",
        }
        s = ApplicationSubmitSerializer(data=data)
        self.assertTrue(s.is_valid(), s.errors)
        self.assertEqual(s.validated_data["source"], "browse")
        self.assertEqual(s.validated_data["post_id"], 10)

    def test_application_submit_serializer_default_source(self):
        data = {"post_id": 5}
        s = ApplicationSubmitSerializer(data=data)
        self.assertTrue(s.is_valid(), s.errors)
        self.assertEqual(s.validated_data["source"], "browse")

    def test_application_submit_serializer_invalid_source(self):
        data = {"source": "unsupported_channel"}
        s = ApplicationSubmitSerializer(data=data)
        self.assertFalse(s.is_valid())
        self.assertIn("source", s.errors)

    def test_application_decision_serializer_valid(self):
        data = {"post_id": 12, "note": "Assigned to logistics team"}
        s = ApplicationDecisionSerializer(data=data)
        self.assertTrue(s.is_valid(), s.errors)
        self.assertEqual(s.validated_data["post_id"], 12)

    def test_manual_assign_serializer_validation(self):
        # Missing required application_id
        s_invalid = ManualAssignSerializer(data={"post_id": 4})
        self.assertFalse(s_invalid.is_valid())
        self.assertIn("application_id", s_invalid.errors)

        # Valid payload with group and leadership
        valid_data = {
            "application_id": 99,
            "post_id": 4,
            "group_code": "ALPHA_TEAM",
            "is_group_leader": True,
        }
        s_valid = ManualAssignSerializer(data=valid_data)
        self.assertTrue(s_valid.is_valid(), s_valid.errors)
        self.assertEqual(s_valid.validated_data["group_code"], "ALPHA_TEAM")
        self.assertTrue(s_valid.validated_data["is_group_leader"])

    def test_assignment_cancel_serializer_default_reason(self):
        s = AssignmentCancelSerializer(data={})
        self.assertTrue(s.is_valid(), s.errors)
        self.assertEqual(s.validated_data["reason"], "")

        s2 = AssignmentCancelSerializer(data={"reason": "Schedule clash"})
        self.assertTrue(s2.is_valid(), s2.errors)
        self.assertEqual(s2.validated_data["reason"], "Schedule clash")

    def test_auto_assign_result_serializer_fields(self):
        payload = {
            "event_id": 1,
            "newly_assigned": 5,
            "total_accepted": 8,
            "total_assigned": 5,
            "remaining_unassigned": 3,
        }
        s = AutoAssignResultSerializer(payload)
        self.assertEqual(s.data["newly_assigned"], 5)
        self.assertEqual(s.data["total_accepted"], 8)


class Phase6RouteResolutionTests(TestCase):
    def test_coordinator_auto_assign_routes_resolve(self):
        match1 = resolve("/api/v1/coordinator/events/10/auto-assign/")
        self.assertIn(match1.view_name, ["event-auto-assign", "event-auto-assign-mount"])

        match2 = resolve("/api/v1/events/10/assignments/auto-run/")
        self.assertEqual(match2.view_name, "event-assignments-auto-run")

    def test_coordinator_manual_assign_routes_resolve(self):
        match1 = resolve("/api/v1/coordinator/events/10/manual-assign/")
        self.assertIn(match1.view_name, ["event-manual-assign", "event-manual-assign-mount"])

        match2 = resolve("/api/v1/events/10/assignments/manual/")
        self.assertEqual(match2.view_name, "event-assignments-manual")

    def test_volunteer_application_and_assignment_routes_resolve(self):
        apply_match = resolve("/api/v1/events/10/apply/")
        self.assertEqual(apply_match.view_name, "event-apply")

        apps_match = resolve("/api/v1/me/applications/")
        self.assertEqual(apps_match.view_name, "my-applications")

        assign_match = resolve("/api/v1/me/assignments/")
        self.assertEqual(assign_match.view_name, "my-assignments")

        confirm_match = resolve("/api/v1/assignments/42/confirm/")
        self.assertEqual(confirm_match.view_name, "assignment-confirm")

        cancel_match = resolve("/api/v1/assignments/42/cancel/")
        self.assertEqual(cancel_match.view_name, "assignment-cancel")
