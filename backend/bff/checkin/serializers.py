from rest_framework import serializers

from common.permissions import AllowListSerializerMixin


class OnboardingStatusSerializer(AllowListSerializerMixin, serializers.Serializer):
    event_id = serializers.IntegerField(read_only=True)
    onboarding_text = serializers.CharField(read_only=True, allow_null=True)
    onboarding_version = serializers.IntegerField(read_only=True)
    require_onboarding_ack = serializers.BooleanField(read_only=True)
    acknowledged = serializers.BooleanField(read_only=True)


class OnboardingAcknowledgeSerializer(AllowListSerializerMixin, serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True)


class QrTokenCreateSerializer(AllowListSerializerMixin, serializers.Serializer):
    purpose = serializers.ChoiceField(choices=["walkin_registration", "checkin", "join_event"])
    max_uses = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    ttl_minutes = serializers.IntegerField(required=False, default=240, min_value=1, max_value=10080)


class QrTokenSerializer(AllowListSerializerMixin, serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    raw_token = serializers.CharField(read_only=True)
    purpose = serializers.CharField(read_only=True)
    max_uses = serializers.IntegerField(read_only=True, allow_null=True)
    expires_at = serializers.DateTimeField(read_only=True)


class QrResolveSerializer(AllowListSerializerMixin, serializers.Serializer):
    token = serializers.CharField()


class QrRedeemSerializer(AllowListSerializerMixin, serializers.Serializer):
    token = serializers.CharField()


QrTokenRedeemSerializer = QrRedeemSerializer


class ManualCheckinSerializer(AllowListSerializerMixin, serializers.Serializer):
    event_id = serializers.IntegerField(required=False)
    user_id = serializers.IntegerField()
    note = serializers.CharField(required=False, allow_blank=True, default="")


ManualCheckInSerializer = ManualCheckinSerializer


class GeoCheckinSerializer(AllowListSerializerMixin, serializers.Serializer):
    event_id = serializers.IntegerField(required=False)
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    accuracy_m = serializers.FloatField(required=False, allow_null=True, min_value=0)
    captured_at = serializers.DateTimeField(required=False, allow_null=True)
    is_mocked = serializers.BooleanField(required=False, default=False)


GeoCheckInSerializer = GeoCheckinSerializer


class ConfirmAttendanceSerializer(AllowListSerializerMixin, serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class RejectAttendanceSerializer(AllowListSerializerMixin, serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=False)


class AttendanceRosterSerializer(AllowListSerializerMixin, serializers.Serializer):
    assignment_id = serializers.IntegerField(read_only=True)
    event_id = serializers.IntegerField(read_only=True)
    user_id = serializers.IntegerField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    post_id = serializers.IntegerField(read_only=True, allow_null=True)
    post_title = serializers.CharField(read_only=True, allow_null=True)
    group_code = serializers.CharField(read_only=True, allow_null=True)
    is_group_leader = serializers.BooleanField(read_only=True)
    assignment_status = serializers.CharField(read_only=True)
    attendance_id = serializers.IntegerField(read_only=True, allow_null=True)
    attendance_status = serializers.CharField(read_only=True, allow_null=True)
    method = serializers.CharField(read_only=True, allow_null=True)
    walk_in_flag = serializers.BooleanField(read_only=True)
    checkin_at = serializers.DateTimeField(read_only=True, allow_null=True)
    checkin_distance_m = serializers.FloatField(read_only=True, allow_null=True)
    confirmation_status = serializers.CharField(read_only=True, allow_null=True)
