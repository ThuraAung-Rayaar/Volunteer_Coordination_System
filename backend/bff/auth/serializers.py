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
