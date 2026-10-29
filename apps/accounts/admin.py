# apps/accounts/admin.py
from django.contrib import admin
from django.utils.html import format_html

from apps.accounts.models import (
    AuthOtp,
    CoordinatorProfile,
    User,
    UserCharityInterest,
    UserVerificationImage,
)
from apps.accounts.services import (
    approve_coordinator,
    review_verification_image,
)


class CoordinatorProfileInline(admin.StackedInline):
    model = CoordinatorProfile
    fk_name = "user"
    extra = 0
    readonly_fields = ("approved_by", "approved_at", "created_at")


class UserCharityInterestInline(admin.TabularInline):
    model = UserCharityInterest
    extra = 0
    readonly_fields = ("created_at",)


class UserVerificationImageInline(admin.TabularInline):
    model = UserVerificationImage
    fk_name = "user"
    extra = 0
    readonly_fields = (
        "image_type",
        "status",
        "comparison_status",
        "comparison_score",
        "is_current",
        "reviewed_by",
        "reviewed_at",
        "created_at",
    )


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "display_name",
        "phone_hash",
        "account_status",
        "verification_status",
        "is_admin",
        "is_staff",
    )
    list_filter = ("account_status", "verification_status", "is_admin", "is_staff", "blood_type")
    search_fields = ("display_name", "phone_hash", "home_area")
    ordering = ("-created_at",)
    inlines = [CoordinatorProfileInline, UserCharityInterestInline, UserVerificationImageInline]
    actions = ["approve_selected_coordinators"]

    @admin.action(description="Approve coordinator profile for selected users")
    def approve_selected_coordinators(self, request, queryset):
        for user in queryset:
            profile = getattr(user, "coordinator_profile", None)
            if profile and profile.status != "approved":
                try:
                    approve_coordinator(actor=request.user, profile=profile)
                except Exception as e:
                    self.message_user(request, f"Error approving coordinator for {user}: {e}", level="error")


@admin.register(CoordinatorProfile)
class CoordinatorProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "status", "approved_by", "approved_at", "created_at")
    list_filter = ("status",)
    search_fields = ("user__display_name", "user__phone_hash", "notes")
    actions = ["approve_selected_coordinators"]

    @admin.action(description="Approve selected coordinators")
    def approve_selected_coordinators(self, request, queryset):
        for profile in queryset:
            if profile.status != "approved":
                try:
                    approve_coordinator(actor=request.user, profile=profile)
                except Exception as e:
                    self.message_user(request, f"Error approving coordinator {profile.user}: {e}", level="error")


@admin.register(UserCharityInterest)
class UserCharityInterestAdmin(admin.ModelAdmin):
    list_display = ("user", "field_code", "created_at")
    list_filter = ("field_code",)
    search_fields = ("user__display_name",)


@admin.register(UserVerificationImage)
class UserVerificationImageAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "image_type",
        "status",
        "comparison_status",
        "comparison_score",
        "is_current",
        "reviewed_by",
        "inspect_image",
        "created_at",
    )
    list_filter = ("status", "comparison_status", "image_type", "is_current")
    search_fields = ("user__display_name", "note")
    readonly_fields = ("image_path", "file_sha256", "inspect_image", "reviewed_by", "reviewed_at", "created_at")
    actions = ["approve_selected_images", "reject_selected_images"]

    def inspect_image(self, obj):
        if obj.image_path:
            return format_html(
                '<a href="/admin/accounts/userverificationimage/{}/view/" target="_blank" rel="noopener noreferrer">View Image</a>',
                obj.id,
            )
        return "No Image"

    def get_urls(self):
        from django.urls import path
        urls = super().get_urls()
        custom_urls = [
            path(
                "<int:image_id>/view/",
                self.admin_site.admin_view(self.secure_view_image),
                name="userverificationimage-secure-view",
            ),
        ]
        return custom_urls + urls

    def secure_view_image(self, request, image_id):
        from django.http import Http404, FileResponse
        from apps.common.permissions import ensure_admin
        ensure_admin(request.user)
        img = UserVerificationImage.objects.filter(id=image_id).first()
        if not img or not img.image_path:
            raise Http404("Image not found")
        return FileResponse(img.image_path.open("rb"), content_type="image/jpeg")

    @admin.action(description="Approve selected verification images")
    def approve_selected_images(self, request, queryset):
        for img in queryset:
            try:
                review_verification_image(
                    actor=request.user,
                    image=img,
                    status="approved",
                    note="Approved via admin action",
                )
            except Exception as e:
                self.message_user(request, f"Error approving image #{img.id}: {e}", level="error")

    @admin.action(description="Reject selected verification images")
    def reject_selected_images(self, request, queryset):
        for img in queryset:
            try:
                review_verification_image(
                    actor=request.user,
                    image=img,
                    status="rejected",
                    note="Rejected via admin action",
                )
            except Exception as e:
                self.message_user(request, f"Error rejecting image #{img.id}: {e}", level="error")


@admin.register(AuthOtp)
class AuthOtpAdmin(admin.ModelAdmin):
    list_display = ("phone_hash", "purpose", "attempt_count", "expires_at", "consumed_at", "created_at")
    list_filter = ("purpose",)
    search_fields = ("phone_hash",)
    readonly_fields = ("phone_hash", "code_hash", "expires_at", "consumed_at", "created_at")
