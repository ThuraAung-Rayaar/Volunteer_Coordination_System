/**
 * @format
 */

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
  GeoAttemptReview,
  VolunteerUuidLookup,
} from '../../domain/models/coordinator';
import type {
  CoordinatorOperationResult,
  CoordinatorRepository,
} from '../contracts/coordinatorRepository';
import type { EventPost } from '../../domain/models/event';
import { approvedCoordinatorUser } from './fixtures/demoUsers';
import {
  Clock,
  createCoordinatorApplicationsFixture,
  createCoordinatorAssignmentsFixture,
  createCoordinatorAttendanceFixture,
  createCoordinatorEventsFixture,
  createCoordinatorMetricsFixture,
  createSequentialIdGenerator,
  deepClone,
  IdGenerator,
} from './mockUtils';
import { defaultEventRepository } from './MockEventRepository';
import { defaultDashboardRepository } from './MockDashboardRepository';
import { appEventBus, AppEvents } from '../../core/events/eventBus';

export interface MockCoordinatorIdentity {
  id: string;
  displayName: string;
  email?: string;
}

export interface MockCoordinatorRepositoryOptions {
  coordinatorIdentity?: MockCoordinatorIdentity;
  idGenerator?: IdGenerator;
  clock?: Clock;
}

export class MockCoordinatorRepository implements CoordinatorRepository {
  private events: CoordinatorEventDetail[];
  private metrics: CoordinatorOverviewMetrics;
  private applications: CoordinatorApplicationItem[];
  private assignments: CoordinatorAssignmentItem[];
  private attendance: CoordinatorAttendanceItem[];
  private qrTokens: Map<number, { eventId: string; rawToken: string; expiresAt: string }>;
  private nextQrTokenId: number;
  private coordinatorIdentity: MockCoordinatorIdentity;
  private idGenerator: IdGenerator;
  private clock: Clock;

  constructor(
    initialEvents: CoordinatorEventDetail[] = createCoordinatorEventsFixture(),
    initialMetrics: CoordinatorOverviewMetrics = createCoordinatorMetricsFixture(),
    initialApplications: CoordinatorApplicationItem[] = createCoordinatorApplicationsFixture(),
    initialAssignments: CoordinatorAssignmentItem[] = createCoordinatorAssignmentsFixture(),
    initialAttendance: CoordinatorAttendanceItem[] = createCoordinatorAttendanceFixture(),
    options?: MockCoordinatorRepositoryOptions,
  ) {
    this.events = deepClone(initialEvents);
    this.metrics = deepClone(initialMetrics);
    this.applications = deepClone(initialApplications);
    this.assignments = deepClone(initialAssignments);
    this.attendance = deepClone(initialAttendance);
    this.qrTokens = new Map();
    this.nextQrTokenId = 1001;
    this.coordinatorIdentity = options?.coordinatorIdentity
      ? { ...options.coordinatorIdentity }
      : {
          id: approvedCoordinatorUser.id,
          displayName: approvedCoordinatorUser.displayName,
          email: approvedCoordinatorUser.email,
        };
    this.idGenerator = options?.idGenerator ?? createSequentialIdGenerator(1000);
    this.clock = options?.clock ?? (() => new Date());
  }

  public reset(
    events?: CoordinatorEventDetail[],
    metrics?: CoordinatorOverviewMetrics,
    applications?: CoordinatorApplicationItem[],
    assignments?: CoordinatorAssignmentItem[],
    attendance?: CoordinatorAttendanceItem[],
    options?: MockCoordinatorRepositoryOptions,
  ): void {
    this.events = deepClone(events ?? createCoordinatorEventsFixture());
    this.metrics = deepClone(metrics ?? createCoordinatorMetricsFixture());
    this.applications = deepClone(
      applications ?? createCoordinatorApplicationsFixture(),
    );
    this.assignments = deepClone(
      assignments ?? createCoordinatorAssignmentsFixture(),
    );
    this.attendance = deepClone(
      attendance ?? createCoordinatorAttendanceFixture(),
    );
    this.qrTokens.clear();
    this.nextQrTokenId = 1001;
    if (options?.coordinatorIdentity) {
      this.coordinatorIdentity = { ...options.coordinatorIdentity };
    }
    if (options?.idGenerator) {
      this.idGenerator = options.idGenerator;
    } else {
      this.idGenerator = createSequentialIdGenerator(1000);
    }
    if (options?.clock) {
      this.clock = options.clock;
    }
  }

