# apps/events/urls.py
from django.urls import path

from apps.events.views import (
    ApplicationAcceptView,
    ApplicationRejectView,
    ApplicationWaitlistView,
    ApplicationWithdrawView,
    CharityFieldListView,
    CoordinatorEventDetailPatchView,
    CoordinatorEventListCreateView,
    EventActivateView,
    EventApplicationsListView,
    EventApplyView,
    EventCancelView,
    EventCompleteView,
    EventPostListCreateView,
    EventPublishView,
    EventRosterView,
    EventUnassignedView,
    PostDetailPatchView,
    PublicEventDetailView,
    PublicEventListView,
)

urlpatterns = [
    # Charity Fields
    path("charity-fields/", CharityFieldListView.as_view(), name="charity-fields-list"),

    # Public Events
    path("events/", PublicEventListView.as_view(), name="public-events-list"),
    path("events/<int:pk>/", PublicEventDetailView.as_view(), name="public-event-detail"),

    # Coordinator Event Management
    path("coordinator/events/", CoordinatorEventListCreateView.as_view(), name="coordinator-events-list-create"),
    path("coordinator/events/<int:pk>/", CoordinatorEventDetailPatchView.as_view(), name="coordinator-event-patch"),

    # Event Lifecycle Actions
    path("events/<int:pk>/publish/", EventPublishView.as_view(), name="event-publish"),
    path("events/<int:pk>/activate/", EventActivateView.as_view(), name="event-activate"),
    path("events/<int:pk>/complete/", EventCompleteView.as_view(), name="event-complete"),
    path("events/<int:pk>/cancel/", EventCancelView.as_view(), name="event-cancel"),

    # Event Posts
    path("events/<int:pk>/posts/", EventPostListCreateView.as_view(), name="event-posts-list-create"),
    path("posts/<int:pk>/", PostDetailPatchView.as_view(), name="post-patch"),

    # Applications
    path("events/<int:pk>/apply/", EventApplyView.as_view(), name="event-apply"),
    path("events/<int:pk>/applications/", EventApplicationsListView.as_view(), name="event-applications-list"),
    path("events/<int:pk>/roster/", EventRosterView.as_view(), name="event-roster"),
    path("events/<int:pk>/unassigned/", EventUnassignedView.as_view(), name="event-unassigned"),

    # Application Decisions
    path("applications/<int:pk>/accept/", ApplicationAcceptView.as_view(), name="application-accept"),
    path("applications/<int:pk>/reject/", ApplicationRejectView.as_view(), name="application-reject"),
    path("applications/<int:pk>/waitlist/", ApplicationWaitlistView.as_view(), name="application-waitlist"),
    path("applications/<int:pk>/withdraw/", ApplicationWithdrawView.as_view(), name="application-withdraw"),
]
