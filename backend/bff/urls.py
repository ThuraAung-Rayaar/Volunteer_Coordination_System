from django.urls import path, include
from admin_portal import map_views

urlpatterns = [
    # Self-Hosted Map Engine & Tile Streaming (MAP-TASK-01)
    path('maps/catalog/', map_views.map_catalog_api_view, name='map_catalog'),
    path('maps/tiles/<int:z>/<int:x>/<int:y>.png', map_views.map_tile_proxy_view, name='map_tile_proxy'),
    path('maps/regions/<str:region_code>/download/', map_views.map_region_download_view, name='map_region_download'),
    path('maps/sync/', map_views.admin_map_sync_action_view, name='map_sync_action'),

    path('auth/', include('bff.auth.urls')),
    path('volunteer/', include('bff.volunteer.urls')),
    path('checkin/', include('bff.checkin.urls')),
    path('coordinator/', include('bff.coordinator.urls')),
    path('admin/', include('admin_portal.urls')),
    path('', include('bff.volunteer.urls')),
    path('', include('bff.coordinator.urls')),
    path('', include('bff.checkin.urls')),
]
