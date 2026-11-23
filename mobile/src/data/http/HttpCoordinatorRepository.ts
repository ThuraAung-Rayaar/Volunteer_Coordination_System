/**
 * @format
 */

import { ApiClient, defaultApiClient } from '../../core/api/apiClient';
import { appEventBus, AppEvents } from '../../core/events/eventBus';
import { defaultDashboardRepository } from '../mock/MockDashboardRepository';
import type {
  CoordinatorApplicationItem,
  CoordinatorApplicationStatus,
  CoordinatorAssignmentItem,
  CoordinatorAttendanceItem,
  CoordinatorEventDetail,
  CoordinatorEventStatus,
  CoordinatorEventSummary,
  CoordinatorHistoryItem,
  CoordinatorOverviewMetrics,
  CreateEventWizardDraft,
  EventPostCapacity,
  EventPurposeType,
  GeoAttemptReview,
  VolunteerUuidLookup,
} from '../../domain/models/coordinator';
import type { CharityCategoryCode } from '../../domain/models/event';
import type {
  CoordinatorOperationResult,
  CoordinatorRepository,
} from '../contracts/coordinatorRepository';
import { coordinatorApi } from '../endpoints/coordinatorApi';
import { checkinApi } from '../endpoints/checkinApi';
import { eventApi } from '../endpoints/eventApi';
import { profileApi } from '../endpoints/profileApi';
import {
  mapAttendanceRosterItem,
  mapCoordinatorApplication,
  mapCoordinatorAssignment,
  mapCoordinatorEventSummary,
  mapCoordinatorHistoryItem,
  mapCreateEventDraftToRequest,
  mapEventUpdateDraftToRequest,
  mapEventPostCapacity,
  mapGeoAttemptReview,
  mapVolunteerUuidLookup,
} from '../mappers/coordinatorMapper';
import { mapPublicEventPost } from '../mappers/eventMapper';
import type { PublicEventPostDto } from '../dto/eventDto';
import type { PostStatus } from '../../domain/models/event';
import type {
  AttendanceRosterDto,
  CoordinatorApplicationDto,
  CoordinatorAssignmentDto,
  CoordinatorEventListItemDto,
  CoordinatorHistoryItemDto,
  EventPostCapacityDto,
} from '../dto/coordinatorDto';
import type { GeoAttemptReviewDto } from '../dto/checkinDto';
import type { UserUuidLookupDto } from '../dto/profileDto';

export class HttpCoordinatorRepository implements CoordinatorRepository {
  private client: ApiClient;
  private appToEventMap: Map<string, string> = new Map();
  private applicationCache: Map<string, CoordinatorApplicationItem> = new Map();
  private attendanceCache: Map<string, CoordinatorAttendanceItem> = new Map();
  private inFlightMyEventsPromise: Promise<CoordinatorEventSummary[]> | null =
    null;
  private coordinatorIdentity = {
    id: 'usr-coord',
    displayName: 'Coordinator',
    email: 'coordinator@example.com',
  };

  constructor(client: ApiClient = defaultApiClient) {
    this.client = client;
  }

  public setCoordinatorIdentity(identity: {
    id: string;
    displayName: string;
    email?: string;
  }): void {
    this.coordinatorIdentity = {
      id: identity.id,
      displayName: identity.displayName,
      email: identity.email ?? 'coordinator@example.com',
    };
  }

  public getCoordinatorIdentity(): {
    id: string;
    displayName: string;
    email: string;
  } {
    return { ...this.coordinatorIdentity };
  }

  public async getMyEvents(): Promise<CoordinatorEventSummary[]> {
    if (this.inFlightMyEventsPromise) {
      return this.inFlightMyEventsPromise;
    }

    this.inFlightMyEventsPromise = (async () => {
      try {
        const res = await coordinatorApi.getMyEvents(this.client);
        if (!res.ok) {
          throw new Error(`Failed to load events: ${res.error.message}`);
        }

        const list: CoordinatorEventListItemDto[] = res.data.results || [];
        const summaries = await Promise.all(
          list.map(e =>
            coordinatorApi.getEventSummary(e.id, this.client).catch(() => null),
          ),
        );

        return list.map((e, idx) => {
          const summaryRes = summaries[idx];
          const summaryDto =
            summaryRes && summaryRes.ok ? summaryRes.data : null;
          return mapCoordinatorEventSummary(e, summaryDto);
        });
      } finally {
        this.inFlightMyEventsPromise = null;
      }
    })();

    return this.inFlightMyEventsPromise;
  }

