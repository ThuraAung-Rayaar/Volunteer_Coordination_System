/**
 * @format
 */

import type { DashboardSummary } from '../../domain/models';
import type {
  CoordinatorApplicationItem,
  CoordinatorAssignmentItem,
  CoordinatorAttendanceItem,
  CoordinatorEventDetail,
  CoordinatorOverviewMetrics,
} from '../../domain/models/coordinator';
import type { EventDetail } from '../../domain/models/event';
import type { VolunteerProfile } from '../../domain/models/profile';
import type { VolunteerAvailability } from '../../domain/models/availability';
import type { VerificationCoordinatorData } from '../../domain/models/verification';

import {
  mockCoordinatorApplications,
  mockCoordinatorAssignments,
  mockCoordinatorAttendance,
  mockCoordinatorEvents,
  mockCoordinatorMetrics,
} from './fixtures/coordinatorFixtures';
import { volunteerDashboardSummary } from './fixtures/dashboardFixture';
import { mockEventsFixture } from './fixtures/eventFixtures';
import {
  mockAvailabilityFixture,
  mockVerificationStatusFixture,
  mockVolunteerProfile,
} from './fixtures/profileFixture';

export type IdGenerator = (prefix: string) => string;
export type Clock = () => Date;

/**
 * Type-safe deep cloning utility that preserves primitives, arrays, plain objects,
 * Date instances, and undefined values without relying on JSON serialization.
 */
export function deepClone<T>(val: T): T {
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (val instanceof Date) {
    return new Date(val.getTime()) as unknown as T;
  }
  if (Array.isArray(val)) {
    return val.map(item => deepClone(item)) as unknown as T;
  }
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(val)) {
    copy[key] = deepClone((val as Record<string, unknown>)[key]);
  }
  return copy as T;
}

/**
 * Creates a deterministic sequential ID generator for predictable test IDs.
 */
export function createSequentialIdGenerator(start = 1000): IdGenerator {
  let counter = start;
  return (prefix: string) => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
}

/**
 * Creates a deterministic clock returning a fixed instant for reliable test timestamps.
 */
export function createFixedClock(
  date: string | number | Date = '2026-11-12T10:30:00.000Z',
): Clock {
  const fixed = new Date(date);
  return () => new Date(fixed.getTime());
}

// Typed fixture factories returning fresh deep clones

export function createCoordinatorEventsFixture(): CoordinatorEventDetail[] {
  return deepClone(mockCoordinatorEvents);
}

export function createCoordinatorMetricsFixture(): CoordinatorOverviewMetrics {
  return deepClone(mockCoordinatorMetrics);
}

export function createCoordinatorApplicationsFixture(): CoordinatorApplicationItem[] {
  return deepClone(mockCoordinatorApplications);
}

export function createCoordinatorAssignmentsFixture(): CoordinatorAssignmentItem[] {
  return deepClone(mockCoordinatorAssignments);
}

export function createCoordinatorAttendanceFixture(): CoordinatorAttendanceItem[] {
  return deepClone(mockCoordinatorAttendance);
}

export function createEventsFixture(): EventDetail[] {
  return deepClone(mockEventsFixture);
}

export function createDashboardSummaryFixture(): DashboardSummary {
  return deepClone(volunteerDashboardSummary);
}

export function createVolunteerProfileFixture(): VolunteerProfile {
  return deepClone(mockVolunteerProfile);
}

export function createAvailabilityFixture(): VolunteerAvailability {
  return deepClone(mockAvailabilityFixture);
}

export function createVerificationFixture(): VerificationCoordinatorData {
  return deepClone(mockVerificationStatusFixture);
}
