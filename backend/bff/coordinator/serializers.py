from rest_framework import serializers

from apps.events.models import Events, EventPosts
from bff.volunteer.serializers import EventSummarySerializer
from common.permissions import AllowListSerializerMixin


class CoordinatorEventConfigurationSerializer(serializers.ModelSerializer):
    """Manager-only configuration detail; never used by the public event browse API."""

    class Meta:
        model = Events
        fields = [
            "id",
            "owner_id",
            "current_coordinator_id",
            "title",
            "description",
            "purpose_type",
            "location_name",
            "landmark_text",
            "latitude",
            "longitude",
            "geo_radius_m",
            "geo_checkin_enabled",
            "geo_checkin_opens_before_min",
            "require_checkin_confirmation",
            "map_provider",
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
        ]
        read_only_fields = fields


class EventCreateSerializer(AllowListSerializerMixin, serializers.Serializer):
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
    publish = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if attrs["end_at"] <= attrs["start_at"]:
            raise serializers.ValidationError({"end_at": "end_at must be after start_at."})
        deadline = attrs.get("application_deadline")
        if deadline is not None and deadline > attrs["start_at"]:
            raise serializers.ValidationError({"application_deadline": "Deadline must be at or before start_at."})
        return attrs


class EventUpdateSerializer(AllowListSerializerMixin, serializers.Serializer):
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
    publish = serializers.BooleanField(required=False, default=False)


class EventListSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    title = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True, allow_null=True, required=False)
    purpose_type = serializers.CharField(read_only=True, allow_null=True, required=False)
    location_name = serializers.CharField(read_only=True, allow_null=True, required=False)
    landmark_text = serializers.CharField(read_only=True, allow_null=True, required=False)
    coordinator_name = serializers.CharField(read_only=True, allow_null=True, required=False)
    charity_fields = serializers.ListField(child=serializers.CharField(), read_only=True, required=False)
    status = serializers.CharField(read_only=True)
    start_at = serializers.DateTimeField(read_only=True)
    end_at = serializers.DateTimeField(read_only=True)
    owner_id = serializers.IntegerField(read_only=True)
    current_coordinator_id = serializers.IntegerField(read_only=True)
    is_owner = serializers.BooleanField(read_only=True)
    is_current_coordinator = serializers.BooleanField(read_only=True)
    is_read_only_monitor = serializers.BooleanField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)


class EventPostCreateSerializer(AllowListSerializerMixin, serializers.Serializer):
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


class EventPostUpdateSerializer(AllowListSerializerMixin, serializers.Serializer):
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


class HandoverSerializer(AllowListSerializerMixin, serializers.Serializer):
    new_coordinator_user_id = serializers.IntegerField()
    reason = serializers.CharField(required=False, allow_blank=True, default="")


CoordinatorHandoverSerializer = HandoverSerializer


class RetakeSerializer(AllowListSerializerMixin, serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="Owner retook coordination")


class CancelEventSerializer(AllowListSerializerMixin, serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class ManualAssignSerializer(AllowListSerializerMixin, serializers.Serializer):
    application_id = serializers.IntegerField()
    post_id = serializers.IntegerField(required=False, allow_null=True)
    group_code = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, max_length=50
    )
    is_group_leader = serializers.BooleanField(required=False, default=False)


