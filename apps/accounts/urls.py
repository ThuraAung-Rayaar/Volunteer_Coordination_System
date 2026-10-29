# apps/accounts/urls.py
from django.urls import path

from apps.accounts.views import (
    MeCharityInterestsView,
    MeCoordinatorView,
    MeProfileView,
    MeVerificationImagesView,
    OtpRequestView,
    OtpVerifyView,
)

urlpatterns = [
    # Auth
    path("auth/otp/request/", OtpRequestView.as_view(), name="otp-request"),
    path("auth/otp/verify/", OtpVerifyView.as_view(), name="otp-verify"),

    # Me / Profile
    path("me/", MeProfileView.as_view(), name="me-profile"),
    path("me/charity-interests/", MeCharityInterestsView.as_view(), name="me-charity-interests"),
    path("me/verification-images/", MeVerificationImagesView.as_view(), name="me-verification-images"),
    path("me/coordinator/", MeCoordinatorView.as_view(), name="me-coordinator"),
    path("coordinator/apply/", MeCoordinatorView.as_view(), name="coordinator-apply"),
]
