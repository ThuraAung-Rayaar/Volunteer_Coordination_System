"""
Unit tests for Phase 2: Serializers and Query Parsing (T0 / T2).
"""

from decimal import Decimal
from django.test import TestCase
from django.utils import timezone

from apps.events.models import CharityFields
from bff.volunteer.serializers import (
    CharityFieldSerializer,
    PublicEventDetailSerializer,
    PublicEventPostSerializer,
    PublicEventSerializer,
)
from common.exceptions import DomainError
from services.query_service import _parse_bool, _parse_datetime


class CharityFieldSerializerTests(TestCase):
    def test_serializer_fields(self):
        item = CharityFields(code="environment", label="Environmental Conservation", sort_order=10, active=True)
        serializer = CharityFieldSerializer(item)
        self.assertEqual(serializer.data["code"], "environment")
        self.assertEqual(serializer.data["label"], "Environmental Conservation")
        self.assertEqual(serializer.data["sort_order"], 10)
        self.assertNotIn("active", serializer.data)


class PublicEventDetailSerializerTests(TestCase):
    def setUp(self):
        self.sample_data = {
            "id": 42,
            "title": "Yangon Riverside Cleanup",
            "description": "Cleaning trash along the riverbanks.",
            "purpose_type": "charity_event",
            "location_name": "Botahtaung Jetty",
            "landmark_text": "Near Jetty 3",
            "latitude": Decimal("16.765400"),
            "longitude": Decimal("96.165400"),
            "geo_radius_m": 150,
            "geo_checkin_enabled": True,
            "map_provider": "openstreetmap",
            "start_at": timezone.now(),
            "end_at": timezone.now(),
            "application_deadline": timezone.now(),
            "status": "published",
            "acceptance_mode": "manual",
            "max_participants": 20,
            "meals_provided": True,
            "lodging_provided": False,
            "travel_support_provided": False,
            "compensation_kind": "unpaid",
            "coordinator_name": "Daw Hla",
            "charity_fields": ["environment", "community"],
            "spots_remaining": 15,
            "posts": [
                {
                    "id": 101,
                    "title": "Trash Collector",
                    "description": "Collects plastic bottles",
                    "status": "open",
                    "physical_level": "medium",
                    "required_skills": ["endurance"],
                    "leader_needed": False,
                    "new_volunteers_allowed": True,
                    "required_headcount": 10,
                    "assigned_count": 2,
                    "remaining": 8,
                }
            ],
            # T2 semi-private data
            "onboarding_text": "Please bring protective gloves and arrive 15 minutes early.",
            "onboarding_version": 2,
            "compensation_note": "Bottled water and certificates provided on site.",
        }

    def test_t2_fields_masked_when_unauthorized(self):
        """When can_access_t2 is False, T2 fields are completely excluded from representation."""
        serializer = PublicEventDetailSerializer(self.sample_data, context={"can_access_t2": False})
        data = serializer.data
        self.assertNotIn("onboarding_text", data)
        self.assertNotIn("onboarding_version", data)
        self.assertNotIn("compensation_note", data)
        self.assertIn("id", data)
        self.assertIn("title", data)
        self.assertIn("posts", data)
        self.assertEqual(len(data["posts"]), 1)

    def test_t2_fields_included_when_authorized(self):
        """When can_access_t2 is True, T2 fields are present in the serialized output."""
        serializer = PublicEventDetailSerializer(self.sample_data, context={"can_access_t2": True})
        data = serializer.data
        self.assertIn("onboarding_text", data)
        self.assertEqual(data["onboarding_text"], "Please bring protective gloves and arrive 15 minutes early.")
        self.assertEqual(data["onboarding_version"], 2)
        self.assertEqual(data["compensation_note"], "Bottled water and certificates provided on site.")


class QueryServiceParserUnitTests(TestCase):
    def test_parse_bool_valid(self):
        self.assertTrue(_parse_bool("true", "param"))
        self.assertTrue(_parse_bool("True", "param"))
        self.assertTrue(_parse_bool("1", "param"))
        self.assertTrue(_parse_bool("yes", "param"))
        self.assertFalse(_parse_bool("false", "param"))
        self.assertFalse(_parse_bool("0", "param"))
        self.assertFalse(_parse_bool("no", "param"))

    def test_parse_bool_invalid_raises_domain_error(self):
        with self.assertRaises(DomainError) as ctx:
            _parse_bool("invalid_bool", "meals_provided")
        self.assertEqual(ctx.exception.code, "invalid_filter")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_parse_datetime_valid(self):
        dt_str = "2026-12-01T10:00:00Z"
        parsed = _parse_datetime(dt_str, "starts_after")
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed.year, 2026)
        self.assertEqual(parsed.month, 12)

    def test_parse_datetime_invalid_raises_domain_error(self):
        with self.assertRaises(DomainError) as ctx:
            _parse_datetime("not-a-datetime", "starts_after")
        self.assertEqual(ctx.exception.code, "invalid_filter")
        self.assertEqual(ctx.exception.status_code, 400)

