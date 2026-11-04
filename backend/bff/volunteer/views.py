from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from services import (
    application_service,
    assignment_service,
    availability_service,
    coordinator_service,
    profile_service,
    query_service,
    verification_service,
)

from .serializers import (
    ApplicationCancelSerializer,
    ApplicationDecisionSerializer,
    ApplicationStatusSerializer,
    ApplicationSubmitSerializer,
    AssignmentCancelSerializer,
    AssignmentConfirmSerializer,
    AvailabilityCheckSerializer,
    AvailabilityExceptionSerializer,
    AvailabilityRulesReplaceSerializer,
    CharityInterestsSerializer,
    CoordinatorApplySerializer,
    CoordinatorProfileSerializer,
    ProfileUpdateSerializer,
    PublicEventPostSerializer,
    PublicEventSerializer,
    UserProfileSerializer,
    VerificationImageSerializer,
    VerificationImageUploadSerializer,
)


class PublicEventPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
    page_query_param = "page"


class PublicEventListView(APIView):
    """GET /api/v1/events/ — public event browsing (T0)."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        flat = {k: v[0] for k, v in request.query_params.lists()}
        queryset = query_service.list_public_events(flat)
        paginator = PublicEventPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = PublicEventSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class PublicEventDetailView(APIView):
    """GET /api/v1/events/{id}/ — public event detail with posts (T0)."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, event_id):
        event = query_service.get_public_event(event_id)
        posts = query_service.get_event_posts(event_id)
        data = PublicEventSerializer(event).data
        data["posts"] = PublicEventPostSerializer(posts, many=True).data
        return Response(data)


class PublicEventPostsView(APIView):
    """GET /api/v1/events/{id}/posts/ — public post list with capacity (T0)."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, event_id):
        posts = query_service.get_event_posts(event_id)
        return Response(PublicEventPostSerializer(posts, many=True).data)


# ---------------------------------------------------------------------------
# Phase 3 Views: Profile and Volunteer Availability
# ---------------------------------------------------------------------------

class MeProfileView(APIView):
    """GET /api/v1/me/ and PATCH /api/v1/me/ (also /api/profile/)"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = profile_service.get_user_profile(request.user)
        serializer = UserProfileSerializer(data)
        return Response(serializer.data)

    def patch(self, request):
        serializer = ProfileUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = profile_service.update_user_profile(
            request.user, serializer.validated_data
        )
        data = profile_service.get_user_profile(user)
        return Response(UserProfileSerializer(data).data)


class MeCharityInterestsView(APIView):
    """GET /api/v1/me/charity-interests/ and PUT /api/v1/me/charity-interests/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        codes = profile_service.get_charity_interests(request.user)
        return Response({"field_codes": codes})

    def put(self, request):
        serializer = CharityInterestsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        codes = profile_service.replace_charity_interests(
            request.user, serializer.validated_data["field_codes"]
        )
        return Response({"field_codes": codes})


class MeAvailabilityView(APIView):
    """GET /api/v1/me/availability/ — list rules and exceptions."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = availability_service.get_user_availability(request.user.id)
        return Response(data)


class MeAvailabilityRulesView(APIView):
    """POST /api/v1/me/availability/rules/ — replace weekly rules."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AvailabilityRulesReplaceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rules = availability_service.set_weekly_availability_rules(
            request.user.id, serializer.validated_data["rules"]
        )
        return Response({"rules": rules}, status=status.HTTP_200_OK)


class MeAvailabilityExceptionsView(APIView):
    """POST /api/v1/me/availability/exceptions/ — upsert a date exception."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AvailabilityExceptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        exc = availability_service.upsert_availability_exception(
            request.user.id, serializer.validated_data
        )
        return Response(exc, status=status.HTTP_200_OK)


