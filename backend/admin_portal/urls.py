from django.urls import path

from . import map_views, views

urlpatterns = [
    # Auth & Identity Lookup Views (UI-TASK-01)
    path("ui/login/", views.admin_login_view, name="admin_ui_login"),
    path("ui/logout/", views.admin_logout_view, name="admin_ui_logout"),
    path("ui/phone-lookup/", views.admin_phone_hash_lookup_api, name="admin_ui_phone_lookup"),

    # Template Views
    path("", views.dashboard_view, name="admin_dashboard"),
    path("ui/dashboard/", views.dashboard_view, name="admin_ui_dashboard"),
    path("ui/event-create/", views.event_create_tab_view, name="admin_ui_event_create"),
    path("ui/events/", views.events_detail_and_geo_view, name="admin_ui_events"),
    path("ui/users/", views.users_directory_view, name="admin_ui_users"),
    path("ui/user-create/", views.user_provision_view, name="admin_ui_user_create"),
    path("ui/geo-monitoring/", views.geo_monitoring_view, name="admin_ui_geo_monitoring"),
    path("ui/coordinators/", views.coordinator_board_view, name="admin_ui_coordinators"),
    path("ui/coordinator-board/", views.coordinator_board_view, name="admin_ui_coordinator_board"),
    path("ui/feedback/", views.feedback_intelligence_view, name="admin_ui_feedback"),
    path("ui/settings/", views.admin_settings_view, name="admin_ui_settings"),
    path("geo-monitoring/", views.geo_monitoring_view, name="geo_monitoring"),
    path("coordinator-board/", views.coordinator_board_view, name="coordinator_board"),

    # Administrative API Views (Phase 4)
    path(
        "verification-images/",
        views.AdminPendingVerificationImagesView.as_view(),
        name="admin-verification-images",
    ),
    path(
        "verification-images/<int:image_id>/file/",
        views.AdminVerificationImageFileView.as_view(),
        name="admin-verification-image-file",
    ),
    path(
        "verification-images/<int:image_id>/review/",
        views.AdminReviewVerificationImageView.as_view(),
        name="admin-verification-image-review",
    ),
    path(
        "coordinators/",
        views.AdminPendingCoordinatorsView.as_view(),
        name="admin-coordinators",
    ),
    path(
        "coordinators/<int:user_id>/<str:action>/",
        views.AdminCoordinatorDecisionView.as_view(),
        name="admin-coordinator-decision",
    ),

    # Administrative API Views (Phase 8: Governance, Moderation, Audit, Dashboards)
    path("dashboard/", views.AdminDashboardView.as_view(), name="admin-dashboard"),
    path("moderation/", views.AdminModerationView.as_view(), name="admin-moderation"),
    path("feedback/", views.AdminFeedbackListView.as_view(), name="admin-feedback-list"),
    path("feedback/<int:feedback_id>/hide/", views.AdminHideFeedbackView.as_view(), name="admin-feedback-hide"),
    path("audit/", views.AdminAuditLogsView.as_view(), name="admin-audit-logs"),
    path("audit-logs/", views.AdminAuditLogsView.as_view(), name="admin-audit-logs-canonical"),
    path("geo-attempts/", views.AdminGeoMonitoringView.as_view(), name="admin-geo-attempts-canonical"),
    path("coordinator-history/", views.AdminCoordinatorHistoryView.as_view(), name="admin-coordinator-history"),
    path("geo-monitoring/api/", views.AdminGeoMonitoringView.as_view(), name="admin-geo-monitoring-api"),
    path("maintenance/run/", views.AdminRunMaintenanceView.as_view(), name="admin-run-maintenance"),
    path("users/<int:user_id>/moderation-summary/", views.AdminModerationSummaryView.as_view(), name="admin-moderation-summary"),
    path("users/<int:user_id>/<str:action>/", views.AdminUserActionView.as_view(), name="admin-user-action"),
    path("events/", views.AdminEventListCreateView.as_view(), name="api_events_list_create"),
    path("events/<int:event_id>/<str:action>/", views.AdminEventActionView.as_view(), name="admin-event-action"),

    # Self-Hosted Map Engine & Tile Streaming (MAP-TASK-01)
    path("maps/catalog/", map_views.map_catalog_api_view, name="admin-map-catalog"),
    path("maps/tiles/<int:z>/<int:x>/<int:y>.png", map_views.map_tile_proxy_view, name="admin-map-tile-proxy"),
    path("maps/regions/<str:region_code>/download/", map_views.map_region_download_view, name="admin-map-region-download"),
    path("maps/sync/", map_views.admin_map_sync_action_view, name="admin-map-sync"),
]
