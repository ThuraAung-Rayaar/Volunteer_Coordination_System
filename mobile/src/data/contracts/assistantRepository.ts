/**
 * @format
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface SuggestedAction {
  type: string;
  eventId?: number;
  label?: string;
}

export interface SourceItem {
  type: string;
  id?: number;
  label?: string;
}

export interface AssistantChatResponse {
  answer: string;
  sources: SourceItem[];
  suggestedActions: SuggestedAction[];
  requestId: string;
}

export interface AssistantRepository {
  sendMessage(
    message: string,
    history: ChatMessage[],
  ): Promise<AssistantChatResponse>;
}
