/**
 * @format
 */

import type {
  AssistantChatResponse,
  AssistantRepository,
  ChatMessage,
} from '../contracts/assistantRepository';

export class MockAssistantRepository implements AssistantRepository {
  public async sendMessage(
    message: string,
    _history: ChatMessage[],
  ): Promise<AssistantChatResponse> {
    const lower = message.toLowerCase().trim();

    // Simulate network delay
    await new Promise(r => setTimeout(r, 150));

    if (lower.includes('recommend') || lower.includes('match') || lower.includes('fit')) {
      return {
        answer:
          'I found 2 recommended events matching your environmental interests and weekend availability:\n\n' +
          '• **Yangon River Cleanup** (Score: 88/100) — Matches your interests and open logistics role.\n' +
          '• **Community Tree Planting** (Score: 76/100) — Welcomes new volunteers and fits your saved availability.',
        sources: [
          { type: 'event', id: 1, label: 'Yangon River Cleanup' },
          { type: 'event', id: 2, label: 'Community Tree Planting' },
        ],
        suggestedActions: [
          { type: 'open_event', eventId: 1, label: 'View River Cleanup' },
          { type: 'open_event', eventId: 2, label: 'View Tree Planting' },
        ],
        requestId: 'mock-req-' + Date.now(),
      };
    }

    if (lower.includes('staffing') || lower.includes('gap') || lower.includes('coverage')) {
      return {
        answer:
          'Staffing status for your managed event **Yangon River Cleanup**:\n\n' +
          '• Required Headcount: 20\n' +
          '• Assigned: 14 (Coverage: 70.0%)\n' +
          '• Open slots: 6 remaining\n' +
          '• Accepted unassigned: 2 volunteers\n\n' +
          'Signal: **STAFFING_GAP_NEAR_START** (Event starts within 48 hours).',
        sources: [
          { type: 'staffing_insight', id: 1, label: 'Yangon River Cleanup' },
        ],
        suggestedActions: [
          { type: 'open_staffing', eventId: 1, label: 'Open Staffing Insight' },
        ],
        requestId: 'mock-req-' + Date.now(),
      };
    }

    if (lower.includes('cancel') || lower.includes('withdraw')) {
      return {
        answer:
          'Under the standard VCS cancellation policy, you can withdraw your application or cancel a shift up to 24 hours prior to start without penalty directly from the event details screen.',
        sources: [],
        suggestedActions: [],
        requestId: 'mock-req-' + Date.now(),
      };
    }

    return {
      answer:
        'Hello! I am your VCS Assistant. I can help you discover matching events, check application status, view staffing gaps, or explain system procedures.',
      sources: [],
      suggestedActions: [
        { type: 'open_event', eventId: 1, label: 'Browse Events' },
      ],
      requestId: 'mock-req-' + Date.now(),
    };
  }
}

export const defaultAssistantRepository = new MockAssistantRepository();
