from django.http import FileResponse, JsonResponse
from django.shortcuts import render, redirect
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import UserVerificationImages
from apps.audit.models import Feedback
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
    AdminActionSuccessSerializer,
    AdminAuditLogSerializer,
    AdminCoordinatorHistorySerializer,
    AdminCoordinatorProfileSerializer,
    AdminDashboardMetricsSerializer,
    AdminEventCreateSerializer,
    AdminEventResponseSerializer,
    AdminEventSummarySerializer,
    AdminFeedbackSerializer,
    AdminGeoAttemptSerializer,
    AdminMaintenanceResponseSerializer,
    AdminModerationSummarySerializer,
    AdminVerificationImageSerializer,
    BlockUserSerializer,
    FeedbackSubmitSerializer,
    HideFeedbackSerializer,
    ModerationActionResponseSerializer,
    ModerationActionSerializer,
    ReviewImageSerializer,
)


# ---------------------------------------------------------------------------
# Template Views
# ---------------------------------------------------------------------------

def _guard_admin_html(request):
    """
    Guard admin HTML views.
    Redirect unauthenticated browser requests to /api/v1/admin/ui/login/?next=...
    Enforce active admin privileges via ensure_admin(request) for authenticated requests.
    """
    if not request.user or not request.user.is_authenticated:
        accept = request.META.get("HTTP_ACCEPT", "")
        if "text/html" in accept and "application/json" not in accept:
            return redirect(f"/api/v1/admin/ui/login/?next={request.path}")
        raise ResourceMaskedNotFound()

    ensure_admin(request)
    return None


@extend_schema(exclude=True)
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def admin_login_view(request):
    """
    Custom Admin Login View supporting Myanmar phone auto-hash normalization (+959, +9509, 09, 9)
    and 64-character SHA-256 HMAC phone hashes.
    """
    from django.contrib.auth import login as django_login
    from .phone_utils import resolve_user_by_phone_or_hash

    next_url = request.POST.get("next") or request.GET.get("next") or "/api/v1/admin/ui/dashboard/"

    if request.method == "GET":
        if request.user.is_authenticated and getattr(request.user, "is_admin", False):
            return redirect(next_url)
        return render(
            request,
            "admin_portal/login.html",
            {
                "next": next_url,
                "entered_phone": "",
                "error_message": None,
            },
        )

    # POST request handling
    phone_or_hash = (
        request.POST.get("phone")
        or (getattr(request, "data", {}).get("phone") if hasattr(request, "data") else None)
        or ""
    ).strip()
    password = (
        request.POST.get("password")
        or (getattr(request, "data", {}).get("password") if hasattr(request, "data") else None)
        or ""
    )

    if not phone_or_hash:
        return render(
            request,
            "admin_portal/login.html",
            {
                "error_message": "Please enter your Myanmar phone number or phone hash.",
                "entered_phone": phone_or_hash,
                "next": next_url,
            },
        )

    try:
        user, p_hash, canonical = resolve_user_by_phone_or_hash(phone_or_hash)
    except ValueError as exc:
        return render(
            request,
            "admin_portal/login.html",
            {
                "error_message": str(exc),
                "entered_phone": phone_or_hash,
                "next": next_url,
            },
        )

    if (
        not user
        or not getattr(user, "is_admin", False)
        or not getattr(user, "is_active", False)
        or getattr(user, "account_status", "") != "active"
    ):
        return render(
            request,
            "admin_portal/login.html",
            {
                "error_message": "Account not found or not authorized as an active administrator.",
                "entered_phone": phone_or_hash,
                "next": next_url,
            },
        )

    # Verify password
    password_valid = False
    raw_user_pw = (user.password or "").strip()
    if raw_user_pw.startswith(("pbkdf2_", "argon2", "bcrypt")):
        password_valid = user.check_password(password)
    elif raw_user_pw and not raw_user_pw.startswith("!"):
        # Only allow AdminDemo123! bootstrap upgrade for non-empty SQL-seeded placeholder hashes
        if password == "AdminDemo123!":
            user.set_password("AdminDemo123!")
            user.save(update_fields=["password"])
            password_valid = True

    if not password_valid:
        return render(
            request,
            "admin_portal/login.html",
            {
                "error_message": "Invalid administrator password.",
                "entered_phone": phone_or_hash,
                "next": next_url,
            },
        )

    django_login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return redirect(next_url)


@extend_schema(exclude=True)
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def admin_logout_view(request):
    """
    Logs out the current admin session and redirects to the custom admin login UI.
    """
    from django.contrib.auth import logout as django_logout
    django_logout(request)
    return redirect("/api/v1/admin/ui/login/")


@extend_schema(exclude=True)
@api_view(["GET"])
@permission_classes([AllowAny])
def admin_phone_hash_lookup_api(request):
    """
    Public helper for login screen live preview: normalizes the Myanmar phone
    (+959, +9509, 09, 9) and returns JSON indicating validation and account status.
    """
    from .phone_utils import resolve_user_by_phone_or_hash

    phone = (request.GET.get("phone") or "").strip()
    if not phone:
        return JsonResponse({"valid": False, "error": "Phone number is required."})

    try:
        user, p_hash, canonical = resolve_user_by_phone_or_hash(phone)
        account_found = bool(
            user
            and getattr(user, "is_admin", False)
            and getattr(user, "is_active", False)
            and getattr(user, "account_status", "") == "active"
        )
        return JsonResponse({
            "valid": True,
            "normalized_phone": canonical,
            "phone_hash": p_hash,
            "account_found": account_found,
        })
    except Exception as exc:
        return JsonResponse({"valid": False, "error": str(exc)})


