# apps/audit/views.py
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.audit.serializers import (
    BlockUserSerializer,
    ModerationActionSerializer,
    ModerationReasonSerializer,
)
from apps.audit.services import (
    block_user,
    cancel_event_by_admin,
    close_account,
    dashboard_stats,
    delete_event,
    hide_feedback,
    reinstate_account,
    restore_event,
    unblock_user,
    warn_user,
)
from apps.common.permissions import IsAdminRole
from apps.events.models import Event
from apps.ops.models import Feedback


class AdminDashboardStatsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        stats = dashboard_stats()
        return Response(stats, status=status.HTTP_200_OK)


class AdminWarnUserView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        target_user = get_object_or_404(User, pk=pk)
        serializer = ModerationReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = warn_user(
            admin=request.user,
            target_user=target_user,
            reason=serializer.validated_data["reason"],
        )
        return Response(ModerationActionSerializer(action).data, status=status.HTTP_200_OK)


class AdminBlockUserView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        target_user = get_object_or_404(User, pk=pk)
        serializer = BlockUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = block_user(
            admin=request.user,
            target_user=target_user,
            reason=serializer.validated_data["reason"],
            expires_at=serializer.validated_data.get("expires_at"),
        )
        return Response(ModerationActionSerializer(action).data, status=status.HTTP_200_OK)


class AdminUnblockUserView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        target_user = get_object_or_404(User, pk=pk)
        serializer = ModerationReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = unblock_user(
            admin=request.user,
            target_user=target_user,
            reason=serializer.validated_data["reason"],
        )
        return Response(ModerationActionSerializer(action).data, status=status.HTTP_200_OK)


class AdminCloseAccountView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        target_user = get_object_or_404(User, pk=pk)
        serializer = ModerationReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = close_account(
            admin=request.user,
            target_user=target_user,
            reason=serializer.validated_data["reason"],
        )
        return Response(ModerationActionSerializer(action).data, status=status.HTTP_200_OK)


class AdminReinstateAccountView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        target_user = get_object_or_404(User, pk=pk)
        serializer = ModerationReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = reinstate_account(
            admin=request.user,
            target_user=target_user,
            reason=serializer.validated_data["reason"],
        )
        return Response(ModerationActionSerializer(action).data, status=status.HTTP_200_OK)


class AdminDeleteEventView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        serializer = ModerationReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = delete_event(
            admin=request.user,
            event=event,
            reason=serializer.validated_data["reason"],
        )
        return Response(ModerationActionSerializer(action).data, status=status.HTTP_200_OK)


class AdminRestoreEventView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        serializer = ModerationReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = restore_event(
            admin=request.user,
            event=event,
            reason=serializer.validated_data["reason"],
        )
        return Response(ModerationActionSerializer(action).data, status=status.HTTP_200_OK)


class AdminCancelEventView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        serializer = ModerationReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = cancel_event_by_admin(
            admin=request.user,
            event=event,
            reason=serializer.validated_data["reason"],
        )
        return Response(ModerationActionSerializer(action).data, status=status.HTTP_200_OK)


class AdminHideFeedbackView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        feedback = get_object_or_404(Feedback, pk=pk)
        serializer = ModerationReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = hide_feedback(
            admin=request.user,
            feedback=feedback,
            reason=serializer.validated_data["reason"],
        )
        return Response(ModerationActionSerializer(action).data, status=status.HTTP_200_OK)
