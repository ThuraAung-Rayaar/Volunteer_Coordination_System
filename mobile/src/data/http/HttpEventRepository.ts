/**
 * @format
 */

import { ApiClient, defaultApiClient } from '../../core/api/apiClient';
import type {
  CharityCategory,
  EventApplicationState,
  EventApplicationStatus,
  EventDetail,
  EventFilters,
  EventSummary,
  RecommendedEvent,
  VolunteerApplicationItem,
  VolunteerAssignmentItem,
} from '../../domain/models/event';
import type {
  EventApplyResult,
  EventFeedbackItem,
  EventRepository,
  GeoCheckInLocationFix,
  GeoCheckInResult,
  OnboardingStatusResult,
  PaginatedEventsResult,
  QrRedeemResult,
  QrResolveResult,
} from '../contracts/eventRepository';
import { eventApi, type EventQueryParams } from '../endpoints/eventApi';
import { checkinApi } from '../endpoints/checkinApi';
import {
  mapCharityField,
  mapPublicEventDetail,
  mapPublicEventSummary,
  mapVolunteerApplication,
  mapVolunteerAssignment,
} from '../mappers/eventMapper';
import {
  queryCache,
  cacheKeys,
  cacheTags,
  CACHE_TTL,
  CACHE_SCOPE,
} from '../cache';
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

  public async getEvents(
    filters?: EventFilters,
    forceRefresh?: boolean,
  ): Promise<EventSummary[]> {
    // Discovery uses this convenience method; keep it on the bounded query cache.
    const page = await this.getEventsPage(filters, 1, 50, forceRefresh);
    return page.results;
  }

  public async getEventsPage(
    filters?: EventFilters,
    page: number = 1,
    pageSize: number = 20,
    forceRefresh?: boolean,
  ): Promise<PaginatedEventsResult> {
    const key = cacheKeys.publicEvents(filters as Record<string, any>, page, pageSize);
    return queryCache.getOrFetch(
      key,
      async () => {
        const params: EventQueryParams = {
          page,
          page_size: pageSize,
        };

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
          throw new Error(`Failed to load paginated events: ${res.error.message}`);
        }

        const count =
          'count' in res.data && typeof res.data.count === 'number'
            ? res.data.count
            : Array.isArray(res.data)
            ? res.data.length
            : 0;
        const next = 'next' in res.data ? res.data.next : null;
        const previous = 'previous' in res.data ? res.data.previous : null;
        const events: PublicEventDto[] = Array.isArray(res.data)
          ? res.data
          : 'results' in res.data
          ? res.data.results
          : [];

        return {
          count,
          next,
          previous,
          results: events.map(mapPublicEventSummary),
        };
      },
      {
        ttlMs: CACHE_TTL.PUBLIC_EVENTS_PAGE,
        tags: [cacheTags.events],
        scope: CACHE_SCOPE.PUBLIC,
        forceRefresh,
      },
    );
  }

  public async getEventById(id: string, forceRefresh?: boolean): Promise<EventDetail | null> {
    const hasToken = await this.client.hasValidToken();
    const scopeSuffix = hasToken ? 'auth' : 'anon';
    const key = cacheKeys.eventDetail(id, scopeSuffix);

    return queryCache.getOrFetch(
      key,
      async () => {
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
      },
      {
        ttlMs: CACHE_TTL.PUBLIC_EVENT_DETAIL,
        tags: [cacheTags.event(id)],
        scope: hasToken ? CACHE_SCOPE.ACCOUNT : CACHE_SCOPE.PUBLIC,
        forceRefresh,
      },
    );
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

    // Cache invalidation on successful application mutation
    queryCache.invalidateTag(cacheTags.event(eventId));
    queryCache.invalidateTag(cacheTags.applications);
    queryCache.invalidateTag(cacheTags.recommendations);
    queryCache.invalidateTag(cacheTags.dashboard);

    const app = res.data;
    const applicationState: EventApplicationState = {
      id: String(app.id),
      eventId: String(app.event_id),
      postId: app.post_id ? String(app.post_id) : postId,
      postTitle: app.post_title || 'Applied Role',
      status: (app.status as EventApplicationStatus) || 'pending',
      appliedAt: app.applied_at || new Date().toISOString(),
      volunteerNote: app.note ?? note,
    };

    return {
      success: true,
      message: 'Application submitted successfully',
      application: applicationState,
    };
  }

  public async getUserApplications(forceRefresh?: boolean): Promise<VolunteerApplicationItem[]> {
    const key = cacheKeys.myApplications('me');
    return queryCache.getOrFetch(
      key,
      async () => {
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
      },
      {
        ttlMs: CACHE_TTL.VOLUNTEER_APPLICATIONS,
        tags: [cacheTags.applications],
        scope: CACHE_SCOPE.ACCOUNT,
        forceRefresh,
      },
    );
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

    queryCache.invalidateTag(cacheTags.applications);
    queryCache.invalidateTag(cacheTags.assignments);
    queryCache.invalidateTag(cacheTags.recommendations);
    queryCache.invalidateTag(cacheTags.dashboard);

    return {
      success: true,
      message: 'Application withdrawn successfully',
    };
  }

  public async acceptInvite(
    applicationId: string,
    note?: string,
  ): Promise<{ success: boolean; message: string; applicationId: string }> {
    const res = await eventApi.acceptInvite(
      applicationId,
      { note },
      this.client,
    );
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
        applicationId,
      };
    }
    return {
      success: true,
      message: 'Invitation accepted successfully',
      applicationId: String(res.data.id),
    };
  }

  public async rejectInvite(
    applicationId: string,
    note?: string,
  ): Promise<{ success: boolean; message: string; applicationId: string }> {
    const res = await eventApi.rejectInvite(
      applicationId,
      { note },
      this.client,
    );
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
        applicationId,
      };
    }
    return {
      success: true,
      message: 'Invitation declined successfully',
      applicationId: String(res.data.id),
    };
  }

  public async getUserAssignments(forceRefresh?: boolean): Promise<VolunteerAssignmentItem[]> {
    const key = cacheKeys.myAssignments('me');
    return queryCache.getOrFetch(
      key,
      async () => {
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
      },
      {
        ttlMs: CACHE_TTL.VOLUNTEER_ASSIGNMENTS,
        tags: [cacheTags.assignments],
        scope: CACHE_SCOPE.ACCOUNT,
        forceRefresh,
      },
    );
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

    queryCache.invalidateTag(cacheTags.assignments);
    queryCache.invalidateTag(cacheTags.dashboard);

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

    queryCache.invalidateTag(cacheTags.assignments);
    queryCache.invalidateTag(cacheTags.dashboard);

    return {
      success: true,
      message: 'Assignment cancelled successfully',
    };
  }

  public async getCharityFields(forceRefresh?: boolean): Promise<CharityCategory[]> {
    return queryCache.getOrFetch(
      cacheKeys.charityTaxonomy(),
      async () => {
        const res = await eventApi.getCharityFields(this.client);
        if (!res.ok) {
          throw new Error(`Failed to load charity fields: ${res.error.message}`);
        }

        const list: CharityFieldDto[] = Array.isArray(res.data)
          ? res.data
          : 'results' in res.data
          ? res.data.results
          : [];
        return list.map(mapCharityField);
      },
      {
        ttlMs: CACHE_TTL.CHARITY_TAXONOMY,
        scope: CACHE_SCOPE.PUBLIC,
        forceRefresh,
      },
    );
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
    fix: GeoCheckInLocationFix,
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
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy_m: fix.accuracyM,
        captured_at: fix.capturedAt,
        is_mocked: fix.isMocked,
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

  public async resolveQrToken(token: string): Promise<QrResolveResult> {
    const res = await checkinApi.resolveQrToken(token, this.client);
    if (!res.ok) {
      throw new Error(`Failed to resolve QR token: ${res.error.message}`);
    }
    return {
      eventId: String(res.data.event_id),
      purpose: res.data.purpose,
      isValid: res.data.is_valid,
      reason: res.data.reason,
    };
  }

  public async qrCheckIn(token: string): Promise<QrRedeemResult> {
    const res = await checkinApi.qrCheckIn(token, this.client);
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
        result: 'code' in res.error ? res.error.code : undefined,
      };
    }
    return {
      success: true,
      message: 'QR check-in completed successfully.',
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

  public async getEventFeedbackList(
    eventId: string,
  ): Promise<EventFeedbackItem[]> {
    const res = await checkinApi.getEventFeedbackList(eventId, this.client);
    if (!res.ok) {
      throw new Error(`Failed to load event feedback list: ${res.error.message}`);
    }
    const items = res.data.results || [];
    return items.map(dto => ({
      id: String(dto.id),
      score: dto.rating_overall,
      comment: dto.comments ?? undefined,
      tags: dto.tags ?? [],
      createdAt: dto.created_at,
    }));
  }

  public async getRecommendations(
    limit: number = 10,
    forceRefresh?: boolean,
  ): Promise<RecommendedEvent[]> {
    const key = cacheKeys.recommendations();
    return queryCache.getOrFetch(
      key,
      async () => {
        const res = await eventApi.getRecommendations(limit, this.client);
        if (!res.ok) {
          throw new Error(res.error?.message || 'Failed to load recommendations');
        }
        return (res.data.results || []).map((r: any) => ({
          event: {
            eventId: r.event.event_id,
            title: r.event.title,
            startAt: r.event.start_at,
            endAt: r.event.end_at,
            locationName: r.event.location_name,
            charityFields: r.event.charity_fields || [],
            spotsRemaining: r.event.spots_remaining,
          },
          matchScore: r.match_score,
          matchLabel: r.match_label,
          reasons: r.reasons || [],
          matchedPostIds: r.matched_post_ids || [],
          policyVersion: r.policy_version,
        }));
      },
      {
        ttlMs: CACHE_TTL.RECOMMENDATIONS,
        tags: [cacheTags.recommendations, cacheTags.events],
        scope: CACHE_SCOPE.ACCOUNT,
        forceRefresh,
      },
    );
  }
}

export const defaultHttpEventRepository = new HttpEventRepository();
