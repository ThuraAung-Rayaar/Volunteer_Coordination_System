/**
 * @format
 */

import { ApiClient } from '../../core/api/apiClient';
import type { ApiResult } from '../../core/api/apiResult';

export interface AssistantPromptItemDto {
  key: string;
  label: string;
  description: string;
  available: boolean;
}

export interface AssistantPromptCatalogDto {
  role: string;
  language: string;
  prompts: AssistantPromptItemDto[];
  catalog_version: string;
}

export interface AssistantChatRequestDto {
  prompt_key?: string;
  message: string;
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>;
  language?: string;
  event_id?: number;
}

export interface AssistantChatResponseDto {
  answer: string;
  sources: Array<{ type: string; id?: number; label?: string }>;
  suggested_actions: Array<{ type: string; event_id?: number; label?: string }>;
  request_id: string;
  intent?: string;
  actor_scope?: string;
  fallback_used?: boolean;
}

export const assistantApi = {
  getPrompts: async (
    language: string = 'en',
    client: ApiClient,
  ): Promise<ApiResult<AssistantPromptCatalogDto>> => {
    return client.get<AssistantPromptCatalogDto>('/api/v1/assistant/prompts/', {
      params: { language },
    });
  },

  postChat: async (
    payload: AssistantChatRequestDto,
    client: ApiClient,
  ): Promise<ApiResult<AssistantChatResponseDto>> => {
    return client.post<AssistantChatResponseDto>(
      '/api/v1/assistant/chat/',
      payload,
    );
  },
};
