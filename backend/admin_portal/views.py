from django.shortcuts import render
from django.views.generic import TemplateView

def dashboard_view(request):
    return render(request, 'admin_portal/dashboard.html', {})

def geo_monitoring_view(request):
    return render(request, 'admin_portal/geo_monitoring.html', {})

def coordinator_board_view(request):
    return render(request, 'admin_portal/coordinator_board.html', {})
