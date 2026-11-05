from rest_framework import serializers

from apps.accounts.models import UserVerificationImages
from apps.events.models import CharityFields, VEventSummary, VPublicEvents
from common.permissions import AllowListSerializerMixin


class CharityFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = CharityFields
        fields = ["code", "label", "sort_order"]
        read_only_fields = fields


class PublicEventSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="event_id", read_only=True)
    charity_fields = serializers.ListField(child=serializers.CharField(), read_only=True)
    spots_remaining = serializers.IntegerField(read_only=True)

    class Meta:
        model = VPublicEvents
        fields = [
            "id",
            "title",
            "description",
            "purpose_type",
            "location_name",
            "landmark_text",
            "latitude",
            "longitude",
            "geo_radius_m",
            "geo_checkin_enabled",
            "map_provider",
            "start_at",
            "end_at",
            "application_deadline",
            "status",
            "acceptance_mode",
            "max_participants",
            "meals_provided",
            "lodging_provided",
            "travel_support_provided",
            "compensation_kind",
            "coordinator_name",
            "charity_fields",
            "spots_remaining",
        ]
        read_only_fields = fields


class PublicEventPostSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    title = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True, allow_null=True)
    status = serializers.CharField(read_only=True)
    physical_level = serializers.CharField(read_only=True)
    required_skills = serializers.ListField(child=serializers.CharField(), read_only=True)
    leader_needed = serializers.BooleanField(read_only=True)
    new_volunteers_allowed = serializers.BooleanField(read_only=True)
    required_headcount = serializers.IntegerField(read_only=True)
    assigned_count = serializers.IntegerField(read_only=True)
    remaining = serializers.IntegerField(read_only=True)


class PublicEventDetailSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    title = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True, allow_null=True)
    purpose_type = serializers.CharField(read_only=True)
    location_name = serializers.CharField(read_only=True, allow_null=True)
    landmark_text = serializers.CharField(read_only=True, allow_null=True)
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, read_only=True, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, read_only=True, allow_null=True)
    geo_radius_m = serializers.IntegerField(read_only=True, allow_null=True)
    geo_checkin_enabled = serializers.BooleanField(read_only=True)
    map_provider = serializers.CharField(read_only=True)
    start_at = serializers.DateTimeField(read_only=True)
    end_at = serializers.DateTimeField(read_only=True)
    application_deadline = serializers.DateTimeField(read_only=True, allow_null=True)
    status = serializers.CharField(read_only=True)
    acceptance_mode = serializers.CharField(read_only=True)
    max_participants = serializers.IntegerField(read_only=True, allow_null=True)
    meals_provided = serializers.BooleanField(read_only=True)
    lodging_provided = serializers.BooleanField(read_only=True)
    travel_support_provided = serializers.BooleanField(read_only=True)
    compensation_kind = serializers.CharField(read_only=True)
    coordinator_name = serializers.CharField(read_only=True, allow_null=True)
    charity_fields = serializers.ListField(child=serializers.CharField(), read_only=True)
    spots_remaining = serializers.IntegerField(read_only=True)
    posts = PublicEventPostSerializer(many=True, read_only=True, required=False)

    onboarding_text = serializers.CharField(read_only=True, allow_null=True, required=False)
    onboarding_version = serializers.IntegerField(read_only=True, required=False)
    compensation_note = serializers.CharField(read_only=True, allow_null=True, required=False)

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        can_access_t2 = self.context.get("can_access_t2", False)
        if not can_access_t2:
            ret.pop("onboarding_text", None)
            ret.pop("onboarding_version", None)
            ret.pop("compensation_note", None)
        return ret


class EventSummarySerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="event_id", read_only=True)

    class Meta:
        model = VEventSummary
        fields = [
            "id",
            "title",
            "status",
            "start_at",
            "end_at",
            "acceptance_mode",
            "auto_assign_enabled",
            "max_participants",
            "geo_checkin_enabled",
            "map_provider",
            "pending_count",
            "accepted_count",
            "waitlisted_count",
            "assignment_count",
            "checked_in_count",
            "pending_confirmations",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Phase 3 Profile & Availability Serializers
# ---------------------------------------------------------------------------

class UserProfileSerializer(serializers.Serializer):
    """Read-only serializer for the user's own profile."""
    id = serializers.IntegerField(read_only=True)
    uuid = serializers.UUIDField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    phone = serializers.CharField(read_only=True, allow_null=True)
    preferred_language = serializers.CharField(read_only=True)
    home_area = serializers.CharField(read_only=True, allow_null=True)
    emergency_contact_name = serializers.CharField(read_only=True, allow_null=True)
    emergency_contact_phone = serializers.CharField(read_only=True, allow_null=True)
    blood_type = serializers.CharField(read_only=True)
    is_willing_to_donate = serializers.BooleanField(read_only=True)
    is_willing_to_donate_blood = serializers.BooleanField(read_only=True)
    is_willing_to_donate_items = serializers.BooleanField(read_only=True)
    physical_ok = serializers.BooleanField(read_only=True)
    good_eyesight = serializers.BooleanField(read_only=True)
    needs_glasses = serializers.BooleanField(read_only=True)
    can_lift_heavy = serializers.BooleanField(read_only=True)
    can_work_outdoor = serializers.BooleanField(read_only=True)
    has_leader_experience = serializers.BooleanField(read_only=True)
    new_to_volunteer = serializers.BooleanField(read_only=True)
    skills = serializers.ListField(child=serializers.CharField(), read_only=True)
    needs_meal_support = serializers.BooleanField(read_only=True)
    needs_travel_support = serializers.BooleanField(read_only=True)
    accepts_unpaid = serializers.BooleanField(read_only=True)
    verification_status = serializers.CharField(read_only=True)
    account_status = serializers.CharField(read_only=True)
    charity_interests = serializers.ListField(
        child=serializers.CharField(), read_only=True
    )
    created_at = serializers.DateTimeField(read_only=True)


class ProfileUpdateSerializer(AllowListSerializerMixin, serializers.Serializer):
    """
    Allow-list serializer for profile updates.
    Only fields declared here are accepted; unknown keys return 400.
    """
    display_name = serializers.CharField(max_length=150, required=False)
    preferred_language = serializers.CharField(max_length=35, required=False)
    home_area = serializers.CharField(max_length=150, required=False, allow_blank=True, allow_null=True)
    emergency_contact_name = serializers.CharField(max_length=150, required=False, allow_blank=True, allow_null=True)
    emergency_contact_phone = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)
    blood_type = serializers.ChoiceField(
        choices=["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"],
        required=False,
    )
    is_willing_to_donate = serializers.BooleanField(required=False)
    is_willing_to_donate_blood = serializers.BooleanField(required=False)
    is_willing_to_donate_items = serializers.BooleanField(required=False)
    physical_ok = serializers.BooleanField(required=False)
    good_eyesight = serializers.BooleanField(required=False)
    needs_glasses = serializers.BooleanField(required=False)
    can_lift_heavy = serializers.BooleanField(required=False)
    can_work_outdoor = serializers.BooleanField(required=False)
    has_leader_experience = serializers.BooleanField(required=False)
    new_to_volunteer = serializers.BooleanField(required=False)
    skills = serializers.ListField(
        child=serializers.CharField(max_length=50),
        required=False,
        allow_empty=True,
    )
    needs_meal_support = serializers.BooleanField(required=False)
    needs_travel_support = serializers.BooleanField(required=False)
    accepts_unpaid = serializers.BooleanField(required=False)


class CharityInterestsSerializer(serializers.Serializer):
    field_codes = serializers.ListField(
        child=serializers.CharField(max_length=50),
        allow_empty=True,
    )


class AvailabilityRuleSerializer(serializers.Serializer):
    weekday = serializers.IntegerField(min_value=1, max_value=7)
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()
    valid_from = serializers.DateField(required=False, allow_null=True)
    valid_to = serializers.DateField(required=False, allow_null=True)


class AvailabilityRulesReplaceSerializer(serializers.Serializer):
    rules = serializers.ListField(child=AvailabilityRuleSerializer(), allow_empty=True)


class AvailabilityExceptionSerializer(serializers.Serializer):
    date = serializers.DateField()
    is_available = serializers.BooleanField(default=False)
    start_time = serializers.TimeField(required=False, allow_null=True)
    end_time = serializers.TimeField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class AvailabilityCheckSerializer(serializers.Serializer):
    start_at = serializers.DateTimeField()
    end_at = serializers.DateTimeField()


class UserPublicCardSerializer(serializers.Serializer):
    """T1 Minimal Public Card (W24)."""
    uuid = serializers.UUIDField(read_only=True)
    display_name = serializers.CharField(read_only=True)