  public seed(data: {
    events?: CoordinatorEventDetail[];
    metrics?: CoordinatorOverviewMetrics;
    applications?: CoordinatorApplicationItem[];
    assignments?: CoordinatorAssignmentItem[];
    attendance?: CoordinatorAttendanceItem[];
    coordinatorIdentity?: MockCoordinatorIdentity;
    idGenerator?: IdGenerator;
    clock?: Clock;
  }): void {
    this.reset(
      data.events,
      data.metrics,
      data.applications,
      data.assignments,
      data.attendance,
      {
        coordinatorIdentity: data.coordinatorIdentity,
        idGenerator: data.idGenerator,
        clock: data.clock,
      },
    );
  }

  public setCoordinatorIdentity(identity: MockCoordinatorIdentity): void {
    this.coordinatorIdentity = { ...identity };
  }

  public getCoordinatorIdentity(): MockCoordinatorIdentity {
    return { ...this.coordinatorIdentity };
  }

  public setIdGenerator(idGenerator: IdGenerator): void {
    this.idGenerator = idGenerator;
  }

  public setClock(clock: Clock): void {
    this.clock = clock;
  }

  public async getOverviewMetrics(): Promise<CoordinatorOverviewMetrics> {
    return deepClone(this.metrics);
  }

  public async getMyEvents(): Promise<CoordinatorEventSummary[]> {
    return this.events.map(e => ({
      id: e.id,
      title: e.title,
      description: e.description,
      status: e.status,
      purposeType: e.purposeType,
      startAt: e.startAt,
      endAt: e.endAt,
      locationName: e.locationName,
      landmarkText: e.landmarkText,
      charityFields: [...e.charityFields],
      ownerId: e.ownerId,
      currentCoordinatorId: e.currentCoordinatorId,
      coordinatorName: e.coordinatorName,
      isOwnerAsMonitor: e.isOwnerAsMonitor,
      pendingApplicationCount: e.pendingApplicationCount,
      acceptedApplicantCount: e.acceptedApplicantCount,
      assignedCount: e.assignedCount,
      checkedInCount: e.checkedInCount,
    }));
  }

  public async getEventDetail(
    eventId: string,
  ): Promise<CoordinatorEventDetail | null> {
    const found = this.events.find(e => e.id === eventId);
    if (!found) {
      return null;
    }
    return deepClone(found);
  }

  public async createDraftEvent(
    draft: CreateEventWizardDraft,
  ): Promise<CoordinatorOperationResult<CoordinatorEventDetail>> {
    // 1. Validate charity categories count (must be between 1 and 3)
    if (
      !draft.charityFieldCodes ||
      draft.charityFieldCodes.length < 1 ||
      draft.charityFieldCodes.length > 3
    ) {
      return {
        success: false,
        message: 'Ensure between 1 and 3 charity fields are provided.',
      };
    }

    // 2. Validate schedule: end must be later than start
    const startTime = new Date(draft.startAt).getTime();
    const endTime = new Date(draft.endAt).getTime();
    if (isNaN(startTime) || isNaN(endTime) || endTime <= startTime) {
      return {
        success: false,
        message: 'Event end time must be later than start time.',
      };
    }

    if (draft.applicationDeadline) {
      const deadlineTime = new Date(draft.applicationDeadline).getTime();
      if (!isNaN(deadlineTime) && deadlineTime > startTime) {
        return {
          success: false,
          message:
            'Application deadline must be on or before the event start time.',
        };
      }
    }

    // 3. Validate geoRadius contract: 20 to 5000 meters
    if (
      draft.geoRadiusM !== undefined &&
      (draft.geoRadiusM < 20 || draft.geoRadiusM > 5000)
    ) {
      return {
        success: false,
        message: 'Geofence radius must be between 20 and 5000 meters.',
      };
    }

    // 4. Create draft/published event using dynamic coordinator fixture identity
    const isPublished = Boolean(draft.publish);
    const generatedEventId = this.idGenerator(isPublished ? 'evt-pub' : 'evt-draft');
    const newEvent: CoordinatorEventDetail = {
      id: generatedEventId,
      title: draft.title.trim(),
      description: draft.description?.trim() ?? '',
      status: isPublished ? 'published' : 'draft',
      purposeType: draft.purposeType,
      startAt: draft.startAt,
      endAt: draft.endAt,
      applicationDeadline: draft.applicationDeadline,
      locationName: draft.locationName.trim(),
      landmarkText: draft.landmarkText?.trim(),
      charityFields: [...draft.charityFieldCodes],
      ownerId: this.coordinatorIdentity.id,
      currentCoordinatorId: this.coordinatorIdentity.id,
      coordinatorName: this.coordinatorIdentity.displayName,
      isOwnerAsMonitor: false,
      pendingApplicationCount: 0,
      acceptedApplicantCount: 0,
      assignedCount: 0,
      checkedInCount: 0,
      latitude: draft.latitude,
      longitude: draft.longitude,
      geoRadiusM: draft.geoRadiusM,
      geoCheckinEnabled: draft.geoCheckinEnabled,
      geoCheckinOpensBeforeMin: draft.geoCheckinOpensBeforeMin,
      requireCheckinConfirmation: draft.requireCheckinConfirmation,
      mapProvider: draft.mapProvider,
      acceptanceMode: draft.acceptanceMode,
      autoAssignEnabled: draft.autoAssignEnabled,
      groupSize: draft.groupSize,
      leaderStrategy: draft.leaderStrategy,
      maxParticipants: draft.maxParticipants,
      mealsProvided: draft.mealsProvided,
      lodgingProvided: draft.lodgingProvided,
      travelSupportProvided: draft.travelSupportProvided,
      compensationKind: draft.compensationKind,
      compensationNote: draft.compensationNote?.trim(),
      onboardingText: draft.onboardingText?.trim(),
      onboardingVersion: 1, // Forced to 1
      requireOnboardingAck: draft.requireOnboardingAck,
      qrRegistrationEnabled: draft.qrRegistrationEnabled,
      posts: isPublished
        ? [
            {
              id: this.idGenerator('post'),
              eventId: generatedEventId,
              title: 'General Volunteer',
              description: draft.description?.trim() || 'General volunteer support role',
              requiredHeadcount: draft.maxParticipants || 10,
              filledHeadcount: 0,
              remainingCapacity: draft.maxParticipants || 10,
              physicalLevel: 'light',
              requiredSkills: [],
              leaderNeeded: false,
              newVolunteersAllowed: true,
              status: 'open',
            },
          ]
        : [],
    };

    this.events.unshift(newEvent);
    this.metrics.totalEventsCount += 1;
    if (isPublished) {
      this.metrics.activeEventsCount += 1;
    } else {
      this.metrics.draftEventsCount += 1;
    }

    return {
      success: true,
      message: 'Demo only — not submitted to server',
      data: deepClone(newEvent),
    };
  }

