/**
 * @format
 */

import type {
  AssistantChatResponse,
  AssistantPromptCatalog,
  AssistantPromptItem,
  AssistantRepository,
  ChatMessage,
  SendAssistantMessageOptions,
} from '../contracts/assistantRepository';

const VOLUNTEER_MOCK_PROMPTS: AssistantPromptItem[] = [
  {
    key: 'volunteer.next_steps',
    label: 'What should I do next?',
    description: 'Review your current applications and assignments.',
    available: true,
  },
  {
    key: 'volunteer.my_applications',
    label: 'Show me my applications.',
    description: 'See your submitted applications and current statuses.',
    available: true,
  },
  {
    key: 'volunteer.my_assignments',
    label: 'Explain my assignments.',
    description: 'Review your shift assignments and attendance state.',
    available: true,
  },
  {
    key: 'volunteer.recommendations',
    label: 'Find events that fit me.',
    description: 'View upcoming events matched to your skills and availability.',
    available: true,
  },
  {
    key: 'volunteer.checkin_help',
    label: 'How do I check in?',
    description: 'Review QR and geolocation check-in rules and shift settings.',
    available: true,
  },
  {
    key: 'volunteer.policy_help',
    label: 'Explain a VCS policy.',
    description: 'Read current cancellation, application, and check-in rules.',
    available: true,
  },
];

const COORDINATOR_MOCK_PROMPTS: AssistantPromptItem[] = [
  {
    key: 'coordinator.next_steps',
    label: 'What needs my attention?',
    description:
      'Summarise pending reviews, unassigned accepted volunteers, and staffing gaps.',
    available: true,
  },
  {
    key: 'coordinator.my_events',
    label: 'Summarise my managed events.',
    description: 'Review events you own or currently coordinate.',
    available: true,
  },
  {
    key: 'coordinator.staffing',
    label: 'Show staffing status for my event.',
    description: 'Inspect headcount coverage, open slots, and readiness signals.',
    available: true,
  },
  {
    key: 'coordinator.pending_applications',
    label: 'Which applications need review?',
    description: 'List pending applications across your managed events.',
    available: true,
  },
  {
    key: 'coordinator.unassigned_accepted',
    label: 'Which accepted volunteers still need a post?',
    description: 'Find accepted applications without an active post assignment.',
    available: true,
  },
  {
    key: 'coordinator.event_readiness',
    label: 'Is my event ready?',
    description: 'Check readiness status and operational staffing indicators.',
    available: true,
  },
];

export class MockAssistantRepository implements AssistantRepository {
  public async getPromptCatalog(
    language: string = 'en',
    roleHint: 'volunteer' | 'coordinator' = 'volunteer',
  ): Promise<AssistantPromptCatalog> {
    await new Promise<void>(r => setTimeout(r, 40));
    const role = roleHint === 'coordinator' ? 'coordinator' : 'volunteer';
    const prompts =
      role === 'coordinator'
        ? COORDINATOR_MOCK_PROMPTS
        : VOLUNTEER_MOCK_PROMPTS;

    return {
      role,
      language: language.startsWith('my') ? 'my' : 'en',
      prompts,
      catalogVersion: 'vcs.prompts.v1',
    };
  }

