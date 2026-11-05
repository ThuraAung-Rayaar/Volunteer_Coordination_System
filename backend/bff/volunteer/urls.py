from django.urls import path

from .views import (
    ApplicationWithdrawView,
    AssignmentCancelView,
    AssignmentConfirmView,
    CharityFieldsListView,
    EventApplyView,
    EventCheckAvailabilityView,
    MeAvailabilityExceptionDetailView,
    MeAvailabilityExceptionsView,
    MeAvailabilityRulesView,
    MeAvailabilityView,
    MeCharityInterestsView,
    MeCoordinatorView,
    MeProfileView,
    MeVerificationImagesView,
    MyApplicationsView,
    MyAssignmentsView,
    PublicEventDetailView,
    PublicEventListView,
    PublicEventPostsView,
    UserByUuidView,
)

urlpatterns = [
    # Public Events & Taxonomy (Phase 2)
    path("charity-fields/", CharityFieldsListView.as_view(), name="charity-fields-list"),
    path("events/", PublicEventListView.as_view(), name="public-event-list"),
    path("events/<int:event_id>/", PublicEventDetailView.as_view(), name="public-event-detail"),
    path("events/<int:event_id>/posts/", PublicEventPostsView.as_view(), name="public-event-posts"),

    # User Profile & Interests (Phase 3)
    path("me/", MeProfileView.as_view(), name="me-profile"),
    path("profile/", MeProfileView.as_view(), name="profile"),
    path("me/charity-interests/", MeCharityInterestsView.as_view(), name="me-charity-interests"),
    path("users/by-uuid/<uuid:uuid>/", UserByUuidView.as_view(), name="user-by-uuid"),

    # Volunteer Availability & Conflicts (Phase 3)
    path("me/availability/", MeAvailabilityView.as_view(), name="me-availability"),
    path("availability/", MeAvailabilityView.as_view(), name="availability"),
    path("me/availability/rules/", MeAvailabilityRulesView.as_view(), name="me-availability-rules"),
    path("availability/rules/", MeAvailabilityRulesView.as_view(), name="availability-rules"),
    path("me/availability/exceptions/", MeAvailabilityExceptionsView.as_view(), name="me-availability-exceptions"),
    path("availability/exceptions/", MeAvailabilityExceptionsView.as_view(), name="availability-exceptions"),
    path(
        "me/availability/exceptions/<int:exception_id>/",
        MeAvailabilityExceptionDetailView.as_view(),
        name="me-availability-exception-detail",
    ),
    path(
        "availability/exceptions/<int:exception_id>/",
        MeAvailabilityExceptionDetailView.as_view(),
        name="availability-exception-detail",
    ),
    path("me/availability/check/", EventCheckAvailabilityView.as_view(), name="me-availability-check"),
    path("availability/check/", EventCheckAvailabilityView.as_view(), name="availability-check"),
    path("events/check-availability/", EventCheckAvailabilityView.as_view(), name="events-check-availability"),

    # Identity Verification & Coordinator (Phase 4)
    path("me/verification-images/", MeVerificationImagesView.as_view(), name="me-verification-images"),
    path("verification-images/", MeVerificationImagesView.as_view(), name="verification-images"),
    path("me/coordinator/", MeCoordinatorView.as_view(), name="me-coordinator"),
    path("coordinator/apply/", MeCoordinatorView.as_view(), name="coordinator-apply"),

    # Applications & Assignments (Phase 6)
    path("events/<int:event_id>/apply/", EventApplyView.as_view(), name="event-apply"),
    path("me/applications/", MyApplicationsView.as_view(), name="my-applications"),
    path("applications/<int:application_id>/withdraw/", ApplicationWithdrawView.as_view(), name="application-withdraw"),
    path("me/assignments/", MyAssignmentsView.as_view(), name="my-assignments"),
    path("assignments/<int:assignment_id>/confirm/", AssignmentConfirmView.as_view(), name="assignment-confirm"),
    path("assignments/<int:assignment_id>/cancel/", AssignmentCancelView.as_view(), name="assignment-cancel"),
    path("events/<int:event_id>/check-availability/", EventCheckAvailabilityView.as_view(), name="event-check-availability"),
]
