# apps/events/admin.py
from django.contrib import admin

from apps.audit.services import delete_event, restore_event
from apps.events.models import (
    CharityField,
    Event,
    EventApplication,
    EventCharityField,
    EventPost,
)
from apps.events.services import activate_event, publish_event


@admin.register(CharityField)
class CharityFieldAdmin(admin.ModelAdmin):
    list_display = ("code", "label", "active", "sort_order")
    list_editable = ("active", "sort_order")
    search_fields = ("code", "label")


class EventCharityFieldInline(admin.TabularInline):
    model = EventCharityField
    extra = 1


class EventPostInline(admin.StackedInline):
    model = EventPost
    extra = 1


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "coordinator",
        "purpose_type",
        "status",
        "start_at",
        "end_at",
        "deleted_at",
    )
    list_filter = (
        "status",
        "purpose_type",
        "compensation_kind",
        "meals_provided",
        "lodging_provided",
    )
    search_fields = ("title", "description", "location_name")
    inlines = [EventCharityFieldInline, EventPostInline]
    actions = [
        "publish_event",
        "activate_event",
        "soft_delete_event",
        "restore_event",
        "publish_selected_events",
        "activate_selected_events",
        "soft_delete_selected_events",
        "restore_selected_events",
    ]

    @admin.action(description="Publish selected draft events")
    def publish_event(self, request, queryset):
        for event in queryset:
            if event.status == "draft":
                try:
                    publish_event(actor=request.user, event=event)
                except Exception as e:
                    self.message_user(request, f"Error publishing event #{event.id}: {e}", level="error")

    @admin.action(description="Activate selected published events")
    def activate_event(self, request, queryset):
        for event in queryset:
            if event.status == "published":
                try:
                    activate_event(actor=request.user, event=event)
                except Exception as e:
                    self.message_user(request, f"Error activating event #{event.id}: {e}", level="error")

    @admin.action(description="Soft delete selected events")
    def soft_delete_event(self, request, queryset):
        for event in queryset:
            if event.deleted_at is None:
                try:
                    delete_event(admin=request.user, event=event, reason="Deleted via admin panel")
                except Exception as e:
                    self.message_user(request, f"Error deleting event #{event.id}: {e}", level="error")

    @admin.action(description="Restore selected deleted events")
    def restore_event(self, request, queryset):
        for event in queryset:
            if event.deleted_at is not None:
                try:
                    restore_event(admin=request.user, event=event, reason="Restored via admin panel")
                except Exception as e:
                    self.message_user(request, f"Error restoring event #{event.id}: {e}", level="error")

    publish_selected_events = publish_event
    activate_selected_events = activate_event
    soft_delete_selected_events = soft_delete_event
    restore_selected_events = restore_event


@admin.register(EventPost)
class EventPostAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "event",
        "required_headcount",
        "physical_level",
        "status",
        "priority",
    )
    list_filter = ("status", "physical_level", "leader_needed")
    search_fields = ("title", "event__title")


@admin.register(EventApplication)
class EventApplicationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "event",
        "user",
        "post",
        "source",
        "status",
        "applied_at",
        "decided_at",
    )
    list_filter = ("status", "source")
    search_fields = ("user__display_name", "event__title")
    readonly_fields = ("applied_at", "decided_at", "decided_by", "conditions_snapshot")