  public async sendMessage(
    message: string,
    _history: ChatMessage[],
    options?: SendAssistantMessageOptions,
  ): Promise<AssistantChatResponse> {
    const lower = message.toLowerCase().trim();
    const promptKey = options?.promptKey || '';

    await new Promise<void>(r => setTimeout(r, 80));

    if (
      promptKey === 'volunteer.recommendations' ||
      lower.includes('recommend') ||
      lower.includes('match') ||
      lower.includes('fit')
    ) {
      return {
        answer:
          'Found 2 matching event(s) (recommendation-v1):\n\n' +
          '• **Yangon River Cleanup** (Score: 88/100, strong) — Matches your interests and open logistics role.\n' +
          '• **Community Tree Planting** (Score: 76/100, strong) — Welcomes new volunteers and fits your saved availability.',
        sources: [
          { type: 'event', id: 1, label: 'Yangon River Cleanup' },
          { type: 'event', id: 2, label: 'Community Tree Planting' },
        ],
        suggestedActions: [
          { type: 'open_event', eventId: 1, label: 'Yangon River Cleanup' },
          { type: 'open_event', eventId: 2, label: 'Community Tree Planting' },
        ],
        requestId: 'mock-req-' + Date.now(),
        intent: 'volunteer.recommendations',
        actorScope: 'volunteer',
        fallbackUsed: false,
      };
    }

    if (
      promptKey.startsWith('coordinator.') ||
      lower.includes('staffing') ||
      lower.includes('gap') ||
      lower.includes('coverage') ||
      lower.includes('attention')
    ) {
      return {
        answer:
          'Staffing status for **Yangon River Cleanup** (readiness indicator: warning):\n\n' +
          '• Required headcount: 20, Assigned: 14, Open slots: 6, Coverage: 70.0%\n' +
          '• Accepted unassigned: 2, Pending applications: 3\n' +
          '• Indicator: Open positions remain close to event start (high)',
        sources: [
          {
            type: 'staffing_insight',
            id: 1,
            label: 'Yangon River Cleanup',
          },
        ],
        suggestedActions: [
          {
            type: 'open_staffing',
            eventId: 1,
            label: 'Yangon River Cleanup',
          },
        ],
        requestId: 'mock-req-' + Date.now(),
        intent: promptKey || 'coordinator.staffing',
        actorScope: 'coordinator',
        fallbackUsed: false,
      };
    }

    if (
      promptKey === 'volunteer.my_applications' ||
      promptKey === 'volunteer.next_steps' ||
      lower.includes('application') ||
      lower.includes('next')
    ) {
      return {
        answer:
          'Summary: 1 pending application for **Yangon River Cleanup** and 0 active assignments. ' +
          'Your pending application is awaiting coordinator review in My Applications.',
        sources: [
          { type: 'application', id: 101, label: 'Yangon River Cleanup' },
        ],
        suggestedActions: [
          { type: 'open_applications', label: 'Open My Applications' },
          { type: 'open_event', eventId: 1, label: 'Yangon River Cleanup' },
        ],
        requestId: 'mock-req-' + Date.now(),
        intent: promptKey || 'volunteer.next_steps',
        actorScope: 'volunteer',
        fallbackUsed: false,
      };
    }

    if (
      promptKey === 'volunteer.my_assignments' ||
      lower.includes('assignment') ||
      lower.includes('shift')
    ) {
      return {
        answer:
          'You currently have no assignments. An accepted application is separate from a confirmed shift assignment.',
        sources: [],
        suggestedActions: [
          { type: 'open_assignments', label: 'Open My Assignments' },
        ],
        requestId: 'mock-req-' + Date.now(),
        intent: 'volunteer.my_assignments',
        actorScope: 'volunteer',
        fallbackUsed: false,
      };
    }

    if (
      promptKey === 'volunteer.checkin_help' ||
      lower.includes('check in') ||
      lower.includes('checkin') ||
      lower.includes('check-in')
    ) {
      return {
        answer:
          'VCS supports QR code registration and optional geolocation check-in when enabled for an event. ' +
          'The permitted perimeter is event-specific and shown in the app (system default radius is 150m when an event does not override it). ' +
          'The check-in window opens 30 minutes before start by default unless overridden by event settings.',
        sources: [{ type: 'policy', label: 'VCS Check-In Policy' }],
        suggestedActions: [],
        requestId: 'mock-req-' + Date.now(),
        intent: 'volunteer.checkin_help',
        actorScope: 'volunteer',
        fallbackUsed: false,
      };
    }

    if (
      promptKey === 'volunteer.policy_help' ||
      lower.includes('cancel') ||
      lower.includes('withdraw') ||
      lower.includes('policy')
    ) {
      return {
        answer:
          'Volunteers can withdraw an application or cancel an assignment before the 48-hour lock window. ' +
          'Under current VCS policy, self-cancellation and withdrawal are blocked inside 48 hours before the scheduled shift start. ' +
          'If an emergency occurs within 48 hours of the shift, contact the event coordinator directly.',
        sources: [{ type: 'policy', label: 'VCS Policy (cancellation)' }],
        suggestedActions: [],
        requestId: 'mock-req-' + Date.now(),
        intent: 'volunteer.policy_help',
        actorScope: 'volunteer',
        fallbackUsed: false,
      };
    }

    return {
      answer:
        'Hello! I am your VCS Assistant. Please select one of the role-specific prompts or ask about your applications, assignments, recommendations, or policies.',
      sources: [],
      suggestedActions: [
        { type: 'open_events', label: 'Browse Upcoming Events' },
      ],
      requestId: 'mock-req-' + Date.now(),
      intent: 'general',
      actorScope: 'volunteer',
      fallbackUsed: false,
    };
  }
}

export const defaultAssistantRepository = new MockAssistantRepository();
