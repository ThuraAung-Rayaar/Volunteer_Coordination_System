/**
 * @format
 */

/**
 * Standard charity field taxonomy item from `GET /api/v1/charity-fields/`.
 */
export interface CharityFieldDto {
  code: string;
  label: string;
  sort_order: number;
}

/**
 * Event card DTO matching `PublicEventSerializer` (backed by `v_public_events`).
 * Returned by `GET /api/v1/events/`.
 */
export interface PublicEventDto {
  id: number;
  title: string;
  description: string | null;
  purpose_type: 'charity_event' | 'help_wanted_event';
  location_name: string | null;
  landmark_text: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  geo_radius_m: number | null;
  geo_checkin_enabled: boolean;
  map_provider: string;
  start_at: string;
  end_at: string;
  application_deadline: string | null;
  status: string;
  acceptance_mode: 'auto' | 'manual';
  max_participants: number | null;
  meals_provided: boolean;
  lodging_provided: boolean;
  travel_support_provided: boolean;
  compensation_kind: string;
  coordinator_name: string | null;
  charity_fields: string[];
  spots_remaining: number;
  require_onboarding_ack?: boolean;
  qr_registration_enabled?: boolean;
}

/**
 * Event role / post matching `PublicEventPostSerializer`.
 */
export interface PublicEventPostDto {
  id: number;
  title: string;
  description: string | null;
  status: 'open' | 'full' | 'closed';
  physical_level: 'none' | 'light' | 'medium' | 'heavy';
  required_skills: string[];
  leader_needed: boolean;
  new_volunteers_allowed: boolean;
  required_headcount: number;
  assigned_count: number;
  remaining: number;
  priority?: number;
}

/**
 * Event detail composite DTO matching `PublicEventDetailSerializer`.
 * Returned by `GET /api/v1/events/{id}/`.
 */
export interface PublicEventDetailDto extends PublicEventDto {
  posts?: PublicEventPostDto[];
  onboarding_text?: string | null;
  onboarding_version?: number;
  compensation_note?: string | null;
  require_onboarding_ack?: boolean;
  qr_registration_enabled?: boolean;
}

/**
 * Request payload for `POST /api/v1/events/{id}/apply/`.
 */
export interface ApplicationSubmitRequestDto {
  event_id?: number;
  post_id?: number | null;
  source?: 'browse' | 'qr_walkin' | 'invite';
  qr_token_id?: number | null;
  note?: string | null;
}

/**
 * Application response item matching `ApplicationStatusSerializer`.
 * Returned by `POST /api/v1/events/{id}/apply/` and `GET /api/v1/me/applications/`.
 */
export interface VolunteerApplicationDto {
  id: number;
  event_id: number;
  event_title: string | null;
  event_status: string | null;
  post_id: number | null;
  post_title: string | null;
  source: string;
  status: string;
  applied_at: string;
  decided_at: string | null;
  note: string | null;
}

/**
 * Volunteer shift assignment matching `VolunteerAssignmentListSerializer`.
 * Returned by `GET /api/v1/me/assignments/`.
 */
export interface VolunteerAssignmentDto {
  id: number;
  application_id?: number | null;
  event_id: number;
  event_title: string;
  event_status: string;
  location_name?: string | null;
  post_id: number | null;
  post_title: string | null;
  group_code: string | null;
  is_group_leader: boolean;
  status: string;
  assigned_at?: string | null;
  schedule_start: string;
  schedule_end: string;
  confirmed_at: string | null;
  attendance_id?: number | null;
  attendance_status?: string | null;
}
