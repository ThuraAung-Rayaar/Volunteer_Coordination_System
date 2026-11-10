from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.events.models import VPublicEvents
from common.permissions import get_visible_event_or_404
from common.privacy import can_access_event_t2
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
    CharityFieldSerializer,
    CharityInterestsSerializer,
    CoordinatorApplySerializer,
    CoordinatorProfileSerializer,
    ProfileUpdateSerializer,
    PublicEventDetailSerializer,
    PublicEventPostSerializer,
    PublicEventSerializer,
    UserProfileSerializer,
    UserPublicCardSerializer,
    UserT2CoordinatorCardSerializer,
    VerificationImageSerializer,
    VerificationImageUploadSerializer,
)


class PublicEventPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
    page_query_param = "page"


class CharityFieldsListView(APIView):
    """GET /api/v1/charity-fields/ — active charity fields taxonomy (T0 - W161)."""
    permission_classes = [AllowAny]

    def get(self, request):
        fields = query_service.list_active_charity_fields()
        serializer = CharityFieldSerializer(fields, many=True)
        return Response(serializer.data)


class PublicEventListView(APIView):
    """GET /api/v1/events/ — public event browsing (T0 - W158)."""
    permission_classes = [AllowAny]

    def get(self, request):
        flat = {}
        for k, v in request.query_params.lists():
            if k == "charity_field":
                flat[k] = ",".join(v)
            else:
                flat[k] = v[0]
        queryset = query_service.list_public_events(flat)
        paginator = PublicEventPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = PublicEventSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class PublicEventDetailView(APIView):
    """GET /api/v1/events/{id}/ — public event detail with posts and conditional T2 fields (W159)."""
    permission_classes = [AllowAny]

    def get(self, request, event_id):
        event = get_visible_event_or_404(request.user, event_id)
        pub_event = VPublicEvents.objects.filter(event_id=event.id).first()
        if pub_event is not None:
            base_data = PublicEventSerializer(pub_event).data
        else:
            # Fallback for authorized manager/participant viewing draft or cancelled event
            coord_name = ""
            if event.current_coordinator and hasattr(event.current_coordinator, "user"):
                coord_name = getattr(event.current_coordinator.user, "display_name", "")
            charity_codes = list(event.charity_fields.values_list("field_code_id", flat=True))
            base_data = {
                "id": event.id,
                "title": event.title,
                "description": event.description,
                "purpose_type": event.purpose_type,
                "location_name": event.location_name,
                "landmark_text": event.landmark_text,
                "latitude": str(event.latitude) if event.latitude is not None else None,
                "longitude": str(event.longitude) if event.longitude is not None else None,
                "geo_radius_m": event.geo_radius_m,
                "geo_checkin_enabled": event.geo_checkin_enabled,
                "map_provider": event.map_provider,
                "start_at": event.start_at.isoformat() if event.start_at else None,
                "end_at": event.end_at.isoformat() if event.end_at else None,
                "application_deadline": event.application_deadline.isoformat() if event.application_deadline else None,
                "status": event.status,
                "acceptance_mode": event.acceptance_mode,
                "max_participants": event.max_participants,
                "meals_provided": event.meals_provided,
                "lodging_provided": event.lodging_provided,
                "travel_support_provided": event.travel_support_provided,
                "compensation_kind": event.compensation_kind,
                "coordinator_name": coord_name,
                "charity_fields": charity_codes,
                "spots_remaining": event.max_participants or 0,
            }

        posts = query_service.get_event_posts(event.id, verified_visible=True)
        data = dict(base_data)
        data["posts"] = posts
        has_t2 = can_access_event_t2(request.user, event)
        if has_t2:
            data["onboarding_text"] = event.onboarding_text
            data["onboarding_version"] = event.onboarding_version
            data["compensation_note"] = event.compensation_note

        serializer = PublicEventDetailSerializer(data, context={"can_access_t2": has_t2})
        return Response(serializer.data)


class PublicEventPostsView(APIView):
    """GET /api/v1/events/{id}/posts/ — public post list with capacity (T0 - W160)."""
    permission_classes = [AllowAny]

    def get(self, request, event_id):
        event = get_visible_event_or_404(request.user, event_id)
        posts = query_service.get_event_posts(event.id, verified_visible=True)
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
    """GET /api/v1/me/availability/ — list rules and exceptions; PUT replaces rules."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = availability_service.get_user_availability(request.user.id)
        return Response(data)

    def put(self, request):
        serializer = AvailabilityRulesReplaceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rules = availability_service.set_weekly_availability_rules(
            request.user.id, serializer.validated_data["rules"]
        )
        return Response({"rules": rules}, status=status.HTTP_200_OK)


class UserByUuidView(APIView):
    """GET /api/v1/users/by-uuid/{uuid}/ — Public UUID lookup & coordinator scan (W24)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, uuid):
        event_id = request.query_params.get("event_id")
        parsed_event_id = int(event_id) if event_id and event_id.isdigit() else None
        data = profile_service.lookup_user_by_uuid(
            actor=request.user,
            target_uuid=uuid,
            event_id=parsed_event_id,
        )
        return Response(data, status=status.HTTP_200_OK)


# Aliases for specification naming compatibility
ProfileView = MeProfileView
AvailabilityView = MeAvailabilityView



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


# Alias for alternative view naming conventions
MyVerificationImagesView = MeVerificationImagesView
VolunteerApplyEventView = EventApplyView
VolunteerMyApplicationsView = MyApplicationsView
VolunteerWithdrawApplicationView = ApplicationWithdrawView
VolunteerMyAssignmentsView = MyAssignmentsView
VolunteerConfirmAssignmentView = AssignmentConfirmView
VolunteerCancelAssignmentView = AssignmentCancelView


class VolunteerFeedbackView(APIView):
    """GET /api/v1/volunteer/feedback/ — volunteer aggregate feedback summary."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from services import feedback_service
        summary = feedback_service.get_user_feedback_summary(request.user.id)
        rows = feedback_service.get_own_feedback(request.user)
        return Response({"results": rows, "summary": summary})


VolunteerFeedbackSummaryView = VolunteerFeedbackView



