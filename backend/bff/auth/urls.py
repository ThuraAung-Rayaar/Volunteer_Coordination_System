from django.urls import path

from .views import LogoutView, OtpRequestView, OtpVerifyView

urlpatterns = [
    path("otp/request/", OtpRequestView.as_view(), name="otp-request"),
    path("otp/verify/", OtpVerifyView.as_view(), name="otp-verify"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
]