@extend_schema(exclude=True)
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def dashboard_view(request):
    guard = _guard_admin_html(request)
    if guard:
        return guard

    from apps.audit.models import AuditLogs
    from apps.coordination.models import CoordinatorProfiles
    from apps.events.models import CharityFields, VEventSummary
    from services import event_service, query_service, verification_service

    success_message = None
    error_message = None

    if request.method == "POST":
        if not request.user.is_superuser:
            raise ResourceMaskedNotFound()

        title = request.data.get("title") or request.POST.get("title")
        description = request.data.get("description") or request.POST.get("description", "")
        start_time = request.data.get("start_time") or request.POST.get("start_time")
        end_time = request.data.get("end_time") or request.POST.get("end_time")
        venue_name = request.data.get("venue_name") or request.POST.get("venue_name", "")
        venue_address = request.data.get("venue_address") or request.POST.get("venue_address", "")
        venue_lat = request.data.get("venue_lat") or request.POST.get("venue_lat")
        venue_lng = request.data.get("venue_lng") or request.POST.get("venue_lng")
        geofence_radius_m = request.data.get("geofence_radius_m") or request.POST.get("geofence_radius_m") or 150

        charity_field_ids = request.data.get("charity_field_ids")
        if not charity_field_ids:
            charity_field_ids = request.POST.getlist("charity_field_ids")
        if isinstance(charity_field_ids, str):
            charity_field_ids = [charity_field_ids]
        elif not isinstance(charity_field_ids, list):
            charity_field_ids = list(charity_field_ids) if charity_field_ids else []

        owner_user_id = request.data.get("owner_user_id") or request.POST.get("owner_user_id")

        try:
            from decimal import Decimal
            from django.utils.dateparse import parse_datetime
            if isinstance(start_time, str):
                dt = parse_datetime(start_time)
                if dt:
                    start_time = timezone.make_aware(dt) if timezone.is_naive(dt) else dt
            if isinstance(end_time, str):
                dt = parse_datetime(end_time)
                if dt:
                    end_time = timezone.make_aware(dt) if timezone.is_naive(dt) else dt

            event_data = {
                "title": title,
                "description": description,
                "start_time": start_time,
                "end_time": end_time,
                "venue_name": venue_name,
                "venue_address": venue_address,
                "venue_lat": Decimal(str(venue_lat)) if venue_lat else None,
                "venue_lng": Decimal(str(venue_lng)) if venue_lng else None,
                "geofence_radius_m": int(geofence_radius_m),
                "charity_field_ids": charity_field_ids,
            }
            target_owner_id = int(owner_user_id) if owner_user_id and str(owner_user_id).isdigit() else None
            created_event = event_service.admin_create_event(
                request.user,
                data=event_data,
                owner_user_id=target_owner_id,
            )
            success_message = f"Event '{created_event.title}' (ID: {created_event.id}) successfully created by Super Admin!"
            if request.headers.get("accept") == "application/json":
                return Response(
                    {"status": "created", "event_id": created_event.id, "title": created_event.title},
                    status=status.HTTP_201_CREATED,
                )
        except Exception as e:
            error_message = str(e)
            if request.headers.get("accept") == "application/json":
                return Response({"error": error_message}, status=status.HTTP_400_BAD_REQUEST)

    kpis = query_service.get_admin_dashboard_kpis()
    recent_events = list(VEventSummary.objects.all().order_by("-start_at")[:10])
    pending_verifications = list(verification_service.list_pending_verifications()[:10])
    charity_fields = list(CharityFields.objects.filter(active=True).order_by("sort_order", "code"))
    approved_coordinators = list(CoordinatorProfiles.objects.select_related("user").filter(status="approved"))
    recent_audit_logs = list(AuditLogs.objects.all().order_by("-created_at")[:15]) if request.user.is_superuser else []

    # 1. User & Coordinator Composition
    from apps.accounts.models import Users
    from apps.events.models import Events

    total_users = Users.objects.count()
    coord_profiles = CoordinatorProfiles.objects.all()
    total_coordinators = coord_profiles.filter(status="approved").count()
    pending_coordinators_count = coord_profiles.filter(status="pending").count()
    suspended_coordinators_count = coord_profiles.filter(status="suspended").count()
    revoked_coordinators_count = coord_profiles.filter(status="revoked").count()

    regular_volunteers = max(total_users - total_coordinators, 0)
    coord_pct = round((total_coordinators / total_users) * 100, 1) if total_users else 0.0
    vol_pct = round(100.0 - coord_pct, 1) if total_users else 0.0
    coord_ratio = f"1 : {round(regular_volunteers / total_coordinators, 1)}" if total_coordinators else f"0 : {total_users}"

    vol_active = Users.objects.filter(account_status="active").count()
    vol_blocked = Users.objects.filter(account_status="blocked").count()
    vol_closed = Users.objects.filter(account_status="closed").count()

    ver_verified = Users.objects.filter(verification_status="verified").count()
    ver_pending = Users.objects.filter(verification_status="pending").count()
    ver_rejected = Users.objects.filter(verification_status="rejected").count()
    ver_none = Users.objects.filter(verification_status="none").count()

    user_composition = {
        "total_users": total_users,
        "total_coordinators": total_coordinators,
        "regular_volunteers": regular_volunteers,
        "coord_pct": coord_pct,
        "vol_pct": vol_pct,
        "coord_ratio": coord_ratio,
        "vol_active": vol_active,
        "vol_blocked": vol_blocked,
        "vol_closed": vol_closed,
        "ver_verified": ver_verified,
        "ver_pending": ver_pending,
        "ver_rejected": ver_rejected,
        "ver_none": ver_none,
        "coord_approved": total_coordinators,
        "coord_pending": pending_coordinators_count,
        "coord_suspended": suspended_coordinators_count,
        "coord_revoked": revoked_coordinators_count,
    }

    # 2. Map Events JSON
    import json
    map_events = []
    events_qs = Events.objects.filter(
        deleted_at__isnull=True,
        status__in=["active", "published", "draft"],
    ).order_by("-start_at")
    for ev in events_qs:
        lat = float(ev.latitude) if (ev.latitude is not None and float(ev.latitude) != 0.0) else 16.80528
        lng = float(ev.longitude) if (ev.longitude is not None and float(ev.longitude) != 0.0) else 96.15611
        radius = int(ev.geo_radius_m) if ev.geo_radius_m is not None else 150
        start_str = ev.start_at.strftime("%Y-%m-%d %H:%M") if ev.start_at else ""
        end_str = ev.end_at.strftime("%Y-%m-%d %H:%M") if ev.end_at else ""
        map_events.append({
            "id": ev.id,
            "title": ev.title or "Untitled Event",
            "status": ev.status,
            "location_name": ev.location_name or "Yangon, Myanmar",
            "latitude": lat,
            "longitude": lng,
            "geo_radius_m": radius,
            "start_at": start_str,
            "end_at": end_str,
        })
    map_events_json = json.dumps(map_events)

    # 3. Past Events Summary
    from django.db.models import Count
    past_events = list(
        VEventSummary.objects.filter(status__in=["completed", "cancelled"]).order_by("-end_at")[:15]
    )
    event_ids = [e.event_id for e in past_events]
    feedback_counts = dict(
        Feedback.objects.filter(event_id__in=event_ids)
        .values("event_id")
        .annotate(c=Count("id"))
        .values_list("event_id", "c")
    )
    for e in past_events:
        e.feedback_count = feedback_counts.get(e.event_id, 0)

    # 4. Feedback Summary Dashboard
    all_feedback = list(Feedback.objects.all())
    total_feedback_count = len(all_feedback)
    total_active_fb = sum(1 for f in all_feedback if f.status == "active")
    total_hidden_fb = sum(1 for f in all_feedback if f.status == "hidden")

    active_scores = [f.score for f in all_feedback if f.status == "active" and f.score is not None]
    avg_score = round(sum(active_scores) / len(active_scores), 2) if active_scores else 0.0

    directions = ["volunteer_to_event", "volunteer_to_coordinator", "coordinator_to_volunteer"]
    by_direction = {}
    for d in directions:
        d_feedbacks = [f for f in all_feedback if f.direction == d and f.status == "active"]
        d_count = len(d_feedbacks)
        d_scores = [f.score for f in d_feedbacks if f.score is not None]
        d_avg = round(sum(d_scores) / len(d_scores), 2) if d_scores else 0.0
        by_direction[d] = {
            "count": d_count,
            "avg_score": d_avg,
        }

    star_counts = {star: 0 for star in (5, 4, 3, 2, 1)}
    for f in all_feedback:
        if f.status == "active" and f.score in star_counts:
            star_counts[f.score] += 1

    star_distribution = []
    for star in [5, 4, 3, 2, 1]:
        cnt = star_counts[star]
        pct = round((cnt / total_active_fb) * 100, 1) if total_active_fb else 0.0
        star_distribution.append({
            "star": star,
            "count": cnt,
            "pct": pct,
        })

    feedback_overview = {
        "total_active": total_active_fb,
        "total_hidden": total_hidden_fb,
        "avg_score": avg_score,
        "by_direction": by_direction,
        "star_distribution": star_distribution,
    }

    context = {
        "active_tab": "dashboard",
        "kpis": kpis,
        "recent_events": recent_events,
        "pending_verifications": pending_verifications,
        "charity_fields": charity_fields,
        "approved_coordinators": approved_coordinators,
        "recent_audit_logs": recent_audit_logs,
        "is_superuser": bool(request.user.is_superuser),
        "success_message": success_message,
        "error_message": error_message,
        "user_composition": user_composition,
        "map_events_json": map_events_json,
        "past_events": past_events,
        "feedback_overview": feedback_overview,
    }
    return render(request, "admin_portal/dashboard.html", context)


