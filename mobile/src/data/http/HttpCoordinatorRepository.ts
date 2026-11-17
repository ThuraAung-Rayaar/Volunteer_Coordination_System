/**
 * @format
 */

import { ApiClient, defaultApiClient } from '../../core/api/apiClient';
import type {
  CoordinatorApplicationItem,
  CoordinatorApplicationStatus,
  CoordinatorAssignmentItem,
  CoordinatorAttendanceItem,
  CoordinatorEventDetail,
  CoordinatorEventStatus,
  CoordinatorEventSummary,
  CoordinatorOverviewMetrics,
  CreateEventWizardDraft,
  EventPurposeType,
} from '../../domain/models/coordinator';
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
  mapCreateEventDraftToRequest,
} from '../mappers/coordinatorMapper';
import { mapPublicEventPost } from '../mappers/eventMapper';
import type { PublicEventPostDto } from '../dto/eventDto';
import type { EventPost } from '../../domain/models/event';
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
      e => e.status === 'active' || e.status === 'published',
    ).length;
    const draftEventsCount = events.filter(e => e.status === 'draft').length;

    let pendingApplicationsCount = 0;
    let acceptedApplicantsCount = 0;
    let checkedInTodayCount = 0;

    for (const e of events) {
      pendingApplicationsCount += e.pendingApplicationCount || 0;
      acceptedApplicantsCount += e.acceptedApplicantCount || 0;
      checkedInTodayCount += e.checkedInCount || 0;
    }

    return {
      totalEventsCount,
      activeEventsCount,
      draftEventsCount,
      pendingApplicationsCount,
      acceptedApplicantsCount,
      checkedInTodayCount,
    };
  }

  public async getEventDetail(
    eventId: string,
  ): Promise<CoordinatorEventDetail | null> {
    const [summaryRes, postsRes, eventsRes, publicDetailRes] = await Promise.all([
      coordinatorApi.getEventSummary(eventId, this.client),
      coordinatorApi.getEventPosts(eventId, this.client).catch(() => null),
      coordinatorApi.getMyEvents(this.client).catch(() => null),
      eventApi.getEventDetail(eventId, this.client).catch(() => null),
    ]);

    if (!summaryRes.ok) {
      if (summaryRes.status === 404) {
        return null;
      }
      throw new Error(`Failed to load event detail: ${summaryRes.error.message}`);
    }

    const summary = summaryRes.data;
    const events: CoordinatorEventListItemDto[] =
      eventsRes && eventsRes.ok && eventsRes.data?.results ? eventsRes.data.results : [];
    const currentEventItem = events.find(e => String(e.id) === String(eventId));

    const publicDetail =
      publicDetailRes && publicDetailRes.ok ? publicDetailRes.data : null;

    let rawPosts: PublicEventPostDto[] = [];
    if (publicDetail?.posts && Array.isArray(publicDetail.posts) && publicDetail.posts.length > 0) {
      rawPosts = publicDetail.posts;
    } else if (postsRes && postsRes.ok) {
      rawPosts = Array.isArray(postsRes.data)
        ? postsRes.data
        : postsRes.data?.results || [];
    }

    const isMonitor = currentEventItem?.is_read_only_monitor ?? false;

    return {
      id: String(summary.id),
      title: publicDetail?.title || summary.title,
      description: publicDetail?.description || '',
      status:
        (publicDetail?.status as CoordinatorEventStatus) ||
        (summary.status as CoordinatorEventStatus) ||
        'draft',
      purposeType:
        (publicDetail?.purpose_type as EventPurposeType) || 'charity_event',
      startAt: publicDetail?.start_at || summary.start_at,
      endAt: publicDetail?.end_at || summary.end_at,
      applicationDeadline: publicDetail?.application_deadline ?? undefined,
      locationName: publicDetail?.location_name || 'Designated Location',
      landmarkText: publicDetail?.landmark_text ?? undefined,
      charityFields: (publicDetail?.charity_fields as any[]) || [],
      ownerId: currentEventItem ? String(currentEventItem.owner_id) : this.coordinatorIdentity.id,
      currentCoordinatorId: currentEventItem ? String(currentEventItem.current_coordinator_id) : this.coordinatorIdentity.id,
      coordinatorName: publicDetail?.coordinator_name || this.coordinatorIdentity.displayName,
      isOwnerAsMonitor: isMonitor,
      pendingApplicationCount: summary.pending_count || 0,
      acceptedApplicantCount: summary.accepted_count || 0,
      assignedCount: summary.assignment_count || 0,
      checkedInCount: summary.checked_in_count || 0,
      latitude: typeof publicDetail?.latitude === 'number'
        ? publicDetail.latitude
        : parseFloat(String(publicDetail?.latitude || 0)) || 0,
      longitude: typeof publicDetail?.longitude === 'number'
        ? publicDetail.longitude
        : parseFloat(String(publicDetail?.longitude || 0)) || 0,
      geoRadiusM: publicDetail?.geo_radius_m ?? 200,
      geoCheckinEnabled: publicDetail?.geo_checkin_enabled ?? summary.geo_checkin_enabled ?? true,
      geoCheckinOpensBeforeMin: 30,
      requireCheckinConfirmation: summary.pending_confirmations > 0,
      mapProvider: publicDetail?.map_provider || summary.map_provider || 'openstreetmap',
      acceptanceMode: (publicDetail?.acceptance_mode as any) || (summary.acceptance_mode as any) || 'manual',
      autoAssignEnabled: summary.auto_assign_enabled ?? false,
      leaderStrategy: 'none',
      maxParticipants: publicDetail?.max_participants ?? summary.max_participants ?? 0,
      mealsProvided: Boolean(publicDetail?.meals_provided),
      lodgingProvided: Boolean(publicDetail?.lodging_provided),
      travelSupportProvided: Boolean(publicDetail?.travel_support_provided),
      compensationKind: (publicDetail?.compensation_kind as any) || 'unpaid',
      compensationNote: publicDetail?.compensation_note ?? undefined,
      onboardingText: publicDetail?.onboarding_text ?? undefined,
      onboardingVersion: publicDetail?.onboarding_version ?? 1,
      requireOnboardingAck: false,
      qrRegistrationEnabled: false,
      posts: rawPosts.map(p => mapPublicEventPost(p, summary.id)),
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
    const payload = mapCreateEventDraftToRequest(data as CreateEventWizardDraft);
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
      requiredHeadcount: number;
      physicalLevel?: string;
      requiredSkills?: string[];
      leaderNeeded?: boolean;
      newVolunteersAllowed?: boolean;
    },
  ): Promise<CoordinatorOperationResult<EventPost>> {
    const res = await coordinatorApi.createEventPost(
      eventId,
      {
        title: post.title,
        required_headcount: post.requiredHeadcount,
        physical_level: (post.physicalLevel as any) || 'light',
        required_skills: post.requiredSkills || [],
        leader_needed: post.leaderNeeded ?? false,
        new_volunteers_allowed: post.newVolunteersAllowed ?? true,
      },
      this.client,
    );
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }
    const createdPost: EventPost = {
      id: String(res.data.id),
      eventId,
      title: post.title,
      requiredHeadcount: post.requiredHeadcount,
      filledHeadcount: 0,
      remainingCapacity: post.requiredHeadcount,
      physicalLevel: (post.physicalLevel as any) || 'light',
      requiredSkills: post.requiredSkills || [],
      leaderNeeded: post.leaderNeeded ?? false,
      newVolunteersAllowed: post.newVolunteersAllowed ?? true,
      status: 'open',
    };
    return {
      success: true,
      message: 'Post created successfully',
      data: createdPost,
    };
  }

  public async updateEventPost(
    postId: string,
    updates: {
      requiredHeadcount?: number;
      status?: string;
      physicalLevel?: string;
      requiredSkills?: string[];
    },
  ): Promise<CoordinatorOperationResult<EventPost>> {
    const res = await coordinatorApi.updateEventPost(
      postId,
      {
        required_headcount: updates.requiredHeadcount,
        status: (updates.status as any) || undefined,
        physical_level: (updates.physicalLevel as any) || undefined,
        required_skills: updates.requiredSkills,
      },
      this.client,
    );
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }
    const updatedPost: EventPost = {
      id: postId,
      eventId: '',
      title: 'Event Post',
      requiredHeadcount: updates.requiredHeadcount ?? 1,
      filledHeadcount: 0,
      remainingCapacity: updates.requiredHeadcount ?? 1,
      physicalLevel: (updates.physicalLevel as any) || 'light',
      requiredSkills: updates.requiredSkills || [],
      leaderNeeded: false,
      newVolunteersAllowed: true,
      status: (updates.status as any) || 'open',
    };
    return {
      success: true,
      message: 'Post updated successfully',
      data: updatedPost,
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
  ): Promise<CoordinatorHistoryItemDto[]> {
    const res = await coordinatorApi.getCoordinatorHistory(eventId, this.client);
    if (!res.ok) {
      throw new Error(`Failed to load coordinator history: ${res.error.message}`);
    }
    return res.data.results || [];
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

    // P0-02: Merge updated status into cached application item or refetch from event
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
        const apps = await this.getApplications(eventId);
        updatedItem = apps.find(a => a.id === applicationId);
      }
    }

    if (!updatedItem) {
      updatedItem = {
        id: applicationId,
        eventId: this.appToEventMap.get(applicationId) || '',
        eventTitle: 'Volunteer Event',
        userId: '88',
        applicantName: 'Volunteer Applicant',
        status,
        source: 'browse',
        appliedAt: new Date().toISOString(),
      };
    }

    return {
      success: true,
      message: `Application ${status} successfully`,
      data: updatedItem,
    };
  }

  public async inviteVolunteer(
    eventId: string,
    volunteerUserId: string | number,
    postId?: string | number,
    note?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorApplicationItem>> {
    const res = await coordinatorApi.inviteVolunteer(
      eventId,
      {
        volunteer_user_id: Number(volunteerUserId),
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
  ): Promise<CoordinatorOperationResult<CoordinatorAssignmentItem>> {
    let eventId = this.appToEventMap.get(applicationId);
    if (!eventId) {
      const events = await this.getMyEvents();
      if (events.length > 0) {
        eventId = events[0].id;
      } else {
        return {
          success: false,
          message: 'Unable to determine event for volunteer assignment.',
        };
      }
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

    // P0-03: Call this.getAssignments(eventId) and return newly created CoordinatorAssignmentItem
    const assignments = await this.getAssignments(eventId);
    const created = assignments.find(
      a =>
        a.id === String(res.data.assignment_id) ||
        a.applicationId === applicationId,
    );

    if (created) {
      return {
        success: true,
        message: 'Volunteer assigned successfully',
        data: created,
      };
    }

    const fallbackItem: CoordinatorAssignmentItem = {
      id: String(res.data.assignment_id),
      eventId,
      eventTitle: 'Coordinator Event',
      applicationId,
      userId: '',
      volunteerName: 'Assigned Volunteer',
      postId,
      postTitle: 'Assigned Post',
      groupCode: groupCode ?? undefined,
      isGroupLeader: isGroupLeader ?? false,
      status: 'assigned',
      assignedAt: new Date().toISOString(),
    };

    return {
      success: true,
      message: 'Volunteer assigned successfully',
      data: fallbackItem,
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
        this.attendanceCache.set(mapped.assignmentId, mapped);
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
        this.attendanceCache.set(mapped.assignmentId, mapped);
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
    attendanceId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>> {
    let record = this.attendanceCache.get(attendanceId);
    if (!record) {
      for (const item of this.attendanceCache.values()) {
        if (item.id === attendanceId || item.assignmentId === attendanceId) {
          record = item;
          break;
        }
      }
    }

    if (!record) {
      return {
        success: false,
        message: 'Attendance record not found in active roster cache.',
      };
    }

    const res = await coordinatorApi.manualCheckIn(
      {
        event_id: Number(record.eventId),
        user_id: Number(record.userId),
        note: 'Manual on-site check-in',
      },
      this.client,
    );

    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    record.status = 'checked_in';
    record.checkInMethod = 'manual';
    record.checkedInAt = new Date().toISOString();
    record.isPendingGeoConfirmation = false;

    return {
      success: true,
      message: 'Volunteer checked in manually',
      data: record,
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
  ): Promise<EventPostCapacityDto[]> {
    const res = await coordinatorApi.getPostCapacity(eventId, this.client);
    if (!res.ok) {
      throw new Error(`Failed to load post capacity: ${res.error.message}`);
    }
    return res.data.results || [];
  }

  public async lookupVolunteerByUuid(
    uuid: string,
    eventId?: string,
  ): Promise<UserUuidLookupDto> {
    const res = await profileApi.lookupUserByUuid(uuid, eventId, this.client);
    if (!res.ok) {
      throw new Error(`Failed to lookup volunteer by UUID: ${res.error.message}`);
    }
    return res.data;
  }

  public async getGeoAttempts(
    eventId: string,
  ): Promise<GeoAttemptReviewDto[]> {
    const res = await checkinApi.getGeoAttempts(eventId, this.client);
    if (!res.ok) {
      throw new Error(`Failed to load geo attempts: ${res.error.message}`);
    }
    return res.data.results || [];
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
