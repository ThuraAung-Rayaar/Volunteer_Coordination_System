from rest_framework import serializers

from apps.accounts.models import UserVerificationImages


class ReviewImageSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approved", "rejected"])
    note = serializers.CharField(required=False, allow_blank=True, default="")
    comparison_status = serializers.ChoiceField(
        choices=["pending", "match", "no_match", "needs_review"],
        required=False,
        allow_null=True,
    )
    comparison_score = serializers.FloatField(
        required=False,
        allow_null=True,
        min_value=0,
        max_value=1,
    )


class AdminVerificationImageSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(read_only=True)
    reviewed_by_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = UserVerificationImages
        fields = [
            "id",
            "user_id",
            "image_type",
            "status",
            "comparison_status",
            "comparison_score",
            "is_current",
            "reviewed_by_id",
            "reviewed_at",
            "note",
            "created_at",
        ]
        read_only_fields = fields


class FeedbackSubmitSerializer(serializers.Serializer):
    direction = serializers.ChoiceField(
        choices=["coordinator_to_volunteer", "volunteer_to_event", "volunteer_to_coordinator"]
    )
    score = serializers.IntegerField(min_value=1, max_value=5)
    tags = serializers.ListField(child=serializers.CharField(max_length=50), required=False, allow_empty=True)
    comment = serializers.CharField(required=False, allow_blank=True, default="")
    target_user_id = serializers.IntegerField(required=False, allow_null=True)


class ModerationActionSerializer(serializers.Serializer):
    action_type = serializers.ChoiceField(choices=[
        "user_warning", "user_block", "user_unblock", "account_close", "account_reinstate",
        "event_delete", "event_restore", "event_cancel", "feedback_hide",
    ])
    target_user_id = serializers.IntegerField(required=False, allow_null=True)
    event_id = serializers.IntegerField(required=False, allow_null=True)
    feedback_id = serializers.IntegerField(required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    expires_at = serializers.DateTimeField(required=False, allow_null=True)


class HideFeedbackSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=False)


class BlockUserSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    expires_at = serializers.DateTimeField(required=False, allow_null=True)

