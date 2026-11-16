/**
 * @format
 */

/**
 * Event item in coordinator's managed event list (`GET /api/v1/coordinator/events/`).
 * Matches `EventListSerializer`.
 */
export interface CoordinatorEventListItemDto {
  id: number;
  title: string;
  status: string;
  start_at: string;
  end_at: string;
  owner_id: number;
  current_coordinator_id: number;
  is_owner: boolean;
  is_current_coordinator: boolean;
  is_read_only_monitor: boolean;
  created_at: string;
}

/**
 * Comprehensive event summary view matching `EventSummarySerializer` / `v_event_summary`.
 * Returned by `GET /api/v1/coordinator/events/{id}/summary/`.
 */
export interface EventSummaryViewDto {
  id: number;
  title: string;
  status: string;
  start_at: string;
  end_at: string;
  acceptance_mode: string;
  auto_assign_enabled: boolean;
  max_participants: number | null;
  geo_checkin_enabled: boolean;
  map_provider: string;
  pending_count: number;
  accepted_count: number;
  waitlisted_count: number;
  assignment_count: number;
  checked_in_count: number;
  pending_confirmations: number;
}

/**
 * Request payload for creating a new event (`POST /api/v1/coordinator/events/`).
 * Matches `EventCreateSerializer`.
 */
export interface EventCreateRequestDto {
  title: string;
  description?: string | null;
  purpose_type?: 'charity_event' | 'help_wanted_event';
  location_name?: string | null;
  landmark_text?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geo_radius_m?: number | null;
  geo_checkin_enabled?: boolean;
  geo_checkin_opens_before_min?: number;
  require_checkin_confirmation?: boolean;
  map_provider?: 'openstreetmap' | 'google';
  start_at: string;
  end_at: string;
  application_deadline?: string | null;
  acceptance_mode?: 'auto' | 'manual';
  auto_assign_enabled?: boolean;
  group_size?: number | null;
  leader_strategy?: 'none' | 'first_experienced' | 'manual';
  max_participants?: number | null;
  meals_provided?: boolean;
  lodging_provided?: boolean;
  travel_support_provided?: boolean;
  compensation_kind?: 'unpaid' | 'arranged_outside_system';
  compensation_note?: string | null;
  onboarding_text?: string | null;
  require_onboarding_ack?: boolean;
  qr_registration_enabled?: boolean;
  charity_field_codes?: string[];
}

/**
 * Coordinator applicant review DTO matching `CoordinatorApplicationListSerializer`.
 * Returned by `GET /api/v1/coordinator/events/{id}/applications/`.
 */
export interface CoordinatorApplicationDto {
  id: number;
  user_id: number;
  display_name: string;
  post_id: number | null;
  post_title: string | null;
  source: string;
  status: string;
  applied_at: string;
  decided_at: string | null;
  decided_by_id: number | null;
  skills?: string[];
  physical_ok?: boolean;
  can_lift_heavy?: boolean;
  has_leader_experience?: boolean;
  new_to_volunteer?: boolean;
}

/**
 * Coordinator assignment review DTO matching `CoordinatorAssignmentListSerializer`.
 * Returned by `GET /api/v1/coordinator/events/{id}/assignments/`.
 */
export interface CoordinatorAssignmentDto {
  id: number;
  user_id: number;
  display_name: string;
  post_id: number | null;
  post_title: string | null;
  group_code: string | null;
  is_group_leader: boolean;
  status: string;
  assigned_by: string;
  schedule_start: string;
  schedule_end: string;
  confirmed_at: string | null;
}

/**
 * Attendance roster item matching `AttendanceRosterSerializer`.
 * Returned by `GET /api/v1/coordinator/events/{id}/attendance/`.
 */
export interface AttendanceRosterDto {
  assignment_id: number;
  event_id: number;
  user_id: number;
  display_name: string;
  post_id: number | null;
  post_title: string | null;
  group_code: string | null;
  is_group_leader: boolean;
  assignment_status: string;
  attendance_id: number | null;
  attendance_status: string | null;
  method: string | null;
  walk_in_flag: boolean;
  checkin_at: string | null;
  checkin_distance_m: number | null;
  confirmation_status: string | null;
}
