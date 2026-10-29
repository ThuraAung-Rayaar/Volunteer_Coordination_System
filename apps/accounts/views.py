# apps/accounts/views.py
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import CoordinatorProfile
from apps.accounts.serializers import (
    CharityInterestsUpdateSerializer,
    CoordinatorApplySerializer,
    CoordinatorProfileSerializer,
    OtpRequestSerializer,
    OtpVerifySerializer,
    UserProfileSerializer,
    VerificationImageSerializer,
    VerificationImageUploadSerializer,
)
from apps.accounts.services import (
    add_verification_image,
    apply_as_coordinator,
    request_otp,
    set_charity_interests,
    update_profile,
    verify_otp,
)
from apps.common.permissions import IsActiveAccount


class OtpRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OtpRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        res = request_otp(
            phone=serializer.validated_data["phone"],
            purpose=serializer.validated_data.get("purpose", "login"),
        )
        return Response(res, status=status.HTTP_200_OK)


class OtpVerifyView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, token, created = verify_otp(
            phone=serializer.validated_data["phone"],
            code=serializer.validated_data["code"],
            purpose=serializer.validated_data.get("purpose", "login"),
        )
        return Response(
            {
                "token": token.key,
                "user": UserProfileSerializer(user).data,
                "created": created,
            },
            status=status.HTTP_200_OK,
        )


class MeProfileView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def get(self, request):
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        # We pass request.data directly to update_profile so domain service detects forbidden field tampering
        data = request.data.dict() if hasattr(request.data, "dict") else dict(request.data)
        updated_user = update_profile(request.user, data)
        return Response(UserProfileSerializer(updated_user).data, status=status.HTTP_200_OK)


class MeCharityInterestsView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def get(self, request):
        interests = list(request.user.charity_interests.values_list("field_code_id", flat=True))
        return Response({"interests": interests}, status=status.HTTP_200_OK)

    def put(self, request):
        serializer = CharityInterestsUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        codes = serializer.validated_data["codes"]
        set_charity_interests(request.user, codes)
        return Response({"status": "ok", "interests": codes}, status=status.HTTP_200_OK)


class MeVerificationImagesView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        images = request.user.verification_images.all().order_by("-created_at")
        serializer = VerificationImageSerializer(images, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = VerificationImageUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_image = add_verification_image(
            user=request.user,
            image_type=serializer.validated_data["image_type"],
            uploaded_file=serializer.validated_data["image"],
        )
        return Response(
            VerificationImageSerializer(new_image).data,
            status=status.HTTP_201_CREATED,
        )


class MeCoordinatorView(APIView):
    permission_classes = [IsAuthenticated, IsActiveAccount]

    def get(self, request):
        profile = CoordinatorProfile.objects.filter(user=request.user).first()
        if not profile:
            return Response({"status": "none"}, status=status.HTTP_200_OK)
        return Response(CoordinatorProfileSerializer(profile).data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = CoordinatorApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = apply_as_coordinator(
            user=request.user,
            notes=serializer.validated_data.get("notes", ""),
        )
        return Response(
            CoordinatorProfileSerializer(profile).data,
            status=status.HTTP_200_OK,
        )
