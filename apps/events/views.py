# apps/events/views.py
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.constants import (
    ACTIVE_ASSIGNMENT_STATUSES,
    EVENT_ACTIVE,
    EVENT_PUBLISHED,
)
from apps.common.exceptions import PermissionDeniedError
from apps.common.permissions import (
    IsActiveAccount,
    ensure_event_manager,
    is_admin,
    is_event_manager,
)
from apps.events.models import CharityField, Event, EventApplication, EventPost
from apps.events.serializers import (
    CharityFieldSerializer,
    EventApplicationCreateSerializer,
    EventApplicationSerializer,
    EventCreateUpdateSerializer,
    EventPostCreateSerializer,
    EventPostSerializer,
    EventSerializer,
)
from apps.events.services import (
    accept_application,
    activate_event,
    add_post,
    apply_to_event,
    cancel_event,
    close_post,
    complete_event,
    create_event,
    publish_event,
    reject_application,
    update_event,
    update_post,
    waitlist_application,
    withdraw_application,
)
from apps.ops.models import Assignment, Attendance, QrToken


class CharityFieldListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        fields = CharityField.objects.filter(active=True).order_by("sort_order")
        return Response(CharityFieldSerializer(fields, many=True).data)


class PublicEventListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = Event.objects.visible().filter(status__in=[EVENT_PUBLISHED, EVENT_ACTIVE])

        charity_field = request.query_params.get("charity_field")
        if charity_field:
            qs = qs.filter(charity_links__field_code_id=charity_field)

        date_from = request.query_params.get("date_from")
        if date_from:
            qs = qs.filter(start_at__gte=date_from)

        date_to = request.query_params.get("date_to")
        if date_to:
            qs = qs.filter(start_at__lte=date_to)

        q = request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(title__icontains=q)
                | Q(description__icontains=q)
                | Q(location_name__icontains=q)
                | Q(landmark_text__icontains=q)
            )

        qs = qs.distinct().order_by("start_at")
        return Response(EventSerializer(qs, many=True).data)


class PublicEventDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        event = get_object_or_404(Event.objects.visible(), pk=pk)
        if event.status not in (EVENT_PUBLISHED, EVENT_ACTIVE):
            if not is_event_manager(request.user, event):
                raise PermissionDeniedError("Event is not publicly visible.")
        return Response(EventSerializer(event).data)


class CoordinatorEventListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def get(self, request):
        if is_admin(request.user):
            qs = Event.objects.visible()
        else:
            qs = Event.objects.visible().filter(coordinator=request.user)
        qs = qs.order_by("-created_at")
        return Response(EventSerializer(qs, many=True).data)

    def post(self, request):
        serializer = EventCreateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = create_event(
            actor=request.user,
            data=serializer.validated_data,
        )
        return Response(EventSerializer(event).data, status=status.HTTP_201_CREATED)


class CoordinatorEventDetailPatchView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def patch(self, request, pk):
        event = get_object_or_404(Event.objects.visible(), pk=pk)
        serializer = EventCreateUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated_event = update_event(
            actor=request.user,
            event=event,
            data=serializer.validated_data,
        )
        return Response(EventSerializer(updated_event).data)


class EventPublishView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def post(self, request, pk):
        event = get_object_or_404(Event.objects.visible(), pk=pk)
        published = publish_event(request.user, event)
        return Response(EventSerializer(published).data)


class EventActivateView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def post(self, request, pk):
        event = get_object_or_404(Event.objects.visible(), pk=pk)
        activated = activate_event(request.user, event)
        return Response(EventSerializer(activated).data)


class EventCompleteView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def post(self, request, pk):
        event = get_object_or_404(Event.objects.visible(), pk=pk)
        completed = complete_event(request.user, event)
        return Response(EventSerializer(completed).data)


class EventCancelView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def post(self, request, pk):
        event = get_object_or_404(Event.objects.visible(), pk=pk)
        reason = request.data.get("reason", "")
        cancelled = cancel_event(request.user, event, reason=reason)
        return Response(EventSerializer(cancelled).data)


class EventPostListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated(), IsActiveAccount()]

    def get(self, request, pk):
        event = get_object_or_404(Event.objects.visible(), pk=pk)
        posts = event.posts.all().order_by("priority", "id")
        return Response(EventPostSerializer(posts, many=True).data)

    def post(self, request, pk):
        event = get_object_or_404(Event.objects.visible(), pk=pk)
        serializer = EventPostCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        post = add_post(request.user, event, serializer.validated_data)
        return Response(EventPostSerializer(post).data, status=status.HTTP_201_CREATED)


