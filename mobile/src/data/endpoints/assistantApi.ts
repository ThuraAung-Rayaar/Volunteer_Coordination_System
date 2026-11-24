/**
 * @format
 */

import { ApiClient } from '../../core/api/apiClient';
import type { ApiResult } from '../../core/api/apiResult';

export interface AssistantChatRequestDto {
  message: string;
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>;
  language?: string;
}

export interface AssistantChatResponseDto {
  answer: string;
  sources: Array<{ type: string; id?: number; label?: string }>;
  suggested_actions: Array<{ type: string; event_id?: number; label?: string }>;
  request_id: string;
}

export const assistantApi = {
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
