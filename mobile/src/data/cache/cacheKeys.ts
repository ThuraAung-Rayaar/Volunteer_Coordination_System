/**
 * @format
 * Deterministic cache key generation and tag definitions for VCS Query Cache.
 */

function serializeFilters(filters?: Record<string, any>): string {
  if (!filters) return '';
  const keys = Object.keys(filters).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const val = filters[k];
    if (val !== undefined && val !== null && val !== '') {
      if (Array.isArray(val)) {
        parts.push(`${k}=${[...val].sort().join(',')}`);
      } else {
        parts.push(`${k}=${String(val)}`);
      }
    }
  }
  return parts.join('&');
}

export const cacheKeys = {
  charityTaxonomy: () => 'public:taxonomy:charity',
  publicEvents: (filters?: Record<string, any>, page: number = 1, pageSize: number = 20) =>
    `public:events:${serializeFilters(filters)}:p${page}:s${pageSize}`,
  eventDetail: (eventId: string, scopeSuffix: string = 'anon') =>
    `event:${eventId}:${scopeSuffix}`,
  myApplications: (scope: string = 'me') => `account:${scope}:applications`,
  myAssignments: (scope: string = 'me') => `account:${scope}:assignments`,
  volunteerDashboard: (scope: string = 'me') => `account:${scope}:dashboard`,
  volunteerProfile: (scope: string = 'me') => `account:${scope}:profile`,
  volunteerAvailability: (scope: string = 'me') => `account:${scope}:availability`,
  volunteerVerification: (scope: string = 'me') => `account:${scope}:verification`,
  coordinatorEligibility: (scope: string = 'me') => `account:${scope}:coordinator:eligibility`,
  volunteerAttendance: (scope: string = 'me') => `account:${scope}:attendance`,
  volunteerFeedback: (scope: string = 'me') => `account:${scope}:feedback`,
  assistantPrompts: (language: string = 'en', scope: string = 'me') =>
    `account:${scope}:assistant:prompts:${language}`,
  coordinatorEvents: (scope: string = 'me') => `account:${scope}:coordinator:events`,
  coordinatorEventDetail: (eventId: string, scope: string = 'me') =>
    `account:${scope}:coordinator:event:${eventId}`,
  coordinatorApplications: (eventId: string, scope: string = 'me') =>
    `account:${scope}:coordinator:applications:${eventId}`,
  coordinatorAssignments: (eventId: string, scope: string = 'me') =>
    `account:${scope}:coordinator:assignments:${eventId}`,
  coordinatorAttendance: (eventId: string, scope: string = 'me') =>
    `account:${scope}:coordinator:attendance:${eventId}`,
  staffingInsight: (eventId: string, scope: string = 'me') =>
    `account:${scope}:staffing:${eventId}`,
  recommendations: (scope: string = 'me') => `account:${scope}:recommendations`,
};

export const cacheTags = {
  events: 'tag:events',
  event: (id: string) => `tag:event:${id}`,
  applications: 'tag:applications',
  eventApplications: (eventId: string) => `tag:applications:${eventId}`,
  assignments: 'tag:assignments',
  profile: 'tag:profile',
  availability: 'tag:availability',
  verification: 'tag:verification',
  assistant: 'tag:assistant',
  coordinator: 'tag:coordinator',
  coordinatorEvent: (id: string) => `tag:coordinator:event:${id}`,
  staffing: (eventId: string) => `tag:staffing:${eventId}`,
  recommendations: 'tag:recommendations',
  dashboard: 'tag:dashboard',
};
