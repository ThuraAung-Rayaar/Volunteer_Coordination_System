from rest_framework import serializers

from apps.accounts.models import UserVerificationImages
from apps.coordination.models import CoordinatorProfiles
from common.serializers import AllowListSerializerMixin


class ReviewImageSerializer(AllowListSerializerMixin, serializers.Serializer):
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


# Alias for alternate naming
AdminVerificationReviewSerializer = ReviewImageSerializer


class AdminCoordinatorProfileSerializer(AllowListSerializerMixin, serializers.ModelSerializer):
    class Meta:
        model = CoordinatorProfiles
        fields = [
            "user_id",
            "status",
            "approved_by_id",
            "approved_at",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class AdminVerificationImageSerializer(AllowListSerializerMixin, serializers.ModelSerializer):
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


class FeedbackSubmitSerializer(AllowListSerializerMixin, serializers.Serializer):
    direction = serializers.ChoiceField(
        choices=["coordinator_to_volunteer", "volunteer_to_event", "volunteer_to_coordinator"]
    )
    score = serializers.IntegerField(min_value=1, max_value=5)
    tags = serializers.ListField(child=serializers.CharField(max_length=50), required=False, allow_empty=True)
    comment = serializers.CharField(required=False, allow_blank=True, default="")
    target_user_id = serializers.IntegerField(required=False, allow_null=True)


class ModerationActionSerializer(AllowListSerializerMixin, serializers.Serializer):
    action_type = serializers.ChoiceField(choices=[
        "user_warning", "user_block", "user_unblock", "account_close", "account_reinstate",
        "event_delete", "event_restore", "event_cancel", "feedback_hide",
    ])
    target_user_id = serializers.IntegerField(required=False, allow_null=True)
    event_id = serializers.IntegerField(required=False, allow_null=True)
    feedback_id = serializers.IntegerField(required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    expires_at = serializers.DateTimeField(required=False, allow_null=True)


ModerationActionCreateSerializer = ModerationActionSerializer


class ModerationActionResponseSerializer(AllowListSerializerMixin, serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    action_type = serializers.CharField(read_only=True)
    admin_user_id = serializers.IntegerField(read_only=True, required=False)
    target_user_id = serializers.IntegerField(read_only=True, required=False, allow_null=True)
    event_id = serializers.IntegerField(read_only=True, required=False, allow_null=True)
    feedback_id = serializers.IntegerField(read_only=True, required=False, allow_null=True)
    reason = serializers.CharField(read_only=True, required=False)
    expires_at = serializers.DateTimeField(read_only=True, required=False, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True, required=False)


class HideFeedbackSerializer(AllowListSerializerMixin, serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=False)


class BlockUserSerializer(AllowListSerializerMixin, serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    expires_at = serializers.DateTimeField(required=False, allow_null=True)


class AdminDashboardMetricsSerializer(AllowListSerializerMixin, serializers.Serializer):
    active_users = serializers.IntegerField(read_only=True)
    blocked_users = serializers.IntegerField(read_only=True)
    users_pending_verification = serializers.IntegerField(read_only=True)
    images_pending_review = serializers.IntegerField(read_only=True)
    coordinators_pending_approval = serializers.IntegerField(read_only=True)
    coordinators_approved = serializers.IntegerField(read_only=True)
    events_draft = serializers.IntegerField(read_only=True)
    events_published = serializers.IntegerField(read_only=True)
    events_active = serializers.IntegerField(read_only=True)
    events_completed = serializers.IntegerField(read_only=True)
    events_cancelled = serializers.IntegerField(read_only=True)
    events_deleted = serializers.IntegerField(read_only=True)
    pending_checkin_confirmations = serializers.IntegerField(read_only=True)
    warnings_last_30d = serializers.IntegerField(read_only=True)


class AdminAuditLogSerializer(AllowListSerializerMixin, serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    actor_user_id = serializers.IntegerField(read_only=True, allow_null=True)
    action = serializers.CharField(read_only=True)
    entity_type = serializers.CharField(read_only=True)
    entity_id = serializers.IntegerField(read_only=True, allow_null=True)
    before_data = serializers.DictField(read_only=True, allow_null=True)
    after_data = serializers.DictField(read_only=True, allow_null=True)
    ip_address = serializers.CharField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)


class AdminGeoAttemptSerializer(AllowListSerializerMixin, serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    event_id = serializers.IntegerField(read_only=True)
    user_id = serializers.IntegerField(read_only=True)
    result = serializers.CharField(read_only=True)
    distance_m = serializers.FloatField(read_only=True, allow_null=True)
    accuracy_m = serializers.FloatField(read_only=True, allow_null=True)
    is_mocked = serializers.BooleanField(read_only=True)
    attempted_at = serializers.DateTimeField(read_only=True)


class AdminCoordinatorHistorySerializer(AllowListSerializerMixin, serializers.Serializer):
    event_id = serializers.IntegerField(read_only=True)
    event_title = serializers.CharField(read_only=True)
    from_coordinator_id = serializers.IntegerField(read_only=True, allow_null=True)
    from_name = serializers.CharField(read_only=True, allow_null=True)
    to_coordinator_id = serializers.IntegerField(read_only=True)
    to_name = serializers.CharField(read_only=True)
    changed_by_user_id = serializers.IntegerField(read_only=True, allow_null=True)
    changed_by_name = serializers.CharField(read_only=True, allow_null=True)
    reason = serializers.CharField(read_only=True, allow_blank=True)
    changed_at = serializers.DateTimeField(read_only=True)


class AdminModerationSummarySerializer(AllowListSerializerMixin, serializers.Serializer):
    user_id = serializers.IntegerField(read_only=True)
    warning_count = serializers.IntegerField(read_only=True)
    last_warning_at = serializers.DateTimeField(read_only=True, allow_null=True)
    block_count = serializers.IntegerField(read_only=True)
    last_block_at = serializers.DateTimeField(read_only=True, allow_null=True)


class AdminFeedbackSerializer(AllowListSerializerMixin, serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    event_id = serializers.IntegerField(read_only=True)
    rater_user_id = serializers.IntegerField(read_only=True)
    target_user_id = serializers.IntegerField(read_only=True, allow_null=True)
    direction = serializers.CharField(read_only=True)
    score = serializers.IntegerField(read_only=True)
    tags = serializers.ListField(child=serializers.CharField(), read_only=True)
    comment = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)


class AdminMaintenanceResponseSerializer(AllowListSerializerMixin, serializers.Serializer):
    released_expired_blocks = serializers.IntegerField(read_only=True, required=False)
    expired_stale_applications = serializers.IntegerField(read_only=True, required=False)
    purged_expired_otps = serializers.IntegerField(read_only=True, required=False)
    purged_geo_evidence = serializers.IntegerField(read_only=True, required=False)


class AdminActionSuccessSerializer(AllowListSerializerMixin, serializers.Serializer):
    success = serializers.BooleanField(default=True)
    message = serializers.CharField(required=False, allow_blank=True)

