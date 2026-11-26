import logging

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from ai.services.chat_service import process_chat_message
from ai.services.prompt_catalog import get_prompt_catalog_for_actor
from common.exceptions import DomainError
from common.permissions import IsActiveUser
from .serializers import (
    AssistantChatRequestSerializer,
    AssistantChatResponseSerializer,
    AssistantPromptCatalogResponseSerializer,
)

logger = logging.getLogger(__name__)


class AssistantPromptCatalogView(APIView):
    """
    GET /api/v1/assistant/prompts/
    Return the backend-controlled, role-scoped prompt catalogue for the current user.
    """
    permission_classes = [IsAuthenticated, IsActiveUser]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="language",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Preferred language code ('en' or 'my').",
            )
        ],
        responses={200: AssistantPromptCatalogResponseSerializer},
        description="Retrieve role-appropriate predefined assistant prompts.",
    )
    def get(self, request):
        language = request.query_params.get("language", "en")
        catalog = get_prompt_catalog_for_actor(request.user, language=language)
        return Response(catalog, status=status.HTTP_200_OK)


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
        description="Submit a prompt key or conversation query to the role-scoped AI Assistant.",
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
                message=data.get("message", ""),
                conversation_history=data.get("conversation"),
                language=data.get("language", "en"),
                prompt_key=data.get("prompt_key", ""),
                event_id=data.get("event_id"),
            )
        except (APIException, DomainError):
            raise
        except Exception:
            # Never return provider URLs, SQL errors, prompts, or configuration.
            logger.exception("Assistant request failed")
            return Response(
                {
                    "detail": "The assistant could not complete this request. Please retry shortly.",
                    "code": "assistant_unavailable",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(result, status=status.HTTP_200_OK)
