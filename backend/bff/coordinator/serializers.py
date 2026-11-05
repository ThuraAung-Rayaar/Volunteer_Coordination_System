from rest_framework import serializers

from apps.events.models import Events, EventPosts
from bff.volunteer.serializers import EventSummarySerializer


class EventCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    purpose_type = serializers.ChoiceField(
        choices=["charity_event", "help_wanted_event"], default="charity_event"
    )
    location_name = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    landmark_text = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    geo_radius_m = serializers.IntegerField(required=False, allow_null=True, min_value=20, max_value=5000)
    geo_checkin_enabled = serializers.BooleanField(required=False, default=False)
    geo_checkin_opens_before_min = serializers.IntegerField(required=False, default=30, min_value=0, max_value=240)
    require_checkin_confirmation = serializers.BooleanField(required=False, default=True)
    map_provider = serializers.ChoiceField(choices=["openstreetmap", "google"], default="openstreetmap")
    start_at = serializers.DateTimeField()
    end_at = serializers.DateTimeField()
    application_deadline = serializers.DateTimeField(required=False, allow_null=True)
    acceptance_mode = serializers.ChoiceField(choices=["auto", "manual"], default="manual")
    auto_assign_enabled = serializers.BooleanField(required=False, default=True)
    group_size = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    leader_strategy = serializers.ChoiceField(
        choices=["none", "first_experienced", "manual"], default="none"
    )
    max_participants = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    meals_provided = serializers.BooleanField(required=False, default=False)
    lodging_provided = serializers.BooleanField(required=False, default=False)
    travel_support_provided = serializers.BooleanField(required=False, default=False)
    compensation_kind = serializers.ChoiceField(
        choices=["unpaid", "arranged_outside_system"], default="unpaid"
    )
    compensation_note = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    onboarding_text = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    require_onboarding_ack = serializers.BooleanField(required=False, default=True)
    qr_registration_enabled = serializers.BooleanField(required=False, default=True)
    charity_field_codes = serializers.ListField(
        child=serializers.CharField(max_length=50), required=False, allow_empty=True
    )

    def validate(self, attrs):
        if attrs["end_at"] <= attrs["start_at"]:
            raise serializers.ValidationError({"end_at": "end_at must be after start_at."})
        deadline = attrs.get("application_deadline")
        if deadline is not None and deadline > attrs["start_at"]:
            raise serializers.ValidationError({"application_deadline": "Deadline must be at or before start_at."})
        return attrs


class EventUpdateSerializer(serializers.Serializer):
    """Allow-list serializer for event edits. Excludes status/owner/coordinator/version."""
    title = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    purpose_type = serializers.ChoiceField(
        choices=["charity_event", "help_wanted_event"], required=False
    )
    location_name = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    landmark_text = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    geo_radius_m = serializers.IntegerField(required=False, allow_null=True, min_value=20, max_value=5000)
    geo_checkin_enabled = serializers.BooleanField(required=False)
    geo_checkin_opens_before_min = serializers.IntegerField(required=False, min_value=0, max_value=240)
    require_checkin_confirmation = serializers.BooleanField(required=False)
    map_provider = serializers.ChoiceField(choices=["openstreetmap", "google"], required=False)
    start_at = serializers.DateTimeField(required=False)
    end_at = serializers.DateTimeField(required=False)
    application_deadline = serializers.DateTimeField(required=False, allow_null=True)
    acceptance_mode = serializers.ChoiceField(choices=["auto", "manual"], required=False)
    auto_assign_enabled = serializers.BooleanField(required=False)
    group_size = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    leader_strategy = serializers.ChoiceField(
        choices=["none", "first_experienced", "manual"], required=False
    )
    max_participants = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    meals_provided = serializers.BooleanField(required=False)
    lodging_provided = serializers.BooleanField(required=False)
    travel_support_provided = serializers.BooleanField(required=False)
    compensation_kind = serializers.ChoiceField(
        choices=["unpaid", "arranged_outside_system"], required=False
    )
    compensation_note = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    onboarding_text = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    require_onboarding_ack = serializers.BooleanField(required=False)
    qr_registration_enabled = serializers.BooleanField(required=False)
    charity_field_codes = serializers.ListField(
        child=serializers.CharField(max_length=50), required=False, allow_empty=True
    )


class EventListSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    title = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    start_at = serializers.DateTimeField(read_only=True)
    end_at = serializers.DateTimeField(read_only=True)
    owner_id = serializers.IntegerField(read_only=True)
    current_coordinator_id = serializers.IntegerField(read_only=True)
    is_owner = serializers.BooleanField(read_only=True)
    is_current_coordinator = serializers.BooleanField(read_only=True)
    is_read_only_monitor = serializers.BooleanField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)


class EventPostCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=150)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    required_headcount = serializers.IntegerField(min_value=1)
    physical_level = serializers.ChoiceField(
        choices=["none", "light", "medium", "heavy"], default="none"
    )
    required_skills = serializers.ListField(
        child=serializers.CharField(max_length=50), required=False, allow_empty=True
    )
    leader_needed = serializers.BooleanField(required=False, default=False)
    new_volunteers_allowed = serializers.BooleanField(required=False, default=True)
    priority = serializers.IntegerField(required=False, default=100)


class EventPostUpdateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=150, required=False)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    required_headcount = serializers.IntegerField(required=False, min_value=1)
    physical_level = serializers.ChoiceField(
        choices=["none", "light", "medium", "heavy"], required=False
    )
    required_skills = serializers.ListField(
        child=serializers.CharField(max_length=50), required=False, allow_empty=True
    )
    leader_needed = serializers.BooleanField(required=False)
    new_volunteers_allowed = serializers.BooleanField(required=False)
    priority = serializers.IntegerField(required=False)


class EventPostSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    title = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True, allow_null=True)
    status = serializers.CharField(read_only=True)
    physical_level = serializers.CharField(read_only=True)
    required_skills = serializers.ListField(child=serializers.CharField(), read_only=True)
    leader_needed = serializers.BooleanField(read_only=True)
    new_volunteers_allowed = serializers.BooleanField(read_only=True)
    priority = serializers.IntegerField(read_only=True)
    required_headcount = serializers.IntegerField(read_only=True)
    assigned_count = serializers.IntegerField(read_only=True)
    remaining = serializers.IntegerField(read_only=True)


class HandoverSerializer(serializers.Serializer):
    new_coordinator_user_id = serializers.IntegerField()
    reason = serializers.CharField(required=False, allow_blank=True, default="")


CoordinatorHandoverSerializer = HandoverSerializer


class RetakeSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="Owner retook coordination")


class CancelEventSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class ManualAssignSerializer(serializers.Serializer):
    application_id = serializers.IntegerField()
    post_id = serializers.IntegerField(required=False, allow_null=True)
    group_code = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, max_length=50
    )
    is_group_leader = serializers.BooleanField(required=False, default=False)


class AutoAssignResultSerializer(serializers.Serializer):
    event_id = serializers.IntegerField(read_only=True)
    newly_assigned = serializers.IntegerField(read_only=True)
    total_accepted = serializers.IntegerField(read_only=True)
    total_assigned = serializers.IntegerField(read_only=True)
    remaining_unassigned = serializers.IntegerField(read_only=True)


class CoordinatorApplicationListSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    user_id = serializers.IntegerField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    post_id = serializers.IntegerField(read_only=True, allow_null=True)
    post_title = serializers.CharField(read_only=True, allow_null=True)
    source = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    applied_at = serializers.DateTimeField(read_only=True)
    decided_at = serializers.DateTimeField(read_only=True, allow_null=True)
    decided_by_id = serializers.IntegerField(read_only=True, allow_null=True)
    skills = serializers.ListField(child=serializers.CharField(), required=False)
    physical_ok = serializers.BooleanField(required=False)
    can_lift_heavy = serializers.BooleanField(required=False)
    has_leader_experience = serializers.BooleanField(required=False)
    new_to_volunteer = serializers.BooleanField(required=False)


class CoordinatorAssignmentListSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    user_id = serializers.IntegerField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    post_id = serializers.IntegerField(read_only=True, allow_null=True)
    post_title = serializers.CharField(read_only=True, allow_null=True)
    group_code = serializers.CharField(read_only=True, allow_null=True)
    is_group_leader = serializers.BooleanField(read_only=True)
    status = serializers.CharField(read_only=True)
    assigned_by = serializers.CharField(read_only=True)
    schedule_start = serializers.DateTimeField(read_only=True)
    schedule_end = serializers.DateTimeField(read_only=True)
    confirmed_at = serializers.DateTimeField(read_only=True, allow_null=True)


__all__ = [
    "AutoAssignResultSerializer",
    "CancelEventSerializer",
    "CoordinatorApplicationListSerializer",
    "CoordinatorAssignmentListSerializer",
    "EventCreateSerializer",
    "EventListSerializer",
    "EventPostCreateSerializer",
    "EventPostSerializer",
    "EventPostUpdateSerializer",
    "EventSummarySerializer",
    "EventUpdateSerializer",
    "HandoverSerializer",
    "CoordinatorHandoverSerializer",
    "ManualAssignSerializer",
    "RetakeSerializer",
]