  public async updateEvent(
    eventId: string,
    data: Partial<CreateEventWizardDraft>,
  ): Promise<CoordinatorOperationResult<CoordinatorEventDetail>> {
    const event = this.events.find(e => e.id === eventId);
    if (!event) {
      return {
        success: false,
        message: 'Event not found',
      };
    }
    if (event.isOwnerAsMonitor) {
      return {
        success: false,
        message: 'Event editing is disabled in read-only monitor mode.',
      };
    }
    if (event.status === 'completed' || event.status === 'cancelled') {
      return {
        success: false,
        message: 'Finalized events cannot be edited.',
      };
    }

    if (data.title !== undefined) event.title = data.title.trim();
    if (data.description !== undefined) event.description = data.description?.trim() ?? '';
    if (data.purposeType !== undefined) event.purposeType = data.purposeType;
    if (data.charityFieldCodes !== undefined) event.charityFields = [...data.charityFieldCodes];
    if (data.locationName !== undefined) event.locationName = data.locationName.trim();
    if (data.landmarkText !== undefined) event.landmarkText = data.landmarkText?.trim() || undefined;
    if (data.latitude !== undefined) event.latitude = data.latitude;
    if (data.longitude !== undefined) event.longitude = data.longitude;
    if (data.geoRadiusM !== undefined) event.geoRadiusM = data.geoRadiusM;
    if (data.geoCheckinEnabled !== undefined) event.geoCheckinEnabled = data.geoCheckinEnabled;
    if (data.geoCheckinOpensBeforeMin !== undefined) event.geoCheckinOpensBeforeMin = data.geoCheckinOpensBeforeMin;
    if (data.requireCheckinConfirmation !== undefined) event.requireCheckinConfirmation = data.requireCheckinConfirmation;
    if (data.mapProvider !== undefined) event.mapProvider = data.mapProvider;
    if (data.startAt !== undefined) event.startAt = data.startAt;
    if (data.endAt !== undefined) event.endAt = data.endAt;
    if (data.applicationDeadline !== undefined) event.applicationDeadline = data.applicationDeadline ?? undefined;
    if (data.acceptanceMode !== undefined) event.acceptanceMode = data.acceptanceMode;
    if (data.autoAssignEnabled !== undefined) event.autoAssignEnabled = data.autoAssignEnabled;
    if (data.groupSize !== undefined) event.groupSize = data.groupSize ?? undefined;
    if (data.leaderStrategy !== undefined) event.leaderStrategy = data.leaderStrategy;
    if (data.maxParticipants !== undefined) event.maxParticipants = data.maxParticipants ?? undefined;
    if (data.mealsProvided !== undefined) event.mealsProvided = data.mealsProvided;
    if (data.lodgingProvided !== undefined) event.lodgingProvided = data.lodgingProvided;
    if (data.travelSupportProvided !== undefined) event.travelSupportProvided = data.travelSupportProvided;
    if (data.compensationKind !== undefined) event.compensationKind = data.compensationKind;
    if (data.compensationNote !== undefined) event.compensationNote = data.compensationNote?.trim() || undefined;
    if (data.onboardingText !== undefined && (data.onboardingText?.trim() ?? '') !== (event.onboardingText ?? '')) {
      event.onboardingText = data.onboardingText?.trim() || undefined;
      event.onboardingVersion = (event.onboardingVersion || 1) + 1;
    }
    if (data.requireOnboardingAck !== undefined) event.requireOnboardingAck = data.requireOnboardingAck;
    if (data.qrRegistrationEnabled !== undefined) event.qrRegistrationEnabled = data.qrRegistrationEnabled;
    return {
      success: true,
      message: 'Demo only — not submitted to server',
      data: deepClone(event),
    };
  }

