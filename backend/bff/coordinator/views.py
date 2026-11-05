from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.exceptions import DomainError
from common.permissions import IsApprovedCoordinator, get_event_for_manager_or_404
from services import (
    application_service,
    assignment_service,
    event_post_service,
    event_service,
    query_service,
)

from bff.volunteer.serializers import ApplicationDecisionSerializer
from .serializers import (
    AutoAssignResultSerializer,
    CancelEventSerializer,
    EventCreateSerializer,
    EventListSerializer,
    EventPostCreateSerializer,
    EventPostSerializer,
    EventPostUpdateSerializer,
    EventSummarySerializer,
    EventUpdateSerializer,
    HandoverSerializer,
    ManualAssignSerializer,
    RetakeSerializer,
)


class EventSummaryView(APIView):
    """GET /api/v1/coordinator/events/{id}/summary/ — manager-scoped summary.

    v_event_summary contains draft events and internal IDs, so it is gated to
    event managers. Non-managers receive a masked 404.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, event_id):
        get_event_for_manager_or_404(request.user, event_id, require_write=False)
        summary = query_service.get_event_summary(event_id)
        return Response(EventSummarySerializer(summary).data)


class CoordinatorEventListCreateView(APIView):
    """GET /api/v1/coordinator/events/ and POST /api/v1/coordinator/events/."""
    permission_classes = [IsAuthenticated, IsApprovedCoordinator]

    def get(self, request):
        events = event_service.list_coordinator_events(request.user)
        return Response({"results": EventListSerializer(events, many=True).data})

    def post(self, request):
        serializer = EventCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        charity_codes = data.pop("charity_field_codes", None)
        event = event_service.create_event(request.user, data, charity_codes)
        return Response({"id": event.id, "status": event.status}, status=status.HTTP_201_CREATED)


class CoordinatorEventDetailView(APIView):
    """PATCH /api/v1/coordinator/events/{event_id}/."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, event_id):
        serializer = EventUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        charity_codes = data.pop("charity_field_codes", None)
        event = event_service.update_event(request.user, event_id, data, charity_codes)
        return Response({"id": event.id, "status": event.status, "onboarding_version": event.onboarding_version})


class EventPublishView(APIView):
    """POST /api/v1/events/{event_id}/publish/."""
    permission_classes = [IsAuthenticated]

    def post(self, request, event_id):
        event = event_service.publish_event(request.user, event_id)
        return Response({"id": event.id, "status": event.status, "published_at": event.published_at})


class EventActivateView(APIView):
    """POST /api/v1/events/{event_id}/activate/."""
    permission_classes = [IsAuthenticated]

    def post(self, request, event_id):
        event = event_service.activate_event(request.user, event_id)
        return Response({"id": event.id, "status": event.status, "activated_at": event.activated_at})


class EventCompleteView(APIView):
    """POST /api/v1/events/{event_id}/complete/."""
    permission_classes = [IsAuthenticated]

    def post(self, request, event_id):
        event = event_service.complete_event(request.user, event_id)
        return Response({"id": event.id, "status": event.status, "completed_at": event.completed_at})


class EventCancelView(APIView):
    """POST /api/v1/events/{event_id}/cancel/."""
    permission_classes = [IsAuthenticated]

    def post(self, request, event_id):
        serializer = CancelEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = event_service.cancel_event(request.user, event_id, serializer.validated_data.get("reason"))
        return Response({"id": event.id, "status": event.status, "cancelled_at": event.cancelled_at})


class EventHandoverView(APIView):
    """POST /api/v1/events/{event_id}/handover/."""
    permission_classes = [IsAuthenticated]

    def post(self, request, event_id):
        serializer = HandoverSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = event_service.handover_event_coordinator(
            request.user,
            event_id,
            serializer.validated_data["new_coordinator_user_id"],
            serializer.validated_data.get("reason", ""),
        )
        return Response({"id": event.id, "current_coordinator_id": event.current_coordinator_id})


class EventRetakeView(APIView):
    """POST /api/v1/events/{event_id}/retake/."""
    permission_classes = [IsAuthenticated]

    def post(self, request, event_id):
        serializer = RetakeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = event_service.retake_event_coordinator(
            request.user, event_id, serializer.validated_data.get("reason", "")
        )
        return Response({"id": event.id, "current_coordinator_id": event.current_coordinator_id})


class CoordinatorEventPostsView(APIView):
    """GET and POST /api/v1/coordinator/events/{event_id}/posts/."""
    permission_classes = [IsAuthenticated]

    def get(self, request, event_id):
        get_event_for_manager_or_404(request.user, event_id, require_write=False)
        posts = event_post_service.get_event_posts_with_capacity(event_id)
        return Response({"results": EventPostSerializer(posts, many=True).data})

    def post(self, request, event_id):
        serializer = EventPostCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        post = event_post_service.create_event_post(request.user, event_id, serializer.validated_data)
        return Response({"id": post.id, "status": post.status}, status=status.HTTP_201_CREATED)


