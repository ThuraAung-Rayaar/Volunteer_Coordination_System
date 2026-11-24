from rest_framework import serializers


class ChatMessageItemSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["user", "assistant"])
    content = serializers.CharField(max_length=2000)


class AssistantChatRequestSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=2000, required=True)
    conversation = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list,
    )
    language = serializers.CharField(max_length=10, required=False, default="en")


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
