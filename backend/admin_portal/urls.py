from django.urls import path
from . import views

urlpatterns = [
    path('', views.dashboard_view, name='admin_dashboard'),
    path('geo-monitoring/', views.geo_monitoring_view, name='geo_monitoring'),
    path('coordinator-board/', views.coordinator_board_view, name='coordinator_board'),
]
