from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('admin-dashboard/', include('admin_portal.urls')),
    path('api/bff/mobile/', include('bff.urls')),
]
