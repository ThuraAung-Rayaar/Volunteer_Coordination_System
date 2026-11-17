/**
 * @format
 */

import { ApiClient, defaultApiClient } from '../../core/api/apiClient';
import type {
  EventApplicationState,
  EventDetail,
  EventFilters,
  EventSummary,
  VolunteerApplicationItem,
  VolunteerAssignmentItem,
} from '../../domain/models/event';
import type {
  EventApplyResult,
  EventRepository,
} from '../contracts/eventRepository';
import { eventApi, type EventQueryParams } from '../endpoints/eventApi';
import { checkinApi } from '../endpoints/checkinApi';
import {
  mapPublicEventDetail,
  mapPublicEventSummary,
  mapVolunteerApplication,
  mapVolunteerAssignment,
} from '../mappers/eventMapper';
import type {
  CharityFieldDto,
  PublicEventDto,
  PublicEventPostDto,
  VolunteerApplicationDto,
  VolunteerAssignmentDto,
} from '../dto/eventDto';

export class HttpEventRepository implements EventRepository {
  private client: ApiClient;

  constructor(client: ApiClient = defaultApiClient) {
    this.client = client;
  }

  public async getEvents(filters?: EventFilters): Promise<EventSummary[]> {
    const params: EventQueryParams = {};

    if (filters) {
      if (filters.query && filters.query.trim().length > 0) {
        params.search = filters.query.trim();
      }
      if (filters.charityFieldCodes && filters.charityFieldCodes.length > 0) {
        params.charity_field = filters.charityFieldCodes.join(',');
      }
      if (filters.statuses && filters.statuses.length === 1) {
        params.status = filters.statuses[0];
      }
      if (filters.mealsProvided === true) {
        params.meals_provided = 'true';
      }
      if (filters.lodgingProvided === true) {
        params.lodging_provided = 'true';
      }
      if (filters.travelSupportProvided === true) {
        params.travel_support_provided = 'true';
      }
      if (filters.startAfter) {
        params.starts_after = filters.startAfter;
      }
      if (filters.endBefore) {
        params.starts_before = filters.endBefore;
      }
    }

    const res = await eventApi.getEvents(params, this.client);
    if (!res.ok) {
      throw new Error(`Failed to load events: ${res.error.message}`);
    }

    const events: PublicEventDto[] = Array.isArray(res.data)
      ? res.data
      : 'results' in res.data
      ? res.data.results
      : [];

    return events.map(mapPublicEventSummary);
  }

  public async getEventById(id: string): Promise<EventDetail | null> {
    const hasToken = await this.client.hasValidToken();

    const [eventRes, postsRes, appsRes] = await Promise.all([
      eventApi.getEventDetail(id, this.client),
      eventApi.getEventPosts(id, this.client),
      hasToken
        ? eventApi.getMyApplications({ event_id: id }, this.client)
        : Promise.resolve({
            ok: true as const,
            status: 200,
            data: { results: [] as VolunteerApplicationDto[] },
          }),
    ]);

    if (!eventRes.ok) {
      if (eventRes.status === 404) {
        return null;
      }
      throw new Error(`Failed to load event: ${eventRes.error.message}`);
    }

    let posts: PublicEventPostDto[] = [];
    if (postsRes.ok) {
      posts = Array.isArray(postsRes.data)
        ? postsRes.data
        : 'results' in postsRes.data
        ? postsRes.data.results
        : [];
    } else if (eventRes.data.posts && eventRes.data.posts.length > 0) {
      posts = eventRes.data.posts;
    }

    if (posts.length > 0) {
      eventRes.data.posts = posts;
    }

    let userAppDto: VolunteerApplicationDto | null = null;
    if (appsRes.ok) {
      const apps: VolunteerApplicationDto[] = Array.isArray(appsRes.data)
        ? appsRes.data
        : 'results' in appsRes.data
        ? appsRes.data.results
        : [];

      userAppDto = apps.find(a => String(a.event_id) === String(id)) ?? null;
    }

    return mapPublicEventDetail(eventRes.data, userAppDto);
  }

  public async applyToPost(
    eventId: string,
    postId: string,
    note?: string,
  ): Promise<EventApplyResult> {
    const numericPostId = isNaN(Number(postId)) ? null : Number(postId);
    const res = await eventApi.applyToEvent(
      eventId,
      {
        event_id: Number(eventId),
        post_id: numericPostId,
        note: note ?? '',
        source: 'browse',
      },
      this.client,
    );

    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    const app = res.data;
    const applicationState: EventApplicationState = {
      id: String(app.id),
      eventId: String(app.event_id),
      postId: app.post_id ? String(app.post_id) : postId,
      postTitle: app.post_title || 'Applied Role',
      status: (app.status as any) || 'applied',
      appliedAt: app.applied_at || new Date().toISOString(),
      volunteerNote: app.note ?? note,
    };

    return {
      success: true,
      message: 'Application submitted successfully',
      application: applicationState,
    };
  }

  public async getUserApplications(): Promise<VolunteerApplicationItem[]> {
    const res = await eventApi.getMyApplications(undefined, this.client);
    if (!res.ok) {
      throw new Error(`Failed to load applications: ${res.error.message}`);
    }

    const apps: VolunteerApplicationDto[] = Array.isArray(res.data)
      ? res.data
      : 'results' in res.data
      ? res.data.results
      : [];

    return apps.map(mapVolunteerApplication);
  }

  public async withdrawApplication(
    applicationId: string,
  ): Promise<{ success: boolean; message: string }> {
    const res = await eventApi.withdrawApplication(applicationId, this.client);
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    return {
      success: true,
      message: 'Application withdrawn successfully',
    };
  }

