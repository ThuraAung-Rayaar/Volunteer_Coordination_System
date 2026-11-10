from django.contrib import admin
from django.urls import path, include
from django.views.generic import RedirectView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path('', RedirectView.as_view(url='/api/v1/admin/ui/login/', permanent=False), name='root_redirect'),
    path('admin/', admin.site.urls),
    path('admin-dashboard/', include('admin_portal.urls')),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/v1/', include('bff.urls')),
    path('api/bff/mobile/', include('bff.urls')),
    path('api/', include('bff.urls')),
]
