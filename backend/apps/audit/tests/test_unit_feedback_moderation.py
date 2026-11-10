from django.test import SimpleTestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from admin_portal.serializers import (
    BlockUserSerializer,
    FeedbackSubmitSerializer,
    HideFeedbackSerializer,
    ModerationActionSerializer,
    ReviewImageSerializer,
)


class UnitFeedbackModerationSerializerTests(SimpleTestCase):
    """Unit tests verifying serializer validations, boundaries, and AllowList enforcement."""

    def test_feedback_submit_valid(self):
        data = {
            "direction": "volunteer_to_event",
            "score": 5,
            "tags": ["helpful", "punctual"],
            "comment": "Outstanding organization",
            "target_user_id": None,
        }
        serializer = FeedbackSubmitSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["score"], 5)

    def test_feedback_submit_score_boundaries(self):
        # Boundary 1 and 5 are valid
        s1 = FeedbackSubmitSerializer(data={"direction": "volunteer_to_event", "score": 1})
        self.assertTrue(s1.is_valid())
        s5 = FeedbackSubmitSerializer(data={"direction": "volunteer_to_event", "score": 5})
        self.assertTrue(s5.is_valid())

        # Boundary violations: 0 and 6 are rejected
        s0 = FeedbackSubmitSerializer(data={"direction": "volunteer_to_event", "score": 0})
        self.assertFalse(s0.is_valid())
        self.assertIn("score", s0.errors)

        s6 = FeedbackSubmitSerializer(data={"direction": "volunteer_to_event", "score": 6})
        self.assertFalse(s6.is_valid())
        self.assertIn("score", s6.errors)

        # Non-integer / float rejected
        sf = FeedbackSubmitSerializer(data={"direction": "volunteer_to_event", "score": "excellent"})
        self.assertFalse(sf.is_valid())

    def test_feedback_submit_direction_choices(self):
        invalid = FeedbackSubmitSerializer(data={"direction": "volunteer_to_random", "score": 4})
        self.assertFalse(invalid.is_valid())
        self.assertIn("direction", invalid.errors)

    def test_feedback_submit_allow_list_rejection(self):
        # Undeclared fields must be rejected per BR-SEC-ALLOWLIST
        payload = {
            "direction": "volunteer_to_event",
            "score": 4,
            "injected_admin_override": True,
        }
        serializer = FeedbackSubmitSerializer(data=payload)
        self.assertFalse(serializer.is_valid())
        self.assertIn("injected_admin_override", str(serializer.errors))

    def test_moderation_action_serializer_valid(self):
        data = {
            "action_type": "user_warning",
            "target_user_id": 42,
            "reason": "Repeated late cancellation",
        }
        serializer = ModerationActionSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_moderation_action_choice_validation(self):
        data = {
            "action_type": "nuke_everything",
            "target_user_id": 42,
        }
        serializer = ModerationActionSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("action_type", serializer.errors)

    def test_moderation_action_allow_list_rejection(self):
        data = {
            "action_type": "user_block",
            "target_user_id": 42,
            "reason": "Fraudulent check-in",
            "is_superuser_override": True,
        }
        serializer = ModerationActionSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("is_superuser_override", str(serializer.errors))

    def test_hide_feedback_serializer_allow_list_and_required_reason(self):
        s_valid = HideFeedbackSerializer(data={"reason": "Contains offensive language"})
        self.assertTrue(s_valid.is_valid())

        # Allow-list rejection
        s_extra = HideFeedbackSerializer(data={"reason": "Valid", "bypass_audit": True})
        self.assertFalse(s_extra.is_valid())
        self.assertIn("bypass_audit", str(s_extra.errors))

    def test_block_user_serializer_valid_and_allow_list(self):
        s_valid = BlockUserSerializer(data={"reason": "Misconduct", "expires_at": timezone.now().isoformat()})
        self.assertTrue(s_valid.is_valid())

        s_extra = BlockUserSerializer(data={"reason": "Misconduct", "permanent_flag": True})
        self.assertFalse(s_extra.is_valid())
        self.assertIn("permanent_flag", str(s_extra.errors))

    def test_review_image_serializer_allow_list(self):
        s_valid = ReviewImageSerializer(data={"decision": "approved", "note": "Clear match"})
        self.assertTrue(s_valid.is_valid())

        s_extra = ReviewImageSerializer(data={"decision": "approved", "auto_approve": True})
        self.assertFalse(s_extra.is_valid())
        self.assertIn("auto_approve", str(s_extra.errors))

    def test_feedback_submit_rejects_from_user_id_tampering(self):
        """BR-PRIV-ANON: Submitting feedback must never allow specifying from_user_id."""
        payload = {
            "direction": "volunteer_to_event",
            "score": 5,
            "from_user_id": 12345,
        }
        serializer = FeedbackSubmitSerializer(data=payload)
        self.assertFalse(serializer.is_valid())
        self.assertIn("from_user_id", str(serializer.errors))