def _build_geo_map_json(events_qs=None, attempts_qs=None, selected_event=None):
    import json
    from apps.attendance.models import AttendanceGeoAttempts
    from apps.events.models import Events

    if events_qs is None:
        events_qs = Events.objects.filter(
            deleted_at__isnull=True,
            status__in=["published", "active"],
        ).order_by("-start_at")

    if attempts_qs is None:
        attempts_qs = AttendanceGeoAttempts.objects.select_related("user", "event").order_by("-attempted_at")[:100]

    map_events_data = []
    for ev in events_qs:
        lat = float(ev.latitude) if (ev.latitude is not None and float(ev.latitude) != 0.0) else 16.80528
        lng = float(ev.longitude) if (ev.longitude is not None and float(ev.longitude) != 0.0) else 96.15611
        radius = int(ev.geo_radius_m) if ev.geo_radius_m is not None else 150
        map_events_data.append({
            "id": ev.id,
            "title": ev.title or "Untitled Event",
            "status": ev.status,
            "location_name": ev.location_name or "Yangon, Myanmar",
            "latitude": lat,
            "longitude": lng,
            "geo_radius_m": radius,
            "start_at": ev.start_at.strftime("%Y-%m-%d %H:%M") if ev.start_at else "",
            "end_at": ev.end_at.strftime("%Y-%m-%d %H:%M") if ev.end_at else "",
        })

    selected_event_lat = None
    selected_event_lng = None
    if selected_event:
        sel_lat = float(selected_event.latitude) if (selected_event.latitude is not None and float(selected_event.latitude) != 0.0) else 16.80528
        sel_lng = float(selected_event.longitude) if (selected_event.longitude is not None and float(selected_event.longitude) != 0.0) else 96.15611
        selected_event_lat = sel_lat
        selected_event_lng = sel_lng

        existing_ids = {e["id"] for e in map_events_data}
        if selected_event.id not in existing_ids:
            map_events_data.append({
                "id": selected_event.id,
                "title": selected_event.title or "Untitled Event",
                "status": selected_event.status,
                "location_name": selected_event.location_name or "Yangon, Myanmar",
                "latitude": sel_lat,
                "longitude": sel_lng,
                "geo_radius_m": int(selected_event.geo_radius_m) if selected_event.geo_radius_m is not None else 150,
                "start_at": selected_event.start_at.strftime("%Y-%m-%d %H:%M") if selected_event.start_at else "",
                "end_at": selected_event.end_at.strftime("%Y-%m-%d %H:%M") if selected_event.end_at else "",
            })

    map_attempts_data = []
    for att in attempts_qs:
        if att.latitude is not None and att.longitude is not None:
            lat = float(att.latitude)
            lng = float(att.longitude)
        else:
            ev_lat = (
                float(att.event.latitude)
                if (att.event and att.event.latitude is not None and float(att.event.latitude) != 0.0)
                else 16.80528
            )
            ev_lng = (
                float(att.event.longitude)
                if (att.event and att.event.longitude is not None and float(att.event.longitude) != 0.0)
                else 96.15611
            )
            lat = ev_lat
            lng = ev_lng

        dist = float(att.distance_m) if att.distance_m is not None else 0.0
        rad = float(att.radius_m) if att.radius_m is not None else 150.0
        map_attempts_data.append({
            "id": att.id,
            "event_id": att.event_id,
            "event_title": att.event.title if att.event else "Unknown Event",
            "user_id": att.user_id,
            "display_name": att.user.display_name if att.user else "Volunteer",
            "latitude": lat,
            "longitude": lng,
            "distance_m": dist,
            "radius_m": rad,
            "result": att.result,
            "device_mocked": bool(att.device_mocked),
            "review_status": att.review_status,
            "attempted_at": att.attempted_at.strftime("%Y-%m-%d %H:%M:%S") if att.attempted_at else "",
        })

    payload = {
        "events": map_events_data,
        "attempts": map_attempts_data,
    }
    if selected_event_lat is not None and selected_event_lng is not None:
        payload["selected_event_lat"] = selected_event_lat
        payload["selected_event_lng"] = selected_event_lng

    return json.dumps(payload)


@extend_schema(exclude=True)
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def event_create_tab_view(request):
    guard = _guard_admin_html(request)
    if guard:
        return guard

    from apps.coordination.models import CoordinatorProfiles
    from apps.events.models import CharityFields, EventPosts, Events, VEventSummary
    from services import event_service

    success_message = None
    error_message = None

    if request.method == "POST":
        if not request.user.is_superuser:
            raise ResourceMaskedNotFound()

        title = request.POST.get("title") or getattr(request, "data", {}).get("title")
        description = request.POST.get("description") or getattr(request, "data", {}).get("description", "")
        purpose_type = request.POST.get("purpose_type") or getattr(request, "data", {}).get("purpose_type", "charity_event")
        acceptance_mode = request.POST.get("acceptance_mode") or getattr(request, "data", {}).get("acceptance_mode", "manual")
        max_participants = request.POST.get("max_participants") or getattr(request, "data", {}).get("max_participants")

        start_time = request.POST.get("start_time") or getattr(request, "data", {}).get("start_time")
        end_time = request.POST.get("end_time") or getattr(request, "data", {}).get("end_time")
        app_deadline = request.POST.get("application_deadline") or getattr(request, "data", {}).get("application_deadline")

        venue_name = request.POST.get("venue_name") or getattr(request, "data", {}).get("venue_name", "")
        venue_address = request.POST.get("venue_address") or getattr(request, "data", {}).get("venue_address", "")
        venue_lat = request.POST.get("venue_lat") or getattr(request, "data", {}).get("venue_lat")
        venue_lng = request.POST.get("venue_lng") or getattr(request, "data", {}).get("venue_lng")
        geofence_radius_m = request.POST.get("geofence_radius_m") or getattr(request, "data", {}).get("geofence_radius_m") or 150

        meals_provided = "meals_provided" in request.POST or bool(getattr(request, "data", {}).get("meals_provided"))
        lodging_provided = "lodging_provided" in request.POST or bool(getattr(request, "data", {}).get("lodging_provided"))
        travel_support_provided = "travel_support_provided" in request.POST or bool(getattr(request, "data", {}).get("travel_support_provided"))
        onboarding_text = request.POST.get("onboarding_text") or getattr(request, "data", {}).get("onboarding_text", "")

        charity_field_ids = request.POST.getlist("charity_field_ids")
        if not charity_field_ids and hasattr(request, "data"):
            charity_field_ids = request.data.get("charity_field_ids", [])
        if isinstance(charity_field_ids, str):
            charity_field_ids = [charity_field_ids]
        elif not isinstance(charity_field_ids, list):
            charity_field_ids = list(charity_field_ids) if charity_field_ids else []

        owner_user_id = request.POST.get("owner_user_id") or getattr(request, "data", {}).get("owner_user_id")

        role_title = (request.POST.get("role_title") or getattr(request, "data", {}).get("role_title") or "").strip()
        role_headcount = request.POST.get("role_headcount") or getattr(request, "data", {}).get("role_headcount")

        try:
            from decimal import Decimal
            from django.utils.dateparse import parse_datetime
            if isinstance(start_time, str):
                dt = parse_datetime(start_time)
                if dt:
                    start_time = timezone.make_aware(dt) if timezone.is_naive(dt) else dt
            if isinstance(end_time, str):
                dt = parse_datetime(end_time)
                if dt:
                    end_time = timezone.make_aware(dt) if timezone.is_naive(dt) else dt
            if isinstance(app_deadline, str) and app_deadline:
                dt = parse_datetime(app_deadline)
                if dt:
                    app_deadline = timezone.make_aware(dt) if timezone.is_naive(dt) else dt
            else:
                app_deadline = None

            event_data = {
                "title": title,
                "description": description,
                "purpose_type": purpose_type,
                "acceptance_mode": acceptance_mode,
                "max_participants": int(max_participants) if max_participants and str(max_participants).isdigit() else None,
                "start_time": start_time,
                "end_time": end_time,
                "application_deadline": app_deadline,
                "venue_name": venue_name,
                "venue_address": venue_address,
                "venue_lat": Decimal(str(venue_lat)) if venue_lat else None,
                "venue_lng": Decimal(str(venue_lng)) if venue_lng else None,
                "geofence_radius_m": int(geofence_radius_m),
                "meals_provided": meals_provided,
                "lodging_provided": lodging_provided,
                "travel_support_provided": travel_support_provided,
                "onboarding_text": onboarding_text,
                "charity_field_ids": charity_field_ids,
            }
            target_owner_id = int(owner_user_id) if owner_user_id and str(owner_user_id).isdigit() else None
            created_event = event_service.admin_create_event(
                request.user,
                data=event_data,
                owner_user_id=target_owner_id,
            )

            if role_title:
                headcount = int(role_headcount) if role_headcount and str(role_headcount).isdigit() else 5
                EventPosts.objects.create(
                    event=created_event,
                    title=role_title,
                    required_headcount=headcount,
                )

            success_message = f"Event '{created_event.title}' (ID: {created_event.id}) successfully created by Super Admin!"
            if request.headers.get("accept") == "application/json":
                return Response(
                    {"status": "created", "event_id": created_event.id, "title": created_event.title},
                    status=status.HTTP_201_CREATED,
                )
        except Exception as e:
            error_message = str(e)
            if request.headers.get("accept") == "application/json":
                return Response({"error": error_message}, status=status.HTTP_400_BAD_REQUEST)

    charity_fields = list(CharityFields.objects.filter(active=True).order_by("sort_order", "code"))
    approved_coordinators = list(CoordinatorProfiles.objects.select_related("user").filter(status="approved"))
    all_events = list(VEventSummary.objects.all().order_by("-start_at")[:30])

    context = {
        "active_tab": "event_create",
        "charity_fields": charity_fields,
        "approved_coordinators": approved_coordinators,
        "all_events": all_events,
        "is_superuser": bool(request.user.is_superuser),
        "success_message": success_message,
        "error_message": error_message,
    }
    return render(request, "admin_portal/event_create.html", context)


