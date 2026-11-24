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
  coordinator: 'tag:coordinator',
  coordinatorEvent: (id: string) => `tag:coordinator:event:${id}`,
  staffing: (eventId: string) => `tag:staffing:${eventId}`,
  recommendations: 'tag:recommendations',
  dashboard: 'tag:dashboard',
};
