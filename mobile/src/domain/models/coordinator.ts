/**
 * @format
 */

import type { EventPost } from './event';
import type { CharityCategoryCode } from './event';

export type CoordinatorEventStatus =
  | 'draft'
  | 'published'
  | 'active'
  | 'completed'
  | 'cancelled';

export type EventPurposeType = 'charity_event' | 'help_wanted_event';
export type AcceptanceMode = 'manual' | 'auto';
export type LeaderStrategy = 'none' | 'first_experienced' | 'manual';
export type CompensationKind = 'unpaid' | 'arranged_outside_system';
export type MapProvider = 'openstreetmap' | 'google';

export interface CoordinatorOverviewMetrics {
  totalEventsCount: number;
  activeEventsCount: number;
  draftEventsCount: number;
  pendingApplicationsCount: number;
  acceptedApplicantsCount: number;
  checkedInTodayCount: number;
  checkedInAllTimeCount?: number;
}

export interface CoordinatorEventSummary {
  id: string;
  title: string;
  description: string;
  status: CoordinatorEventStatus;
  purposeType: EventPurposeType;
  startAt: string;
  endAt: string;
  locationName: string;
  landmarkText?: string;
  charityFields: CharityCategoryCode[];
  ownerId: string;
  currentCoordinatorId: string;
  coordinatorName: string;
  isOwnerAsMonitor: boolean;
  pendingApplicationCount: number;
  acceptedApplicantCount: number;
  assignedCount: number;
  checkedInCount: number;
  checkedInTodayCount?: number;
}

export interface CreateEventWizardDraft {
  // Step 1: Basics
  title: string;
  description?: string;
  purposeType: EventPurposeType;
  charityFieldCodes: CharityCategoryCode[];

  // Step 2: Location
  locationName: string;
  landmarkText?: string;
  latitude: number;
  longitude: number;
  geoRadiusM: number;
  geoCheckinEnabled: boolean;
  geoCheckinOpensBeforeMin: number;
  requireCheckinConfirmation: boolean;
  mapProvider: MapProvider;

  // Step 3: Schedule
  startAt: string;
  endAt: string;
  applicationDeadline?: string;

  // Step 4: Capacity & Acceptance
  acceptanceMode: AcceptanceMode;
  autoAssignEnabled: boolean;
  groupSize?: number;
  leaderStrategy: LeaderStrategy;
  maxParticipants?: number;

  // Step 5: Support
  mealsProvided: boolean;
  lodgingProvided: boolean;
  travelSupportProvided: boolean;
  compensationKind: CompensationKind;
  compensationNote?: string;

  // Step 6: Onboarding & QR
  onboardingText?: string;
  requireOnboardingAck: boolean;
  qrRegistrationEnabled: boolean;
}

export interface CoordinatorEventDetail extends CoordinatorEventSummary {
  latitude?: number | null;
  longitude?: number | null;
  geoRadiusM: number;
  geoCheckinEnabled: boolean;
  geoCheckinOpensBeforeMin: number;
  requireCheckinConfirmation: boolean;
  mapProvider: MapProvider;
  applicationDeadline?: string;
  acceptanceMode: AcceptanceMode;
  autoAssignEnabled: boolean;
  groupSize?: number;
  leaderStrategy: LeaderStrategy;
  maxParticipants?: number;
  mealsProvided: boolean;
  lodgingProvided: boolean;
  travelSupportProvided: boolean;
  compensationKind: CompensationKind;
  compensationNote?: string;
  onboardingText?: string;
  onboardingVersion: number;
  requireOnboardingAck: boolean;
  qrRegistrationEnabled: boolean;
  posts: EventPost[];
}

export type CoordinatorApplicationStatus =
  | 'pending'
  | 'accepted'
  | 'waitlisted'
  | 'rejected'
  | 'withdrawn'
  | 'expired';

export interface VolunteerT2Capabilities {
  skills: string[];
  physicalOk: boolean;
  goodEyesight: boolean;
  needsGlasses: boolean;
  canLiftHeavy: boolean;
  canWorkOutdoor: boolean;
  hasLeaderExperience: boolean;
  newToVolunteer: boolean;
  preferredLanguage: string;
  homeArea: string;
  needsMealSupport: boolean;
  needsTravelSupport: boolean;
  acceptsUnpaid: boolean;
  verificationStatus: string;
}

