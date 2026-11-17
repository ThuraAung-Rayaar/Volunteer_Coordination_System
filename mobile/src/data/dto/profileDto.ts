import type {
  AttendanceMethodDto,
  AttendanceStatusDto,
  ConfirmationStatusDto,
} from './commonDto';

/**
 * Profile DTO matching `UserProfileSerializer`.
 * Returned by `GET /api/v1/me/` and `PATCH /api/v1/me/`.
 */
export interface UserProfileDto {
  id: number;
  uuid: string;
  display_name: string;
  phone: string | null;
  preferred_language: string;
  home_area: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  blood_type: string;
  is_willing_to_donate: boolean;
  is_willing_to_donate_blood: boolean;
  is_willing_to_donate_items: boolean;
  physical_ok: boolean;
  good_eyesight: boolean;
  needs_glasses: boolean;
  can_lift_heavy: boolean;
  can_work_outdoor: boolean;
  has_leader_experience: boolean;
  new_to_volunteer: boolean;
  skills: string[];
  needs_meal_support: boolean;
  needs_travel_support: boolean;
  accepts_unpaid: boolean;
  verification_status: string;
  account_status: string;
  charity_interests: string[];
  created_at: string;
}

/**
 * Strict allow-list payload for `PATCH /api/v1/me/`.
 * Matches `ProfileUpdateSerializer`. Any unlisted keys cause HTTP 400.
 */
export interface ProfileUpdateRequestDto {
  display_name?: string;
  preferred_language?: string;
  home_area?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  blood_type?: string;
  is_willing_to_donate?: boolean;
  is_willing_to_donate_blood?: boolean;
  is_willing_to_donate_items?: boolean;
  physical_ok?: boolean;
  good_eyesight?: boolean;
  needs_glasses?: boolean;
  can_lift_heavy?: boolean;
  can_work_outdoor?: boolean;
  has_leader_experience?: boolean;
  new_to_volunteer?: boolean;
  skills?: string[];
  needs_meal_support?: boolean;
  needs_travel_support?: boolean;
  accepts_unpaid?: boolean;
}

/**
 * Payload for `GET /api/v1/me/charity-interests/` and `PUT /api/v1/me/charity-interests/`.
 */
export interface CharityInterestsDto {
  field_codes: string[];
}

/**
 * Availability rule representation from `AvailabilityRuleSerializer`.
 */
export interface AvailabilityRuleDto {
  id?: number;
  weekday: number;
  start_time: string; // e.g. "08:00:00" from TimeField
  end_time: string; // e.g. "12:00:00" from TimeField
  valid_from?: string | null;
  valid_to?: string | null;
}

/**
 * Availability exception representation from `AvailabilityExceptionSerializer`.
 */
export interface AvailabilityExceptionDto {
  id?: number;
  date: string;
  is_available: boolean;
  start_time?: string | null;
  end_time?: string | null;
  note?: string | null;
}

/**
 * Response for `GET /api/v1/me/availability/`.
 */
export interface AvailabilityResponseDto {
  rules: AvailabilityRuleDto[];
  exceptions: AvailabilityExceptionDto[];
}

/**
 * Payload for `PUT /api/v1/me/availability/rules/` (`AvailabilityRulesReplaceSerializer`).
 */
export interface AvailabilityRulesReplaceDto {
  rules: Array<{
    weekday: number;
    start_time: string;
    end_time: string;
    valid_from?: string | null;
    valid_to?: string | null;
  }>;
}

/**
 * Single image record in `VerificationStatusResponseDto`.
 */
export interface VerificationImageItemDto {
  id: number;
  image_type: string;
  status: string;
  comparison_status?: string;
  is_current: boolean;
  reviewed_at: string | null;
  created_at: string;
}

/**
 * Response for `GET /api/v1/me/verification-images/`.
 */
export interface VerificationStatusResponseDto {
  verification_status: string;
  images: VerificationImageItemDto[];
}

/**
 * Coordinator record in `CoordinatorProfileEnvelopeDto`.
 */
export interface CoordinatorProfileRecordDto {
  user_id: number;
  status: string;
  approved_by_id: number | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Response envelope for `GET /api/v1/me/coordinator/`.
 */
export interface CoordinatorProfileEnvelopeDto {
  coordinator: CoordinatorProfileRecordDto | null;
}

/**
 * Response for `GET /api/v1/me/availability/check/?event_id={id}` and `POST /api/v1/me/availability/check/`.
 */
export interface AvailabilityCheckResultDto {
  event_id?: number;
  available: boolean;
  schedule_conflict: boolean;
  start_at?: string;
  end_at?: string;
}

/**
 * Response for `POST /api/v1/me/verification-images/`.
 */
export interface VerificationImageUploadResponseDto {
  id: number;
  image_type: string;
  status: string;
  comparison_status?: string;
  is_current: boolean;
  created_at?: string;
}

/**
 * Response for `GET /api/v1/users/by-uuid/{uuid}/` (V-18 / C-29).
 * Returns public T1 identification, plus T2 capability hints if caller is an authorized manager.
 */
export interface UserUuidLookupDto {
  user_id?: number;
  uuid: string;
  display_name: string;
  skills?: string[];
  physical_ok?: boolean;
  good_eyesight?: boolean;
  needs_glasses?: boolean;
  can_lift_heavy?: boolean;
  can_work_outdoor?: boolean;
  has_leader_experience?: boolean;
  new_to_volunteer?: boolean;
  preferred_language?: string;
  home_area?: string | null;
  needs_meal_support?: boolean;
  needs_travel_support?: boolean;
  accepts_unpaid?: boolean;
  verification_status?: string;
}

/**
 * Single feedback item authored by the user in `FeedbackSummaryResponseDto`.
 */
export interface AuthoredFeedbackItemDto {
  id: number;
  event_id: number;
  event_title?: string | null;
  direction?: string;
  rating_overall: number;
  tags?: string[];
  comments?: string | null;
  created_at: string;
}

/**
 * Nested feedback metrics summary.
 */
export interface FeedbackSummaryMetricsDto {
  user_id?: number;
  volunteer_avg_rating?: number | null;
  volunteer_rating_count?: number;
  coordinator_avg_rating?: number | null;
  coordinator_rating_count?: number;
  overall_avg_rating?: number | null;
  total_count?: number;
  as_volunteer?: {
    count: number;
    avg_overall: number | null;
  };
  as_coordinator?: {
    count: number;
    avg_overall: number | null;
  };
  rating_distribution?: Record<string, number>;
}

/**
 * Response for `GET /api/v1/me/feedback/`.
 */
export interface FeedbackSummaryResponseDto {
  results: AuthoredFeedbackItemDto[];
  summary: FeedbackSummaryMetricsDto;
}

/**
 * Item in `GET /api/v1/checkin/me/attendance/` history response.
 */
export interface AttendanceHistoryItemDto {
  id: number;
  assignment_id?: number | null;
  event_id: number;
  event_title?: string | null;
  location_name?: string | null;
  post_id?: number | null;
  post_title?: string | null;
  schedule_start?: string | null;
  schedule_end?: string | null;
  status: AttendanceStatusDto | string;
  method: AttendanceMethodDto | string | null;
  checkin_at: string | null;
  checkout_at: string | null;
  confirmation_status?: ConfirmationStatusDto | string | null;
  walk_in_flag?: boolean;
  verified_hours?: number | null;
}
