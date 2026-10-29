# apps/ops/urls.py
from django.urls import path

from apps.ops.views import (
    AssignmentCancelView,
    AssignmentConfirmView,
    EventAutoRunAssignmentView,
    EventCheckInView,
    EventCheckOutView,
    EventFeedbackView,
    EventManualAssignmentView,
    EventMarkAbsentView,
    EventOnboardingAcknowledgeView,
    EventQrGenerateView,
    MeApplicationsListView,
    MeAssignmentsListView,
    QrRedeemView,
    QrResolveView,
)

urlpatterns = [
    # QR Tokens
    path("events/<int:pk>/qr/", EventQrGenerateView.as_view(), name="event-qr-generate"),
    path("qr/resolve/", QrResolveView.as_view(), name="qr-resolve"),
    path("qr/redeem/", QrRedeemView.as_view(), name="qr-redeem"),

    # Assignments
    path("events/<int:pk>/assignments/auto-run/", EventAutoRunAssignmentView.as_view(), name="event-assignments-autorun"),
    path("events/<int:pk>/assignments/manual/", EventManualAssignmentView.as_view(), name="event-assignments-manual"),
    path("assignments/<int:pk>/confirm/", AssignmentConfirmView.as_view(), name="assignment-confirm"),
    path("assignments/<int:pk>/cancel/", AssignmentCancelView.as_view(), name="assignment-cancel"),

    # Attendance / Onboarding / Feedback
    path("events/<int:pk>/check-in/", EventCheckInView.as_view(), name="event-check-in"),
    path("events/<int:pk>/check-out/", EventCheckOutView.as_view(), name="event-check-out"),
    path("events/<int:pk>/mark-absent/", EventMarkAbsentView.as_view(), name="event-mark-absent"),
    path("events/<int:pk>/onboarding/acknowledge/", EventOnboardingAcknowledgeView.as_view(), name="event-onboarding-ack"),
    path("events/<int:pk>/feedback/", EventFeedbackView.as_view(), name="event-feedback"),

    # Me Endpoints
    path("me/applications/", MeApplicationsListView.as_view(), name="me-applications"),
    path("me/assignments/", MeAssignmentsListView.as_view(), name="me-assignments"),
]
