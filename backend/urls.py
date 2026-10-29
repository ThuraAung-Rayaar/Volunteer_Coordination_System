from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView
)

urlpatterns = [
    # Admin Web Portal
    path('admin/', admin.site.urls),

    # REST APIs for Mobile (React Native) & Frontend
    path('api/v1/', include('apps.accounts.urls')),
    path('api/v1/accounts/', include('apps.accounts.urls')),
    path('api/v1/', include('apps.events.urls')),
    path('api/v1/events/', include('apps.events.urls')),
    path('api/v1/', include('apps.ops.urls')),
    path('api/v1/ops/', include('apps.ops.urls')),
    path('api/v1/', include('apps.audit.urls')),
    path('api/v1/audit/', include('apps.audit.urls')),

    # OpenAPI Schema & Interactive Documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
