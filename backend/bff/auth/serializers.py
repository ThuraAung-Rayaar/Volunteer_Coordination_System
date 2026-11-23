from rest_framework import serializers


class OtpRequestSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    purpose = serializers.ChoiceField(
        choices=["login", "qr_registration"],
        default="login",
    )


class OtpVerifySerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    code = serializers.CharField(max_length=10)
    purpose = serializers.ChoiceField(
        choices=["login", "qr_registration"],
        default="login",
    )
    display_name = serializers.CharField(
        max_length=150, required=False, allow_blank=True
    )


# ---------------------------------------------------------------------------
# v0.12.0 Tokenized Challenge Handshake Serializers (AUTH-02, AUTH-03)
# ---------------------------------------------------------------------------

class TokenizedOtpDeliverySerializer(serializers.Serializer):
    provider = serializers.CharField()
    channel = serializers.CharField()
    delivered = serializers.BooleanField()
    configured = serializers.BooleanField()
    accepted = serializers.BooleanField(required=False, default=False)
    message_id = serializers.CharField(required=False, allow_null=True)
    error_category = serializers.CharField(required=False, allow_null=True)
    retryability = serializers.CharField(required=False, allow_null=True)


class TokenizedOtpRequestSerializer(serializers.Serializer):
    """
    POST /api/v1/auth/tokenized/request-otp/
    Accepts identity_token (CIT envelope) or phone (over TLS), purpose, and optional request_id.
    """
    identity_token = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    purpose = serializers.ChoiceField(
        choices=["login", "qr_registration"],
        default="login",
    )
    request_id = serializers.CharField(max_length=64, required=False, allow_blank=True)
    is_new_user = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        identity_token = attrs.get("identity_token")
        phone = attrs.get("phone")
        if not identity_token and not phone:
            raise serializers.ValidationError(
                {"phone": "Either phone or identity_token must be provided."}
            )
        return attrs


class TokenizedOtpRequestResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    auth_session_token = serializers.CharField()
    expires_in = serializers.IntegerField()
    code_length = serializers.IntegerField()
    delivery = TokenizedOtpDeliverySerializer()
    dev_code = serializers.CharField(required=False, allow_null=True)
    idempotent_reissue = serializers.BooleanField(required=False, default=False)


class TokenizedOtpVerifySerializer(serializers.Serializer):
    """
    POST /api/v1/auth/tokenized/verify-otp/
    Verifies challenge with auth_session_token and code only.
    MUST NOT accept or require phone.
    """
    auth_session_token = serializers.CharField(max_length=128)
    code = serializers.CharField(max_length=10)
    purpose = serializers.ChoiceField(
        choices=["login", "qr_registration"],
        default="login",
        required=False,
    )
    display_name = serializers.CharField(
        max_length=150, required=False, allow_blank=True, default=""
    )


class TokenizedAuthUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    uuid = serializers.CharField(allow_null=True)
    display_name = serializers.CharField()
    verification_status = serializers.CharField()


class TokenizedOtpVerifyResponseSerializer(serializers.Serializer):
    token = serializers.CharField()
    user = TokenizedAuthUserSerializer()