export interface CoordinatorApplicationItem {
  id: string;
  eventId: string;
  eventTitle?: string;
  userId?: string;
  applicantName?: string;
  status: CoordinatorApplicationStatus;
  appliedAt?: string;
  source?: 'browse' | 'qr_walkin' | 'invite';
  postId?: string;
  postTitle?: string;
  // T2 semi-private capabilities: strictly present ONLY if status === 'accepted'
  t2Capabilities?: VolunteerT2Capabilities;
}

export type CoordinatorAssignmentStatus =
  | 'assigned'
  | 'confirmed'
  | 'cancelled'
  | 'completed';

export interface CoordinatorAssignmentItem {
  id: string;
  eventId: string;
  eventTitle: string;
  applicationId: string;
  userId: string;
  volunteerName: string;
  postId: string;
  postTitle: string;
  status: CoordinatorAssignmentStatus;
  groupCode?: string;
  isGroupLeader: boolean;
  assignedAt: string;
}

export type AttendanceRecordStatus =
  | 'scheduled'
  | 'pending_confirmation'
  | 'checked_in'
  | 'checked_out'
  | 'completed'
  | 'no_show';

export type CheckInMethod =
  | 'geo'
  | 'qr'
  | 'manual'
  | 'qr_scan'
  | 'coordinator_manual'
  | 'system';

export interface CoordinatorGeoAttemptReview {
  attemptedAt: string;
  withinGeofence: boolean;
  distanceMeters?: number;
  confirmationStatus: 'pending' | 'confirmed' | 'rejected';
  note?: string;
}

export interface CoordinatorAttendanceItem {
  id: string;
  eventId: string;
  eventTitle?: string;
  assignmentId?: string;
  userId: string;
  volunteerName?: string;
  postTitle?: string;
  groupCode?: string;
  status: AttendanceRecordStatus;
  attendanceStatus?:
    | 'expected'
    | 'checked_in'
    | 'absent'
    | 'completed'
    | 'cancelled'
    | null;
  confirmationStatus?:
    | 'not_required'
    | 'pending'
    | 'confirmed'
    | 'rejected'
    | null;
  checkInMethod?: CheckInMethod;
  checkedInAt?: string;
  checkedOutAt?: string;
  isPendingGeoConfirmation: boolean;
  geoAttempt?: CoordinatorGeoAttemptReview;
}

/**
 * Audit record domain model from v_event_coordinator_history (C-18 / P1-05).
 */
export interface CoordinatorHistoryItem {
  id: string;
  eventId: string;
  eventTitle?: string;
  changeType: string;
  previousCoordinatorId: string | null;
  previousCoordinatorName: string | null;
  newCoordinatorId: string;
  newCoordinatorName: string | null;
  changedById: string;
  changedByName: string | null;
  reason: string | null;
  changedAt: string;
}

/**
 * Post capacity breakdown domain model matching v_event_post_capacity (C-28 / P1-05).
 */
export interface EventPostCapacity {
  postId: string;
  title: string;
  status: string;
  requiredHeadcount: number;
  assignedCount: number;
  remainingCapacity: number;
}

/**
 * Volunteer identity and capabilities lookup domain model by UUID (V-18 / C-29 / P1-05).
 */
export interface VolunteerUuidLookup {
  userId?: string;
  uuid: string;
  displayName: string;
  display_name?: string;
  skills?: string[];
  physicalOk?: boolean;
  goodEyesight?: boolean;
  needsGlasses?: boolean;
  canLiftHeavy?: boolean;
  canWorkOutdoor?: boolean;
  hasLeaderExperience?: boolean;
  newToVolunteer?: boolean;
  preferredLanguage?: string;
  homeArea?: string | null;
  needsMealSupport?: boolean;
  needsTravelSupport?: boolean;
  acceptsUnpaid?: boolean;
  verificationStatus?: string;
}

/**
 * Geo check-in attempt review domain model matching v_geo_attempts_review (C-35 / P1-05).
 */
export interface GeoAttemptReview {
  attemptId: string;
  eventId: string;
  userId: string;
  displayName: string;
  attemptedAt: string;
  distanceMeters: number | null;
  effectiveRadiusMeters: number | null;
  accuracyMeters: number | null;
  isMocked: boolean;
  resultCode: string;
}

