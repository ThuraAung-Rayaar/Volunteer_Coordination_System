/**
 * @format
 */

import { ApiClient, defaultApiClient } from '../../core/api/apiClient';
import type {
  AssistantChatResponse,
  AssistantRepository,
  ChatMessage,
} from '../contracts/assistantRepository';
import { assistantApi } from '../endpoints/assistantApi';

export class HttpAssistantRepository implements AssistantRepository {
  private client: ApiClient;

  constructor(client: ApiClient = defaultApiClient) {
    this.client = client;
  }

  public async sendMessage(
    message: string,
    history: ChatMessage[],
  ): Promise<AssistantChatResponse> {
    const formattedHistory = history
      .slice(-4)
      .map(m => ({ role: m.role, content: m.content }));

    const res = await assistantApi.postChat(
      {
        message: message.trim(),
        conversation: formattedHistory,
      },
      this.client,
    );

    if (!res.ok) {
      throw new Error(res.error?.message || 'Failed to send chat message to assistant.');
    }

    const data = res.data;
    return {
      answer: data.answer,
      sources: data.sources || [],
      suggestedActions: (data.suggested_actions || []).map(
        (a: { type: string; event_id?: number; label?: string }) => ({
          type: a.type,
          eventId: a.event_id,
          label: a.label,
        }),
      ),
      requestId: data.request_id,
    };
  }
}

export const defaultHttpAssistantRepository = new HttpAssistantRepository();