class MeAvailabilityExceptionDetailView(APIView):
    """DELETE /api/v1/me/availability/exceptions/{id}/"""
    permission_classes = [IsAuthenticated]

    def delete(self, request, exception_id):
        availability_service.delete_availability_exception(
            request.user.id, exception_id
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class EventCheckAvailabilityView(APIView):
    """Check availability for a time window (POST) or an event (GET)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, event_id=None):
        if event_id is None:
            event_id = request.query_params.get("event_id")
        if event_id:
            result = application_service.check_user_availability_for_event(
                request.user, int(event_id)
            )
            return Response(result)
        return Response({"error": "event_id is required"}, status=status.HTTP_400_BAD_REQUEST)

    def post(self, request):
        serializer = AvailabilityCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        available = availability_service.check_user_availability(
            request.user.id,
            serializer.validated_data["start_at"],
            serializer.validated_data["end_at"],
        )
        conflict = availability_service.check_schedule_conflict(
            request.user.id,
            serializer.validated_data["start_at"],
            serializer.validated_data["end_at"],
        )
        return Response({"available": available, "schedule_conflict": conflict})


EventAvailabilityCheckView = EventCheckAvailabilityView


# ---------------------------------------------------------------------------
# Phase 6 Views: Applications & Volunteer Assignments
# ---------------------------------------------------------------------------

class EventApplyView(APIView):
    """POST /api/v1/events/{event_id}/apply/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, event_id):
        serializer = ApplicationSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        target_event_id = data.get("event_id") or event_id
        app = application_service.apply_to_event(
            user=request.user,
            event_id=int(target_event_id),
            post_id=data.get("post_id"),
            source=data.get("source", "browse"),
            qr_token_id=data.get("qr_token_id"),
            note=data.get("note", "") or "",
        )
        return Response(
            ApplicationStatusSerializer(app).data,
            status=status.HTTP_201_CREATED,
        )


class MyApplicationsView(APIView):
    """GET /api/v1/me/applications/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        event_id = request.query_params.get("event_id")
        apps = application_service.get_own_applications(
            request.user,
            event_id=int(event_id) if event_id else None,
        )
        return Response({"results": apps})


class ApplicationWithdrawView(APIView):
    """POST /api/v1/applications/{id}/withdraw/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, application_id):
        app = application_service.withdraw_application(request.user, application_id)
        return Response({"id": app.id, "status": app.status})


class MyAssignmentsView(APIView):
    """GET /api/v1/me/assignments/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        event_id = request.query_params.get("event_id")
        assignments = assignment_service.get_own_assignments(
            request.user,
            event_id=int(event_id) if event_id else None,
        )
        return Response({"results": assignments})


class AssignmentConfirmView(APIView):
    """POST /api/v1/assignments/{id}/confirm/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, assignment_id):
        assignment = assignment_service.confirm_assignment(request.user, assignment_id)
        return Response({"id": assignment.id, "status": assignment.status})


class AssignmentCancelView(APIView):
    """POST /api/v1/assignments/{id}/cancel/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, assignment_id):
        serializer = AssignmentCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment = assignment_service.cancel_assignment(
            request.user,
            assignment_id,
            reason=serializer.validated_data.get("reason", ""),
        )
        return Response({"id": assignment.id, "status": assignment.status})


# ---------------------------------------------------------------------------
# Phase 4 Views: Verification Images & Coordinator Applications
# ---------------------------------------------------------------------------

class MeVerificationImagesView(APIView):
    """GET /api/v1/me/verification-images/ and POST upload."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = verification_service.get_verification_status(request.user)
        return Response(data)

    def post(self, request):
        serializer = VerificationImageUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        image = verification_service.upload_verification_image(
            request.user,
            serializer.validated_data["image_type"],
            request.FILES["image"],
        )
        return Response(
            VerificationImageSerializer(image).data,
            status=status.HTTP_201_CREATED,
        )


class MeCoordinatorView(APIView):
    """GET / POST / PATCH /api/v1/me/coordinator/ (also /api/coordinator/)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = coordinator_service.get_coordinator_profile(request.user)
        if profile is None:
            return Response({"coordinator": None})
        return Response({"coordinator": CoordinatorProfileSerializer(profile).data})

    def post(self, request):
        serializer = CoordinatorApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        coordinator_service.apply_for_coordinator(
            request.user, serializer.validated_data.get("notes", "")
        )
        profile = coordinator_service.get_coordinator_profile(request.user)
        return Response(
            {"coordinator": CoordinatorProfileSerializer(profile).data},
            status=status.HTTP_201_CREATED,
        )

    def patch(self, request):
        serializer = CoordinatorApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        coordinator_service.update_coordinator_application(
            request.user, serializer.validated_data.get("notes", "")
        )
        profile = coordinator_service.get_coordinator_profile(request.user)
        return Response({"coordinator": CoordinatorProfileSerializer(profile).data})