@extend_schema(exclude=True)
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def events_detail_and_geo_view(request):
    guard = _guard_admin_html(request)
    if guard:
        return guard

    from apps.attendance.models import VGeoAttemptsReview
    from apps.coordination.models import Assignments
    from apps.events.models import EventApplications, Events, VEventPostCapacity, VEventSummary
    from services import moderation_service

    success_message = None
    error_message = None

    if request.method == "POST":
        action = request.POST.get("action") or getattr(request, "data", {}).get("action")
        target_event_id = request.POST.get("event_id") or getattr(request, "data", {}).get("event_id")
        reason = request.POST.get("reason") or getattr(request, "data", {}).get("reason", "Admin moderation action")

        if not target_event_id:
            error_message = "Event ID is required for moderation action."
        else:
            try:
                target_event_id = int(target_event_id)
                action_type_map = {
                    "cancel": "event_cancel",
                    "event_cancel": "event_cancel",
                    "delete": "event_delete",
                    "event_delete": "event_delete",
                    "restore": "event_restore",
                    "event_restore": "event_restore",
                }
                action_type = action_type_map.get(action)
                if not action_type:
                    raise DomainError(
                        code="invalid_action",
                        message=f"Invalid event moderation action '{action}'.",
                        status_code=400,
                    )

                moderation_service.record_moderation_action(
                    admin_user=request.user,
                    action_type=action_type,
                    event_id=target_event_id,
                    reason=reason,
                )
                success_message = f"Successfully performed '{action_type}' on event #{target_event_id}."
            except Exception as e:
                error_message = str(e)

    # Load event list and optional event inspection
    event_id = request.GET.get("event_id") or request.POST.get("event_id")
    selected_event = None
    selected_posts = []
    selected_applications = []
    selected_assignments = []
    selected_geo_attempts = []

    if event_id and str(event_id).isdigit():
        eid = int(event_id)
        selected_event = Events.objects.filter(id=eid).first()
        if selected_event:
            selected_posts = list(VEventPostCapacity.objects.filter(event_id=eid))
            selected_applications = list(
                EventApplications.objects.select_related("user", "post")
                .filter(event_id=eid)
                .order_by("-applied_at")[:50]
            )
            selected_assignments = list(
                Assignments.objects.select_related("user", "post")
                .filter(event_id=eid)
                .order_by("-created_at")[:50]
            )
            selected_geo_attempts = list(
                VGeoAttemptsReview.objects.filter(event_id=eid).order_by("-attempted_at")[:50]
            )

    events_list = list(VEventSummary.objects.all().order_by("-start_at")[:100])
    geo_attempts = list(VGeoAttemptsReview.objects.all().order_by("-attempted_at")[:100])
    geo_map_json = _build_geo_map_json(selected_event=selected_event)

    context = {
        "active_tab": "events",
        "events_list": events_list,
        "selected_event": selected_event,
        "selected_posts": selected_posts,
        "selected_applications": selected_applications,
        "selected_assignments": selected_assignments,
        "selected_geo_attempts": selected_geo_attempts,
        "geo_attempts": geo_attempts,
        "geo_map_json": geo_map_json,
        "is_superuser": bool(request.user.is_superuser),
        "success_message": success_message,
        "error_message": error_message,
    }
    return render(request, "admin_portal/events_detail.html", context)


@extend_schema(exclude=True)
@api_view(["GET"])
@permission_classes([AllowAny])
def geo_monitoring_view(request):
    guard = _guard_admin_html(request)
    if guard:
        return guard

    from apps.attendance.models import VGeoAttemptsReview
    from apps.events.models import Events

    geo_attempts = list(VGeoAttemptsReview.objects.all().order_by("-attempted_at")[:100])
    active_events = list(Events.objects.filter(status__in=["published", "active"]).order_by("-start_at"))
    geo_map_json = _build_geo_map_json(events_qs=active_events)

    context = {
        "active_tab": "events",
        "geo_attempts": geo_attempts,
        "active_events": active_events,
        "geo_map_json": geo_map_json,
        "is_superuser": bool(request.user.is_superuser),
    }
    return render(request, "admin_portal/geo_monitoring.html", context)


@extend_schema(exclude=True)
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def users_directory_view(request):
    guard = _guard_admin_html(request)
    if guard:
        return guard

    from apps.accounts.models import Users, UserVerificationImages
    from apps.attendance.models import Attendance
    from apps.audit.models import ModerationActions, VUserModerationSummary
    from apps.coordination.models import Assignments, CoordinatorProfiles
    from common.security import decrypt_phone
    from services import moderation_service, verification_service

    success_message = None
    error_message = None

    if request.method == "POST":
        action = request.POST.get("action") or getattr(request, "data", {}).get("action")
        try:
            if action == "review_image":
                image_id = request.POST.get("image_id") or getattr(request, "data", {}).get("image_id")
                decision = request.POST.get("decision") or getattr(request, "data", {}).get("decision")
                note = request.POST.get("review_note") or getattr(request, "data", {}).get("review_note", "")
                if not image_id or not decision:
                    raise DomainError(code="invalid_params", message="Image ID and decision are required.", status_code=400)
                if decision in ("approve", "approved"):
                    decision_clean = "approved"
                elif decision in ("reject", "rejected"):
                    decision_clean = "rejected"
                else:
                    decision_clean = decision
                verification_service.review_verification_image(
                    actor=request.user,
                    image_id=int(image_id),
                    decision=decision_clean,
                    note=note,
                )
                success_message = f"Identity image #{image_id} successfully {decision_clean}."

            elif action == "moderation_action":
                target_user_id = request.POST.get("target_user_id") or getattr(request, "data", {}).get("target_user_id")
                action_type = request.POST.get("action_type") or getattr(request, "data", {}).get("action_type")
                reason = request.POST.get("reason") or getattr(request, "data", {}).get("reason", "")
                expires_at = request.POST.get("expires_at") or getattr(request, "data", {}).get("expires_at")

                if not target_user_id or not action_type:
                    raise DomainError(code="invalid_params", message="Target user ID and action type are required.", status_code=400)

                from django.utils.dateparse import parse_datetime
                parsed_expires_at = None
                if expires_at and str(expires_at).strip():
                    dt = parse_datetime(str(expires_at).strip())
                    if dt is None:
                        raise DomainError(code="invalid_expires_at", message="Invalid expiry date/time format.", status_code=400)
                    parsed_expires_at = timezone.make_aware(dt) if timezone.is_naive(dt) else dt

                moderation_service.record_moderation_action(
                    admin_user=request.user,
                    action_type=action_type,
                    target_user_id=int(target_user_id),
                    reason=reason or "Admin UI moderation action",
                    expires_at=parsed_expires_at,
                )
                success_message = f"Moderation action '{action_type}' recorded successfully for user #{target_user_id}."
            else:
                error_message = f"Unknown action: {action}"
        except Exception as exc:
            error_message = str(exc)

    role_filter = request.GET.get("role", "all").lower()
    search_query = (request.GET.get("q") or "").strip()
    selected_user_id = request.GET.get("user_id") or request.POST.get("target_user_id")

    users_qs = Users.objects.all().order_by("-created_at")

    if role_filter == "volunteers":
        approved_coords = CoordinatorProfiles.objects.filter(status="approved").values_list("user_id", flat=True)
        users_qs = users_qs.filter(is_admin=False, is_superuser=False).exclude(id__in=approved_coords)
    elif role_filter == "coordinators":
        approved_coords = CoordinatorProfiles.objects.filter(status="approved").values_list("user_id", flat=True)
        users_qs = users_qs.filter(id__in=approved_coords)
    elif role_filter == "admins":
        users_qs = users_qs.filter(is_admin=True)
    elif role_filter == "blocked":
        users_qs = users_qs.filter(account_status="blocked")

    if search_query:
        if search_query.isdigit():
            users_qs = users_qs.filter(id=int(search_query))
        else:
            users_qs = users_qs.filter(display_name__icontains=search_query)

    users_list = list(users_qs[:100])

    # Batch load coordinator profiles & moderation summaries
    user_ids = [u.id for u in users_list]
    coords_map = {
        cp.user_id: cp.status
        for cp in CoordinatorProfiles.objects.filter(user_id__in=user_ids)
    }
    mod_summaries_map = {
        ms.user_id: ms
        for ms in VUserModerationSummary.objects.filter(user_id__in=user_ids)
    }

    for u in users_list:
        u.decrypted_phone = decrypt_phone(u.phone_enc) or u.phone_enc or ""
        u.coordinator_status = coords_map.get(u.id)
        u.moderation_summary = mod_summaries_map.get(u.id)

    # Detailed inspection if user_id is requested
    selected_user = None
    selected_images = []
    selected_assignments = []
    selected_attendance = []
    selected_moderations = []
    selected_user_summary = None

    if selected_user_id and str(selected_user_id).isdigit():
        uid = int(selected_user_id)
        selected_user = Users.objects.filter(id=uid).first()
        if selected_user:
            selected_user.decrypted_phone = decrypt_phone(selected_user.phone_enc) or selected_user.phone_enc or ""
            selected_user.coordinator_status = CoordinatorProfiles.objects.filter(user_id=uid).values_list("status", flat=True).first()
            selected_images = list(UserVerificationImages.objects.filter(user_id=uid).order_by("-created_at"))
            selected_assignments = list(Assignments.objects.select_related("event", "post").filter(user_id=uid).order_by("-created_at")[:30])
            selected_attendance = list(Attendance.objects.select_related("event").filter(user_id=uid).order_by("-created_at")[:30])
            selected_moderations = list(ModerationActions.objects.select_related("admin_user").filter(target_user_id=uid).order_by("-created_at")[:30])
            selected_user_summary = VUserModerationSummary.objects.filter(user_id=uid).first()

    context = {
        "active_tab": "users",
        "users_list": users_list,
        "selected_user": selected_user,
        "selected_images": selected_images,
        "selected_assignments": selected_assignments,
        "selected_attendance": selected_attendance,
        "selected_moderations": selected_moderations,
        "selected_user_summary": selected_user_summary,
        "role_filter": role_filter,
        "search_query": search_query,
        "is_superuser": bool(request.user.is_superuser),
        "success_message": success_message,
        "error_message": error_message,
    }
    return render(request, "admin_portal/users.html", context)


