from django.urls import path

from .views import (
    AttendanceCheckoutView,
    AttendanceGeoCheckinView,
    AttendanceManualCheckinView,
    AttendanceQrCheckinView,
    CoordinatorAttendanceBoardView,
    CoordinatorConfirmAttendanceView,
    CoordinatorGeoAttemptsView,
    CoordinatorPendingConfirmationsView,
    CoordinatorRejectAttendanceView,
    EventFeedbackListView,
    EventFeedbackSubmitView,
    EventOnboardingAcknowledgeView,
    EventOnboardingView,
    MyFeedbackView,
    QrRedeemView,
    QrResolveView,
    QrTokenCreateView,
    QrTokenRevokeView,
    UserAttendanceHistoryView,
)

urlpatterns = [
    # Onboarding
    path("events/<int:event_id>/onboarding/", EventOnboardingView.as_view(), name="event-onboarding"),
    path("events/<int:event_id>/onboarding/status/", EventOnboardingView.as_view(), name="event-onboarding-status"),
    path("events/<int:event_id>/onboarding/acknowledge/", EventOnboardingAcknowledgeView.as_view(), name="event-onboarding-ack"),

    # QR
    path("qr/resolve/", QrResolveView.as_view(), name="qr-resolve"),
    path("qr/redeem/", QrRedeemView.as_view(), name="qr-redeem"),
    path("coordinator/events/<int:event_id>/qr-tokens/", QrTokenCreateView.as_view(), name="qr-token-create"),
    path("coordinator/qr-tokens/<int:qr_id>/revoke/", QrTokenRevokeView.as_view(), name="qr-token-revoke"),

    # Check-in (Flat paths)
    path("attendance/qr-checkin/", AttendanceQrCheckinView.as_view(), name="attendance-qr-checkin"),
    path("attendance/manual-checkin/", AttendanceManualCheckinView.as_view(), name="attendance-manual-checkin"),
    path("attendance/geo-checkin/", AttendanceGeoCheckinView.as_view(), name="attendance-geo-checkin"),
    path("attendance/<int:attendance_id>/checkout/", AttendanceCheckoutView.as_view(), name="attendance-checkout"),

    # Check-in (Event-scoped RESTful aliases)
    path("events/<int:event_id>/geo-check-in/", AttendanceGeoCheckinView.as_view(), name="event-geo-checkin-alias"),
    path("events/<int:event_id>/geo-checkin/", AttendanceGeoCheckinView.as_view(), name="event-geo-checkin"),
    path("events/<int:event_id>/check-in/", AttendanceManualCheckinView.as_view(), name="event-manual-checkin-alias"),
    path("events/<int:event_id>/checkin/", AttendanceManualCheckinView.as_view(), name="event-manual-checkin"),
    path("events/<int:event_id>/check-out/", AttendanceCheckoutView.as_view(), name="event-checkout-alias"),
    path("events/<int:event_id>/checkout/", AttendanceCheckoutView.as_view(), name="event-checkout"),

    # Volunteer self-service history (BR-PRIV-T4)
    path("me/attendance/", UserAttendanceHistoryView.as_view(), name="my-attendance-history"),

    # Coordinator boards, roster & confirmation
    path("coordinator/events/<int:event_id>/attendance/", CoordinatorAttendanceBoardView.as_view(), name="coordinator-attendance-board"),
    path("coordinator/events/<int:event_id>/attendance/roster/", CoordinatorAttendanceBoardView.as_view(), name="coordinator-attendance-roster"),
    path("coordinator/events/<int:event_id>/attendance/pending/", CoordinatorPendingConfirmationsView.as_view(), name="coordinator-attendance-pending"),
    path("coordinator/events/<int:event_id>/geo-attempts/", CoordinatorGeoAttemptsView.as_view(), name="coordinator-geo-attempts"),
    path("coordinator/attendance/<int:attendance_id>/confirm/", CoordinatorConfirmAttendanceView.as_view(), name="coordinator-attendance-confirm"),
    path("coordinator/attendance/<int:attendance_id>/reject/", CoordinatorRejectAttendanceView.as_view(), name="coordinator-attendance-reject"),

    # Feedback
    path("events/<int:event_id>/feedback/", EventFeedbackSubmitView.as_view(), name="event-feedback-submit"),
    path("events/<int:event_id>/feedback/list/", EventFeedbackListView.as_view(), name="event-feedback-list"),
    path("me/feedback/", MyFeedbackView.as_view(), name="my-feedback"),
]
