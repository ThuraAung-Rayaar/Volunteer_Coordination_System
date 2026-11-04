from django.http import FileResponse
from django.shortcuts import render
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import UserVerificationImages
from common.exceptions import DomainError, ResourceMaskedNotFound, log_security_event
from common.permissions import ensure_admin
from services import (
    audit_service,
    coordinator_service,
    feedback_service,
    maintenance_service,
    moderation_service,
    query_service,
    verification_service,
)

from .serializers import (
    AdminVerificationImageSerializer,
    BlockUserSerializer,
    FeedbackSubmitSerializer,
    HideFeedbackSerializer,
    ModerationActionSerializer,
    ReviewImageSerializer,
)


# ---------------------------------------------------------------------------
# Template Views
# ---------------------------------------------------------------------------

def dashboard_view(request):
    return render(request, "admin_portal/dashboard.html", {})


def geo_monitoring_view(request):
    return render(request, "admin_portal/geo_monitoring.html", {})


def coordinator_board_view(request):
    return render(request, "admin_portal/coordinator_board.html", {})


# ---------------------------------------------------------------------------
# Administrative API Views (Phase 4)
# ---------------------------------------------------------------------------

class AdminPendingVerificationImagesView(APIView):
    """GET /api/v1/admin/verification-images/ — pending review queue."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_admin(request)
        rows = verification_service.get_pending_images_for_admin(request.user)
        return Response({"results": rows})


class AdminVerificationImageFileView(APIView):
    """GET /api/v1/admin/verification-images/{id}/file/ — private stream."""
    permission_classes = [IsAuthenticated]

    def get(self, request, image_id):
        ensure_admin(request)  # raises masked 404 for non-admins
        image = UserVerificationImages.objects.filter(id=image_id).first()
        if image is None:
            raise ResourceMaskedNotFound()
        log_security_event(
            request,
            action="security.warning.admin_image_view",
            entity_type="user_verification_images",
            entity_id=image.id,
        )
        path = verification_service.resolve_private_image_path(image)
        return FileResponse(open(path, "rb"), content_type="image/jpeg")


class AdminReviewVerificationImageView(APIView):
    """POST /api/v1/admin/verification-images/{id}/review/."""
    permission_classes = [IsAuthenticated]

    def post(self, request, image_id):
        ensure_admin(request)
        serializer = ReviewImageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        image = verification_service.review_verification_image(
            actor=request.user,
            image_id=image_id,
            decision=serializer.validated_data["decision"],
            note=serializer.validated_data.get("note", ""),
            comparison_status=serializer.validated_data.get("comparison_status"),
            comparison_score=serializer.validated_data.get("comparison_score"),
        )
        return Response(AdminVerificationImageSerializer(image).data)


class AdminPendingCoordinatorsView(APIView):
    """GET /api/v1/admin/coordinators/ — pending coordinator applications."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_admin(request)
        rows = coordinator_service.get_pending_coordinator_applications(request.user)
        return Response({"results": rows})


class AdminCoordinatorDecisionView(APIView):
    """
    POST /api/v1/admin/coordinators/{user_id}/{action}/ where action is
    approve | suspend | revoke.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id, action):
        ensure_admin(request)
        notes = request.data.get("notes", "")
        if action == "approve":
            profile = coordinator_service.approve_coordinator(request.user, user_id, notes)
        elif action == "suspend":
            profile = coordinator_service.suspend_coordinator(request.user, user_id, notes)
        elif action == "revoke":
            profile = coordinator_service.revoke_coordinator(request.user, user_id, notes)
        else:
            raise DomainError(
                message="Invalid coordinator action.",
                code="invalid_decision",
                status_code=400,
            )
        return Response({
            "user_id": profile.user_id,
            "status": profile.status,
            "approved_by_id": profile.approved_by_id,
            "approved_at": profile.approved_at,
        })


# ---------------------------------------------------------------------------
# Administrative API Views (Phase 8: Governance, Moderation, Audit, Dashboards)
# ---------------------------------------------------------------------------

class AdminDashboardView(APIView):
    """GET /api/v1/admin/dashboard/ — A01."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_admin(request)
        return Response(query_service.get_admin_dashboard())