class CoordinatorInviteSerializer(AllowListSerializerMixin, serializers.Serializer):
    volunteer_user_id = serializers.IntegerField(required=False)
    volunteer_uuid = serializers.UUIDField(required=False)
    post_id = serializers.IntegerField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        if not attrs.get("volunteer_user_id") and not attrs.get("volunteer_uuid"):
            raise serializers.ValidationError("Either volunteer_user_id or volunteer_uuid must be provided.")
        return attrs


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
    note = serializers.CharField(read_only=True, allow_blank=True, allow_null=True, required=False)
    # T2 Volunteer Profile (present only for accepted applicants)
    uuid = serializers.CharField(read_only=True, allow_null=True, required=False)
    skills = serializers.ListField(child=serializers.CharField(), required=False)
    physical_ok = serializers.BooleanField(required=False, allow_null=True)
    good_eyesight = serializers.BooleanField(required=False, allow_null=True)
    needs_glasses = serializers.BooleanField(required=False, allow_null=True)
    can_lift_heavy = serializers.BooleanField(required=False, allow_null=True)
    can_work_outdoor = serializers.BooleanField(required=False, allow_null=True)
    has_leader_experience = serializers.BooleanField(required=False, allow_null=True)
    new_to_volunteer = serializers.BooleanField(required=False, allow_null=True)
    preferred_language = serializers.CharField(read_only=True, allow_null=True, required=False)
    home_area = serializers.CharField(read_only=True, allow_null=True, required=False)
    needs_meal_support = serializers.BooleanField(required=False, allow_null=True)
    needs_travel_support = serializers.BooleanField(required=False, allow_null=True)
    accepts_unpaid = serializers.BooleanField(required=False, allow_null=True)
    verification_status = serializers.CharField(read_only=True, allow_null=True, required=False)


class CoordinatorAssignmentListSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    application_id = serializers.IntegerField(read_only=True, allow_null=True, required=False)
    event_id = serializers.IntegerField(read_only=True, allow_null=True, required=False)
    event_title = serializers.CharField(read_only=True, allow_null=True, required=False)
    user_id = serializers.IntegerField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    post_id = serializers.IntegerField(read_only=True, allow_null=True)
    post_title = serializers.CharField(read_only=True, allow_null=True)
    group_code = serializers.CharField(read_only=True, allow_null=True)
    is_group_leader = serializers.BooleanField(read_only=True)
    status = serializers.CharField(read_only=True)
    assigned_by = serializers.CharField(read_only=True)
    assigned_at = serializers.DateTimeField(read_only=True, allow_null=True, required=False)
    schedule_start = serializers.DateTimeField(read_only=True)
    schedule_end = serializers.DateTimeField(read_only=True)
    confirmed_at = serializers.DateTimeField(read_only=True, allow_null=True)


class StaffingSummarySerializer(serializers.Serializer):
    required_headcount = serializers.IntegerField(read_only=True)
    assigned_count = serializers.IntegerField(read_only=True)
    open_slots = serializers.IntegerField(read_only=True)
    accepted_unassigned = serializers.IntegerField(read_only=True)
    pending_applications = serializers.IntegerField(read_only=True)
    waitlisted_applications = serializers.IntegerField(read_only=True)
    checked_in_count = serializers.IntegerField(read_only=True)
    pending_confirmations = serializers.IntegerField(read_only=True)
    coverage_percent = serializers.FloatField(read_only=True)
    readiness_status = serializers.CharField(read_only=True, required=False)


class StaffingPostBreakdownSerializer(serializers.Serializer):
    post_id = serializers.IntegerField(read_only=True)
    title = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    required_headcount = serializers.IntegerField(read_only=True)
    assigned_count = serializers.IntegerField(read_only=True)
    remaining = serializers.IntegerField(read_only=True)


class StaffingSignalSerializer(serializers.Serializer):
    code = serializers.CharField(read_only=True)
    severity = serializers.CharField(read_only=True)
    title = serializers.CharField(read_only=True)
    evidence = serializers.DictField(read_only=True, required=False)


class StaffingInsightSerializer(serializers.Serializer):
    event_id = serializers.IntegerField(read_only=True)
    event_title = serializers.CharField(read_only=True)
    event_status = serializers.CharField(read_only=True)
    start_at = serializers.CharField(read_only=True, allow_null=True)
    readiness_status = serializers.CharField(read_only=True, required=False)
    summary = StaffingSummarySerializer(read_only=True)
    posts = StaffingPostBreakdownSerializer(many=True, read_only=True)
    signals = StaffingSignalSerializer(many=True, read_only=True)
    generated_at = serializers.CharField(read_only=True)


__all__ = [
    "AutoAssignResultSerializer",
    "CancelEventSerializer",
    "CoordinatorApplicationListSerializer",
    "CoordinatorAssignmentListSerializer",
    "CoordinatorInviteSerializer",
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
    "StaffingInsightSerializer",
    "StaffingSummarySerializer",
    "StaffingPostBreakdownSerializer",
    "StaffingSignalSerializer",
]
