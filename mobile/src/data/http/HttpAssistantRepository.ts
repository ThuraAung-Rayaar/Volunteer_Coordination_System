/**
 * @format
 */

import { isOfflineMode } from '../../app/configuration/dataMode';
import { ApiClient, defaultApiClient } from '../../core/api/apiClient';
import type {
  AssistantChatResponse,
  AssistantPromptCatalog,
  AssistantRepository,
  ChatMessage,
  SendAssistantMessageOptions,
} from '../contracts/assistantRepository';
import { assistantApi } from '../endpoints/assistantApi';
import {
  CACHE_SCOPE,
  CACHE_TTL,
  cacheKeys,
  cacheTags,
  queryCache,
} from '../cache';

export class HttpAssistantRepository implements AssistantRepository {
  private client: ApiClient;

  constructor(client: ApiClient = defaultApiClient) {
    this.client = client;
  }

  public async getPromptCatalog(
    language: string = 'en',
  ): Promise<AssistantPromptCatalog> {
    const key = cacheKeys.assistantPrompts(language, 'me');
    return queryCache.getOrFetch(
      key,
      async () => {
        const res = await assistantApi.getPrompts(language, this.client);
        if (!res.ok) {
          throw new Error(
            res.error?.message || 'Failed to load assistant prompts.',
          );
        }

        const data = res.data;
        return {
          role: data.role,
          language: data.language,
          prompts: data.prompts || [],
          catalogVersion: data.catalog_version,
        };
      },
      {
        ttlMs: CACHE_TTL.ASSISTANT_PROMPTS,
        tags: [cacheTags.assistant],
        scope: CACHE_SCOPE.ACCOUNT,
      },
    );
  }

  public async sendMessage(
    message: string,
    history: ChatMessage[],
    options?: SendAssistantMessageOptions,
  ): Promise<AssistantChatResponse> {
    if (isOfflineMode()) {
      throw new Error(
        'Offline Mode: AI Assistant requires a live BFF connection.',
      );
    }

    const formattedHistory = history
      .slice(-4)
      .map(m => ({ role: m.role, content: m.content }));

    const res = await assistantApi.postChat(
      {
        prompt_key: options?.promptKey,
        message: message.trim(),
        conversation: formattedHistory,
        language: options?.language || 'en',
        event_id: options?.eventId,
      },
      this.client,
    );

    if (!res.ok) {
      throw new Error(
        res.error?.message || 'Failed to send chat message to assistant.',
      );
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
      intent: data.intent,
      actorScope: data.actor_scope,
      fallbackUsed: Boolean(data.fallback_used),
    };
  }
}

export const defaultHttpAssistantRepository = new HttpAssistantRepository();
