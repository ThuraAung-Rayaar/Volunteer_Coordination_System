/**
 * @format
 */

import { ApiClient, defaultApiClient } from '../../core/api/apiClient';
import type { ApiResult } from '../../core/api/apiResult';
import type { PaginatedResponseDto, ResultsListDto } from '../dto/commonDto';
import type {
  ApplicationSubmitRequestDto,
  CharityFieldDto,
  PublicEventDetailDto,
  PublicEventDto,
  PublicEventPostDto,
  VolunteerApplicationDto,
  VolunteerAssignmentDto,
} from '../dto/eventDto';

export interface EventQueryParams {
  search?: string;
  charity_field?: string;
  starts_after?: string;
  starts_before?: string;
  upcoming?: boolean | string;
  status?: string;
  page?: number;
  page_size?: number;
  sort?: string;
  [key: string]: string | number | boolean | undefined | null | Array<string | number>;
}

export const eventApi = {
  /**
   * Fetches active charity fields taxonomy.
   * Public endpoint.
   */
  getCharityFields(
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<CharityFieldDto[] | ResultsListDto<CharityFieldDto>>> {
    return client.get<CharityFieldDto[] | ResultsListDto<CharityFieldDto>>(
      'charity-fields/',
      { authRequired: false },
    );
  },

  /**
   * Fetches public events matching search and filter criteria.
   * Public endpoint.
   */
  getEvents(
    params?: EventQueryParams,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<PaginatedResponseDto<PublicEventDto> | PublicEventDto[]>> {
    return client.get<PaginatedResponseDto<PublicEventDto> | PublicEventDto[]>(
      'events/',
      { params, authRequired: false },
    );
  },

  /**
   * Fetches full public event detail with posts and conditional fields.
   * Public/mixed endpoint.
   */
  getEventDetail(
    id: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<PublicEventDetailDto>> {
    return client.get<PublicEventDetailDto>(`events/${id}/`, {
      authRequired: false,
    });
  },

  /**
   * Fetches open posts and capacity for an event.
   * Public endpoint.
   */
  getEventPosts(
    id: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<PublicEventPostDto[] | ResultsListDto<PublicEventPostDto>>> {
    return client.get<PublicEventPostDto[] | ResultsListDto<PublicEventPostDto>>(
      `events/${id}/posts/`,
      { authRequired: false },
    );
  },

  /**
   * Submits a volunteer application for an event post.
   * Authenticated endpoint.
   */
  applyToEvent(
    id: number | string,
    data: ApplicationSubmitRequestDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<VolunteerApplicationDto>> {
    return client.post<VolunteerApplicationDto>(`events/${id}/apply/`, data);
  },

  /**
   * Fetches the current user's submitted applications.
   * Authenticated endpoint.
   */
  getMyApplications(
    params?: { event_id?: number | string },
    client: ApiClient = defaultApiClient,
  ): Promise<
    ApiResult<
      | PaginatedResponseDto<VolunteerApplicationDto>
      | ResultsListDto<VolunteerApplicationDto>
      | VolunteerApplicationDto[]
    >
  > {
    return client.get<
      | PaginatedResponseDto<VolunteerApplicationDto>
      | ResultsListDto<VolunteerApplicationDto>
      | VolunteerApplicationDto[]
    >('me/applications/', { params });
  },

  /**
   * Withdraws a pending or waitlisted volunteer application.
   * Authenticated endpoint.
   */
  withdrawApplication(
    id: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<{ id: number; status: string }>> {
    return client.post<{ id: number; status: string }>(
      `applications/${id}/withdraw/`,
      {},
    );
  },

  /**
   * Fetches the current user's assignments.
   * Authenticated endpoint.
   */
  getMyAssignments(
    params?: { event_id?: number | string },
    client: ApiClient = defaultApiClient,
  ): Promise<
    ApiResult<
      | PaginatedResponseDto<VolunteerAssignmentDto>
      | ResultsListDto<VolunteerAssignmentDto>
      | VolunteerAssignmentDto[]
    >
  > {
    return client.get<
      | PaginatedResponseDto<VolunteerAssignmentDto>
      | ResultsListDto<VolunteerAssignmentDto>
      | VolunteerAssignmentDto[]
    >('me/assignments/', { params });
  },

  /**
   * Confirms a scheduled shift assignment.
   * Authenticated endpoint.
   */
  confirmAssignment(
    id: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<{ id: number; status: string }>> {
    return client.post<{ id: number; status: string }>(
      `assignments/${id}/confirm/`,
      {},
    );
  },

  /**
   * Cancels a scheduled shift assignment.
   * Authenticated endpoint.
   */
  cancelAssignment(
    id: number | string,
    reason: string = '',
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<{ id: number; status: string }>> {
    return client.post<{ id: number; status: string }>(
      `assignments/${id}/cancel/`,
      { reason },
    );
  },
};