  public async getOverviewMetrics(): Promise<CoordinatorOverviewMetrics> {
    const events = await this.getMyEvents();
    const totalEventsCount = events.length;
    const activeEventsCount = events.filter(
      e =>
        (e.status === 'active' || e.status === 'published') &&
        (!e.endAt || new Date(e.endAt).getTime() >= Date.now()),
    ).length;
    const draftEventsCount = events.filter(e => e.status === 'draft').length;

    let pendingApplicationsCount = 0;
    let acceptedApplicantsCount = 0;
    let checkedInTodayCount = 0;
    let checkedInAllTimeCount = 0;

    for (const e of events) {
      pendingApplicationsCount += e.pendingApplicationCount || 0;
      acceptedApplicantsCount += e.acceptedApplicantCount || 0;
      checkedInTodayCount +=
        typeof e.checkedInTodayCount === 'number'
          ? e.checkedInTodayCount
          : e.checkedInCount || 0;
      checkedInAllTimeCount += e.checkedInCount || 0;
    }

    return {
      totalEventsCount,
      activeEventsCount,
      draftEventsCount,
      pendingApplicationsCount,
      acceptedApplicantsCount,
      checkedInTodayCount,
      checkedInAllTimeCount,
    };
  }

  public async getEventDetail(
    eventId: string,
  ): Promise<CoordinatorEventDetail | null> {
    const [summaryRes, postsRes, eventsRes, configurationRes] = await Promise.all([
      coordinatorApi.getEventSummary(eventId, this.client),
      coordinatorApi.getEventPosts(eventId, this.client),
      coordinatorApi.getMyEvents(this.client),
      coordinatorApi.getEventConfiguration(eventId, this.client),
    ]);

    if (!summaryRes.ok) {
      if (summaryRes.status === 404) return null;
      throw new Error(`Failed to load event summary: ${summaryRes.error.message}`);
    }
    if (!configurationRes || !configurationRes.ok) {
      if (configurationRes?.status === 404) return null;
      throw new Error(
        `Failed to load manager event configuration: ${configurationRes?.error?.message ?? 'Unknown error'}`,
      );
    }

    if (!eventsRes.ok) {
      throw new Error(
        `Failed to verify coordinator event permissions: ${eventsRes.error.message}`,
      );
    }
    if (!postsRes.ok) {
      throw new Error(
        `Failed to load event posts: ${postsRes.error.message}`,
      );
    }

    const summary = summaryRes.data;
    const configuration = configurationRes.data;
    const events: CoordinatorEventListItemDto[] = eventsRes.data?.results ?? [];
    const currentEventItem = events.find(e => String(e.id) === String(eventId));
    if (!currentEventItem) {
      throw new Error('Cannot verify event manager/monitor permissions for this event.');
    }

    const rawPosts: PublicEventPostDto[] = Array.isArray(postsRes.data)
      ? postsRes.data
      : postsRes.data?.results || [];

    const toCoordinate = (value: string | number | null | undefined): number | null => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    return {
      id: String(configuration.id),
      title: configuration.title,
      description: configuration.description ?? '',
      status: configuration.status as CoordinatorEventStatus,
      purposeType: configuration.purpose_type as EventPurposeType,
      startAt: configuration.start_at,
      endAt: configuration.end_at,
      applicationDeadline: configuration.application_deadline ?? undefined,
      locationName: configuration.location_name ?? '',
      landmarkText: configuration.landmark_text ?? undefined,
      charityFields: (currentEventItem.charity_fields || []) as CharityCategoryCode[],
      ownerId: String(configuration.owner_id),
      currentCoordinatorId: String(configuration.current_coordinator_id),
      coordinatorName: currentEventItem.coordinator_name || this.coordinatorIdentity.displayName,
      isOwnerAsMonitor: currentEventItem.is_read_only_monitor,
      pendingApplicationCount: summary.pending_count || 0,
      acceptedApplicantCount: summary.accepted_count || 0,
      assignedCount: summary.assignment_count || 0,
      checkedInCount: summary.checked_in_count || 0,
      latitude: toCoordinate(configuration.latitude),
      longitude: toCoordinate(configuration.longitude),
      geoRadiusM: configuration.geo_radius_m ?? 200,
      geoCheckinEnabled: configuration.geo_checkin_enabled,
      geoCheckinOpensBeforeMin: configuration.geo_checkin_opens_before_min,
      requireCheckinConfirmation: configuration.require_checkin_confirmation,
      mapProvider: configuration.map_provider,
      acceptanceMode: configuration.acceptance_mode,
      autoAssignEnabled: configuration.auto_assign_enabled,
      groupSize: configuration.group_size ?? undefined,
      leaderStrategy: configuration.leader_strategy,
      maxParticipants: configuration.max_participants ?? 0,
      mealsProvided: configuration.meals_provided,
      lodgingProvided: configuration.lodging_provided,
      travelSupportProvided: configuration.travel_support_provided,
      compensationKind: configuration.compensation_kind,
      compensationNote: configuration.compensation_note ?? undefined,
      onboardingText: configuration.onboarding_text ?? undefined,
      onboardingVersion: configuration.onboarding_version,
      requireOnboardingAck: configuration.require_onboarding_ack,
      qrRegistrationEnabled: configuration.qr_registration_enabled,
      posts: rawPosts.map(post => mapPublicEventPost(post, configuration.id)),
    };
  }

