from django.urls import path
from .views import AssistantChatView, AssistantPromptCatalogView

urlpatterns = [
    path('prompts/', AssistantPromptCatalogView.as_view(), name='assistant_prompts'),
    path('chat/', AssistantChatView.as_view(), name='assistant_chat'),
]
