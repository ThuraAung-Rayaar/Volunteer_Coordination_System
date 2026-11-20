/**
 * @format
 */

import { ApiClient, defaultApiClient } from '../../core/api/apiClient';
import type { ApiResult } from '../../core/api/apiResult';
import type { ResultsListDto } from '../dto/commonDto';
import type {
  AttendanceRosterDto,
  AutoAssignResultDto,
  CoordinatorApplicationDto,
  CoordinatorAssignmentDto,
  CoordinatorEventListItemDto,
  CoordinatorHistoryItemDto,
  CoordinatorInviteRequestDto,
  EventCreateRequestDto,
  EventPostCapacityDto,
  EventPostCreateRequestDto,
  EventPostUpdateRequestDto,
  EventSummaryViewDto,
  ManualAssignResultDto,
} from '../dto/coordinatorDto';
import type { ManualCheckinResponseDto } from '../dto/checkinDto';
import type { PublicEventPostDto } from '../dto/eventDto';

export const coordinatorApi = {
  /**
   * Fetches events owned or coordinated by the user.
   * Authenticated endpoint.
   */
  getMyEvents(
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<ResultsListDto<CoordinatorEventListItemDto>>> {
    return client.get<ResultsListDto<CoordinatorEventListItemDto>>(
      'coordinator/events/',
    );
  },

  /**
   * Fetches coordinator-level summary metrics for an event.
   * Authenticated endpoint.
   */
  getEventSummary(
    eventId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<EventSummaryViewDto>> {
    return client.get<EventSummaryViewDto>(
      `coordinator/events/${eventId}/summary/`,
    );
  },

  /**
   * Creates a new event in draft status.
   * Authenticated endpoint.
   */
  createEvent(
    data: EventCreateRequestDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<{ id: number; status: string }>> {
    return client.post<{ id: number; status: string }>(
      'coordinator/events/',
      data,
    );
  },

  /**
   * Updates an existing event.
   * Authenticated endpoint.
   */
  updateEvent(
    eventId: number | string,
    data: Partial<EventCreateRequestDto>,
    client: ApiClient = defaultApiClient,
  ): Promise<
    ApiResult<{ id: number; status: string; onboarding_version?: number }>
  > {
    return client.patch<{
      id: number;
      status: string;
      onboarding_version?: number;
    }>(`coordinator/events/${eventId}/`, data);
  },

  /**
   * Publishes a draft event.
   * Authenticated endpoint.
   */
  publishEvent(
    eventId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<
    ApiResult<{ id: number; status: string; published_at?: string }>
  > {
    return client.post<{
      id: number;
      status: string;
      published_at?: string;
    }>(`events/${eventId}/publish/`, {});
  },

  /**
   * Activates a published event.
   * Authenticated endpoint.
   */
  activateEvent(
    eventId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<
    ApiResult<{ id: number; status: string; activated_at?: string }>
  > {
    return client.post<{
      id: number;
      status: string;
      activated_at?: string;
    }>(`events/${eventId}/activate/`, {});
  },

  /**
   * Completes an active event.
   * Authenticated endpoint.
   */
  completeEvent(
    eventId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<
    ApiResult<{ id: number; status: string; completed_at?: string }>
  > {
    return client.post<{
      id: number;
      status: string;
      completed_at?: string;
    }>(`events/${eventId}/complete/`, {});
  },

  /**
   * Cancels an event with a reason.
   * Authenticated endpoint.
   */
  cancelEvent(
    eventId: number | string,
    reason: string = 'Cancelled by coordinator',
    client: ApiClient = defaultApiClient,
  ): Promise<
    ApiResult<{ id: number; status: string; cancelled_at?: string }>
  > {
    return client.post<{
      id: number;
      status: string;
      cancelled_at?: string;
    }>(`events/${eventId}/cancel/`, { reason });
  },

  /**
   * Hands over event coordination to another approved coordinator.
   * Authenticated endpoint.
   */
  handoverEvent(
    eventId: number | string,
    newCoordinatorUserId: number,
    reason: string = '',
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<{ id: number; current_coordinator_id: number }>> {
    return client.post<{ id: number; current_coordinator_id: number }>(
      `events/${eventId}/handover/`,
      {
        new_coordinator_user_id: newCoordinatorUserId,
        reason,
      },
    );
  },

  /**
   * Retakes event coordination as the original event owner.
   * Authenticated endpoint.
   */
  retakeEvent(
    eventId: number | string,
    reason: string = '',
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<{ id: number; current_coordinator_id: number }>> {
    return client.post<{ id: number; current_coordinator_id: number }>(
      `events/${eventId}/retake/`,
      { reason },
    );
  },

  /**
   * Fetches posts for a coordinator event.
   * Authenticated endpoint.
   */
  getEventPosts(
    eventId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<
    ApiResult<ResultsListDto<PublicEventPostDto> | PublicEventPostDto[]>
  > {
    return client.get<
      ResultsListDto<PublicEventPostDto> | PublicEventPostDto[]
    >(`coordinator/events/${eventId}/posts/`);
  },

  /**
   * Creates a new post for an event (C-08).
   * Authenticated endpoint.
   */
  createEventPost(
    eventId: number | string,
    data: EventPostCreateRequestDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<{ id: number; status: string }>> {
    return client.post<{ id: number; status: string }>(
      `coordinator/events/${eventId}/posts/`,
      data,
    );
  },

  /**
   * Updates an event post headcount, requirements, or status (C-09).
   * Authenticated endpoint.
   */
  updateEventPost(
    postId: number | string,
    data: EventPostUpdateRequestDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<{ id: number; status: string }>> {
    return client.patch<{ id: number; status: string }>(
      `posts/${postId}/`,
      data,
    );
  },

  /**
   * Closes an event post to stop accepting new applications (C-10).
   * Authenticated endpoint.
   */
  closeEventPost(
    postId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<{ id: number; status: string }>> {
    return client.post<{ id: number; status: string }>(
      `posts/${postId}/close/`,
      {},
    );
  },

  /**
   * Fetches event coordinator handover audit history (C-18).
   * Authenticated endpoint.
   */
  getCoordinatorHistory(
    eventId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<ResultsListDto<CoordinatorHistoryItemDto>>> {
    return client.get<ResultsListDto<CoordinatorHistoryItemDto>>(
      `coordinator/events/${eventId}/history/`,
    );
  },

  /**
   * Invites a volunteer to an event by user_id or uuid (C-23 / V-24).
   * Authenticated endpoint.
   */
  inviteVolunteer(
    eventId: number | string,
    data: CoordinatorInviteRequestDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<CoordinatorApplicationDto>> {
    return client.post<CoordinatorApplicationDto>(
      `coordinator/events/${eventId}/invite/`,
      data,
    );
  },

  /**
   * Fetches applications for a coordinator event.
   * Authenticated endpoint.
   */
  getApplications(
    eventId: number | string,
    status?: string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<ResultsListDto<CoordinatorApplicationDto>>> {
    return client.get<ResultsListDto<CoordinatorApplicationDto>>(
      `coordinator/events/${eventId}/applications/`,
      { params: status ? { status } : undefined },
    );
  },

  /**
   * Updates application status (accept, reject, waitlist).
   * Authenticated endpoint.
   */
  decideApplication(
    applicationId: number | string,
    action: 'accept' | 'reject' | 'waitlist',
    data: { post_id?: number | null; note?: string } = {},
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<{ id: number; status: string }>> {
    return client.post<{ id: number; status: string }>(
      `coordinator/applications/${applicationId}/${action}/`,
      data,
    );
  },

  /**
   * Runs auto-assignment on an event (C-24).
   * Authenticated endpoint.
   */
  runAutoAssignment(
    eventId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<AutoAssignResultDto>> {
    return client.post<AutoAssignResultDto>(
      `coordinator/events/${eventId}/auto-assign/`,
      {},
    );
  },

  /**
   * Manually assigns a volunteer application to an event post (C-25).
   * Authenticated endpoint.
   */
  manualAssign(
    eventId: number | string,
    data: {
      application_id: number;
      post_id?: number | null;
      group_code?: string | null;
      is_group_leader?: boolean;
    },
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<ManualAssignResultDto>> {
    return client.post<ManualAssignResultDto>(
      `coordinator/events/${eventId}/manual-assign/`,
      data,
    );
  },

  /**
   * Fetches post capacity breakdown for an event (C-28).
   * Authenticated endpoint.
   */
  getPostCapacity(
    eventId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<ResultsListDto<EventPostCapacityDto>>> {
    return client.get<ResultsListDto<EventPostCapacityDto>>(
      `coordinator/events/${eventId}/post-capacity/`,
    );
  },

  /**
   * Fetches assignments for an event.
   * Authenticated endpoint.
   */
  getAssignments(
    eventId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<ResultsListDto<CoordinatorAssignmentDto>>> {
    return client.get<ResultsListDto<CoordinatorAssignmentDto>>(
      `coordinator/events/${eventId}/assignments/`,
    );
  },

  /**
   * Fetches unassigned accepted applications for an event.
   * Authenticated endpoint.
   */
  getUnassignedApplications(
    eventId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<ResultsListDto<CoordinatorApplicationDto>>> {
    return client.get<ResultsListDto<CoordinatorApplicationDto>>(
      `coordinator/events/${eventId}/unassigned/`,
    );
  },

  /**
   * Fetches full attendance roster for an event.
   * Authenticated endpoint.
   */
  getAttendanceRoster(
    eventId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<ResultsListDto<AttendanceRosterDto>>> {
    return client.get<ResultsListDto<AttendanceRosterDto>>(
      `coordinator/events/${eventId}/attendance/`,
    );
  },

  /**
   * Fetches pending geo check-in attempts for an event.
   * Authenticated endpoint.
   */
  getPendingGeoConfirmations(
    eventId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<ResultsListDto<AttendanceRosterDto>>> {
    return client.get<ResultsListDto<AttendanceRosterDto>>(
      `coordinator/events/${eventId}/attendance/pending/`,
    );
  },

  /**
   * Confirms a pending geo check-in attempt.
   * Authenticated endpoint.
   */
  confirmAttendance(
    attendanceId: number | string,
    note: string = '',
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<{ id: number; confirmation_status: string }>> {
    return client.post<{ id: number; confirmation_status: string }>(
      `coordinator/attendance/${attendanceId}/confirm/`,
      { note },
    );
  },

  /**
   * Rejects a pending geo check-in attempt.
   * Authenticated endpoint.
   */
  rejectAttendance(
    attendanceId: number | string,
    reason: string = 'Rejected by coordinator',
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<{ id: number; confirmation_status: string }>> {
    return client.post<{ id: number; confirmation_status: string }>(
      `coordinator/attendance/${attendanceId}/reject/`,
      { reason },
    );
  },

  /**
   * Checks in a volunteer manually on-site (C-34 / ATT-02).
   * Authenticated endpoint. Canonical route: checkin/attendance/manual-checkin/
   */
  manualCheckIn(
    data: {
      event_id: number;
      user_id: number;
      note?: string;
    },
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<ManualCheckinResponseDto>> {
    return client.post<ManualCheckinResponseDto>(
      'checkin/attendance/manual-checkin/',
      data,
    );
  },
};