class UserT2CoordinatorCardSerializer(serializers.Serializer):
    """T2 Event-Scoped Volunteer Card for coordinators (W24)."""
    id = serializers.IntegerField(read_only=True)
    uuid = serializers.UUIDField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    skills = serializers.ListField(child=serializers.CharField(), read_only=True)
    physical_ok = serializers.BooleanField(read_only=True)
    good_eyesight = serializers.BooleanField(read_only=True)
    needs_glasses = serializers.BooleanField(read_only=True)
    can_lift_heavy = serializers.BooleanField(read_only=True)
    can_work_outdoor = serializers.BooleanField(read_only=True)
    has_leader_experience = serializers.BooleanField(read_only=True)
    new_to_volunteer = serializers.BooleanField(read_only=True)
    preferred_language = serializers.CharField(read_only=True)
    home_area = serializers.CharField(read_only=True, allow_null=True)
    needs_meal_support = serializers.BooleanField(read_only=True)
    needs_travel_support = serializers.BooleanField(read_only=True)
    accepts_unpaid = serializers.BooleanField(read_only=True)
    verification_status = serializers.CharField(read_only=True)
    assignment_status = serializers.CharField(read_only=True, allow_null=True)
    event_id = serializers.IntegerField(read_only=True, allow_null=True)


class AvailabilitySerializer(serializers.Serializer):
    """Composite serializer for rules and exceptions."""
    rules = AvailabilityRuleSerializer(many=True, read_only=True)
    exceptions = AvailabilityExceptionSerializer(many=True, read_only=True)


# Aliases for specification naming compatibility
ProfileSerializer = UserProfileSerializer
UserByUuidSerializer = UserPublicCardSerializer



# ---------------------------------------------------------------------------
# Phase 4 Identity Verification & Coordinator Serializers
# ---------------------------------------------------------------------------

class VerificationImageUploadSerializer(serializers.Serializer):
    image_type = serializers.ChoiceField(
        choices=["mock_selfie", "id_license", "driver_license"]
    )
    image = serializers.ImageField()


class VerificationImageSerializer(serializers.ModelSerializer):
    """Read-only metadata. image_path is intentionally excluded."""
    class Meta:
        model = UserVerificationImages
        fields = [
            "id", "image_type", "status", "comparison_status",
            "is_current", "reviewed_at", "created_at",
        ]
        read_only_fields = fields


class CoordinatorProfileSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(read_only=True)
    status = serializers.CharField(read_only=True)
    approved_by_id = serializers.IntegerField(read_only=True, allow_null=True)
    approved_at = serializers.DateTimeField(read_only=True, allow_null=True)
    notes = serializers.CharField(read_only=True, allow_null=True, allow_blank=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)


class CoordinatorApplySerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default="")



# ---------------------------------------------------------------------------
# Phase 6 Application & Assignment Serializers
# ---------------------------------------------------------------------------

class ApplicationSubmitSerializer(serializers.Serializer):
    event_id = serializers.IntegerField(required=False)
    post_id = serializers.IntegerField(required=False, allow_null=True)
    source = serializers.ChoiceField(
        choices=["browse", "qr_walkin", "invite"],
        default="browse",
    )
    qr_token_id = serializers.IntegerField(required=False, allow_null=True)
    note = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=1000
    )


class ApplicationStatusSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    event_id = serializers.IntegerField(read_only=True)
    event_title = serializers.SerializerMethodField()
    event_status = serializers.SerializerMethodField()
    post_id = serializers.IntegerField(read_only=True, allow_null=True)
    post_title = serializers.SerializerMethodField()
    source = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    applied_at = serializers.DateTimeField(read_only=True)
    decided_at = serializers.DateTimeField(read_only=True, allow_null=True)
    note = serializers.CharField(read_only=True, allow_null=True)

    def get_event_title(self, obj):
        if isinstance(obj, dict):
            return obj.get("event_title")
        return obj.event.title if getattr(obj, "event", None) else None

    def get_event_status(self, obj):
        if isinstance(obj, dict):
            return obj.get("event_status")
        return obj.event.status if getattr(obj, "event", None) else None

    def get_post_title(self, obj):
        if isinstance(obj, dict):
            return obj.get("post_title")
        return obj.post.title if getattr(obj, "post", None) else None


class ApplicationDecisionSerializer(serializers.Serializer):
    post_id = serializers.IntegerField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class AssignmentConfirmSerializer(serializers.Serializer):
    pass  # No body needed


class AssignmentCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class VolunteerAssignmentListSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    event_id = serializers.IntegerField(read_only=True)
    event_title = serializers.CharField(read_only=True)
    event_status = serializers.CharField(read_only=True)
    post_id = serializers.IntegerField(read_only=True, allow_null=True)
    post_title = serializers.CharField(read_only=True, allow_null=True)
    group_code = serializers.CharField(read_only=True, allow_null=True)
    is_group_leader = serializers.BooleanField(read_only=True)
    status = serializers.CharField(read_only=True)
    schedule_start = serializers.DateTimeField(read_only=True)
    schedule_end = serializers.DateTimeField(read_only=True)
    confirmed_at = serializers.DateTimeField(read_only=True, allow_null=True)


ApplicationCancelSerializer = AssignmentCancelSerializer
VolunteerApplicationListSerializer = ApplicationStatusSerializer