  public async transitionEventStatus(
    eventId: string,
    targetStatus: CoordinatorEventStatus,
  ): Promise<CoordinatorOperationResult<CoordinatorEventDetail>> {
    const event = this.events.find(e => e.id === eventId);
    if (!event) {
      return {
        success: false,
        message: 'Event not found',
      };
    }

    // Owner-as-monitor guard: writes and transitions are disabled
    if (event.isOwnerAsMonitor) {
      return {
        success: false,
        message:
          'Action disabled in read-only monitor mode. Coordination is held by another coordinator.',
      };
    }

    // Lifecycle state machine validation
    const current = event.status;
    const allowed = getAllowedTransitions(current);
    if (!allowed.includes(targetStatus)) {
      return {
        success: false,
        message: `Invalid transition from ${current} to ${targetStatus}`,
      };
    }

    event.status = targetStatus;

    if (targetStatus === 'completed' || targetStatus === 'cancelled') {
      this.assignments.forEach(a => {
        if (a.eventId === eventId) {
          if (
            targetStatus === 'completed' &&
            (a.status === 'assigned' || a.status === 'confirmed')
          ) {
            a.status = 'completed';
          } else if (targetStatus === 'cancelled') {
            a.status = 'cancelled';
          }
        }
      });

      this.applications.forEach(a => {
        if (
          a.eventId === eventId &&
          (a.status === 'pending' || a.status === 'waitlisted')
        ) {
          a.status = 'expired';
        }
      });

      defaultEventRepository.syncEventStatus(eventId, targetStatus, event);
      defaultDashboardRepository.removeCommitmentsForEvent(eventId);
    }

    appEventBus.emit(AppEvents.EVENT_STATUS_CHANGED, {
      eventId,
      status: targetStatus,
    });

    return {
      success: true,
      message: 'Demo only — not submitted to server',
      data: deepClone(event),
    };
  }

  public async getApplications(
    eventId?: string,
  ): Promise<CoordinatorApplicationItem[]> {
    const list = eventId
      ? this.applications.filter(a => a.eventId === eventId)
      : this.applications;
    return deepClone(list);
  }

  public async updateApplicationStatus(
    applicationId: string,
    status: CoordinatorApplicationStatus,
  ): Promise<CoordinatorOperationResult<CoordinatorApplicationItem>> {
    const app = this.applications.find(a => a.id === applicationId);
    if (!app) {
      return {
        success: false,
        message: 'Application not found',
      };
    }

    const event = this.events.find(e => e.id === app.eventId);
    if (event?.isOwnerAsMonitor) {
      return {
        success: false,
        message:
          'Action disabled in read-only monitor mode. Coordination is held by another coordinator.',
      };
    }

    app.status = status;

    // Enforce privacy rule: T2 capabilities appear only for accepted applicants
    if (status === 'accepted') {
      if (!app.t2Capabilities) {
        app.t2Capabilities = {
          skills: ['general_assistance', 'community_outreach'],
          physicalOk: true,
          goodEyesight: true,
          needsGlasses: false,
          canLiftHeavy: false,
          canWorkOutdoor: true,
          hasLeaderExperience: false,
          newToVolunteer: false,
          preferredLanguage: 'my',
          homeArea: 'Yangon',
          needsMealSupport: true,
          needsTravelSupport: false,
          acceptsUnpaid: true,
          verificationStatus: 'verified',
        };
      }
    } else {
      // Remove T2 semi-private capabilities for pending/waitlisted/rejected applicants
      delete app.t2Capabilities;
    }

    return {
      success: true,
      message: 'Demo only — not submitted to server',
      data: deepClone(app),
    };
  }

