from rest_framework import serializers


class OnboardingStatusSerializer(serializers.Serializer):
    event_id = serializers.IntegerField(read_only=True)
    onboarding_text = serializers.CharField(read_only=True, allow_null=True)
    onboarding_version = serializers.IntegerField(read_only=True)
    require_onboarding_ack = serializers.BooleanField(read_only=True)
    acknowledged = serializers.BooleanField(read_only=True)


class QrTokenCreateSerializer(serializers.Serializer):
    purpose = serializers.ChoiceField(choices=["walkin_registration", "checkin", "join_event"])
    max_uses = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    ttl_minutes = serializers.IntegerField(required=False, default=240, min_value=1, max_value=10080)


class QrTokenSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    raw_token = serializers.CharField(read_only=True)
    purpose = serializers.CharField(read_only=True)
    max_uses = serializers.IntegerField(read_only=True, allow_null=True)
    expires_at = serializers.DateTimeField(read_only=True)


class QrResolveSerializer(serializers.Serializer):
    token = serializers.CharField()


class QrRedeemSerializer(serializers.Serializer):
    token = serializers.CharField()


class ManualCheckinSerializer(serializers.Serializer):
    event_id = serializers.IntegerField()
    user_id = serializers.IntegerField()
    note = serializers.CharField(required=False, allow_blank=True, default="")


class GeoCheckinSerializer(serializers.Serializer):
    event_id = serializers.IntegerField()
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    accuracy_m = serializers.FloatField(required=False, allow_null=True, min_value=0)
    captured_at = serializers.DateTimeField(required=False, allow_null=True)
    is_mocked = serializers.BooleanField(required=False, default=False)


class ConfirmAttendanceSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class RejectAttendanceSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=False)
