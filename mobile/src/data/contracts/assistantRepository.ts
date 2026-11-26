/**
 * @format
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  fallbackUsed?: boolean;
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

export interface AssistantPromptItem {
  key: string;
  label: string;
  description: string;
  available: boolean;
}

export interface AssistantPromptCatalog {
  role: string;
  language: string;
  prompts: AssistantPromptItem[];
  catalogVersion: string;
}

export interface SendAssistantMessageOptions {
  promptKey?: string;
  language?: string;
  eventId?: number;
}

export interface AssistantChatResponse {
  answer: string;
  sources: SourceItem[];
  suggestedActions: SuggestedAction[];
  requestId: string;
  intent?: string;
  actorScope?: string;
  fallbackUsed?: boolean;
}

export interface AssistantRepository {
  getPromptCatalog(
    language?: string,
    roleHint?: 'volunteer' | 'coordinator',
  ): Promise<AssistantPromptCatalog>;

  sendMessage(
    message: string,
    history: ChatMessage[],
    options?: SendAssistantMessageOptions,
  ): Promise<AssistantChatResponse>;
}