  public async createDraftEvent(
    draft: CreateEventWizardDraft,
  ): Promise<CoordinatorOperationResult<CoordinatorEventDetail>> {
    const payload = mapCreateEventDraftToRequest(draft);
    const res = await coordinatorApi.createEvent(payload, this.client);

    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    const created = await this.getEventDetail(String(res.data.id));
    return {
      success: true,
      message: 'Draft event created successfully',
      data: created ?? undefined,
    };
  }

  public async updateEvent(
    eventId: string,
    data: Partial<CreateEventWizardDraft>,
  ): Promise<CoordinatorOperationResult<CoordinatorEventDetail>> {
    const payload = mapEventUpdateDraftToRequest(data);
    const res = await coordinatorApi.updateEvent(eventId, payload, this.client);
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }
    const updated = await this.getEventDetail(eventId);
    return {
      success: true,
      message: 'Event updated successfully',
      data: updated ?? undefined,
    };
  }

  public async transitionEventStatus(
    eventId: string,
    targetStatus: CoordinatorEventStatus,
  ): Promise<CoordinatorOperationResult<CoordinatorEventDetail>> {
    let res;
    if (targetStatus === 'published') {
      res = await coordinatorApi.publishEvent(eventId, this.client);
    } else if (targetStatus === 'active') {
      res = await coordinatorApi.activateEvent(eventId, this.client);
    } else if (targetStatus === 'completed') {
      res = await coordinatorApi.completeEvent(eventId, this.client);
    } else if (targetStatus === 'cancelled') {
      res = await coordinatorApi.cancelEvent(
        eventId,
        'Cancelled by coordinator',
        this.client,
      );
    } else {
      return {
        success: false,
        message: `Unsupported event status transition to '${targetStatus}'.`,
      };
    }

    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    if (targetStatus === 'completed' || targetStatus === 'cancelled') {
      // Invalidate attendance and application cache for this event
      for (const [key, item] of this.applicationCache.entries()) {
        if (String(item.eventId) === String(eventId)) {
          this.applicationCache.delete(key);
        }
      }
      for (const [key, item] of this.attendanceCache.entries()) {
        if (String(item.eventId) === String(eventId)) {
          this.attendanceCache.delete(key);
        }
      }
      defaultDashboardRepository.removeCommitmentsForEvent(eventId);
    }

    appEventBus.emit(AppEvents.EVENT_STATUS_CHANGED, {
      eventId,
      status: targetStatus,
    });

    const updated = await this.getEventDetail(eventId);
    return {
      success: true,
      message: `Event transitioned to ${targetStatus}`,
      data: updated ?? undefined,
    };
  }

  public async handoverEvent(
    eventId: string,
    newCoordinatorUserId: string,
    reason: string = '',
  ): Promise<CoordinatorOperationResult> {
    const numericUserId = Number(newCoordinatorUserId);
    const res = await coordinatorApi.handoverEvent(
      eventId,
      isNaN(numericUserId) ? 0 : numericUserId,
      reason,
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
      message: 'Event handed over successfully',
    };
  }

  public async retakeEvent(
    eventId: string,
    reason: string = '',
  ): Promise<CoordinatorOperationResult> {
    const res = await coordinatorApi.retakeEvent(eventId, reason, this.client);
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }
    return {
      success: true,
      message: 'Event retaken successfully',
    };
  }

  public async createEventPost(
    eventId: string,
    post: {
      title: string;
      description?: string;
      requiredHeadcount: number;
      physicalLevel?: 'none' | 'light' | 'medium' | 'heavy';
      requiredSkills?: string[];
      leaderNeeded?: boolean;
      newVolunteersAllowed?: boolean;
      priority?: number;
    },
  ): Promise<CoordinatorOperationResult<{ id: string; status: PostStatus }>> {
    const res = await coordinatorApi.createEventPost(
      eventId,
      {
        title: post.title.trim(),
        description: post.description?.trim() || null,
        required_headcount: post.requiredHeadcount,
        physical_level: post.physicalLevel ?? 'light',
        required_skills: post.requiredSkills ?? [],
        leader_needed: post.leaderNeeded ?? false,
        new_volunteers_allowed: post.newVolunteersAllowed ?? true,
        priority: post.priority ?? 100,
      },
      this.client,
    );
    if (!res.ok) {
      return { success: false, message: res.error.message };
    }
    return {
      success: true,
      message: 'Post created successfully',
      data: { id: String(res.data.id), status: res.data.status as PostStatus },
    };
  }

  public async updateEventPost(
    postId: string,
    updates: {
      title?: string;
      description?: string;
      requiredHeadcount?: number;
      status?: 'open' | 'full' | 'closed';
      physicalLevel?: 'none' | 'light' | 'medium' | 'heavy';
      requiredSkills?: string[];
      leaderNeeded?: boolean;
      newVolunteersAllowed?: boolean;
      priority?: number;
    },
  ): Promise<CoordinatorOperationResult<{ id: string; status: PostStatus }>> {
    const res = await coordinatorApi.updateEventPost(
      postId,
      {
        title: updates.title?.trim(),
        description: updates.description?.trim(),
        required_headcount: updates.requiredHeadcount,
        status: updates.status,
        physical_level: updates.physicalLevel,
        required_skills: updates.requiredSkills,
        leader_needed: updates.leaderNeeded,
        new_volunteers_allowed: updates.newVolunteersAllowed,
        priority: updates.priority,
      },
      this.client,
    );
    if (!res.ok) {
      return { success: false, message: res.error.message };
    }
    return {
      success: true,
      message: 'Post updated successfully',
      data: { id: String(res.data.id), status: res.data.status as PostStatus },
    };
  }

  public async closeEventPost(
    postId: string,
  ): Promise<CoordinatorOperationResult<void>> {
    const res = await coordinatorApi.closeEventPost(postId, this.client);
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }
    return {
      success: true,
      message: 'Post closed successfully',
    };
  }

  public async getCoordinatorHistory(
    eventId: string,
  ): Promise<CoordinatorHistoryItem[]> {
    const res = await coordinatorApi.getCoordinatorHistory(eventId, this.client);
    if (!res.ok) {
      throw new Error(`Failed to load coordinator history: ${res.error.message}`);
    }
    const list = res.data.results || [];
    return list.map(mapCoordinatorHistoryItem);
  }

  public async getApplications(
    eventId?: string,
  ): Promise<CoordinatorApplicationItem[]> {
    if (eventId) {
      const res = await coordinatorApi.getApplications(
        eventId,
        undefined,
        this.client,
      );
      if (!res.ok) {
        throw new Error(`Failed to load applications: ${res.error.message}`);
      }
      const list: CoordinatorApplicationDto[] = res.data.results || [];
      const items = list.map(a => {
        const mapped = mapCoordinatorApplication(a, eventId);
        this.appToEventMap.set(mapped.id, String(eventId));
        this.applicationCache.set(mapped.id, mapped);
        return mapped;
      });
      return items;
    }

    // If no eventId, aggregate over coordinator's events
    const events = await this.getMyEvents();
    const appLists = await Promise.all(
      events.map(e => this.getApplications(e.id).catch(() => [])),
    );
    return appLists.flat();
  }

  public async updateApplicationStatus(
    applicationId: string,
    status: CoordinatorApplicationStatus,
  ): Promise<CoordinatorOperationResult<CoordinatorApplicationItem>> {
    const action =
      status === 'accepted'
        ? 'accept'
        : status === 'rejected'
        ? 'reject'
        : 'waitlist';

    const res = await coordinatorApi.decideApplication(
      applicationId,
      action,
      {},
      this.client,
    );

    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    // Merge updated status into cached application item or refetch from event
    let updatedItem = this.applicationCache.get(applicationId);
    if (updatedItem) {
      updatedItem = {
        ...updatedItem,
        status,
      };
      this.applicationCache.set(applicationId, updatedItem);
    } else {
      const eventId = this.appToEventMap.get(applicationId);
      if (eventId) {
        try {
          const apps = await this.getApplications(eventId);
          const found = apps.find(a => a.id === applicationId);
          if (found) {
            updatedItem = {
              ...found,
              status,
            };
            this.applicationCache.set(applicationId, updatedItem);
          }
        } catch {
          // Refetch failed
        }
      }
    }

    // Section 6.4: Return minimal typed mutation result from server; NEVER fabricate applicant details or timestamps
    if (!updatedItem) {
      const eventId = this.appToEventMap.get(applicationId) || '';
      updatedItem = {
        id: String(res.data.id || applicationId),
        eventId,
        status: (res.data.status as CoordinatorApplicationStatus) || status,
      };
      this.applicationCache.set(applicationId, updatedItem);
    }

    return {
      success: true,
      message: `Application ${status} successfully`,
      data: updatedItem,
    };
  }

  public async inviteVolunteer(
    eventId: string,
    volunteerUserId?: string | number,
    postId?: string | number,
    note?: string,
    volunteerUuid?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorApplicationItem>> {
    const normalizedUserId = volunteerUserId !== undefined && String(volunteerUserId).trim()
      ? Number(volunteerUserId)
      : undefined;
    if (normalizedUserId !== undefined && (!Number.isInteger(normalizedUserId) || normalizedUserId < 1)) {
      return { success: false, message: 'Volunteer user ID must be a positive whole number.' };
    }
    if (!normalizedUserId && !volunteerUuid?.trim()) {
      return { success: false, message: 'Provide either a volunteer user ID or UUID.' };
    }
    const res = await coordinatorApi.inviteVolunteer(
      eventId,
      {
        volunteer_user_id: normalizedUserId,
        volunteer_uuid: volunteerUuid?.trim() || undefined,
        post_id: postId ? Number(postId) : null,
        note: note || null,
      },
      this.client,
    );

    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    const item = mapCoordinatorApplication(res.data, eventId);
    this.applicationCache.set(item.id, item);
    this.appToEventMap.set(item.id, eventId);

    return {
      success: true,
      message: 'Volunteer invited successfully',
      data: item,
    };
  }

  public async getAssignments(
    eventId?: string,
  ): Promise<CoordinatorAssignmentItem[]> {
    if (eventId) {
      const res = await coordinatorApi.getAssignments(eventId, this.client);
      if (!res.ok) {
        throw new Error(`Failed to load assignments: ${res.error.message}`);
      }
      const list: CoordinatorAssignmentDto[] = res.data.results || [];
      return list.map(a => mapCoordinatorAssignment(a, eventId));
    }

    const events = await this.getMyEvents();
    const lists = await Promise.all(
      events.map(e => this.getAssignments(e.id).catch(() => [])),
    );
    return lists.flat();
  }

  public async getUnassignedApplications(
    eventId?: string,
  ): Promise<CoordinatorApplicationItem[]> {
    if (eventId) {
      const res = await coordinatorApi.getUnassignedApplications(
        eventId,
        this.client,
      );
      if (!res.ok) {
        throw new Error(
          `Failed to load unassigned applications: ${res.error.message}`,
        );
      }
      const list: CoordinatorApplicationDto[] = res.data.results || [];
      return list.map(a => {
        const mapped = mapCoordinatorApplication(a, eventId);
        this.appToEventMap.set(mapped.id, String(eventId));
        this.applicationCache.set(mapped.id, mapped);
        return mapped;
      });
    }

    const events = await this.getMyEvents();
    const lists = await Promise.all(
      events.map(e => this.getUnassignedApplications(e.id).catch(() => [])),
    );
    return lists.flat();
  }

  public async runAutoAssignment(
    eventId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAssignmentItem[]>> {
    const res = await coordinatorApi.runAutoAssignment(eventId, this.client);
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    const assignments = await this.getAssignments(eventId);
    return {
      success: true,
      message: 'Auto-assignment completed successfully',
      data: assignments,
    };
  }

  public async assignVolunteerManually(
    applicationId: string,
    postId: string,
    groupCode?: string,
    isGroupLeader?: boolean,
    eventIdOverride?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAssignmentItem>> {
    const eventId = eventIdOverride || this.appToEventMap.get(applicationId);
    if (!eventId) {
      return {
        success: false,
        message: 'Unable to determine event for volunteer assignment.',
      };
    }

    const numericPostId =
      !postId || !postId.trim() || isNaN(Number(postId)) || Number(postId) <= 0
        ? null
        : Number(postId);
    const res = await coordinatorApi.manualAssign(
      eventId,
      {
        application_id: Number(applicationId),
        post_id: numericPostId,
        group_code: groupCode ?? null,
        is_group_leader: isGroupLeader ?? false,
      },
      this.client,
    );

    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    // P1-03: Deterministically refetch assignments from server; do not fabricate fake assignment fallback
    const assignments = await this.getAssignments(eventId);
    const returnedAssignmentId =
      res.data.assignment_id != null
        ? String(res.data.assignment_id)
        : res.data.id != null
        ? String(res.data.id)
        : null;
    const created = assignments.find(
      a =>
        (returnedAssignmentId !== null && a.id === returnedAssignmentId) ||
        (Boolean(a.applicationId) && a.applicationId === applicationId),
    );

    if (created) {
      return {
        success: true,
        message: 'Volunteer assigned successfully',
        data: created,
      };
    }

    return {
      success: false,
      message:
        'Assignment succeeded on server but failed to synchronize updated assignment record.',
    };
  }

  public async cancelAssignment(
    assignmentId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAssignmentItem>> {
    const res = await eventApi.cancelAssignment(
      assignmentId,
      'Cancelled by coordinator',
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

  public async getAttendanceRoster(
    eventId?: string,
  ): Promise<CoordinatorAttendanceItem[]> {
    if (eventId) {
      const res = await coordinatorApi.getAttendanceRoster(
        eventId,
        this.client,
      );
      if (!res.ok) {
        throw new Error(
          `Failed to load attendance roster: ${res.error.message}`,
        );
      }
      const list: AttendanceRosterDto[] = res.data.results || [];
      const items = list.map(item => {
        const mapped = mapAttendanceRosterItem(item, eventId);
        this.attendanceCache.set(mapped.id, mapped);
        if (mapped.assignmentId) {
          this.attendanceCache.set(mapped.assignmentId, mapped);
        }
        return mapped;
      });
      return items;
    }

    const events = await this.getMyEvents();
    const lists = await Promise.all(
      events.map(e => this.getAttendanceRoster(e.id).catch(() => [])),
    );
    return lists.flat();
  }

  public async getPendingGeoConfirmations(
    eventId?: string,
  ): Promise<CoordinatorAttendanceItem[]> {
    if (eventId) {
      const res = await coordinatorApi.getPendingGeoConfirmations(
        eventId,
        this.client,
      );
      if (!res.ok) {
        throw new Error(
          `Failed to load pending geo confirmations: ${res.error.message}`,
        );
      }
      const list: AttendanceRosterDto[] = res.data.results || [];
      const items = list.map(item => {
        const mapped = mapAttendanceRosterItem(item, eventId);
        this.attendanceCache.set(mapped.id, mapped);
        if (mapped.assignmentId) {
          this.attendanceCache.set(mapped.assignmentId, mapped);
        }
        return mapped;
      });
      return items;
    }

    const events = await this.getMyEvents();
    const lists = await Promise.all(
      events.map(e => this.getPendingGeoConfirmations(e.id).catch(() => [])),
    );
    return lists.flat();
  }

  public async confirmGeoAttendance(
    attendanceId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>> {
    const res = await coordinatorApi.confirmAttendance(
      attendanceId,
      'Confirmed by coordinator',
      this.client,
    );
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    const cached = this.attendanceCache.get(attendanceId);
    if (cached) {
      cached.isPendingGeoConfirmation = false;
      cached.status = 'checked_in';
    }

    return {
      success: true,
      message: 'Geo attendance confirmed',
      data: cached,
    };
  }

  public async rejectGeoAttendance(
    attendanceId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>> {
    const res = await coordinatorApi.rejectAttendance(
      attendanceId,
      'Rejected by coordinator',
      this.client,
    );
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    const cached = this.attendanceCache.get(attendanceId);
    if (cached) {
      cached.isPendingGeoConfirmation = false;
      cached.status = 'scheduled';
      if (cached.geoAttempt) {
        cached.geoAttempt.confirmationStatus = 'rejected';
      }
    }

    return {
      success: true,
      message: 'Geo attendance rejected',
      data: cached,
    };
  }

  public async manualCheckIn(
    params: { eventId: string | number; volunteerUserId: string | number; note?: string },
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>>;
  public async manualCheckIn(
    eventId: string | number,
    volunteerUserId: string | number,
    note?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>>;
  public async manualCheckIn(
    attendanceId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>>;
  public async manualCheckIn(
    arg1: string | number | { eventId: string | number; volunteerUserId: string | number; note?: string },
    arg2?: string | number,
    arg3?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>> {
    let targetEventId: number | null = null;
    let targetUserId: number | null = null;
    let targetNote: string | undefined = undefined;
    let cachedRecord: CoordinatorAttendanceItem | undefined = undefined;

    if (typeof arg1 === 'object' && arg1 !== null && 'eventId' in arg1 && 'volunteerUserId' in arg1) {
      targetEventId = Number(arg1.eventId);
      targetUserId = Number(arg1.volunteerUserId);
      targetNote = arg1.note;
    } else if (arg2 !== undefined && arg2 !== null) {
      targetEventId = Number(arg1);
      targetUserId = Number(arg2);
      targetNote = arg3;
    } else {
      const attendanceId = String(arg1);
      cachedRecord = this.attendanceCache.get(attendanceId);
      if (!cachedRecord) {
        for (const item of this.attendanceCache.values()) {
          if (item.id === attendanceId || item.assignmentId === attendanceId) {
            cachedRecord = item;
            break;
          }
        }
      }

      if (!cachedRecord) {
        return {
          success: false,
          message: 'Attendance record not found in active roster cache.',
        };
      }

      targetEventId = Number(cachedRecord.eventId);
      targetUserId = Number(cachedRecord.userId);
      targetNote = 'Manual on-site check-in';
    }

    if (!targetEventId || isNaN(targetEventId) || !targetUserId || isNaN(targetUserId)) {
      return {
        success: false,
        message: 'Invalid event or volunteer user identifier for manual check-in.',
      };
    }

    // Call canonical BFF endpoint: POST /api/v1/checkin/attendance/manual-checkin/
    const res = await checkinApi.manualCheckIn(
      {
        event_id: targetEventId,
        user_id: targetUserId,
        note: targetNote ?? 'Manual on-site check-in',
      },
      this.client,
    );

    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    const data = res.data;
    const attendanceIdStr = String(data.attendance_id || data.id);

    // If item was in cache or can be found in cache
    if (!cachedRecord) {
      cachedRecord = this.attendanceCache.get(attendanceIdStr);
      if (!cachedRecord) {
        for (const item of this.attendanceCache.values()) {
          if (
            (item.id === attendanceIdStr || item.userId === String(targetUserId)) &&
            item.eventId === String(targetEventId)
          ) {
            cachedRecord = item;
            break;
          }
        }
      }
    }

    // If still not in local cache, deterministically refetch from server roster
    if (!cachedRecord) {
      try {
        const roster = await this.getAttendanceRoster(String(targetEventId));
        cachedRecord = roster.find(
          item =>
            item.id === attendanceIdStr ||
            item.userId === String(targetUserId),
        );
      } catch {
        // Roster refetch failed
      }
    }

    if (cachedRecord) {
      cachedRecord.status = (data.status as any) || 'checked_in';
      // Authoritative method from server: never overwrite qr_scan / geo to manual
      if (data.method) {
        cachedRecord.checkInMethod = (data.method as any);
      }
      // Authoritative server timestamp (never fabricated with new Date())
      cachedRecord.checkedInAt = data.checkin_at;
      // Do not clear pending geo confirmation unless verified by server
      if (data.status === 'checked_in' || data.status === 'completed') {
        cachedRecord.isPendingGeoConfirmation = false;
      }
    }

    // Section 6.4: Authoritative mutation result with real fields only;
    // never invent event title, volunteer name, post title, or assignment ID.
    const resultItem: CoordinatorAttendanceItem = cachedRecord
      ? { ...cachedRecord }
      : {
          id: attendanceIdStr,
          eventId: String(targetEventId),
          userId: String(targetUserId),
          status: (data.status as any) || 'checked_in',
          checkInMethod: (data.method as any) || 'coordinator_manual',
          checkedInAt: data.checkin_at,
          isPendingGeoConfirmation: false,
        };

    // Store in cache for subsequent lookups
    this.attendanceCache.set(resultItem.id, resultItem);
    this.attendanceCache.set(resultItem.userId, resultItem);

    return {
      success: true,
      message: data.already_checked_in
        ? 'Volunteer already checked in'
        : 'Volunteer checked in manually',
      data: resultItem,
    };
  }

  public async createQrToken(
    eventId: string,
    purpose: 'walkin_registration' | 'checkin' | 'join_event',
    maxUses?: number | null,
    ttlMinutes: number = 240,
  ): Promise<
    CoordinatorOperationResult<{
      id: number;
      rawToken: string;
      expiresAt: string;
    }>
  > {
    const res = await checkinApi.createCoordinatorQrToken(
      eventId,
      {
        purpose,
        max_uses: maxUses,
        ttl_minutes: ttlMinutes,
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
      message: 'QR token generated successfully',
      data: {
        id: res.data.id,
        rawToken: res.data.raw_token,
        expiresAt: res.data.expires_at,
      },
    };
  }

  public async revokeQrToken(
    qrId: string,
  ): Promise<CoordinatorOperationResult> {
    const res = await checkinApi.revokeCoordinatorQrToken(qrId, this.client);
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    return {
      success: true,
      message: 'QR token revoked successfully',
    };
  }

  public async getPostCapacity(
    eventId: string,
  ): Promise<EventPostCapacity[]> {
    const res = await coordinatorApi.getPostCapacity(eventId, this.client);
    if (!res.ok) {
      throw new Error(`Failed to load post capacity: ${res.error.message}`);
    }
    const list = res.data.results || [];
    return list.map(mapEventPostCapacity);
  }

  public async lookupVolunteerByUuid(
    uuid: string,
    eventId?: string,
  ): Promise<VolunteerUuidLookup> {
    const res = await profileApi.lookupUserByUuid(uuid, eventId, this.client);
    if (!res.ok) {
      throw new Error(`Failed to lookup volunteer by UUID: ${res.error.message}`);
    }
    return mapVolunteerUuidLookup(res.data);
  }

  public async getGeoAttempts(
    eventId: string,
  ): Promise<GeoAttemptReview[]> {
    const res = await checkinApi.getGeoAttempts(eventId, this.client);
    if (!res.ok) {
      throw new Error(`Failed to load geo attempts: ${res.error.message}`);
    }
    const list = res.data.results || [];
    return list.map(mapGeoAttemptReview);
  }

  public async submitCoordinatorFeedback(
    eventId: string,
    volunteerUserId: string | number,
    score: number,
    comment?: string,
    tags?: string[],
  ): Promise<CoordinatorOperationResult> {
    const res = await checkinApi.submitEventFeedback(
      eventId,
      {
        direction: 'coordinator_to_volunteer',
        target_user_id: Number(volunteerUserId),
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
      message: 'Coordinator feedback submitted successfully',
    };
  }
}

export const defaultHttpCoordinatorRepository = new HttpCoordinatorRepository();
