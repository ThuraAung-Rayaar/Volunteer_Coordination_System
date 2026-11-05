from django.urls import path

from .views import LogoutView, OtpRequestView, OtpVerifyView

urlpatterns = [
    path("otp/request/", OtpRequestView.as_view(), name="otp-request"),
    path("request-otp/", OtpRequestView.as_view(), name="auth-request-otp"),
    path("otp/verify/", OtpVerifyView.as_view(), name="otp-verify"),
    path("verify-otp/", OtpVerifyView.as_view(), name="auth-verify-otp"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
]
