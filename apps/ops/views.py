# apps/ops/views.py
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.common.security import hash_token
from apps.events.models import Event, EventApplication, EventPost
from apps.events.serializers import EventApplicationSerializer
from apps.ops.models import Assignment, Attendance, Feedback, QrToken
from apps.ops.serializers import (
    AssignmentCancelSerializer,
    AssignmentSerializer,
    AttendanceSerializer,
    CheckInSerializer,
    CheckOutSerializer,
    FeedbackCreateSerializer,
    FeedbackSerializer,
    ManualAssignmentSerializer,
    MarkAbsentSerializer,
    OnboardingAcknowledgeSerializer,
    OnboardingAcknowledgmentSerializer,
    QrTokenGenerateSerializer,
    QrTokenRedeemSerializer,
    QrTokenResolveSerializer,
    QrTokenSerializer,
)
from apps.ops.services import (
    acknowledge_onboarding,
    assign_manually,
    cancel_assignment,
    check_in,
    check_out,
    confirm_assignment,
    generate_qr_token,
    mark_absent,
    redeem_qr_token,
    resolve_qr_token,
    run_auto_assignment,
    submit_feedback,
)


class EventQrGenerateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        serializer = QrTokenGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        qr_token, raw_token = generate_qr_token(
            actor=request.user,
            event=event,
            purpose=serializer.validated_data["purpose"],
            max_uses=serializer.validated_data.get("max_uses"),
            ttl_minutes=serializer.validated_data.get("ttl_minutes", 240),
        )

        return Response(
            {
                "raw_token": raw_token,
                "token": raw_token,
                "qr_token": QrTokenSerializer(qr_token).data,
            },
            status=status.HTTP_201_CREATED,
        )


class QrResolveView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = QrTokenResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        preview = resolve_qr_token(raw_token=serializer.validated_data["token"])
        return Response(preview, status=status.HTTP_200_OK)


class QrRedeemView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = QrTokenRedeemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        res = redeem_qr_token(user=request.user, raw_token=serializer.validated_data["token"])
        return Response(res, status=status.HTTP_200_OK)


class EventAutoRunAssignmentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        assignments = run_auto_assignment(actor=request.user, event=event)
        return Response(
            AssignmentSerializer(assignments, many=True).data,
            status=status.HTTP_200_OK,
        )


class EventManualAssignmentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        serializer = ManualAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        application = get_object_or_404(
            EventApplication,
            pk=serializer.validated_data["application_id"],
            event=event,
        )

        post = None
        if serializer.validated_data.get("post_id"):
            post = get_object_or_404(
                EventPost,
                pk=serializer.validated_data["post_id"],
                event=event,
            )

        assignment = assign_manually(
            actor=request.user,
            application=application,
            post=post,
            group_code=serializer.validated_data.get("group_code"),
            is_group_leader=serializer.validated_data.get("is_group_leader", False),
        )

        return Response(AssignmentSerializer(assignment).data, status=status.HTTP_200_OK)


class AssignmentConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        assignment = get_object_or_404(Assignment, pk=pk)
        updated = confirm_assignment(user=request.user, assignment=assignment)
        return Response(AssignmentSerializer(updated).data, status=status.HTTP_200_OK)


class AssignmentCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        assignment = get_object_or_404(Assignment, pk=pk)
        serializer = AssignmentCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cancelled = cancel_assignment(
            actor=request.user,
            assignment=assignment,
            reason=serializer.validated_data.get("reason", ""),
        )
        return Response(AssignmentSerializer(cancelled).data, status=status.HTTP_200_OK)


class EventCheckInView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        serializer = CheckInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_user = request.user
        if serializer.validated_data.get("user_id"):
            target_user = get_object_or_404(User, pk=serializer.validated_data["user_id"])

        qr_token = None
        raw_token = serializer.validated_data.get("token")
        if raw_token:
            qr_token = QrToken.objects.filter(token_hash=hash_token(raw_token)).first()

        attendance = check_in(
            actor=request.user,
            event=event,
            user=target_user,
            method=serializer.validated_data.get("method", "qr_scan"),
            qr_token=qr_token,
        )
        return Response(AttendanceSerializer(attendance).data, status=status.HTTP_200_OK)


class EventCheckOutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        serializer = CheckOutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_user = request.user
        if serializer.validated_data.get("user_id"):
            target_user = get_object_or_404(User, pk=serializer.validated_data["user_id"])

        attendance = check_out(actor=request.user, event=event, user=target_user)
        return Response(AttendanceSerializer(attendance).data, status=status.HTTP_200_OK)


class EventMarkAbsentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        serializer = MarkAbsentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_user = get_object_or_404(User, pk=serializer.validated_data["user_id"])
        attendance = mark_absent(actor=request.user, event=event, user=target_user)
        return Response(AttendanceSerializer(attendance).data, status=status.HTTP_200_OK)


class EventOnboardingAcknowledgeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        serializer = OnboardingAcknowledgeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        ack = acknowledge_onboarding(
            user=request.user,
            event=event,
            method=serializer.validated_data.get("method", "app_tick"),
        )
        return Response(OnboardingAcknowledgmentSerializer(ack).data, status=status.HTTP_200_OK)


class EventFeedbackView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        event = get_object_or_404(Event, pk=pk)
        serializer = FeedbackCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_user = None
        if serializer.validated_data.get("target_user_id"):
            target_user = get_object_or_404(User, pk=serializer.validated_data["target_user_id"])

        feedback = submit_feedback(
            user=request.user,
            event=event,
            direction=serializer.validated_data["direction"],
            target_user=target_user,
            score=serializer.validated_data["score"],
            tags=serializer.validated_data.get("tags", []),
            comment=serializer.validated_data.get("comment", ""),
        )
        return Response(FeedbackSerializer(feedback).data, status=status.HTTP_201_CREATED)


class MeApplicationsListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = EventApplicationSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False) or not getattr(self.request.user, "is_authenticated", False):
            return EventApplication.objects.none()
        return (
            EventApplication.objects.filter(user=self.request.user)
            .select_related("event", "post")
            .order_by("-applied_at")
        )


class MeAssignmentsListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AssignmentSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False) or not getattr(self.request.user, "is_authenticated", False):
            return Assignment.objects.none()
        return (
            Assignment.objects.filter(user=self.request.user)
            .select_related("event", "post", "user")
            .order_by("-created_at")
        )
