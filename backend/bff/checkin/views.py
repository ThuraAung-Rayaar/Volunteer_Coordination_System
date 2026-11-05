from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from services import attendance_service, geo_service, onboarding_service, qr_service

from .serializers import (
    ConfirmAttendanceSerializer,
    GeoCheckinSerializer,
    ManualCheckinSerializer,
    OnboardingStatusSerializer,
    QrRedeemSerializer,
    QrResolveSerializer,
    QrTokenCreateSerializer,
    QrTokenSerializer,
    RejectAttendanceSerializer,
)


# --- Onboarding (volunteer) -------------------------------------------------

class EventOnboardingView(APIView):
    """GET /api/v1/events/{event_id}/onboarding/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, event_id):
        data = onboarding_service.get_event_onboarding(request.user, event_id)
        return Response(OnboardingStatusSerializer(data).data)


class EventOnboardingAcknowledgeView(APIView):
    """POST /api/v1/events/{event_id}/onboarding/acknowledge/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, event_id):
        ack = onboarding_service.acknowledge_event_onboarding(request.user, event_id)
        return Response(
            {"event_id": event_id, "onboarding_version": ack.onboarding_version, "acknowledged": True},
            status=status.HTTP_200_OK,
        )


# --- QR (resolve is public; redeem requires auth) ---------------------------

class QrResolveView(APIView):
    """POST /api/v1/qr/resolve/ — read-only preview, consumes nothing."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = QrResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = qr_service.preview_qr_token(serializer.validated_data["token"])
        # Never expose token_id internals beyond validity; keep it minimal.
        return Response({
            "event_id": data["event_id"],
            "purpose": data["purpose"],
            "is_valid": data["is_valid"],
            "reason": data["reason"],
        })


class QrRedeemView(APIView):
    """POST /api/v1/qr/redeem/ — dispatches by purpose."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = QrRedeemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = qr_service.redeem_qr_token(request.user, serializer.validated_data["token"])
        return Response(result)


class QrTokenCreateView(APIView):
    """POST /api/v1/coordinator/events/{event_id}/qr-tokens/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, event_id):
        serializer = QrTokenCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = qr_service.create_event_qr_token(
            request.user,
            event_id,
            purpose=data["purpose"],
            max_uses=data.get("max_uses"),
            ttl_minutes=data.get("ttl_minutes", 240),
        )
        return Response(QrTokenSerializer(result).data, status=status.HTTP_201_CREATED)


class QrTokenRevokeView(APIView):
    """POST /api/v1/coordinator/qr-tokens/{qr_id}/revoke/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, qr_id):
        qr = qr_service.revoke_event_qr_token(request.user, qr_id)
        return Response({"id": qr.id, "revoked_at": qr.revoked_at})


# --- Check-in (QR / Manual / Geo) -------------------------------------------

class AttendanceQrCheckinView(APIView):
    """POST /api/v1/attendance/qr-checkin/"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = QrRedeemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = qr_service.qr_check_in(request.user, serializer.validated_data["token"])
        return Response(result)


class AttendanceManualCheckinView(APIView):
    """POST /api/v1/attendance/manual-checkin/ or /events/{event_id}/check-in/ (coordinator only)"""
    permission_classes = [IsAuthenticated]

    def post(self, request, event_id=None):
        serializer = ManualCheckinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        target_event_id = event_id or data.get("event_id")
        if not target_event_id:
            return Response({"detail": "event_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        att = attendance_service.manual_check_in(
            request.user, target_event_id, data["user_id"], data.get("note", "")
        )
        return Response({"id": att.id, "status": att.status, "method": att.method})


class AttendanceGeoCheckinView(APIView):
    """POST /api/v1/attendance/geo-checkin/ or /events/{event_id}/geo-check-in/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, event_id=None):
        serializer = GeoCheckinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        target_event_id = event_id or data.get("event_id")
        if not target_event_id:
            return Response({"detail": "event_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        result = geo_service.submit_geo_check_in(
            request.user,
            target_event_id,
            data["latitude"],
            data["longitude"],
            accuracy_m=data.get("accuracy_m"),
            captured_at=data.get("captured_at"),
            is_mocked=data.get("is_mocked", False),
        )
        http_status = status.HTTP_200_OK if result["success"] else status.HTTP_400_BAD_REQUEST
        return Response(result, status=http_status)


class AttendanceCheckoutView(APIView):
    """POST /api/v1/attendance/{attendance_id}/checkout/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, attendance_id):
        att = attendance_service.check_out(request.user, attendance_id)
        return Response({"id": att.id, "status": att.status, "checkout_at": att.checkout_at})


# --- Coordinator confirmation & boards --------------------------------------

class CoordinatorAttendanceBoardView(APIView):
    """GET /api/v1/coordinator/events/{event_id}/attendance/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, event_id):
        rows = attendance_service.get_event_attendance_board(request.user, event_id)
        return Response({"results": rows})


