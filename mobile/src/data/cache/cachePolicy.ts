/**
 * @format
 * Cache policy specifying TTLs and visibility scopes across VCS resources.
 */

export const CACHE_TTL = {
  CHARITY_TAXONOMY: 60 * 60 * 1000,    // 60 minutes
  PUBLIC_EVENTS_PAGE: 45 * 1000,       // 45 seconds
  PUBLIC_EVENT_DETAIL: 30 * 1000,      // 30 seconds
  VOLUNTEER_APPLICATIONS: 20 * 1000,   // 20 seconds
  VOLUNTEER_ASSIGNMENTS: 20 * 1000,    // 20 seconds
  VOLUNTEER_PROFILE: 60 * 1000,        // 60 seconds
  VOLUNTEER_AVAILABILITY: 60 * 1000,   // 60 seconds
  VOLUNTEER_DASHBOARD: 30 * 1000,      // 30 seconds
  COORDINATOR_EVENTS: 20 * 1000,       // 20 seconds
  COORDINATOR_DETAILS: 15 * 1000,      // 15 seconds
  COORDINATOR_EVENT_DETAIL: 15 * 1000, // 15 seconds
  COORDINATOR_APPLICATIONS: 20 * 1000, // 20 seconds
  STAFFING_INSIGHT: 20 * 1000,         // 20 seconds
  RECOMMENDATIONS: 45 * 1000,          // 45 seconds
} as const;

export const CACHE_SCOPE = {
  PUBLIC: 'public',
  ACCOUNT: 'account',
} as const;

export type CacheScope = typeof CACHE_SCOPE[keyof typeof CACHE_SCOPE];
