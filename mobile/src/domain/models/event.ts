/**
 * @format
 */

/**
 * Standard charity field codes matching the backend charity_fields taxonomy.
 */
export type CharityCategoryCode =
  | 'teaching'
  | 'food_distribution'
  | 'elderly_care'
  | 'child_care'
  | 'animal_welfare'
  | 'environment'
  | 'disaster_support'
  | 'blood_donation'
  | 'fundraising'
  | 'logistics'
  | 'cleaning'
  | 'cooking'
  | 'other';

export interface CharityCategory {
  code: CharityCategoryCode;
  label: string;
  sortOrder: number;
}

export const CHARITY_CATEGORIES: CharityCategory[] = [
  { code: 'teaching', label: 'Teaching', sortOrder: 10 },
  { code: 'food_distribution', label: 'Food Distribution', sortOrder: 20 },
  { code: 'elderly_care', label: 'Elderly Care', sortOrder: 30 },
  { code: 'child_care', label: 'Child Care', sortOrder: 40 },
  { code: 'animal_welfare', label: 'Animal Welfare', sortOrder: 50 },
  { code: 'environment', label: 'Environment', sortOrder: 60 },
  { code: 'disaster_support', label: 'Disaster Support', sortOrder: 70 },
  { code: 'blood_donation', label: 'Blood Donation', sortOrder: 80 },
  { code: 'fundraising', label: 'Fundraising', sortOrder: 90 },
  { code: 'logistics', label: 'Logistics', sortOrder: 100 },
  { code: 'cleaning', label: 'Cleaning', sortOrder: 110 },
  { code: 'cooking', label: 'Cooking', sortOrder: 120 },
  { code: 'other', label: 'Other', sortOrder: 999 },
];

export type EventStatus = 'published' | 'active';

export type PhysicalLevel = 'none' | 'light' | 'medium' | 'heavy';

export type PostStatus = 'open' | 'full' | 'closed';

export type EventApplicationStatus =
  | 'pending'
  | 'accepted'
  | 'waitlisted'
  | 'rejected'
  | 'withdrawn'
  | 'expired';

export interface EventPost {
  id: string;
  eventId: string;
  title: string;
  description?: string;
  requiredHeadcount: number;
  filledHeadcount: number;
  remainingCapacity: number;
  physicalLevel: PhysicalLevel;
  requiredSkills: string[];
  leaderNeeded: boolean;
  newVolunteersAllowed: boolean;
  status: PostStatus;
}

export interface EventSummary {
  id: string;
  title: string;
  description: string;
  purposeType: 'charity_event' | 'help_wanted_event';
  status: EventStatus;
  locationName: string;
  landmarkText?: string;
  startAt: string;
  endAt: string;
  applicationDeadline?: string;
  charityFields: CharityCategoryCode[];
  coordinatorName: string;
  spotsRemaining: number;
  mealsProvided: boolean;
  lodgingProvided: boolean;
  travelSupportProvided: boolean;
  compensationKind: string;
}

export interface EventApplicationState {
  id: string;
  eventId: string;
  postId: string;
  postTitle: string;
  status: EventApplicationStatus;
  appliedAt: string;
  volunteerNote?: string;
}

export interface EventDetail extends EventSummary {
  landmarkText?: string;
  compensationNote?: string;
  onboardingText?: string;
  latitude?: number;
  longitude?: number;
  geoCheckinEnabled: boolean;
  posts: EventPost[];
  userApplication?: EventApplicationState | null;
}

export interface EventFilters {
  query?: string;
  charityFieldCodes?: CharityCategoryCode[];
  statuses?: EventStatus[];
  mealsProvided?: boolean;
  lodgingProvided?: boolean;
  travelSupportProvided?: boolean;
  startAfter?: string;
  endBefore?: string;
}

export interface VolunteerApplicationItem {
  id: string;
  eventId: string;
  eventTitle: string;
  postId: string;
  postTitle: string;
  status: EventApplicationStatus;
  appliedAt: string;
  volunteerNote?: string;
}

export type VolunteerAssignmentStatus =
  | 'assigned'
  | 'confirmed'
  | 'completed'
  | 'cancelled';

export interface VolunteerAssignmentItem {
  id: string;
  eventId: string;
  eventTitle: string;
  applicationId?: string;
  postId: string;
  postTitle: string;
  status: VolunteerAssignmentStatus;
  startAt: string;
  endAt: string;
  location: string;
  assignedAt: string;
  attendanceId?: string;
  attendanceStatus?:
    | 'scheduled'
    | 'checked_in'
    | 'pending_confirmation'
    | 'completed'
    | 'absent'
    | 'excused'
    | 'expected'
    | 'cancelled';
  verifiedHours?: number;
}