class PostDetailPatchView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def patch(self, request, pk):
        post = get_object_or_404(EventPost, pk=pk)
        if request.data.get("status") == "closed":
            closed_post = close_post(request.user, post)
            return Response(EventPostSerializer(closed_post).data)
        updated_post = update_post(request.user, post, request.data)
        return Response(EventPostSerializer(updated_post).data)


class EventApplyView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def post(self, request, pk):
        event = get_object_or_404(Event.objects.visible(), pk=pk)
        serializer = EventApplicationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        post = None
        post_id = serializer.validated_data.get("post_id")
        if post_id:
            post = get_object_or_404(event.posts, pk=post_id)

        qr_token = None
        qr_token_id = serializer.validated_data.get("qr_token_id")
        if qr_token_id:
            qr_token = get_object_or_404(QrToken, pk=qr_token_id)

        source = serializer.validated_data.get("source", "browse")
        application = apply_to_event(
            user=request.user,
            event=event,
            post=post,
            source=source,
            qr_token=qr_token,
        )
        return Response(
            EventApplicationSerializer(application).data,
            status=status.HTTP_201_CREATED,
        )


class EventApplicationsListView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def get(self, request, pk):
        event = get_object_or_404(Event.objects.visible(), pk=pk)
        ensure_event_manager(request.user, event)
        apps = event.applications.all().order_by("-created_at")
        return Response(EventApplicationSerializer(apps, many=True).data)


class EventRosterView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def get(self, request, pk):
        event = get_object_or_404(Event.objects.visible(), pk=pk)
        ensure_event_manager(request.user, event)

        assignments = (
            Assignment.objects.filter(event=event)
            .select_related("user", "post")
            .order_by("group_code", "id")
        )
        attendances = {
            att.user_id: att.status
            for att in Attendance.objects.filter(event=event)
        }

        roster = []
        for a in assignments:
            roster.append(
                {
                    "assignment_id": a.id,
                    "user_id": a.user_id,
                    "display_name": a.user.display_name,
                    "post_id": a.post_id,
                    "post_title": a.post.title if a.post else None,
                    "group_code": a.group_code,
                    "is_group_leader": a.is_group_leader,
                    "status": a.status,
                    "attendance_status": attendances.get(a.user_id, "none"),
                }
            )

        return Response({"roster": roster})


class EventUnassignedView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def get(self, request, pk):
        event = get_object_or_404(Event.objects.visible(), pk=pk)
        ensure_event_manager(request.user, event)

        unassigned_apps = (
            EventApplication.objects.filter(event=event, status="accepted")
            .filter(~Q(assignments__status__in=ACTIVE_ASSIGNMENT_STATUSES))
            .distinct()
        )
        return Response(EventApplicationSerializer(unassigned_apps, many=True).data)


class ApplicationAcceptView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def post(self, request, pk):
        app = get_object_or_404(EventApplication, pk=pk)
        post = None
        post_id = request.data.get("post_id")
        if post_id:
            post = get_object_or_404(app.event.posts, pk=post_id)

        accepted_app, assignment = accept_application(
            actor=request.user,
            application=app,
            post=post,
        )
        return Response(
            {
                "application": EventApplicationSerializer(accepted_app).data,
                "assigned": bool(assignment),
            }
        )


class ApplicationRejectView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def post(self, request, pk):
        app = get_object_or_404(EventApplication, pk=pk)
        reason = request.data.get("reason", "")
        rejected_app = reject_application(
            actor=request.user,
            application=app,
            reason=reason,
        )
        return Response(EventApplicationSerializer(rejected_app).data)


class ApplicationWaitlistView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def post(self, request, pk):
        app = get_object_or_404(EventApplication, pk=pk)
        waitlisted_app = waitlist_application(
            actor=request.user,
            application=app,
        )
        return Response(EventApplicationSerializer(waitlisted_app).data)


class ApplicationWithdrawView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def post(self, request, pk):
        app = get_object_or_404(EventApplication, pk=pk)
        withdrawn_app = withdraw_application(
            user=request.user,
            application=app,
        )
        return Response(EventApplicationSerializer(withdrawn_app).data)