class AdminModerationView(APIView):
    """POST /api/v1/admin/moderation/ — generic insert-to-apply moderation."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ensure_admin(request)
        serializer = ModerationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        action = moderation_service.record_moderation_action(
            request.user,
            action_type=data["action_type"],
            target_user_id=data.get("target_user_id"),
            event_id=data.get("event_id"),
            feedback_id=data.get("feedback_id"),
            reason=data.get("reason", ""),
            expires_at=data.get("expires_at"),
        )
        return Response({"id": action.id, "action_type": action.action_type}, status=status.HTTP_201_CREATED)


class AdminUserActionView(APIView):
    """POST /api/v1/admin/users/{id}/{action}/ where action is
    warn|block|unblock|close|reinstate."""
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id, action):
        ensure_admin(request)
        action_map = {
            "warn": "user_warning",
            "block": "user_block",
            "unblock": "user_unblock",
            "close": "account_close",
            "reinstate": "account_reinstate",
        }
        if action not in action_map:
            raise ResourceMaskedNotFound()
        serializer = BlockUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        moderation_service.record_moderation_action(
            request.user,
            action_type=action_map[action],
            target_user_id=user_id,
            reason=serializer.validated_data.get("reason", ""),
            expires_at=serializer.validated_data.get("expires_at"),
        )
        return Response({"user_id": user_id, "action": action})


class AdminEventActionView(APIView):
    """POST /api/v1/admin/events/{id}/{action}/ where action is cancel|delete|restore."""
    permission_classes = [IsAuthenticated]

    def post(self, request, event_id, action):
        ensure_admin(request)
        action_map = {"cancel": "event_cancel", "delete": "event_delete", "restore": "event_restore"}
        if action not in action_map:
            raise ResourceMaskedNotFound()
        serializer = BlockUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        moderation_service.record_moderation_action(
            request.user,
            action_type=action_map[action],
            event_id=event_id,
            reason=serializer.validated_data.get("reason", ""),
        )
        return Response({"event_id": event_id, "action": action})


class AdminHideFeedbackView(APIView):
    """POST /api/v1/admin/feedback/{id}/hide/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, feedback_id):
        ensure_admin(request)
        serializer = HideFeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        moderation_service.record_moderation_action(
            request.user,
            action_type="feedback_hide",
            feedback_id=feedback_id,
            reason=serializer.validated_data["reason"],
        )
        return Response({"feedback_id": feedback_id, "status": "hidden"})


class AdminAuditLogsView(APIView):
    """GET /api/v1/admin/audit/ — Super Admin only (A05)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        records = audit_service.get_audit_records(
            request.user,
            entity_type=request.query_params.get("entity_type"),
            entity_id=int(request.query_params["entity_id"]) if request.query_params.get("entity_id") else None,
            action=request.query_params.get("action"),
        )
        return Response({"results": records})


class AdminCoordinatorHistoryView(APIView):
    """GET /api/v1/admin/coordinator-history/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        event_id = request.query_params.get("event_id")
        rows = audit_service.get_event_coordinator_history(
            request.user, event_id=int(event_id) if event_id else None
        )
        return Response({"results": rows})


class AdminModerationSummaryView(APIView):
    """GET /api/v1/admin/users/{id}/moderation-summary/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        ensure_admin(request)
        summary = query_service.get_user_moderation_summary(user_id)
        if summary is None:
            return Response({"user_id": user_id, "warning_count": 0, "block_count": 0})
        return Response(summary)


class AdminGeoMonitoringView(APIView):
    """GET /api/v1/admin/geo-monitoring/ — geo attempt telemetry for fraud review."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_admin(request)
        from apps.attendance.models import VGeoAttemptsReview
        rows = VGeoAttemptsReview.objects.all().order_by("-attempted_at")[:200]
        return Response({"results": list(rows.values())})


class AdminRunMaintenanceView(APIView):
    """POST /api/v1/admin/maintenance/run/ — Super Admin only (A12)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ensure_admin(request, require_superuser=True)
        summary = maintenance_service.run_all_maintenance()
        return Response(summary)

