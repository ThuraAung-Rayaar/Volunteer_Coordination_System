import logging

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.exceptions import DomainError
from services import auth_service

from .serializers import (
    OtpRequestSerializer,
    OtpVerifySerializer,
    TokenizedOtpRequestResponseSerializer,
    TokenizedOtpRequestSerializer,
    TokenizedOtpVerifyResponseSerializer,
    TokenizedOtpVerifySerializer,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# v0.12.0 Tokenized Challenge Handshake Endpoints (AUTH-02, AUTH-03)
# ---------------------------------------------------------------------------

class TokenizedOtpRequestView(APIView):
    """
    POST /api/v1/auth/tokenized/request-otp/
    Public endpoint: creates an atomic login challenge and issues auth_session_token.
    Accepts identity_token (CIT envelope) or standard phone input over TLS.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        request=TokenizedOtpRequestSerializer,
        responses={200: TokenizedOtpRequestResponseSerializer},
        summary="Create login challenge / request tokenized OTP",
        description="Creates an atomic 180s challenge row bound to an OTP in PostgreSQL and returns an opaque auth_session_token.",
    )
    def post(self, request):
        serializer = TokenizedOtpRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        phone = data.get("phone")
        identity_token = data.get("identity_token")
        purpose = data.get("purpose", "login")
        request_id = data.get("request_id")

        if identity_token and not phone:
            # CIT verification stub: Client Identity Envelope decoding
            # Explicitly reject invalid envelopes per Section 4.3 (invalid_identity_token)
            raise DomainError(
                code="invalid_identity_token",
                message="Client Identity Envelope could not be decoded or verified.",
                status_code=400,
            )

        result = auth_service.request_tokenized_login_otp(
            raw_phone=phone,
            purpose=purpose,
            request_id=request_id,
        )
        return Response(result, status=status.HTTP_200_OK)


class TokenizedOtpVerifyView(APIView):
    """
    POST /api/v1/auth/tokenized/verify-otp/
    Public endpoint: verifies challenge code using auth_session_token and code ONLY.
    Does NOT accept or require phone number. Issues authoritative DRF Token on success.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        request=TokenizedOtpVerifySerializer,
        responses={200: TokenizedOtpVerifyResponseSerializer},
        summary="Verify login challenge",
        description="Verifies challenge using auth_session_token and 6-digit code. Consumes challenge row atomically and returns DRF Token.",
    )
    def post(self, request):
        serializer = TokenizedOtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        result = auth_service.verify_tokenized_login_otp(
            auth_session_token=data["auth_session_token"],
            code=data["code"],
            display_name=data.get("display_name"),
        )

        return Response(
            {
                "token": result["token"],
                "user": result["user"],
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Legacy Backward-Compatible Endpoints (Rollout Grace Period)
# ---------------------------------------------------------------------------

class OtpRequestView(APIView):
    """POST /api/v1/auth/otp/request/ — Deprecated legacy route."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        logger.info(
            "Legacy OTP request endpoint invoked",
            extra={"path": request.path, "ip": request.META.get("REMOTE_ADDR")},
        )
        serializer = OtpRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = auth_service.request_login_otp(
            raw_phone=serializer.validated_data["phone"],
            purpose=serializer.validated_data.get("purpose", "login"),
        )
        response = Response(result, status=status.HTTP_200_OK)
        response["Warning"] = '299 - "Deprecated auth endpoint: migrate to /api/v1/auth/tokenized/request-otp/"'
        return response


class OtpVerifyView(APIView):
    """POST /api/v1/auth/otp/verify/ — Deprecated legacy route."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        logger.info(
            "Legacy OTP verify endpoint invoked",
            extra={"path": request.path, "ip": request.META.get("REMOTE_ADDR")},
        )
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
            response = Response(
                {"error": {"code": code, "message": message}},
                status=status_code,
            )
            response["Warning"] = '299 - "Deprecated auth endpoint: migrate to /api/v1/auth/tokenized/verify-otp/"'
            return response

        user = result["user"]
        response = Response(
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
        response["Warning"] = '299 - "Deprecated auth endpoint: migrate to /api/v1/auth/tokenized/verify-otp/"'
        return response


class LogoutView(APIView):
    """POST /api/v1/auth/logout/"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        auth_service.logout_user(request.user, request.auth)
        return Response(status=status.HTTP_204_NO_CONTENT)


# Aliases for specification naming compatibility
RequestOtpView = OtpRequestView
VerifyOtpView = OtpVerifyView