@extend_schema(exclude=True)
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def user_provision_view(request):
    guard = _guard_admin_html(request)
    if guard:
        return guard

    if not request.user.is_superuser:
        raise ResourceMaskedNotFound()

    from django.db import transaction
    from apps.accounts.models import Users
    from apps.coordination.models import CoordinatorProfiles
    from common.security import compute_phone_hash, decrypt_phone, encrypt_phone
    from common.utils import normalize_tags
    from .phone_utils import normalize_myanmar_phone

    success_message = None
    error_message = None

    if request.method == "POST":
        form_action = request.POST.get("form_action") or getattr(request, "data", {}).get("form_action", "provision_user")

        try:
            with transaction.atomic():
                if form_action == "provision_user":
                    raw_phone = request.POST.get("phone") or getattr(request, "data", {}).get("phone")
                    display_name = request.POST.get("display_name") or getattr(request, "data", {}).get("display_name", "")
                    password = request.POST.get("password") or getattr(request, "data", {}).get("password")
                    assign_role = request.POST.get("assign_role") or getattr(request, "data", {}).get("assign_role", "volunteer")
                    verification_status = request.POST.get("verification_status") or getattr(request, "data", {}).get("verification_status", "verified")
                    blood_type = request.POST.get("blood_type") or getattr(request, "data", {}).get("blood_type", "unknown")
                    home_area = request.POST.get("home_area") or getattr(request, "data", {}).get("home_area", "")
                    skills_raw = request.POST.get("skills") or getattr(request, "data", {}).get("skills", "")
                    notes = request.POST.get("notes") or getattr(request, "data", {}).get("notes", "")

                    if not raw_phone or not display_name:
                        raise DomainError(code="missing_fields", message="Phone number and display name are required.", status_code=400)

                    canonical_phone = normalize_myanmar_phone(raw_phone)
                    p_hash = compute_phone_hash(canonical_phone)

                    if Users.objects.filter(phone_hash=p_hash).exists():
                        raise DomainError(code="duplicate_user", message=f"A user with phone {canonical_phone} already exists.", status_code=409)

                    is_staff_flag = (assign_role == "staff_admin")
                    if assign_role == "coordinator":
                        verification_status = "verified"  # Required by trg_01_coordinator_guard

                    skills_list = [s.strip() for s in skills_raw.split(",") if s.strip()] if isinstance(skills_raw, str) else list(skills_raw or [])

                    new_user = Users.objects.create(
                        phone_hash=p_hash,
                        phone_enc=encrypt_phone(canonical_phone),
                        display_name=display_name.strip()[:150],
                        is_admin=is_staff_flag,
                        is_staff=is_staff_flag,
                        is_superuser=False,
                        is_active=True,
                        account_status="active",
                        verification_status=verification_status,
                        blood_type=blood_type,
                        home_area=home_area.strip()[:100] if home_area else "",
                        skills=normalize_tags(skills_list),
                    )

                    password_to_set = password or "AdminDemo123!"
                    new_user.set_password(password_to_set)
                    new_user.save(update_fields=["password"])

                    if assign_role == "coordinator":
                        # Respect PostgreSQL trigger trg_01_coordinator_guard:
                        # Step 1: Insert as pending
                        CoordinatorProfiles.objects.create(
                            user=new_user,
                            status="pending",
                            notes=notes or "Provisioned directly by Super Admin",
                        )
                        # Step 2: Transition to approved with Super Admin as approver
                        CoordinatorProfiles.objects.filter(user_id=new_user.id).update(
                            status="approved",
                            approved_by_id=request.user.id,
                            approved_at=timezone.now(),
                            notes=notes or "Immediately approved by Super Admin on user creation",
                        )

                    role_label = "Approved Coordinator" if assign_role == "coordinator" else ("Staff Admin" if assign_role == "staff_admin" else "Volunteer")
                    success_message = f"User '{new_user.display_name}' ({canonical_phone}) successfully provisioned as {role_label}!"
                    if request.headers.get("accept") == "application/json":
                        return Response(
                            {"status": "created", "user_id": new_user.id, "display_name": new_user.display_name, "role": assign_role},
                            status=status.HTTP_201_CREATED,
                        )

                elif form_action == "promote_coordinator":
                    target_user_id = request.POST.get("target_user_id") or getattr(request, "data", {}).get("target_user_id")
                    notes = request.POST.get("notes") or getattr(request, "data", {}).get("notes", "Promoted by Super Admin")
                    if not target_user_id:
                        raise DomainError(code="missing_user", message="Please select a user to promote.", status_code=400)

                    target_user = Users.objects.filter(id=int(target_user_id)).first()
                    if not target_user:
                        raise ResourceMaskedNotFound(message="Target user not found.")

                    if target_user.id == request.user.id:
                        raise DomainError(
                            code="self_approval_forbidden",
                            message="You cannot self-approve your own account as a coordinator (ck_coordinator_no_self_approval).",
                            status_code=400,
                        )

                    if target_user.verification_status not in ("verified", "full"):
                        Users.objects.filter(id=target_user.id).update(verification_status="verified")
                        target_user.refresh_from_db()

                    cp = CoordinatorProfiles.objects.filter(user_id=target_user.id).first()
                    if not cp:
                        CoordinatorProfiles.objects.create(
                            user=target_user,
                            status="pending",
                            notes=notes,
                        )
                    CoordinatorProfiles.objects.filter(user_id=target_user.id).update(
                        status="approved",
                        approved_by_id=request.user.id,
                        approved_at=timezone.now(),
                        notes=notes,
                    )
                    success_message = f"User '{target_user.display_name}' (# {target_user.id}) successfully promoted to Approved Coordinator!"
                    if request.headers.get("accept") == "application/json":
                        return Response(
                            {"status": "approved", "user_id": target_user.id, "display_name": target_user.display_name},
                            status=status.HTTP_200_OK,
                        )
        except Exception as exc:
            error_message = str(exc)
            if request.headers.get("accept") == "application/json":
                return Response({"error": error_message}, status=status.HTTP_400_BAD_REQUEST)

    recent_provisioned_users = list(Users.objects.all().order_by("-created_at")[:20])
    for u in recent_provisioned_users:
        u.decrypted_phone = decrypt_phone(u.phone_enc) or u.phone_enc or ""

    approved_coord_ids = CoordinatorProfiles.objects.filter(status="approved").values_list("user_id", flat=True)
    eligible_volunteers = list(
        Users.objects.filter(is_admin=False, is_superuser=False)
        .exclude(id__in=approved_coord_ids)
        .exclude(id=request.user.id)
        .order_by("display_name")[:50]
    )
    for v in eligible_volunteers:
        v.decrypted_phone = decrypt_phone(v.phone_enc) or v.phone_enc or ""

    context = {
        "active_tab": "user_create",
        "recent_provisioned_users": recent_provisioned_users,
        "eligible_volunteers": eligible_volunteers,
        "is_superuser": bool(request.user.is_superuser),
        "success_message": success_message,
        "error_message": error_message,
    }
    return render(request, "admin_portal/user_create.html", context)


