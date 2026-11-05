from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from services import auth_service

from .serializers import OtpRequestSerializer, OtpVerifySerializer


class OtpRequestView(APIView):
    """POST /api/v1/auth/otp/request/"""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = OtpRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = auth_service.request_login_otp(
            raw_phone=serializer.validated_data["phone"],
            purpose=serializer.validated_data.get("purpose", "login"),
        )
        return Response(result, status=status.HTTP_200_OK)


class OtpVerifyView(APIView):
    """POST /api/v1/auth/otp/verify/"""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = auth_service.verify_login_otp(
            raw_phone=serializer.validated_data["phone"],
            raw_code=serializer.validated_data["code"],
            purpose=serializer.validated_data.get("purpose", "login"),
            display_name=serializer.validated_data.get("display_name"),
        )

        if not result["ok"]:
            code = result["result"]
            status_code = status.HTTP_400_BAD_REQUEST
            message = "Verification failed."
            if code == "expired":
                message = "This verification code has expired. Please request a new one."
            elif code == "too_many_attempts":
                message = "Maximum verification attempts exceeded. Please request a new code."
                status_code = status.HTTP_429_TOO_MANY_REQUESTS
            elif code == "invalid_code":
                message = "Incorrect verification code."
            elif code == "no_otp":
                message = "No active verification code found. Please request a new code."
            return Response(
                {"error": {"code": code, "message": message}},
                status=status_code,
            )

        user = result["user"]
        return Response(
            {
                "token": result["token"],
                "user": {
                    "id": user.id,
                    "uuid": str(user.uuid) if hasattr(user, "uuid") and user.uuid else None,
                    "display_name": user.display_name,
                    "verification_status": user.verification_status,
                },
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    """POST /api/v1/auth/logout/"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        auth_service.logout_user(request.user, request.auth)
        return Response(status=status.HTTP_204_NO_CONTENT)


# Aliases for specification naming compatibility
RequestOtpView = OtpRequestView
VerifyOtpView = OtpVerifyView

