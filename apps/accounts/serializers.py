# apps/accounts/serializers.py
from rest_framework import serializers

from apps.accounts.models import CoordinatorProfile, User, UserCharityInterest, UserVerificationImage
from apps.common.constants import IMAGE_DRIVER_LICENSE, IMAGE_ID_LICENSE, IMAGE_MOCK_SELFIE


class OtpRequestSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=30)
    purpose = serializers.CharField(max_length=30, default="login", required=False)


class OtpVerifySerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=30)
    code = serializers.CharField(max_length=10)
    purpose = serializers.CharField(max_length=30, default="login", required=False)


class UserProfileSerializer(serializers.ModelSerializer):
    emergency_contact_phone = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )

    class Meta:
        model = User
        fields = [
            "id",
            "phone_hash",
            "display_name",
            "preferred_language",
            "home_area",
            "emergency_contact_name",
            "emergency_contact_phone",
            "blood_type",
            "is_willing_to_donate",
            "is_willing_to_donate_blood",
            "is_willing_to_donate_items",
            "physical_ok",
            "good_eyesight",
            "needs_glasses",
            "can_lift_heavy",
            "can_work_outdoor",
            "has_leader_experience",
            "new_to_volunteer",
            "skills",
            "needs_meal_support",
            "needs_travel_support",
            "accepts_unpaid",
            "is_admin",
            "account_status",
            "verification_status",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "phone_hash",
            "is_admin",
            "account_status",
            "verification_status",
            "created_at",
        ]


class VerificationImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserVerificationImage
        fields = [
            "id",
            "image_type",
            "file_format",
            "file_sha256",
            "status",
            "comparison_status",
            "comparison_score",
            "is_current",
            "reviewed_at",
            "note",
            "created_at",
        ]
        read_only_fields = fields


class VerificationImageUploadSerializer(serializers.Serializer):
    image_type = serializers.ChoiceField(
        choices=[
            (IMAGE_MOCK_SELFIE, "Mock Selfie"),
            (IMAGE_ID_LICENSE, "ID License"),
            (IMAGE_DRIVER_LICENSE, "Driver License"),
        ]
    )
    image = serializers.ImageField()


class CharityInterestsUpdateSerializer(serializers.Serializer):
    codes = serializers.ListField(
        child=serializers.CharField(max_length=50),
        allow_empty=True,
    )


class CoordinatorProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoordinatorProfile
        fields = [
            "status",
            "approved_at",
            "notes",
        ]
        read_only_fields = ["status", "approved_at"]


class CoordinatorApplySerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default="")