@extend_schema(exclude=True)
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def coordinator_board_view(request):
    guard = _guard_admin_html(request)
    if guard:
        return guard

    from apps.audit.models import Feedback, ModerationActions
    from apps.coordination.models import CoordinatorProfiles, VEventCoordinatorHistory
    from services import coordinator_service, moderation_service

    success_message = None
    error_message = None

    if request.method == "POST":
        action = request.POST.get("action") or getattr(request, "data", {}).get("action")
        target_user_id = request.POST.get("target_user_id") or getattr(request, "data", {}).get("target_user_id")
        feedback_id = request.POST.get("feedback_id") or getattr(request, "data", {}).get("feedback_id")
        reason = (request.POST.get("reason") or getattr(request, "data", {}).get("reason") or "").strip()
        notes = (request.POST.get("notes") or getattr(request, "data", {}).get("notes") or "").strip()

        try:
            if action in ("approve", "approve_coordinator"):
                if not target_user_id:
                    raise DomainError(code="missing_user", message="User ID is required.", status_code=400)
                coordinator_service.approve_coordinator(request.user, int(target_user_id), notes=notes or "Approved by admin")
                success_message = f"Coordinator #{target_user_id} successfully approved."

            elif action in ("suspend", "suspend_coordinator"):
                if not target_user_id:
                    raise DomainError(code="missing_user", message="User ID is required.", status_code=400)
                coordinator_service.suspend_coordinator(request.user, int(target_user_id), notes=notes or "Suspended by admin")
                success_message = f"Coordinator #{target_user_id} suspended."

            elif action in ("revoke", "revoke_coordinator"):
                if not target_user_id:
                    raise DomainError(code="missing_user", message="User ID is required.", status_code=400)
                coordinator_service.revoke_coordinator(request.user, int(target_user_id), notes=notes or "Revoked by admin")
                success_message = f"Coordinator #{target_user_id} revoked."

            elif action == "hide_feedback":
                if not feedback_id:
                    raise DomainError(code="missing_feedback", message="Feedback ID is required.", status_code=400)
                moderation_service.record_moderation_action(
                    request.user,
                    action_type="feedback_hide",
                    feedback_id=int(feedback_id),
                    reason=reason or "Hidden via coordinator complaints board",
                )
                success_message = f"Feedback #{feedback_id} has been hidden."

            elif action == "warn_user":
                if not target_user_id:
                    raise DomainError(code="missing_user", message="User ID is required.", status_code=400)
                moderation_service.record_moderation_action(
                    request.user,
                    action_type="user_warning",
                    target_user_id=int(target_user_id),
                    reason=reason or "Warning issued via coordinator complaints board",
                )
                success_message = f"Warning issued to user #{target_user_id}."

            elif action == "block_user":
                if not target_user_id:
                    raise DomainError(code="missing_user", message="User ID is required.", status_code=400)
                moderation_service.record_moderation_action(
                    request.user,
                    action_type="user_block",
                    target_user_id=int(target_user_id),
                    reason=reason or "Account blocked via coordinator complaints board",
                )
                success_message = f"User #{target_user_id} blocked."

            else:
                error_message = f"Unknown action '{action}'"
        except Exception as exc:
            error_message = str(exc)

    pending_coordinators = coordinator_service.list_coordinator_applications(status_filter="pending")
    approved_coordinators = coordinator_service.list_coordinator_applications(status_filter="approved")
    suspended_coordinators = list(
        CoordinatorProfiles.objects.filter(status__in=["suspended", "revoked"])
        .select_related("user")
        .order_by("-updated_at")
        .values(
            "user_id", "user__display_name", "user__verification_status",
            "status", "notes", "created_at", "approved_at", "approved_by_id", "updated_at",
        )
    )
    handover_history = list(VEventCoordinatorHistory.objects.all().order_by("-changed_at")[:25])
    complaints_and_alerts = list(
        Feedback.objects.filter(score__lte=2)
        .select_related("event", "rater_user", "target_user")
        .order_by("-created_at")[:25]
    )
    recent_moderations = list(
        ModerationActions.objects.select_related("admin_user", "target_user", "event", "feedback")
        .order_by("-created_at")[:25]
    )

    context = {
        "active_tab": "coordinators",
        "pending_coordinators": pending_coordinators,
        "approved_coordinators": approved_coordinators,
        "suspended_coordinators": suspended_coordinators,
        "handover_history": handover_history,
        "complaints_and_alerts": complaints_and_alerts,
        "recent_moderations": recent_moderations,
        "is_superuser": bool(request.user.is_superuser),
        "success_message": success_message,
        "error_message": error_message,
    }
    return render(request, "admin_portal/coordinator_board.html", context)


@extend_schema(exclude=True)
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def feedback_intelligence_view(request):
    guard = _guard_admin_html(request)
    if guard:
        return guard

    from django.db.models import Q
    from apps.audit.models import Feedback
    from apps.events.models import Events
    from services import moderation_service

    success_message = None
    error_message = None

    if request.method == "POST":
        action = request.POST.get("action") or getattr(request, "data", {}).get("action", "feedback_hide")
        feedback_id = request.POST.get("feedback_id") or getattr(request, "data", {}).get("feedback_id")
        reason = (request.POST.get("reason") or getattr(request, "data", {}).get("reason") or "").strip()

        try:
            if not feedback_id:
                raise DomainError(code="missing_feedback", message="Feedback ID is required.", status_code=400)
            if action == "feedback_hide":
                moderation_service.record_moderation_action(
                    request.user,
                    action_type="feedback_hide",
                    feedback_id=int(feedback_id),
                    reason=reason or "Inappropriate review hidden by admin",
                )
                success_message = f"Feedback review #{feedback_id} has been hidden."
            else:
                error_message = f"Unsupported action: {action}"
        except Exception as exc:
            error_message = str(exc)

    # 1. Top Feedback Analytics Strip
    all_feedback = list(Feedback.objects.all())
    total_reviews = len(all_feedback)
    total_active = sum(1 for f in all_feedback if f.status == "active")
    total_hidden = sum(1 for f in all_feedback if f.status == "hidden")
    low_score_count = sum(1 for f in all_feedback if f.score is not None and f.score <= 2)

    active_scores = [f.score for f in all_feedback if f.status == "active" and f.score is not None]
    avg_score = round(sum(active_scores) / len(active_scores), 2) if active_scores else 0.0

    directions = ["volunteer_to_event", "volunteer_to_coordinator", "coordinator_to_volunteer"]
    by_direction = {}
    for d in directions:
        d_items = [f for f in all_feedback if f.direction == d and f.status == "active"]
        d_count = len(d_items)
        d_scores = [f.score for f in d_items if f.score is not None]
        d_avg = round(sum(d_scores) / len(d_scores), 2) if d_scores else 0.0
        by_direction[d] = {
            "count": d_count,
            "avg_score": d_avg,
        }

    analytics = {
        "total_reviews": total_reviews,
        "total_active": total_active,
        "total_hidden": total_hidden,
        "low_score_count": low_score_count,
        "avg_score": avg_score,
        "by_direction": by_direction,
    }

    # 2. Filter Bar
    direction_filter = request.GET.get("direction", "all")
    score_filter = request.GET.get("score", "all")
    status_filter = request.GET.get("status", "all")
    event_filter = request.GET.get("event_id", "all")
    search_query = (request.GET.get("q") or "").strip()

    qs = Feedback.objects.select_related("event", "rater_user", "target_user").all().order_by("-created_at")

    if direction_filter and direction_filter != "all":
        qs = qs.filter(direction=direction_filter)
    if score_filter and score_filter != "all" and score_filter.isdigit():
        qs = qs.filter(score=int(score_filter))
    if status_filter and status_filter != "all":
        qs = qs.filter(status=status_filter)
    if event_filter and event_filter != "all" and event_filter.isdigit():
        qs = qs.filter(event_id=int(event_filter))
    if search_query:
        if search_query.isdigit():
            qs = qs.filter(id=int(search_query))
        else:
            qs = qs.filter(
                Q(comment__icontains=search_query)
                | Q(rater_user__display_name__icontains=search_query)
                | Q(target_user__display_name__icontains=search_query)
                | Q(event__title__icontains=search_query)
            )

    feedbacks = list(qs[:100])
    events_list = list(Events.objects.filter(deleted_at__isnull=True).order_by("-start_at")[:50])

    context = {
        "active_tab": "feedback",
        "analytics": analytics,
        "feedbacks": feedbacks,
        "events_list": events_list,
        "filter_direction": direction_filter,
        "filter_score": score_filter,
        "filter_status": status_filter,
        "filter_event_id": event_filter,
        "search_query": search_query,
        "is_superuser": bool(request.user.is_superuser),
        "success_message": success_message,
        "error_message": error_message,
    }
    return render(request, "admin_portal/feedback.html", context)


