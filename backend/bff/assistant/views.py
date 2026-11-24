from rest_framework import status
from rest_framework.permissions import IsAuthenticated
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
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=AssistantChatRequestSerializer,
        responses={200: AssistantChatResponseSerializer},
        description="Submit a conversation query to the role-scoped AI Assistant.",
    )
    def post(self, request):
        serializer = AssistantChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        result = process_chat_message(
            actor=request.user,
            message=data["message"],
            conversation_history=data.get("conversation"),
            language=data.get("language", "en"),
        )

        return Response(result, status=status.HTTP_200_OK)