  public async getAssignments(
    eventId?: string,
  ): Promise<CoordinatorAssignmentItem[]> {
    const list = eventId
      ? this.assignments.filter(a => a.eventId === eventId)
      : this.assignments;
    return deepClone(list);
  }

  public async getUnassignedApplications(
    eventId?: string,
  ): Promise<CoordinatorApplicationItem[]> {
    const acceptedApps = this.applications.filter(
      a =>
        a.status === 'accepted' &&
        (!eventId || a.eventId === eventId) &&
        !this.assignments.some(
          asg => asg.applicationId === a.id && asg.status !== 'cancelled',
        ),
    );
    return deepClone(acceptedApps);
  }

  public async runAutoAssignment(
    eventId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAssignmentItem[]>> {
    const event = this.events.find(e => e.id === eventId);
    if (!event) {
      return {
        success: false,
        message: 'Event not found',
      };
    }

    if (event.isOwnerAsMonitor) {
      return {
        success: false,
        message:
          'Action disabled in read-only monitor mode. Coordination is held by another coordinator.',
      };
    }

    const unassigned = await this.getUnassignedApplications(eventId);
    if (unassigned.length === 0) {
      return {
        success: true,
        message: 'All accepted volunteers are already assigned.',
        data: [],
      };
    }

    const created: CoordinatorAssignmentItem[] = [];
    unassigned.forEach((app, index) => {
      const newAsg: CoordinatorAssignmentItem = {
        id: this.idGenerator('asg-auto'),
        eventId: app.eventId,
        eventTitle: app.eventTitle || 'Volunteer Event',
        applicationId: app.id,
        userId: app.userId || '',
        volunteerName: app.applicantName || 'Volunteer',
        postId: app.postId ?? 'post-default',
        postTitle: app.postTitle ?? 'General Volunteer Support',
        status: 'assigned',
        groupCode: `GRP-${String.fromCharCode(65 + (index % 3))}`,
        isGroupLeader: index === 0,
        assignedAt: this.clock().toISOString(),
      };
      this.assignments.push(newAsg);
      created.push(newAsg);
    });

    event.assignedCount += created.length;

    return {
      success: true,
      message: 'Demo only — not submitted to server',
      data: deepClone(created),
    };
  }

  public async assignVolunteerManually(
    applicationId: string,
    postId: string,
    groupCode = 'GRP-MANUAL',
    isGroupLeader = false,
  ): Promise<CoordinatorOperationResult<CoordinatorAssignmentItem>> {
    const app = this.applications.find(a => a.id === applicationId);
    if (!app) {
      return {
        success: false,
        message: 'Application not found',
      };
    }

    const event = this.events.find(e => e.id === app.eventId);
    if (event?.isOwnerAsMonitor) {
      return {
        success: false,
        message:
          'Action disabled in read-only monitor mode. Coordination is held by another coordinator.',
      };
    }

    if (app.status !== 'accepted') {
      return {
        success: false,
        message: 'Only accepted applicants may be assigned to posts.',
      };
    }

    const newAsg: CoordinatorAssignmentItem = {
      id: this.idGenerator('asg-manual'),
      eventId: app.eventId,
      eventTitle: app.eventTitle || 'Volunteer Event',
      applicationId: app.id,
      userId: app.userId || '',
      volunteerName: app.applicantName || 'Volunteer',
      postId: postId,
      postTitle: app.postTitle ?? 'Volunteer Post',
      status: 'assigned',
      groupCode,
      isGroupLeader,
      assignedAt: this.clock().toISOString(),
    };

    this.assignments.push(newAsg);
    if (event) {
      event.assignedCount += 1;
    }

    return {
      success: true,
      message: 'Demo only — not submitted to server',
      data: deepClone(newAsg),
    };
  }

  public async cancelAssignment(
    assignmentId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAssignmentItem>> {
    const asg = this.assignments.find(a => a.id === assignmentId);
    if (!asg) {
      return {
        success: false,
        message: 'Assignment not found',
      };
    }

    const event = this.events.find(e => e.id === asg.eventId);
    if (event?.isOwnerAsMonitor) {
      return {
        success: false,
        message:
          'Action disabled in read-only monitor mode. Coordination is held by another coordinator.',
      };
    }

    if (asg.status === 'completed') {
      return {
        success: false,
        message: 'Completed assignments cannot be cancelled.',
      };
    }

    asg.status = 'cancelled';
    if (event && event.assignedCount > 0) {
      event.assignedCount -= 1;
    }

    return {
      success: true,
      message: 'Demo only — not submitted to server',
      data: deepClone(asg),
    };
  }

  public async getAttendanceRoster(
    eventId?: string,
  ): Promise<CoordinatorAttendanceItem[]> {
    const list = eventId
      ? this.attendance.filter(a => a.eventId === eventId)
      : this.attendance;
    return deepClone(list);
  }

  public async getPendingGeoConfirmations(
    eventId?: string,
  ): Promise<CoordinatorAttendanceItem[]> {
    const list = this.attendance.filter(
      a =>
        a.isPendingGeoConfirmation &&
        (!eventId || a.eventId === eventId),
    );
    return deepClone(list);
  }

  public async confirmGeoAttendance(
    attendanceId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>> {
    const record = this.attendance.find(a => a.id === attendanceId);
    if (!record) {
      return {
        success: false,
        message: 'Attendance record not found',
      };
    }

    const event = this.events.find(e => e.id === record.eventId);
    if (event?.isOwnerAsMonitor) {
      return {
        success: false,
        message:
          'Action disabled in read-only monitor mode. Coordination is held by another coordinator.',
      };
    }

    record.status = 'checked_in';
    record.isPendingGeoConfirmation = false;
    record.checkedInAt = this.clock().toISOString();
    if (record.geoAttempt) {
      record.geoAttempt.confirmationStatus = 'confirmed';
    }

    if (event) {
      event.checkedInCount += 1;
    }

    return {
      success: true,
      message: 'Demo only — not submitted to server',
      data: deepClone(record),
    };
  }

  public async rejectGeoAttendance(
    attendanceId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>> {
    const record = this.attendance.find(a => a.id === attendanceId);
    if (!record) {
      return {
        success: false,
        message: 'Attendance record not found',
      };
    }

    const event = this.events.find(e => e.id === record.eventId);
    if (event?.isOwnerAsMonitor) {
      return {
        success: false,
        message:
          'Action disabled in read-only monitor mode. Coordination is held by another coordinator.',
      };
    }

    record.status = 'scheduled';
    record.isPendingGeoConfirmation = false;
    if (record.geoAttempt) {
      record.geoAttempt.confirmationStatus = 'rejected';
      record.geoAttempt.note = 'Rejected by coordinator in on-site verification.';
    }

    return {
      success: true,
      message: 'Demo only — not submitted to server',
      data: deepClone(record),
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
    _arg3?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>> {
    let record: CoordinatorAttendanceItem | undefined;
    if (typeof arg1 === 'object' && arg1 !== null && 'eventId' in arg1 && 'volunteerUserId' in arg1) {
      record = this.attendance.find(
        a => a.eventId === String(arg1.eventId) && a.userId === String(arg1.volunteerUserId),
      );
    } else if (arg2 !== undefined && arg2 !== null) {
      record = this.attendance.find(
        a => a.eventId === String(arg1) && a.userId === String(arg2),
      );
    } else {
      const attendanceId = String(arg1);
      record = this.attendance.find(a => a.id === attendanceId || a.assignmentId === attendanceId);
    }

    if (!record) {
      return {
        success: false,
        message: 'Attendance record not found',
      };
    }

    const event = this.events.find(e => e.id === record!.eventId);
    if (event?.isOwnerAsMonitor) {
      return {
        success: false,
        message:
          'Action disabled in read-only monitor mode. Coordination is held by another coordinator.',
      };
    }

    record.status = 'checked_in';
    record.checkInMethod = 'manual';
    record.checkedInAt = this.clock().toISOString();
    record.isPendingGeoConfirmation = false;

    if (event) {
      event.checkedInCount += 1;
    }

    return {
      success: true,
      message: 'Demo only — not submitted to server',
      data: deepClone(record),
    };
  }

  public async handoverEvent(
    eventId: string,
    newCoordinatorUserId: string,
    _reason?: string,
  ): Promise<CoordinatorOperationResult> {
    const event = this.events.find(e => e.id === eventId);
    if (!event) {
      return {
        success: false,
        message: 'Event not found',
      };
    }

    event.currentCoordinatorId = newCoordinatorUserId;
    event.isOwnerAsMonitor = true;

    return {
      success: true,
      message: 'Event handed over successfully',
    };
  }

  public async retakeEvent(
    eventId: string,
    _reason?: string,
  ): Promise<CoordinatorOperationResult> {
    const event = this.events.find(e => e.id === eventId);
    if (!event) {
      return {
        success: false,
        message: 'Event not found',
      };
    }

    event.currentCoordinatorId = event.ownerId;
    event.isOwnerAsMonitor = false;

    return {
      success: true,
      message: 'Event retaken successfully',
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
    const event = this.events.find(item => item.id === eventId);
    if (!event) return { success: false, message: 'Event not found.' };
    if (event.isOwnerAsMonitor) {
      return { success: false, message: 'QR token management is disabled in read-only monitor mode.' };
    }
    if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 10080) {
      return { success: false, message: 'Token lifetime must be between 1 and 10080 minutes.' };
    }
    if (maxUses !== undefined && maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
      return { success: false, message: 'Maximum uses must be a positive whole number.' };
    }

    const id = this.nextQrTokenId++;
    const expiresAt = new Date(
      this.clock().getTime() + ttlMinutes * 60 * 1000,
    ).toISOString();
    const rawToken = `template-qr-${id}-${eventId}-${purpose}-${this.clock().getTime()}`;
    this.qrTokens.set(id, { eventId, rawToken, expiresAt });
    return {
      success: true,
      message: 'Local template QR token created — not submitted to the server.',
      data: { id, rawToken, expiresAt },
    };
  }

  public async revokeQrToken(
    qrId: string,
  ): Promise<CoordinatorOperationResult> {
    const id = Number(qrId);
    const token = this.qrTokens.get(id);
    if (!Number.isInteger(id) || !token) {
      return { success: false, message: 'Template QR token not found.' };
    }
    const event = this.events.find(item => item.id === token.eventId);
    if (event?.isOwnerAsMonitor) {
      return { success: false, message: 'QR token management is disabled in read-only monitor mode.' };
    }
    this.qrTokens.delete(id);
    return {
      success: true,
      message: 'Local template QR token revoked.',
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
  ): Promise<CoordinatorOperationResult<{ id: string; status: 'open' | 'full' | 'closed' }>> {
    const event = this.events.find(e => e.id === eventId);
    if (!event) return { success: false, message: 'Event not found' };
    if (event.isOwnerAsMonitor) {
      return { success: false, message: 'Post editing is disabled in read-only monitor mode.' };
    }
    if (!post.title.trim() || !Number.isInteger(post.requiredHeadcount) || post.requiredHeadcount < 1) {
      return { success: false, message: 'Post title and a positive whole-number headcount are required.' };
    }
    const newPost: EventPost = {
      id: this.idGenerator('post'),
      eventId,
      title: post.title.trim(),
      description: post.description?.trim(),
      requiredHeadcount: post.requiredHeadcount,
      filledHeadcount: 0,
      remainingCapacity: post.requiredHeadcount,
      physicalLevel: post.physicalLevel ?? 'light',
      requiredSkills: post.requiredSkills ?? [],
      leaderNeeded: post.leaderNeeded ?? false,
      newVolunteersAllowed: post.newVolunteersAllowed ?? true,
      priority: post.priority ?? 100,
      status: 'open',
    };
    event.posts.push(newPost);
    return {
      success: true,
      message: 'Demo only — not submitted to server',
      data: { id: newPost.id, status: newPost.status },
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
  ): Promise<CoordinatorOperationResult<{ id: string; status: 'open' | 'full' | 'closed' }>> {
    for (const event of this.events) {
      const post = event.posts.find(p => p.id === postId);
      if (!post) continue;
      if (event.isOwnerAsMonitor) {
        return { success: false, message: 'Post editing is disabled in read-only monitor mode.' };
      }
      if (updates.title !== undefined) post.title = updates.title.trim();
      if (updates.description !== undefined) post.description = updates.description.trim();
      if (updates.requiredHeadcount !== undefined) {
        if (!Number.isInteger(updates.requiredHeadcount) || updates.requiredHeadcount < post.filledHeadcount) {
          return { success: false, message: 'Headcount must be a positive whole number and cannot be below assigned capacity.' };
        }
        post.requiredHeadcount = updates.requiredHeadcount;
        post.remainingCapacity = Math.max(0, post.requiredHeadcount - post.filledHeadcount);
      }
      if (updates.status !== undefined) post.status = updates.status;
      if (updates.physicalLevel !== undefined) post.physicalLevel = updates.physicalLevel;
      if (updates.requiredSkills !== undefined) post.requiredSkills = [...updates.requiredSkills];
      if (updates.leaderNeeded !== undefined) post.leaderNeeded = updates.leaderNeeded;
      if (updates.newVolunteersAllowed !== undefined) post.newVolunteersAllowed = updates.newVolunteersAllowed;
      if (updates.priority !== undefined) post.priority = updates.priority;
      return {
        success: true,
        message: 'Demo only — not submitted to server',
        data: { id: post.id, status: post.status },
      };
    }
    return { success: false, message: 'Post not found' };
  }

  public async closeEventPost(
    postId: string,
  ): Promise<CoordinatorOperationResult<void>> {
    for (const event of this.events) {
      const post = event.posts.find(p => p.id === postId);
      if (post) {
        if (event.isOwnerAsMonitor) {
          return {
            success: false,
            message: 'Post management is disabled in read-only monitor mode.',
          };
        }
        post.status = 'closed';
        return {
          success: true,
          message: 'Demo only — not submitted to server',
        };
      }
    }
    return {
      success: false,
      message: 'Post not found',
    };
  }

  public async inviteVolunteer(
    eventId: string,
    volunteerUserId?: string | number,
    postId?: string | number,
    note?: string,
    volunteerUuid?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorApplicationItem>> {
    const event = this.events.find(e => e.id === eventId);
    if (!event) return { success: false, message: 'Event not found' };
    if (event.isOwnerAsMonitor) {
      return { success: false, message: 'Invitations are disabled in read-only monitor mode.' };
    }
    if (!volunteerUserId && !volunteerUuid?.trim()) {
      return { success: false, message: 'Provide either a volunteer user ID or UUID.' };
    }
    const appItem: CoordinatorApplicationItem = {
      id: this.idGenerator('app-inv'),
      eventId,
      eventTitle: event.title,
      userId: String(volunteerUuid?.trim() || volunteerUserId),
      applicantName: 'Invited Volunteer',
      source: 'invite',
      postId: postId ? String(postId) : undefined,
      postTitle: postId ? 'Invited Role' : undefined,
      status: 'accepted',
      appliedAt: this.clock().toISOString(),
    };
    this.applications.unshift(appItem);
    return {
      success: true,
      message: 'Demo only — not submitted to server',
      data: deepClone(appItem),
    };
  }

  public async getCoordinatorHistory(
    _eventId: string,
  ): Promise<CoordinatorHistoryItem[]> {
    return [
      {
        id: '1',
        eventId: '101',
        changeType: 'coordinator_handover',
        previousCoordinatorId: '5',
        previousCoordinatorName: 'Alex Morgan',
        newCoordinatorId: '6',
        newCoordinatorName: 'Jordan Lee',
        changedById: '5',
        changedByName: 'Alex Morgan',
        reason: 'Shift handover to relief coordinator',
        changedAt: '2026-11-01T12:00:00Z',
      },
    ];
  }

  public async getPostCapacity(
    eventId: string,
  ): Promise<EventPostCapacity[]> {
    const event = this.events.find(e => e.id === eventId);
    if (!event) return [];
    return event.posts.map(p => ({
      postId: p.id,
      title: p.title,
      status: p.status,
      requiredHeadcount: p.requiredHeadcount,
      assignedCount: p.filledHeadcount,
      remainingCapacity: p.remainingCapacity,
    }));
  }

  public async getGeoAttempts(
    _eventId: string,
  ): Promise<GeoAttemptReview[]> {
    return [
      {
        attemptId: '901',
        eventId: '77',
        userId: '88',
        displayName: 'Ma Hla Hla',
        attemptedAt: '2026-12-20T07:55:00Z',
        distanceMeters: 85.5,
        effectiveRadiusMeters: 100,
        accuracyMeters: 10,
        isMocked: false,
        resultCode: 'pending_confirmation',
      },
    ];
  }

  public async lookupVolunteerByUuid(
    uuid: string,
    _eventId?: string,
  ): Promise<VolunteerUuidLookup> {
    return {
      userId: '88',
      uuid,
      displayName: 'Demo Volunteer',
      display_name: 'Demo Volunteer',
      verificationStatus: 'verified',
      skills: ['first aid', 'logistics'],
      physicalOk: true,
      goodEyesight: true,
      needsGlasses: false,
      canLiftHeavy: true,
      canWorkOutdoor: true,
      hasLeaderExperience: true,
      newToVolunteer: false,
      preferredLanguage: 'my',
      homeArea: 'Kamayut, Yangon',
      needsMealSupport: true,
      needsTravelSupport: false,
      acceptsUnpaid: true,
    };
  }

  public async submitCoordinatorFeedback(
    _eventId: string,
    _volunteerUserId: string | number,
    score: number,
    _comment?: string,
    _tags?: string[],
  ): Promise<CoordinatorOperationResult> {
    return {
      success: true,
      message: `Feedback (${score}/5 stars) recorded locally (Demo only)`,
    };
  }
}

function getAllowedTransitions(
  status: CoordinatorEventStatus,
): CoordinatorEventStatus[] {
  switch (status) {
    case 'draft':
      return ['published', 'cancelled'];
    case 'published':
      return ['active', 'cancelled'];
    case 'active':
      return ['completed', 'cancelled'];
    case 'completed':
    case 'cancelled':
    default:
      return [];
  }
}

export const defaultCoordinatorRepository = new MockCoordinatorRepository();
