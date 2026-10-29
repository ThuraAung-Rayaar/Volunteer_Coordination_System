# apps/audit/urls.py
from django.urls import path

from apps.audit.views import (
    AdminBlockUserView,
    AdminCancelEventView,
    AdminCloseAccountView,
    AdminDashboardStatsView,
    AdminDeleteEventView,
    AdminHideFeedbackView,
    AdminReinstateAccountView,
    AdminRestoreEventView,
    AdminUnblockUserView,
    AdminWarnUserView,
)

urlpatterns = [
    # Admin Moderation & Dashboard (canonical /api/v1/admin/...)
    path("admin/dashboard/", AdminDashboardStatsView.as_view(), name="admin-dashboard-stats"),
    path("admin/users/<int:pk>/warn/", AdminWarnUserView.as_view(), name="admin-user-warn"),
    path("admin/users/<int:pk>/block/", AdminBlockUserView.as_view(), name="admin-user-block"),
    path("admin/users/<int:pk>/unblock/", AdminUnblockUserView.as_view(), name="admin-user-unblock"),
    path("admin/users/<int:pk>/close/", AdminCloseAccountView.as_view(), name="admin-user-close"),
    path("admin/users/<int:pk>/reinstate/", AdminReinstateAccountView.as_view(), name="admin-user-reinstate"),
    path("admin/events/<int:pk>/delete/", AdminDeleteEventView.as_view(), name="admin-event-delete"),
    path("admin/events/<int:pk>/restore/", AdminRestoreEventView.as_view(), name="admin-event-restore"),
    path("admin/events/<int:pk>/cancel/", AdminCancelEventView.as_view(), name="admin-event-cancel"),
    path("admin/feedback/<int:pk>/hide/", AdminHideFeedbackView.as_view(), name="admin-feedback-hide"),

    # Direct /api/v1/audit/ aliases
    path("dashboard/", AdminDashboardStatsView.as_view(), name="audit-dashboard-stats"),
    path("users/<int:pk>/warn/", AdminWarnUserView.as_view(), name="audit-user-warn"),
    path("users/<int:pk>/block/", AdminBlockUserView.as_view(), name="audit-user-block"),
    path("users/<int:pk>/unblock/", AdminUnblockUserView.as_view(), name="audit-user-unblock"),
    path("users/<int:pk>/close/", AdminCloseAccountView.as_view(), name="audit-user-close"),
    path("users/<int:pk>/reinstate/", AdminReinstateAccountView.as_view(), name="audit-user-reinstate"),
    path("events/<int:pk>/delete/", AdminDeleteEventView.as_view(), name="audit-event-delete"),
    path("events/<int:pk>/restore/", AdminRestoreEventView.as_view(), name="audit-event-restore"),
    path("events/<int:pk>/cancel/", AdminCancelEventView.as_view(), name="audit-event-cancel"),
    path("feedback/<int:pk>/hide/", AdminHideFeedbackView.as_view(), name="audit-feedback-hide"),
]
