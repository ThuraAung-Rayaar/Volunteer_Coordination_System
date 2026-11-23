/**
 * @format
 */

/**
 * Event item in coordinator's managed event list (`GET /api/v1/coordinator/events/`).
 * Matches `EventListSerializer` (enriched in Phase 2).
 */
export interface CoordinatorEventListItemDto {
  id: number;
  title: string;
  description?: string | null;
  purpose_type?: 'charity_event' | 'help_wanted_event';
  location_name?: string | null;
  landmark_text?: string | null;
  coordinator_name?: string | null;
  charity_fields?: string[];
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
 * Manager-only event configuration returned by GET /api/v1/coordinator/events/{id}/.
 * This DTO must never be substituted with the public event detail response.
 */
export interface CoordinatorEventConfigurationDto {
  id: number;
  owner_id: number;
  current_coordinator_id: number;
  title: string;
  description?: string | null;
  purpose_type: 'charity_event' | 'help_wanted_event';
  location_name?: string | null;
  landmark_text?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  geo_radius_m?: number | null;
  geo_checkin_enabled: boolean;
  geo_checkin_opens_before_min: number;
  require_checkin_confirmation: boolean;
  map_provider: 'openstreetmap' | 'google';
  start_at: string;
  end_at: string;
  application_deadline?: string | null;
  status: string;
  acceptance_mode: 'auto' | 'manual';
  auto_assign_enabled: boolean;
  group_size?: number | null;
  leader_strategy: 'none' | 'first_experienced' | 'manual';
  max_participants?: number | null;
  meals_provided: boolean;
  lodging_provided: boolean;
  travel_support_provided: boolean;
  compensation_kind: 'unpaid' | 'arranged_outside_system';
  compensation_note?: string | null;
  onboarding_text?: string | null;
  onboarding_version: number;
  require_onboarding_ack: boolean;
  qr_registration_enabled: boolean;
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
  checked_in_today_count?: number;
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
  publish?: boolean;
}

/**
 * Payload for creating an event post (`POST /api/v1/coordinator/events/{id}/posts/` - C-08).
 */
export interface EventPostCreateRequestDto {
  title: string;
  description?: string | null;
  required_headcount: number;
  physical_level?: 'none' | 'light' | 'medium' | 'heavy';
  required_skills?: string[];
  leader_needed?: boolean;
  new_volunteers_allowed?: boolean;
  priority?: number;
}

/**
 * Payload for updating an event post (`PATCH /api/v1/posts/{id}/` - C-09).
 */
export interface EventPostUpdateRequestDto {
  title?: string;
  description?: string | null;
  required_headcount?: number;
  physical_level?: 'none' | 'light' | 'medium' | 'heavy';
  required_skills?: string[];
  leader_needed?: boolean;
  new_volunteers_allowed?: boolean;
  priority?: number;
  status?: 'open' | 'full' | 'closed';
}

/**
 * Audit record from `v_event_coordinator_history` (`GET /api/v1/coordinator/events/{id}/history/` - C-18).
 */
export interface CoordinatorHistoryItemDto {
  id: number;
  event_id: number;
  event_title?: string;
  change_type: string;
  previous_coordinator_id: number | null;
  previous_coordinator_name: string | null;
  new_coordinator_id: number;
  new_coordinator_name: string | null;
  changed_by_id: number;
  changed_by_name: string | null;
  reason: string | null;
  changed_at: string;
}

/**
 * Payload for inviting a volunteer to an event (`POST /api/v1/coordinator/events/{id}/invite/` - C-23).
 */
export interface CoordinatorInviteRequestDto {
  volunteer_user_id?: number;
  volunteer_uuid?: string;
  post_id?: number | null;
  note?: string | null;
}

/**
 * Response for manual assignment (`POST /api/v1/coordinator/events/{id}/manual-assign/` - C-25).
 */
export interface ManualAssignResultDto {
  assignment_id?: number;
  application_id?: number | null;
  status?: string;
  id?: number;
  user_id?: number;
  display_name?: string;
  post_id?: number | null;
  post_title?: string | null;
  group_code?: string | null;
  is_group_leader?: boolean;
  assigned_by?: string;
  schedule_start?: string;
  schedule_end?: string;
  confirmed_at?: string | null;
}

/**
 * Response for running automatic assignment (`POST /api/v1/coordinator/events/{id}/auto-assign/` - C-24).
 */
export interface AutoAssignResultDto {
  event_id?: number;
  newly_assigned?: number;
  total_accepted?: number;
  total_assigned?: number;
  remaining_unassigned?: number;
  assigned?: number;
  message?: string;
}

/**
 * Post capacity summary matching `v_event_post_capacity` (`GET /api/v1/coordinator/events/{id}/post-capacity/` - C-28).
 */
export interface EventPostCapacityDto {
  post_id: number;
  title: string;
  status: string;
  required_headcount: number;
  assigned_count: number;
  remaining: number;
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
  note?: string | null;
  // T2 Volunteer Profile (present only for accepted applicants)
  uuid?: string | null;
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
 * Coordinator assignment review DTO matching `CoordinatorAssignmentListSerializer`.
 * Returned by `GET /api/v1/coordinator/events/{id}/assignments/`.
 */
export interface CoordinatorAssignmentDto {
  id: number;
  application_id?: number | null;
  event_id?: number | null;
  event_title?: string | null;
  user_id: number;
  display_name: string;
  post_id: number | null;
  post_title: string | null;
  group_code: string | null;
  is_group_leader: boolean;
  status: string;
  assigned_by: string;
  assigned_at?: string | null;
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