  public async getUserAssignments(): Promise<VolunteerAssignmentItem[]> {
    const res = await eventApi.getMyAssignments(undefined, this.client);
    if (!res.ok) {
      throw new Error(`Failed to load assignments: ${res.error.message}`);
    }

    const assignments: VolunteerAssignmentDto[] = Array.isArray(res.data)
      ? res.data
      : 'results' in res.data
      ? res.data.results
      : [];

    return assignments.map(mapVolunteerAssignment);
  }

  public async confirmAssignment(
    assignmentId: string,
  ): Promise<{ success: boolean; message: string }> {
    const res = await eventApi.confirmAssignment(assignmentId, this.client);
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    return {
      success: true,
      message: 'Assignment confirmed successfully',
    };
  }

  public async cancelAssignment(
    assignmentId: string,
  ): Promise<{ success: boolean; message: string }> {
    const res = await eventApi.cancelAssignment(
      assignmentId,
      'Cancelled by volunteer',
      this.client,
    );
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    return {
      success: true,
      message: 'Assignment cancelled successfully',
    };
  }

  public async getCharityFields(): Promise<CharityFieldDto[]> {
    const res = await eventApi.getCharityFields(this.client);
    if (!res.ok) {
      throw new Error(`Failed to load charity fields: ${res.error.message}`);
    }

    return Array.isArray(res.data)
      ? res.data
      : 'results' in res.data
      ? res.data.results
      : [];
  }

  public async getEventOnboarding(eventId: string): Promise<{
    eventId: string;
    onboardingText: string | null;
    onboardingVersion: number;
    requireOnboardingAck: boolean;
    acknowledged: boolean;
  }> {
    const res = await checkinApi.getOnboarding(eventId, this.client);
    if (!res.ok) {
      throw new Error(`Failed to load onboarding briefing: ${res.error.message}`);
    }

    return {
      eventId: String(res.data.event_id),
      onboardingText: res.data.onboarding_text,
      onboardingVersion: res.data.onboarding_version,
      requireOnboardingAck: res.data.require_onboarding_ack,
      acknowledged: res.data.acknowledged,
    };
  }

  public async acknowledgeOnboarding(
    eventId: string,
    notes?: string,
  ): Promise<{ success: boolean; message: string; acknowledged: boolean }> {
    const res = await checkinApi.acknowledgeOnboarding(
      eventId,
      { notes },
      this.client,
    );
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
        acknowledged: false,
      };
    }

    return {
      success: true,
      message: 'Onboarding acknowledged successfully',
      acknowledged: res.data.acknowledged,
    };
  }

  public async submitGeoCheckIn(
    eventId: string,
    latitude: number,
    longitude: number,
    accuracyM?: number,
  ): Promise<{
    success: boolean;
    message: string;
    result?: string;
    distanceM?: number;
    confirmationStatus?: string;
    attendanceId?: string;
  }> {
    const res = await checkinApi.submitGeoCheckIn(
      {
        event_id: Number(eventId),
        latitude,
        longitude,
        accuracy_m: accuracyM ?? null,
      },
      this.client,
    );

    if (res.ok) {
      return {
        success: res.data.success ?? true,
        message: res.data.message || 'Geo check-in verified successfully.',
        result: res.data.result,
        distanceM: res.data.distance_m ?? undefined,
        confirmationStatus: res.data.confirmation_status ?? undefined,
        attendanceId: res.data.attendance_id
          ? String(res.data.attendance_id)
          : undefined,
      };
    }

    const error = res.error;
    const distanceM =
      error.kind === 'validation' &&
      error.meta &&
      typeof error.meta.distance_m === 'number'
        ? error.meta.distance_m
        : undefined;

    return {
      success: false,
      message: error.message,
      result: 'code' in error ? error.code : undefined,
      distanceM,
    };
  }

  public async redeemQrToken(token: string): Promise<{
    success: boolean;
    message: string;
    result?: string;
    eventId?: string;
    attendanceId?: string;
    applicationId?: string;
  }> {
    const res = await checkinApi.redeemQrToken(token, this.client);
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
        result: 'code' in res.error ? res.error.code : undefined,
      };
    }

    return {
      success: true,
      message: 'QR token redeemed successfully.',
      result: res.data.result,
      eventId: res.data.event_id ? String(res.data.event_id) : undefined,
      attendanceId: res.data.attendance_id
        ? String(res.data.attendance_id)
        : undefined,
      applicationId: res.data.application_id
        ? String(res.data.application_id)
        : undefined,
    };
  }

  public async checkOutAttendance(
    attendanceId: string,
  ): Promise<{ success: boolean; message: string; checkedOutAt?: string }> {
    const res = await checkinApi.checkoutAttendance(attendanceId, this.client);
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    return {
      success: true,
      message: 'Shift checkout completed successfully.',
      checkedOutAt: res.data.checkout_at,
    };
  }

  public async submitEventFeedback(
    eventId: string,
    score: number,
    comment?: string,
    tags?: string[],
    direction:
      | 'coordinator_to_volunteer'
      | 'volunteer_to_event'
      | 'volunteer_to_coordinator' = 'volunteer_to_event',
  ): Promise<{ success: boolean; message: string; feedbackId?: string }> {
    const res = await checkinApi.submitEventFeedback(
      eventId,
      {
        direction,
        score,
        comment: comment || '',
        tags: tags || [],
      },
      this.client,
    );

    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    return {
      success: true,
      message: 'Feedback submitted successfully.',
      feedbackId: String(res.data.id),
    };
  }
}

export const defaultHttpEventRepository = new HttpEventRepository();