class CoordinatorPendingConfirmationsView(APIView):
    """GET /api/v1/coordinator/events/{event_id}/attendance/pending/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, event_id):
        rows = attendance_service.get_pending_confirmations(request.user, event_id)
        return Response({"results": rows})


class CoordinatorGeoAttemptsView(APIView):
    """GET /api/v1/coordinator/events/{event_id}/geo-attempts/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, event_id):
        rows = attendance_service.get_geo_attempts_review(request.user, event_id)
        return Response({"results": rows})


class CoordinatorConfirmAttendanceView(APIView):
    """POST /api/v1/coordinator/attendance/{attendance_id}/confirm/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, attendance_id):
        serializer = ConfirmAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        attendance_service.confirm_attendance(
            request.user, attendance_id, serializer.validated_data.get("note")
        )
        return Response({"id": attendance_id, "confirmation_status": "confirmed"})


class CoordinatorRejectAttendanceView(APIView):
    """POST /api/v1/coordinator/attendance/{attendance_id}/reject/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, attendance_id):
        serializer = RejectAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        attendance_service.reject_attendance(
            request.user, attendance_id, serializer.validated_data["reason"]
        )
        return Response({"id": attendance_id, "confirmation_status": "rejected"})


# --- Feedback (Volunteer & Coordinator) -------------------------------------

class EventFeedbackSubmitView(APIView):
    """POST /api/v1/events/{event_id}/feedback/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, event_id):
        from admin_portal.serializers import FeedbackSubmitSerializer
        from services import feedback_service
        serializer = FeedbackSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        feedback = feedback_service.submit_event_feedback(
            request.user,
            event_id,
            direction=data["direction"],
            score=data["score"],
            tags=data.get("tags"),
            comment=data.get("comment", ""),
            target_user_id=data.get("target_user_id"),
        )
        return Response({"id": feedback.id, "status": feedback.status}, status=status.HTTP_201_CREATED)

    def get(self, request, event_id):
        from services import feedback_service
        rows = feedback_service.get_event_feedback(request.user, event_id)
        return Response({"results": rows})


class EventFeedbackListView(APIView):
    """GET /api/v1/events/{event_id}/feedback/list/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, event_id):
        from services import feedback_service
        rows = feedback_service.get_event_feedback(request.user, event_id)
        return Response({"results": rows})


class MyFeedbackView(APIView):
    """GET /api/v1/me/feedback/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from services import feedback_service
        rows = feedback_service.get_own_feedback(request.user)
        return Response({"results": rows})


# --- Self-Service Volunteer Attendance History (BR-PRIV-T4) -----------------

class UserAttendanceHistoryView(APIView):
    """GET /api/v1/me/attendance/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        records = attendance_service.get_user_attendance_history(request.user)
        return Response({"results": records})


# --- Spec & BFF View Aliases ------------------------------------------------

EventOnboardingStatusView = EventOnboardingView
EventQrTokenCreateView = QrTokenCreateView
EventQrTokenRevokeView = QrTokenRevokeView
EventQrTokenRedeemView = QrRedeemView
GeoCheckInView = AttendanceGeoCheckinView
ManualCheckInView = AttendanceManualCheckinView
CheckOutView = AttendanceCheckoutView
AttendanceConfirmView = CoordinatorConfirmAttendanceView
AttendanceRejectView = CoordinatorRejectAttendanceView
EventAttendanceRosterView = CoordinatorAttendanceBoardView


