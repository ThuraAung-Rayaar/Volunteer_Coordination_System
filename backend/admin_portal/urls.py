from django.urls import path

from . import views

urlpatterns = [
    # Template Views
    path("", views.dashboard_view, name="admin_dashboard"),
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
    path("users/<int:user_id>/moderation-summary/", views.AdminModerationSummaryView.as_view(), name="admin-moderation-summary"),
    path("users/<int:user_id>/<str:action>/", views.AdminUserActionView.as_view(), name="admin-user-action"),
    path("events/<int:event_id>/<str:action>/", views.AdminEventActionView.as_view(), name="admin-event-action"),
    path("feedback/<int:feedback_id>/hide/", views.AdminHideFeedbackView.as_view(), name="admin-feedback-hide"),
    path("audit/", views.AdminAuditLogsView.as_view(), name="admin-audit-logs"),
    path("coordinator-history/", views.AdminCoordinatorHistoryView.as_view(), name="admin-coordinator-history"),
    path("geo-monitoring/api/", views.AdminGeoMonitoringView.as_view(), name="admin-geo-monitoring-api"),
    path("maintenance/run/", views.AdminRunMaintenanceView.as_view(), name="admin-run-maintenance"),

    # Direct /api/v1/admin/ path fallbacks if routed without prefix
    path("api/v1/admin/dashboard/", views.AdminDashboardView.as_view(), name="admin-dashboard-direct"),
    path("api/v1/admin/moderation/", views.AdminModerationView.as_view(), name="admin-moderation-direct"),
    path("api/v1/admin/users/<int:user_id>/moderation-summary/", views.AdminModerationSummaryView.as_view(), name="admin-moderation-summary-direct"),
    path("api/v1/admin/users/<int:user_id>/<str:action>/", views.AdminUserActionView.as_view(), name="admin-user-action-direct"),
    path("api/v1/admin/events/<int:event_id>/<str:action>/", views.AdminEventActionView.as_view(), name="admin-event-action-direct"),
    path("api/v1/admin/feedback/<int:feedback_id>/hide/", views.AdminHideFeedbackView.as_view(), name="admin-feedback-hide-direct"),
    path("api/v1/admin/audit/", views.AdminAuditLogsView.as_view(), name="admin-audit-logs-direct"),
    path("api/v1/admin/coordinator-history/", views.AdminCoordinatorHistoryView.as_view(), name="admin-coordinator-history-direct"),
    path("api/v1/admin/geo-monitoring/", views.AdminGeoMonitoringView.as_view(), name="admin-geo-monitoring"),
    path("api/v1/admin/maintenance/run/", views.AdminRunMaintenanceView.as_view(), name="admin-run-maintenance-direct"),
]
