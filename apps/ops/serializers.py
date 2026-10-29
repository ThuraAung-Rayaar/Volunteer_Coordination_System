# apps/ops/serializers.py
from rest_framework import serializers

from apps.accounts.models import User
from apps.events.models import Event, EventApplication, EventPost
from apps.ops.models import (
    Assignment,
    Attendance,
    Feedback,
    OnboardingAcknowledgment,
    QrToken,
)


class QrTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = QrToken
        fields = [
            "id",
            "event",
            "purpose",
            "max_uses",
            "used_count",
            "expires_at",
            "revoked_at",
            "created_at",
        ]
        read_only_fields = ["id", "used_count", "created_at"]


class QrTokenGenerateSerializer(serializers.Serializer):
    purpose = serializers.ChoiceField(choices=["walkin_registration", "checkin", "join_event"])
    max_uses = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    ttl_minutes = serializers.IntegerField(required=False, default=240, min_value=1)


class QrTokenResolveSerializer(serializers.Serializer):
    token = serializers.CharField(required=True)


class QrTokenRedeemSerializer(serializers.Serializer):
    token = serializers.CharField(required=True)


class AssignmentSerializer(serializers.ModelSerializer):
    user_display_name = serializers.CharField(source="user.display_name", read_only=True)
    post_title = serializers.CharField(source="post.title", read_only=True)
    event_title = serializers.CharField(source="event.title", read_only=True)

    class Meta:
        model = Assignment
        fields = [
            "id",
            "event",
            "event_title",
            "application",
            "post",
            "post_title",
            "user",
            "user_display_name",
            "group_code",
            "is_group_leader",
            "status",
            "assigned_by",
            "schedule_start",
            "schedule_end",
            "conditions_snapshot",
            "created_at",
        ]
        read_only_fields = fields


class ManualAssignmentSerializer(serializers.Serializer):
    application_id = serializers.IntegerField(required=True)
    post_id = serializers.IntegerField(required=False, allow_null=True)
    group_code = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    is_group_leader = serializers.BooleanField(required=False, default=False)


class AssignmentCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class AttendanceSerializer(serializers.ModelSerializer):
    user_display_name = serializers.CharField(source="user.display_name", read_only=True)
    event_title = serializers.CharField(source="event.title", read_only=True)

    class Meta:
        model = Attendance
        fields = [
            "id",
            "event",
            "event_title",
            "user",
            "user_display_name",
            "assignment",
            "qr_token",
            "status",
            "checkin_at",
            "checkout_at",
            "method",
            "note",
            "created_at",
        ]
        read_only_fields = fields


class CheckInSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(required=False, allow_null=True)
    method = serializers.CharField(required=False, default="qr_scan")
    token = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class CheckOutSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(required=False, allow_null=True)


class MarkAbsentSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(required=True)


class OnboardingAcknowledgmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = OnboardingAcknowledgment
        fields = [
            "id",
            "event",
            "user",
            "onboarding_version",
            "acknowledged_at",
            "method",
        ]
        read_only_fields = fields


class OnboardingAcknowledgeSerializer(serializers.Serializer):
    method = serializers.CharField(required=False, default="app_tick")


class FeedbackSerializer(serializers.ModelSerializer):
    rater_name = serializers.CharField(source="rater_user.display_name", read_only=True)
    target_name = serializers.CharField(source="target_user.display_name", read_only=True)

    class Meta:
        model = Feedback
        fields = [
            "id",
            "event",
            "rater_user",
            "rater_name",
            "target_user",
            "target_name",
            "direction",
            "score",
            "tags",
            "comment",
            "status",
            "created_at",
        ]
        read_only_fields = fields


class FeedbackCreateSerializer(serializers.Serializer):
    direction = serializers.ChoiceField(
        choices=[
            "coordinator_to_volunteer",
            "volunteer_to_event",
            "volunteer_to_coordinator",
        ]
    )
    target_user_id = serializers.IntegerField(required=False, allow_null=True)
    score = serializers.IntegerField(required=True, min_value=1, max_value=5)
    tags = serializers.ListField(
        child=serializers.CharField(max_length=50),
        required=False,
        default=list,
    )
    comment = serializers.CharField(required=False, allow_blank=True, default="")
