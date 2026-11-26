from rest_framework import serializers


class ChatMessageItemSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["user", "assistant"])
    content = serializers.CharField(max_length=2000)


class AssistantChatRequestSerializer(serializers.Serializer):
    prompt_key = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    message = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")
    conversation = serializers.ListField(
        child=ChatMessageItemSerializer(),
        required=False,
        default=list,
    )
    language = serializers.CharField(max_length=10, required=False, default="en")
    event_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)

    def validate(self, attrs):
        prompt_key = str(attrs.get("prompt_key") or "").strip()
        message = str(attrs.get("message") or "").strip()
        if not prompt_key and not message:
            raise serializers.ValidationError(
                {"message": "Provide a prompt_key or a non-empty message."}
            )
        return attrs


class SuggestedActionSerializer(serializers.Serializer):
    type = serializers.CharField()
    event_id = serializers.IntegerField(required=False)
    label = serializers.CharField(required=False)


class SourceItemSerializer(serializers.Serializer):
    type = serializers.CharField()
    id = serializers.IntegerField(required=False)
    label = serializers.CharField(required=False)


class AssistantChatResponseSerializer(serializers.Serializer):
    answer = serializers.CharField()
    sources = SourceItemSerializer(many=True, default=list)
    suggested_actions = SuggestedActionSerializer(many=True, default=list)
    request_id = serializers.CharField()
    intent = serializers.CharField(required=False)
    actor_scope = serializers.CharField(required=False)
    fallback_used = serializers.BooleanField(required=False)


class AssistantPromptItemSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    description = serializers.CharField()
    available = serializers.BooleanField()


class AssistantPromptCatalogResponseSerializer(serializers.Serializer):
    role = serializers.CharField()
    language = serializers.CharField()
    prompts = AssistantPromptItemSerializer(many=True)
    catalog_version = serializers.CharField()