@extend_schema(exclude=True)
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def admin_settings_view(request):
    guard = _guard_admin_html(request)
    if guard:
        return guard

    from django.contrib.auth import update_session_auth_hash
    from django.db import transaction
    from apps.accounts.models import Users
    from apps.audit.models import AppSettings, AuditLogs
    from common.map_engine import get_map_catalog_status, seed_region_tiles
    from common.security import compute_phone_hash, decrypt_phone, encrypt_phone
    from services import maintenance_service
    from .phone_utils import normalize_myanmar_phone, resolve_user_by_phone_or_hash

    success_message = None
    error_message = None
    maintenance_result = None

    if request.method == "POST":
        form_action = request.POST.get("form_action") or getattr(request, "data", {}).get("form_action")

        try:
            if form_action == "change_own_password":
                new_pw = request.POST.get("new_password") or getattr(request, "data", {}).get("new_password")
                confirm_pw = request.POST.get("confirm_password") or getattr(request, "data", {}).get("confirm_password")
                if not new_pw or not confirm_pw:
                    raise DomainError(code="missing_password", message="New password and confirmation are required.", status_code=400)
                if new_pw != confirm_pw:
                    raise DomainError(code="password_mismatch", message="New password and confirmation do not match.", status_code=400)

                request.user.set_password(new_pw)
                request.user.save(update_fields=["password"])
                update_session_auth_hash(request, request.user)
                success_message = "Your admin password has been changed successfully."

            elif form_action == "reset_user_password":
                target_user_id = request.POST.get("target_user_id") or getattr(request, "data", {}).get("target_user_id")
                new_pw = request.POST.get("new_password") or getattr(request, "data", {}).get("new_password")
                phone_search = (request.POST.get("phone_search") or getattr(request, "data", {}).get("phone_search") or "").strip()

                if not new_pw:
                    raise DomainError(code="missing_password", message="New password is required.", status_code=400)

                target_user = None
                if target_user_id and str(target_user_id).isdigit():
                    target_user = Users.objects.filter(id=int(target_user_id)).first()
                elif phone_search:
                    target_user, _, _ = resolve_user_by_phone_or_hash(phone_search)

                if not target_user:
                    raise ResourceMaskedNotFound(message="Target user not found.")

                if target_user.is_superuser and not request.user.is_superuser:
                    raise DomainError(code="insufficient_privilege", message="Only a Super Admin can modify a Super Admin account.", status_code=403)

                target_user.set_password(new_pw)
                target_user.save(update_fields=["password"])
                AuditLogs.objects.create(
                    actor_user=request.user,
                    action="admin.user_password_reset",
                    entity_type="users",
                    entity_id=target_user.id,
                    before_data={},
                    after_data={"status": "password_reset"},
                )
                success_message = f"Password for user '{target_user.display_name}' (#{target_user.id}) has been reset."

            elif form_action == "change_user_phone":
                target_user_id = request.POST.get("target_user_id") or getattr(request, "data", {}).get("target_user_id")
                new_phone = request.POST.get("new_phone") or getattr(request, "data", {}).get("new_phone")

                if not target_user_id or not new_phone:
                    raise DomainError(code="missing_fields", message="Target user and new phone number are required.", status_code=400)

                target_user = Users.objects.filter(id=int(target_user_id)).first()
                if not target_user:
                    raise ResourceMaskedNotFound(message="Target user not found.")

                if target_user.is_superuser and not request.user.is_superuser:
                    raise DomainError(code="insufficient_privilege", message="Only a Super Admin can modify a Super Admin account.", status_code=403)

                canonical = normalize_myanmar_phone(new_phone)
                new_hash = compute_phone_hash(canonical)
                new_enc = encrypt_phone(canonical)

                if Users.objects.filter(phone_hash=new_hash).exclude(id=target_user.id).exists():
                    raise DomainError(
                        code="duplicate_phone",
                        message=f"Phone number {canonical} is already assigned to another user account.",
                        status_code=409,
                    )

                with transaction.atomic():
                    old_hash = target_user.phone_hash
                    from django.db import connection
                    with connection.cursor() as cursor:
                        cursor.execute("ALTER TABLE users DISABLE TRIGGER trg_01_users_guard")
                        try:
                            Users.objects.filter(id=target_user.id).update(
                                phone_hash=new_hash,
                                phone_enc=new_enc,
                                updated_at=timezone.now(),
                            )
                        finally:
                            cursor.execute("ALTER TABLE users ENABLE TRIGGER trg_01_users_guard")

                    AuditLogs.objects.create(
                        actor_user=request.user,
                        action="admin.user_phone_changed",
                        entity_type="users",
                        entity_id=target_user.id,
                        before_data={"phone_hash": old_hash},
                        after_data={"phone_hash": new_hash},
                    )

                success_message = f"Phone number for '{target_user.display_name}' (#{target_user.id}) successfully updated to {canonical}."

            elif form_action == "run_maintenance":
                if not request.user.is_superuser:
                    raise ResourceMaskedNotFound()

                maintenance_result = maintenance_service.run_all_maintenance()
                success_message = "PostgreSQL database maintenance routines executed successfully."

            elif form_action == "sync_offline_maps":
                region_code = request.POST.get("region_code") or getattr(request, "data", {}).get("region_code") or "yangon"
                fetch_remote_raw = request.POST.get("fetch_remote") or getattr(request, "data", {}).get("fetch_remote") or "0"
                fetch_remote = str(fetch_remote_raw).strip() in ("1", "true", "True")

                sync_res = seed_region_tiles(region_code=region_code, fetch_remote=fetch_remote)
                success_message = f"Map pack '{region_code}' synchronized ({sync_res.get('seeded_tiles', 0)} tiles processed). Monthly schedule active."

            else:
                error_message = f"Unknown form action '{form_action}'."
        except Exception as exc:
            error_message = str(exc)

        if request.headers.get("accept") == "application/json" or "application/json" in request.META.get("HTTP_ACCEPT", ""):
            if error_message:
                return Response({"error": error_message}, status=status.HTTP_400_BAD_REQUEST)
            return Response({
                "status": "ok",
                "message": success_message,
                "maintenance_result": maintenance_result,
            })

    all_users = list(Users.objects.all().order_by("id")[:200])
    for u in all_users:
        u.decrypted_phone = decrypt_phone(u.phone_enc) or u.phone_enc or ""

    app_settings = list(AppSettings.objects.all().order_by("key"))

    context = {
        "active_tab": "settings",
        "all_users": all_users,
        "app_settings": app_settings,
        "maintenance_result": maintenance_result,
        "is_superuser": bool(request.user.is_superuser),
        "success_message": success_message,
        "error_message": error_message,
        "map_catalog": get_map_catalog_status(),
    }
    return render(request, "admin_portal/settings.html", context)


# ---------------------------------------------------------------------------
# Administrative API Views (Phase 4)
# ---------------------------------------------------------------------------

class AdminPendingVerificationImagesView(APIView):
    """GET /api/v1/admin/verification-images/ — pending review queue with optional filters."""
    permission_classes = [IsAuthenticated]
    serializer_class = AdminVerificationImageSerializer

    @extend_schema(responses={200: AdminVerificationImageSerializer(many=True)})
    def get(self, request):
        ensure_admin(request)
        status_filter = request.query_params.get("status", "pending")
        image_type_filter = request.query_params.get("image_type")
        rows = verification_service.get_pending_images_for_admin(
            request.user,
            status=status_filter,
            image_type=image_type_filter,
        )
        return Response({"results": rows})


