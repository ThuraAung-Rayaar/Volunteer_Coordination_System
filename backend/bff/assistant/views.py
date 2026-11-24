from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from common.permissions import IsActiveUser
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from ai.services.chat_service import process_chat_message
from .serializers import AssistantChatRequestSerializer, AssistantChatResponseSerializer


class AssistantChatView(APIView):
    """
    POST /api/v1/assistant/chat/
    Role-scoped read-only AI Assistant conversation endpoint.
    Zero core database persistence. Enforces T0-T4 visibility and PII redaction.
    """
    permission_classes = [IsAuthenticated, IsActiveUser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'assistant'

    @extend_schema(
        request=AssistantChatRequestSerializer,
        responses={200: AssistantChatResponseSerializer},
        description="Submit a conversation query to the role-scoped AI Assistant.",
    )
    def post(self, request):
        from django.conf import settings

        if not getattr(settings, "AI_ENABLED", True):
            return Response(
                {"detail": "The AI assistant is currently disabled."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        serializer = AssistantChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        try:
            result = process_chat_message(
                actor=request.user,
                message=data["message"],
                conversation_history=data.get("conversation"),
                language=data.get("language", "en"),
            )
        except Exception:
            # Never return provider URLs, SQL errors, prompts, or configuration.
            import logging
            logging.getLogger(__name__).exception("Assistant request failed")
            return Response(
                {
                    "detail": "The assistant could not complete this request. Please retry shortly.",
                    "code": "assistant_unavailable",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(result, status=status.HTTP_200_OK)
