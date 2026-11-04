from django.urls import path

from .views import (
    ApplicationDecisionView,
    CoordinatorEventApplicationsView,
    CoordinatorEventDetailView,
    CoordinatorEventListCreateView,
    CoordinatorEventPostsView,
    EventActivateView,
    EventAssignmentsView,
    EventAutoAssignView,
    EventCancelView,
    EventCompleteView,
    EventHandoverView,
    EventManualAssignView,
    EventPostCapacityView,
    EventPostCloseView,
    EventPostDetailView,
    EventPublishView,
    EventRetakeView,
    EventSummaryView,
    EventUnassignedView,
)

urlpatterns = [
    # Summary (backward compatible with Phase 2)
    path("events/<int:event_id>/summary/", EventSummaryView.as_view(), name="event-summary"),
    path("coordinator/events/<int:event_id>/summary/", EventSummaryView.as_view(), name="coordinator-event-summary"),

    # Event CRUD & lifecycle
    path("coordinator/events/", CoordinatorEventListCreateView.as_view(), name="coordinator-event-list-create"),
    path("events/", CoordinatorEventListCreateView.as_view(), name="coordinator-events-mount"),
    path("coordinator/events/<int:event_id>/", CoordinatorEventDetailView.as_view(), name="coordinator-event-detail"),
    path("events/<int:event_id>/", CoordinatorEventDetailView.as_view(), name="coordinator-event-detail-mount"),
    path("events/<int:event_id>/publish/", EventPublishView.as_view(), name="event-publish"),
    path("events/<int:event_id>/activate/", EventActivateView.as_view(), name="event-activate"),
    path("events/<int:event_id>/complete/", EventCompleteView.as_view(), name="event-complete"),
    path("events/<int:event_id>/cancel/", EventCancelView.as_view(), name="event-cancel"),

    # Coordinator handover & retake
    path("events/<int:event_id>/handover/", EventHandoverView.as_view(), name="event-handover"),
    path("events/<int:event_id>/retake/", EventRetakeView.as_view(), name="event-retake"),

    # Event posts
    path("coordinator/events/<int:event_id>/posts/", CoordinatorEventPostsView.as_view(), name="coordinator-event-posts"),
    path("events/<int:event_id>/posts/", CoordinatorEventPostsView.as_view(), name="coordinator-event-posts-mount"),
    path("posts/<int:post_id>/", EventPostDetailView.as_view(), name="event-post-detail"),
    path("posts/<int:post_id>/close/", EventPostCloseView.as_view(), name="event-post-close"),

    # Applications & Assignments (Phase 6)
    path("coordinator/events/<int:event_id>/applications/", CoordinatorEventApplicationsView.as_view(), name="coordinator-event-applications"),
    path("events/<int:event_id>/applications/", CoordinatorEventApplicationsView.as_view(), name="coordinator-event-applications-mount"),
    path("applications/<int:application_id>/<str:action>/", ApplicationDecisionView.as_view(), name="application-decision"),
    path("coordinator/applications/<int:application_id>/<str:action>/", ApplicationDecisionView.as_view(), name="coordinator-application-decision"),
    path("coordinator/events/<int:event_id>/auto-assign/", EventAutoAssignView.as_view(), name="event-auto-assign"),
    path("events/<int:event_id>/auto-assign/", EventAutoAssignView.as_view(), name="event-auto-assign-mount"),
    path("coordinator/events/<int:event_id>/manual-assign/", EventManualAssignView.as_view(), name="event-manual-assign"),
    path("events/<int:event_id>/manual-assign/", EventManualAssignView.as_view(), name="event-manual-assign-mount"),
    path("coordinator/events/<int:event_id>/assignments/", EventAssignmentsView.as_view(), name="event-assignments"),
    path("events/<int:event_id>/assignments/", EventAssignmentsView.as_view(), name="event-assignments-mount"),
    path("coordinator/events/<int:event_id>/unassigned/", EventUnassignedView.as_view(), name="event-unassigned"),
    path("events/<int:event_id>/unassigned/", EventUnassignedView.as_view(), name="event-unassigned-mount"),
    path("coordinator/events/<int:event_id>/post-capacity/", EventPostCapacityView.as_view(), name="event-post-capacity"),
    path("events/<int:event_id>/post-capacity/", EventPostCapacityView.as_view(), name="event-post-capacity-mount"),
]
