"""
Unit tests for Phase 5: Event Lifecycle, Posts & Coordinator Management.

Focus:
- Serializer input validation (EventCreateSerializer, EventUpdateSerializer, EventPostCreateSerializer).
- Validation rules (end_at > start_at, deadline <= start_at, headcount >= 1).
- Allow-list field filtering.
- Taxonomy tag / charity code deduplication in _replace_charity_fields.
"""
from datetime import timedelta
from unittest import TestCase

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from bff.coordinator.serializers import (
    CancelEventSerializer,
    CoordinatorHandoverSerializer,
    EventCreateSerializer,
    EventPostCreateSerializer,
    EventPostUpdateSerializer,
    EventUpdateSerializer,
    HandoverSerializer,
    RetakeSerializer,
)
from common.exceptions import DomainError
from services.event_service import EVENT_CREATE_FIELDS, EVENT_UPDATE_FIELDS
from services.event_post_service import POST_EDITABLE_FIELDS, _validate_post_data


class EventSerializerUnitTests(TestCase):
    def test_create_serializer_valid_dates(self):
        now = timezone.now()
        data = {
            "title": "Community Planting",
            "start_at": now + timedelta(days=5),
            "end_at": now + timedelta(days=5, hours=3),
            "application_deadline": now + timedelta(days=4),
            "charity_field_codes": ["gardening", "environment"],
        }
        s = EventCreateSerializer(data=data)
        self.assertTrue(s.is_valid(), s.errors)

    def test_create_serializer_end_before_start_fails(self):
        now = timezone.now()
        data = {
            "title": "Bad Dates",
            "start_at": now + timedelta(days=5),
            "end_at": now + timedelta(days=5) - timedelta(hours=1),
        }
        s = EventCreateSerializer(data=data)
        self.assertFalse(s.is_valid())
        self.assertIn("end_at", s.errors)

    def test_create_serializer_deadline_after_start_fails(self):
        now = timezone.now()
        data = {
            "title": "Late Deadline",
            "start_at": now + timedelta(days=5),
            "end_at": now + timedelta(days=5, hours=3),
            "application_deadline": now + timedelta(days=6),  # deadline after start
        }
        s = EventCreateSerializer(data=data)
        self.assertFalse(s.is_valid())
        self.assertIn("application_deadline", s.errors)

    def test_create_serializer_geo_radius_bounds(self):
        now = timezone.now()
        base = {
            "title": "Geo Test",
            "start_at": now + timedelta(days=1),
            "end_at": now + timedelta(days=1, hours=2),
        }
        # Radius < 20m invalid
        s1 = EventCreateSerializer(data={**base, "geo_radius_m": 15})
        self.assertFalse(s1.is_valid())
        self.assertIn("geo_radius_m", s1.errors)

        # Radius > 5000m invalid
        s2 = EventCreateSerializer(data={**base, "geo_radius_m": 6000})
        self.assertFalse(s2.is_valid())
        self.assertIn("geo_radius_m", s2.errors)

        # Radius 100m valid
        s3 = EventCreateSerializer(data={**base, "geo_radius_m": 100})
        self.assertTrue(s3.is_valid())

    def test_event_update_serializer_fields(self):
        s = EventUpdateSerializer(data={
            "title": "Updated Title",
            "onboarding_text": "New orientation instructions",
            "require_onboarding_ack": True,
        })
        self.assertTrue(s.is_valid(), s.errors)

    def test_handover_and_retake_serializers(self):
        h = CoordinatorHandoverSerializer(data={"new_coordinator_user_id": 42, "reason": "Medical leave"})
        self.assertTrue(h.is_valid(), h.errors)
        self.assertEqual(h.validated_data["new_coordinator_user_id"], 42)

        r = RetakeSerializer(data={"reason": "Back on duty"})
        self.assertTrue(r.is_valid(), r.errors)

        c = CancelEventSerializer(data={"reason": "Weather conditions"})
        self.assertTrue(c.is_valid(), c.errors)


class EventPostSerializerUnitTests(TestCase):
    def test_post_create_valid(self):
        s = EventPostCreateSerializer(data={
            "title": "Site Coordinator Assistant",
            "required_headcount": 4,
            "physical_level": "medium",
            "required_skills": ["leadership", "first_aid"],
            "leader_needed": True,
        })
        self.assertTrue(s.is_valid(), s.errors)

    def test_post_create_invalid_headcount(self):
        s = EventPostCreateSerializer(data={
            "title": "Zero Staff",
            "required_headcount": 0,
        })
        self.assertFalse(s.is_valid())
        self.assertIn("required_headcount", s.errors)

    def test_post_create_invalid_physical_level(self):
        s = EventPostCreateSerializer(data={
            "title": "Heavy Lift",
            "required_headcount": 2,
            "physical_level": "extreme",
        })
        self.assertFalse(s.is_valid())
        self.assertIn("physical_level", s.errors)

    def test_post_update_serializer_valid(self):
        s = EventPostUpdateSerializer(data={
            "title": "New Title",
            "required_headcount": 5,
        })
        self.assertTrue(s.is_valid(), s.errors)


class PostServiceValidationUnitTests(TestCase):
    def test_validate_post_data_skill_normalization(self):
        raw = {
            "title": "Medic",
            "required_skills": ["  FIRST AID ", "triage", "FIRST AID  "],
        }
        cleaned = _validate_post_data(raw)
        self.assertEqual(cleaned["required_skills"], ["first aid", "triage"])

    def test_validate_post_data_unknown_field_rejected(self):
        raw = {"title": "Medic", "unknown_secret_flag": True}
        with self.assertRaises(DomainError) as ctx:
            _validate_post_data(raw)
        self.assertEqual(ctx.exception.code, "field_not_allowed")

