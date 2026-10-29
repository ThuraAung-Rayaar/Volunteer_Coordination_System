# apps/ops/admin.py
from django.contrib import admin

from apps.audit.services import hide_feedback
from apps.ops.models import (
    Assignment,
    Attendance,
    Feedback,
    OnboardingAcknowledgment,
    QrToken,
)


@admin.register(QrToken)
class QrTokenAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "event",
        "purpose",
        "used_count",
        "max_uses",
        "expires_at",
        "revoked_at",
        "created_at",
    )
    list_filter = ("purpose",)
    search_fields = ("event__title", "token_hash")
    readonly_fields = ("token_hash", "used_count", "created_at")


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "event",
        "user",
        "post",
        "status",
        "group_code",
        "is_group_leader",
        "assigned_by",
        "created_at",
    )
    list_filter = ("status", "assigned_by", "is_group_leader")
    search_fields = ("user__display_name", "event__title", "group_code")
    readonly_fields = ("created_at", "conditions_snapshot")


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "event",
        "user",
        "status",
        "checkin_at",
        "checkout_at",
        "method",
        "recorded_by",
    )
    list_filter = ("status", "method")
    search_fields = ("user__display_name", "event__title")
    readonly_fields = ("checkin_at", "checkout_at", "created_at")


@admin.register(OnboardingAcknowledgment)
class OnboardingAcknowledgmentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "event",
        "user",
        "onboarding_version",
        "method",
        "acknowledged_at",
    )
    list_filter = ("onboarding_version", "method")
    search_fields = ("user__display_name", "event__title")
    readonly_fields = ("acknowledged_at",)


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "event",
        "rater_user",
        "target_user",
        "direction",
        "score",
        "status",
        "created_at",
    )
    list_filter = ("direction", "status", "score")
    search_fields = ("rater_user__display_name", "target_user__display_name", "event__title")
    actions = ["hide_selected_feedbacks"]

    @admin.action(description="Hide selected feedbacks")
    def hide_selected_feedbacks(self, request, queryset):
        for fb in queryset:
            if fb.status != "hidden":
                try:
                    hide_feedback(admin=request.user, feedback=fb, reason="Hidden via admin action")
                except Exception as e:
                    self.message_user(request, f"Error hiding feedback #{fb.id}: {e}", level="error")
