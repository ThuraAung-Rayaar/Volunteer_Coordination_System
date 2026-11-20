from django.urls import path

from .views import (
    LogoutView,
    OtpRequestView,
    OtpVerifyView,
    TokenizedOtpRequestView,
    TokenizedOtpVerifyView,
)

urlpatterns = [
    # v0.12.0 Tokenized Challenge Handshake Routes (AUTH-02, AUTH-03)
    path("tokenized/request-otp/", TokenizedOtpRequestView.as_view(), name="auth-tokenized-request-otp"),
    path("tokenized/verify-otp/", TokenizedOtpVerifyView.as_view(), name="auth-tokenized-verify-otp"),

    # Legacy Backward-Compatible Routes
    path("otp/request/", OtpRequestView.as_view(), name="otp-request"),
    path("request-otp/", OtpRequestView.as_view(), name="auth-request-otp"),
    path("otp/verify/", OtpVerifyView.as_view(), name="otp-verify"),
    path("verify-otp/", OtpVerifyView.as_view(), name="auth-verify-otp"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
]