class EventPostDetailView(APIView):
    """PATCH /api/v1/posts/{post_id}/."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, post_id):
        serializer = EventPostUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        post = event_post_service.update_event_post(request.user, post_id, serializer.validated_data)
        return Response({"id": post.id, "status": post.status})


class EventPostCloseView(APIView):
    """POST /api/v1/posts/{post_id}/close/."""
    permission_classes = [IsAuthenticated]

    def post(self, request, post_id):
        post = event_post_service.close_event_post(request.user, post_id)
        return Response({"id": post.id, "status": post.status})


# --- View Aliases for Alternative View Naming Conventions -------------------
CoordinatorEventListView = CoordinatorEventListCreateView
CoordinatorEventPublishView = EventPublishView
CoordinatorEventActivateView = EventActivateView
CoordinatorEventCompleteView = EventCompleteView
CoordinatorEventCancelView = EventCancelView
CoordinatorEventHandoverView = EventHandoverView
CoordinatorEventRetakeView = EventRetakeView
CoordinatorEventPostListView = CoordinatorEventPostsView
CoordinatorEventPostDetailView = EventPostDetailView




# ---------------------------------------------------------------------------
# Phase 6 Views: Coordinator Applications & Assignments
# ---------------------------------------------------------------------------

class CoordinatorEventApplicationsView(APIView):
    """GET /api/v1/coordinator/events/{event_id}/applications/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, event_id):
        status_filter = request.query_params.get("status")
        apps = application_service.get_event_applications(
            request.user, event_id, status_filter=status_filter
        )
        return Response({"results": apps})


class ApplicationDecisionView(APIView):
    """POST /api/v1/applications/{id}/{action}/ where action is accept|reject|waitlist"""
    permission_classes = [IsAuthenticated]

    def post(self, request, application_id, action):
        serializer = ApplicationDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if action == "accept":
            app = application_service.accept_application(
                request.user, application_id, post_id=data.get("post_id")
            )
        elif action == "reject":
            app = application_service.reject_application(
                request.user, application_id, note=data.get("note")
            )
        elif action == "waitlist":
            app = application_service.waitlist_application(request.user, application_id)
        else:
            raise DomainError(
                code="invalid_action",
                message=f"Invalid decision action '{action}'.",
                status_code=400,
            )

        return Response({"id": app.id, "status": app.status})


class EventAutoAssignView(APIView):
    """POST /api/v1/coordinator/events/{event_id}/auto-assign/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, event_id):
        result = assignment_service.run_event_auto_assignment(request.user, event_id)
        return Response(result)


class EventManualAssignView(APIView):
    """POST /api/v1/coordinator/events/{event_id}/manual-assign/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, event_id):
        serializer = ManualAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        result = assignment_service.assign_volunteer_manually(
            actor=request.user,
            application_id=data["application_id"],
            post_id=data.get("post_id"),
            group_code=data.get("group_code"),
            is_group_leader=data.get("is_group_leader", False),
        )
        return Response(result, status=status.HTTP_201_CREATED)


class EventAssignmentsView(APIView):
    """GET /api/v1/coordinator/events/{event_id}/assignments/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, event_id):
        assignments = assignment_service.get_event_assignments(request.user, event_id)
        return Response({"results": assignments})


class EventUnassignedView(APIView):
    """GET /api/v1/coordinator/events/{event_id}/unassigned/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, event_id):
        unassigned = assignment_service.get_unassigned_accepted(request.user, event_id)
        return Response({"results": unassigned})


class EventPostCapacityView(APIView):
    """GET /api/v1/coordinator/events/{event_id}/post-capacity/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, event_id):
        get_event_for_manager_or_404(request.user, event_id, require_write=False)
        capacity = assignment_service.get_post_capacity_summary(event_id)
        return Response({"results": capacity})


# Coordinator Application View (W34)
from bff.volunteer.views import MeCoordinatorView
CoordinatorApplicationView = MeCoordinatorView

# Phase 6 Specification Action Views & Aliases
class CoordinatorApplicationAcceptView(APIView):
    """POST /api/v1/applications/{application_id}/accept/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, application_id):
        serializer = ApplicationDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        app = application_service.accept_application(
            request.user, application_id, post_id=serializer.validated_data.get("post_id")
        )
        return Response({"id": app.id, "status": app.status})


class CoordinatorApplicationRejectView(APIView):
    """POST /api/v1/applications/{application_id}/reject/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, application_id):
        serializer = ApplicationDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        app = application_service.reject_application(
            request.user, application_id, note=serializer.validated_data.get("note")
        )
        return Response({"id": app.id, "status": app.status})


class CoordinatorApplicationWaitlistView(APIView):
    """POST /api/v1/applications/{application_id}/waitlist/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, application_id):
        app = application_service.waitlist_application(request.user, application_id)
        return Response({"id": app.id, "status": app.status})


CoordinatorAutoAssignView = EventAutoAssignView
CoordinatorManualAssignView = EventManualAssignView
CoordinatorUnassignedAcceptedView = EventUnassignedView
CoordinatorPostCapacityView = EventPostCapacityView


