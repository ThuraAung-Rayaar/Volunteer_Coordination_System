# apps/audit/admin.py
from django.contrib import admin

from apps.audit.models import AuditLog, ModerationAction


@admin.register(ModerationAction)
class ModerationActionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "action_type",
        "admin_user",
        "target_user",
        "event",
        "feedback",
        "expires_at",
        "created_at",
    )
    list_filter = ("action_type",)
    search_fields = (
        "admin_user__display_name",
        "target_user__display_name",
        "reason",
    )
    readonly_fields = ("created_at",)


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "action",
        "entity_type",
        "entity_id",
        "actor_user",
        "ip_address",
        "created_at",
    )
    list_filter = ("action", "entity_type")
    search_fields = ("action", "entity_type", "actor_user__display_name")
    readonly_fields = [f.name for f in AuditLog._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