class AdminVerificationImageFileView(APIView):
    """GET /api/v1/admin/verification-images/{id}/file/ — private stream."""
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OpenApiTypes.BINARY})
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
        file_obj = open(path, "rb")
        return FileResponse(file_obj, content_type="image/jpeg")


class AdminReviewVerificationImageView(APIView):
    """POST /api/v1/admin/verification-images/{id}/review/."""
    permission_classes = [IsAuthenticated]
    serializer_class = ReviewImageSerializer

    @extend_schema(
        request=ReviewImageSerializer,
        responses={200: AdminVerificationImageSerializer},
    )
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
    serializer_class = AdminCoordinatorProfileSerializer

    @extend_schema(responses={200: AdminCoordinatorProfileSerializer(many=True)})
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

    @extend_schema(
        request=None,
        responses={200: AdminActionSuccessSerializer},
    )
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


# --- View Aliases for Alternative View Naming Conventions -------------------
AdminVerificationImageListView = AdminPendingVerificationImagesView
AdminVerificationImageReviewView = AdminReviewVerificationImageView
AdminCoordinatorListView = AdminPendingCoordinatorsView


# ---------------------------------------------------------------------------
# Administrative API Views (Phase 8: Governance, Moderation, Audit, Dashboards)
# ---------------------------------------------------------------------------

class AdminDashboardView(APIView):
    """GET /api/v1/admin/dashboard/ — A01."""
    permission_classes = [IsAuthenticated]
    serializer_class = AdminDashboardMetricsSerializer

    @extend_schema(responses={200: AdminDashboardMetricsSerializer})
    def get(self, request):
        ensure_admin(request)
        return Response(query_service.get_admin_dashboard())


class AdminModerationView(APIView):
    """POST /api/v1/admin/moderation/ — generic insert-to-apply moderation."""
    permission_classes = [IsAuthenticated]
    serializer_class = ModerationActionSerializer

    @extend_schema(
        request=ModerationActionSerializer,
        responses={201: ModerationActionResponseSerializer},
    )
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
    serializer_class = BlockUserSerializer

    @extend_schema(
        request=BlockUserSerializer,
        responses={200: AdminActionSuccessSerializer},
    )
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
    serializer_class = BlockUserSerializer

    @extend_schema(
        request=BlockUserSerializer,
        responses={200: AdminActionSuccessSerializer},
    )
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
    serializer_class = HideFeedbackSerializer

    @extend_schema(
        request=HideFeedbackSerializer,
        responses={200: AdminActionSuccessSerializer},
    )
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


class AdminFeedbackListView(APIView):
    """GET /api/v1/admin/feedback/ — list feedback for moderation review."""
    permission_classes = [IsAuthenticated]
    serializer_class = AdminFeedbackSerializer

    @extend_schema(responses={200: AdminFeedbackSerializer(many=True)})
    def get(self, request):
        ensure_admin(request)
        event_id = request.query_params.get("event_id")
        status_filter = request.query_params.get("status")
        qs = Feedback.objects.all().order_by("-created_at")
        if event_id:
            qs = qs.filter(event_id=int(event_id))
        if status_filter:
            qs = qs.filter(status=status_filter)
        rows = [
            {
                "id": fb.id,
                "event_id": fb.event_id,
                "rater_user_id": fb.rater_user_id,
                "target_user_id": fb.target_user_id,
                "direction": fb.direction,
                "score": fb.score,
                "tags": list(fb.tags or []),
                "comment": fb.comment,
                "status": fb.status,
                "created_at": fb.created_at,
            }
            for fb in qs[:100]
        ]
        return Response({"results": rows})


class AdminAuditLogsView(APIView):
    """GET /api/v1/admin/audit/ — Super Admin only (A05)."""
    permission_classes = [IsAuthenticated]
    serializer_class = AdminAuditLogSerializer

    @extend_schema(responses={200: AdminAuditLogSerializer(many=True)})
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
    serializer_class = AdminCoordinatorHistorySerializer

    @extend_schema(responses={200: AdminCoordinatorHistorySerializer(many=True)})
    def get(self, request):
        event_id = request.query_params.get("event_id")
        rows = audit_service.get_event_coordinator_history(
            request.user, event_id=int(event_id) if event_id else None
        )
        return Response({"results": rows})


class AdminModerationSummaryView(APIView):
    """GET /api/v1/admin/users/{id}/moderation-summary/"""
    permission_classes = [IsAuthenticated]
    serializer_class = AdminModerationSummarySerializer

    @extend_schema(responses={200: AdminModerationSummarySerializer})
    def get(self, request, user_id):
        ensure_admin(request)
        summary = query_service.get_user_moderation_summary(user_id)
        if summary is None:
            return Response({"user_id": user_id, "warning_count": 0, "block_count": 0})
        return Response(summary)


class AdminGeoMonitoringView(APIView):
    """GET /api/v1/admin/geo-monitoring/ — geo attempt telemetry for fraud review."""
    permission_classes = [IsAuthenticated]
    serializer_class = AdminGeoAttemptSerializer

    @extend_schema(responses={200: AdminGeoAttemptSerializer(many=True)})
    def get(self, request):
        ensure_admin(request)
        from apps.attendance.models import VGeoAttemptsReview
        rows = VGeoAttemptsReview.objects.all().order_by("-attempted_at")[:200]
        return Response({"results": list(rows.values())})


class AdminRunMaintenanceView(APIView):
    """POST /api/v1/admin/maintenance/run/ — Super Admin only (A12)."""
    permission_classes = [IsAuthenticated]
    serializer_class = AdminMaintenanceResponseSerializer

    @extend_schema(
        request=None,
        responses={200: AdminMaintenanceResponseSerializer},
    )
    def post(self, request):
        ensure_admin(request, require_superuser=True)
        summary = maintenance_service.run_all_maintenance()
        return Response(summary)


# Phase 8 Specification View Aliases
AdminModerationActionListView = AdminModerationView
AdminModerationActionCreateView = AdminModerationView
AdminFeedbackHideView = AdminHideFeedbackView
AdminAuditLogListView = AdminAuditLogsView
AdminGeoAttemptListView = AdminGeoMonitoringView
AdminDashboardMetricsView = AdminDashboardView


class AdminEventListCreateView(APIView):
    """
    GET /api/v1/admin/events/ — Super Admin / Admin lists events from VEventSummary.
    POST /api/v1/admin/events/ — Super Admin creates event adhering to all event rules.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = AdminEventCreateSerializer

    @extend_schema(
        operation_id="admin_events_list",
        responses={200: AdminEventSummarySerializer(many=True)},
    )
    def get(self, request):
        ensure_admin(request)
        from apps.events.models import VEventSummary
        qs = VEventSummary.objects.all().order_by("-start_at")
        results = [
            {
                "id": row.event_id,
                "event_id": row.event_id,
                "title": row.title,
                "status": row.status,
                "owner_id": row.owner_id,
                "current_coordinator_id": row.current_coordinator_id,
                "start_time": row.start_at,
                "start_at": row.start_at,
                "end_time": row.end_at,
                "end_at": row.end_at,
                "acceptance_mode": row.acceptance_mode,
                "auto_assign_enabled": row.auto_assign_enabled,
                "max_participants": row.max_participants,
                "geo_checkin_enabled": row.geo_checkin_enabled,
                "pending_count": row.pending_count,
                "accepted_count": row.accepted_count,
                "waitlisted_count": row.waitlisted_count,
                "assignment_count": row.assignment_count,
                "checked_in_count": row.checked_in_count,
                "pending_confirmations": row.pending_confirmations,
            }
            for row in qs[:200]
        ]
        return Response({"results": results})

    @extend_schema(
        operation_id="admin_create_event",
        request=AdminEventCreateSerializer,
        responses={201: AdminEventResponseSerializer},
    )
    def post(self, request):
        ensure_admin(request, require_superuser=True)
        serializer = AdminEventCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        from services import event_service
        event = event_service.admin_create_event(
            request.user,
            data=data,
            owner_user_id=data.get("owner_user_id"),
        )
        return Response(
            {
                "id": event.id,
                "event_id": event.id,
                "title": event.title,
                "status": event.status,
                "owner_id": event.owner_id,
                "current_coordinator_id": event.current_coordinator_id,
                "start_time": event.start_at,
                "start_at": event.start_at,
                "end_time": event.end_at,
                "end_at": event.end_at,
            },
            status=status.HTTP_201_CREATED,
        )

