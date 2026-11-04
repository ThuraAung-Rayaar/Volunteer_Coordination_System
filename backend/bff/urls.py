from django.urls import path, include

urlpatterns = [
    path('auth/', include('bff.auth.urls')),
    path('volunteer/', include('bff.volunteer.urls')),
    path('checkin/', include('bff.checkin.urls')),
    path('coordinator/', include('bff.coordinator.urls')),
    path('admin/', include('admin_portal.urls')),
    path('', include('bff.volunteer.urls')),
    path('', include('bff.coordinator.urls')),
    path('', include('bff.checkin.urls')),
]
