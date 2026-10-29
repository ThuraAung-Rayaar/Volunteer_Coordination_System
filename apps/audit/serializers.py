# apps/audit/serializers.py
from rest_framework import serializers

from apps.audit.models import AuditLog, ModerationAction


class ModerationActionSerializer(serializers.ModelSerializer):
    admin_name = serializers.CharField(source="admin_user.display_name", read_only=True)
    target_user_name = serializers.CharField(source="target_user.display_name", read_only=True)
    event_title = serializers.CharField(source="event.title", read_only=True)

    class Meta:
        model = ModerationAction
        fields = [
            "id",
            "admin_user",
            "admin_name",
            "target_user",
            "target_user_name",
            "event",
            "event_title",
            "feedback",
            "action_type",
            "reason",
            "expires_at",
            "created_at",
        ]
        read_only_fields = fields


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor_user.display_name", read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "actor_user",
            "actor_name",
            "action",
            "entity_type",
            "entity_id",
            "before_data",
            "after_data",
            "ip_address",
            "created_at",
        ]
        read_only_fields = fields


class ModerationReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True)


class BlockUserSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True)
    expires_at = serializers.DateTimeField(required=False, allow_null=True, default=None)
