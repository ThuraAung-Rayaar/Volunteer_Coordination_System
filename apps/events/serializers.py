# apps/events/serializers.py
from rest_framework import serializers

from apps.events.models import CharityField, Event, EventApplication, EventCharityField, EventPost


class CharityFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = CharityField
        fields = ["code", "label", "active", "sort_order"]


class EventPostSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventPost
        fields = [
            "id",
            "event",
            "title",
            "description",
            "required_headcount",
            "physical_level",
            "required_skills",
            "leader_needed",
            "new_volunteers_allowed",
            "priority",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "event", "created_at", "updated_at"]


class EventPostCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventPost
        fields = [
            "title",
            "description",
            "required_headcount",
            "physical_level",
            "required_skills",
            "leader_needed",
            "new_volunteers_allowed",
            "priority",
        ]


class EventSerializer(serializers.ModelSerializer):
    posts = EventPostSerializer(many=True, read_only=True)
    coordinator_name = serializers.CharField(source="coordinator.display_name", read_only=True)
    charity_codes = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            "id",
            "coordinator",
            "coordinator_name",
            "title",
            "description",
            "purpose_type",
            "location_name",
            "landmark_text",
            "start_at",
            "end_at",
            "application_deadline",
            "status",
            "acceptance_mode",
            "auto_assign_enabled",
            "group_size",
            "leader_strategy",
            "max_participants",
            "meals_provided",
            "lodging_provided",
            "travel_support_provided",
            "compensation_kind",
            "compensation_note",
            "onboarding_text",
            "onboarding_version",
            "require_onboarding_ack",
            "qr_registration_enabled",
            "charity_codes",
            "posts",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "coordinator",
            "status",
            "onboarding_version",
            "created_at",
        ]

    def get_charity_codes(self, obj):
        return list(obj.charity_links.values_list("field_code_id", flat=True))


class EventCreateUpdateSerializer(serializers.ModelSerializer):
    charity_codes = serializers.ListField(
        child=serializers.CharField(max_length=50),
        required=False,
        default=list,
    )

    class Meta:
        model = Event
        fields = [
            "title",
            "description",
            "purpose_type",
            "location_name",
            "landmark_text",
            "start_at",
            "end_at",
            "application_deadline",
            "acceptance_mode",
            "auto_assign_enabled",
            "group_size",
            "leader_strategy",
            "max_participants",
            "meals_provided",
            "lodging_provided",
            "travel_support_provided",
            "compensation_kind",
            "compensation_note",
            "onboarding_text",
            "require_onboarding_ack",
            "qr_registration_enabled",
            "charity_codes",
        ]


class EventApplicationSerializer(serializers.ModelSerializer):
    user_display_name = serializers.CharField(source="user.display_name", read_only=True)
    event_title = serializers.CharField(source="event.title", read_only=True)
    post_title = serializers.CharField(source="post.title", read_only=True, allow_null=True)

    class Meta:
        model = EventApplication
        fields = [
            "id",
            "event",
            "event_title",
            "post",
            "post_title",
            "user",
            "user_display_name",
            "qr_token",
            "source",
            "status",
            "applied_at",
            "decided_at",
            "conditions_acknowledged_at",
            "conditions_snapshot",
            "note",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "user",
            "applied_at",
            "decided_at",
            "conditions_snapshot",
            "created_at",
        ]


class EventApplicationCreateSerializer(serializers.Serializer):
    post_id = serializers.IntegerField(required=False, allow_null=True)
    source = serializers.CharField(max_length=20, default="browse", required=False)
    qr_token_id = serializers.IntegerField(required=False, allow_null=True)
