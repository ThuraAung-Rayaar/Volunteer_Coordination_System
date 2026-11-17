/**
 * @format
 */

import {
  CHARITY_CATEGORIES,
  type EventApplicationState,
  type EventDetail,
  type EventFilters,
  type EventSummary,
  type VolunteerApplicationItem,
  type VolunteerAssignmentItem,
} from '../../domain/models/event';
import type {
  EventApplyResult,
  EventFeedbackItem,
  EventRepository,
  GeoCheckInResult,
  OnboardingStatusResult,
  PaginatedEventsResult,
  QrRedeemResult,
  QrResolveResult,
} from '../contracts/eventRepository';
import {
  Clock,
  createEventsFixture,
  createSequentialIdGenerator,
  deepClone,
  IdGenerator,
} from './mockUtils';

export const initialVolunteerApplications: VolunteerApplicationItem[] = [
  {
    id: 'app-901',
    eventId: 'evt-101',
    eventTitle: 'Riverbank Environmental Cleanup & Waste Audit',
    postId: 'post-101-2',
    postTitle: 'Recycling & Waste Data Auditor',
    status: 'pending',
    appliedAt: '2026-11-10T09:30:00Z',
    volunteerNote: 'Excited to contribute to local river conservation data.',
  },
  {
    id: 'app-902',
    eventId: 'evt-103',
    eventTitle: 'Emergency Food Bank Packaging & Logistics',
    postId: 'post-103-1',
    postTitle: 'Ration Box Assembly Lead',
    status: 'accepted',
    appliedAt: '2026-11-05T14:15:00Z',
    volunteerNote: 'Experienced in food pantry packaging from prior missions.',
  },
  {
    id: 'app-903',
    eventId: 'evt-102',
    eventTitle: 'Weekend Youth Literacy & Coding Workshop',
    postId: 'post-102-1',
    postTitle: 'Reading Mentorship Volunteer',
    status: 'waitlisted',
    appliedAt: '2026-11-08T11:00:00Z',
  },
];

export const initialVolunteerAssignments: VolunteerAssignmentItem[] = [
  {
    id: 'asgn-301',
    eventId: 'evt-101',
    eventTitle: 'Riverbank Environmental Cleanup & Waste Audit',
    postId: 'post-101-2',
    postTitle: 'Recycling & Waste Data Auditor',
    status: 'confirmed',
    startAt: '2026-11-15T08:00:00Z',
    endAt: '2026-11-15T13:00:00Z',
    location: 'Downtown Riverwalk Plaza, Pier 4',
    assignedAt: '2026-11-06T10:00:00Z',
  },
  {
    id: 'asgn-302',
    eventId: 'evt-103',
    eventTitle: 'Emergency Food Bank Packaging & Logistics',
    postId: 'post-103-1',
    postTitle: 'Ration Box Assembly Lead',
    status: 'assigned',
    startAt: '2026-11-28T07:00:00Z',
    endAt: '2026-11-28T14:30:00Z',
    location: 'Inya Relief Distribution Hub',
    assignedAt: '2026-11-07T14:00:00Z',
  },
  {
    id: 'asgn-303',
    eventId: 'evt-104',
    eventTitle: 'Animal Shelter Wellness & Adoption Fair',
    postId: 'post-104-1',
    postTitle: 'Kennel Grooming & Exercise Assistant',
    status: 'completed',
    attendanceStatus: 'completed',
    verifiedHours: 4.5,
    startAt: '2026-11-01T10:00:00Z',
    endAt: '2026-11-01T16:00:00Z',
    location: 'Bahan Community Animal Sanctuary',
    assignedAt: '2026-10-20T09:00:00Z',
  },
];

export interface MockEventRepositoryOptions {
  idGenerator?: IdGenerator;
  clock?: Clock;
}

export class MockEventRepository implements EventRepository {
  private events: EventDetail[];
  private applications: VolunteerApplicationItem[];
  private assignments: VolunteerAssignmentItem[];
  private idGenerator: IdGenerator;
  private clock: Clock;
  private acknowledgedOnboarding: Set<string> = new Set();

  constructor(
    initialData: EventDetail[] = createEventsFixture(),
    initialApps: VolunteerApplicationItem[] = initialVolunteerApplications,
    initialAssignments: VolunteerAssignmentItem[] = initialVolunteerAssignments,
    options?: MockEventRepositoryOptions,
  ) {
    this.events = deepClone(initialData);
    this.applications = deepClone(initialApps);
    this.assignments = deepClone(initialAssignments);
    this.idGenerator = options?.idGenerator ?? createSequentialIdGenerator(2000);
    this.clock = options?.clock ?? (() => new Date());
  }

  public reset(
    data?: EventDetail[],
    apps?: VolunteerApplicationItem[],
    assignments?: VolunteerAssignmentItem[],
    options?: MockEventRepositoryOptions,
  ): void {
    this.events = deepClone(data ?? createEventsFixture());
    this.applications = deepClone(apps ?? initialVolunteerApplications);
    this.assignments = deepClone(assignments ?? initialVolunteerAssignments);
    if (options?.idGenerator) {
      this.idGenerator = options.idGenerator;
    } else {
      this.idGenerator = createSequentialIdGenerator(2000);
    }
    if (options?.clock) {
      this.clock = options.clock;
    }
  }

  public seed(data: {
    events?: EventDetail[];
    applications?: VolunteerApplicationItem[];
    assignments?: VolunteerAssignmentItem[];
    idGenerator?: IdGenerator;
    clock?: Clock;
  }): void {
    this.reset(data.events, data.applications, data.assignments, {
      idGenerator: data.idGenerator,
      clock: data.clock,
    });
  }

  public setIdGenerator(idGenerator: IdGenerator): void {
    this.idGenerator = idGenerator;
  }

  public setClock(clock: Clock): void {
    this.clock = clock;
  }

  public async getEvents(filters?: EventFilters): Promise<EventSummary[]> {
    let result = [...this.events];

    if (!filters) {
      return result.map(toSummary);
    }

    // 1. Search text filter (title, description, locationName)
    if (filters.query && filters.query.trim().length > 0) {
      const q = filters.query.trim().toLowerCase();
      result = result.filter(
        e =>
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.locationName.toLowerCase().includes(q) ||
          (e.landmarkText && e.landmarkText.toLowerCase().includes(q)),
      );
    }

    // 2. Charity category filter (match any of the selected codes)
    if (filters.charityFieldCodes && filters.charityFieldCodes.length > 0) {
      const selectedCodes = new Set(filters.charityFieldCodes);
      result = result.filter(e =>
        e.charityFields.some(code => selectedCodes.has(code)),
      );
    }

    // 3. Status filter (published or active)
    if (filters.statuses && filters.statuses.length > 0) {
      const statusSet = new Set(filters.statuses);
      result = result.filter(e => statusSet.has(e.status));
    }

    // 4. Meals filter
    if (filters.mealsProvided === true) {
      result = result.filter(e => e.mealsProvided);
    }

    // 5. Lodging filter
    if (filters.lodgingProvided === true) {
      result = result.filter(e => e.lodgingProvided);
    }

    // 6. Travel support filter
    if (filters.travelSupportProvided === true) {
      result = result.filter(e => e.travelSupportProvided);
    }

    return result.map(toSummary);
  }

  public async getEventsPage(
    filters?: EventFilters,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<PaginatedEventsResult> {
    const all = await this.getEvents(filters);
    const start = (page - 1) * pageSize;
    const paginated = all.slice(start, start + pageSize);
    return {
      count: all.length,
      next: start + pageSize < all.length ? `page=${page + 1}` : null,
      previous: page > 1 ? `page=${page - 1}` : null,
      results: paginated,
    };
  }

  public async getCharityFields(): Promise<
    Array<{ code: string; label: string; sort_order?: number }>
  > {
    return CHARITY_CATEGORIES.map(c => ({
      code: c.code,
      label: c.label,
      sort_order: c.sortOrder,
    }));
  }

  public async getEventById(id: string): Promise<EventDetail | null> {
    const found = this.events.find(e => e.id === id);
    if (!found) {
      return null;
    }
    return deepClone(found);
  }

  public async applyToPost(
    eventId: string,
    postId: string,
    note?: string,
  ): Promise<EventApplyResult> {
    const event = this.events.find(e => e.id === eventId);
    if (!event) {
      return {
        success: false,
        message: 'Event not found',
      };
    }

    const post = event.posts.find(p => p.id === postId);
    if (!post) {
      return {
        success: false,
        message: 'Selected role/post not found',
      };
    }

    if (post.status === 'closed') {
      return {
        success: false,
        message: 'This post is closed for applications',
      };
    }

    if (event.userApplication && event.userApplication.postId === postId) {
      return {
        success: false,
        message: 'You have already applied to this role',
      };
    }

    const newApplication: EventApplicationState = {
      id: this.idGenerator('app-demo'),
      eventId,
      postId,
      postTitle: post.title,
      status: 'pending',
      appliedAt: this.clock().toISOString(),
      volunteerNote: note,
    };

    // Update local mock state
    event.userApplication = newApplication;
    if (post.remainingCapacity > 0) {
      post.filledHeadcount += 1;
      post.remainingCapacity = Math.max(
        0,
        post.requiredHeadcount - post.filledHeadcount,
      );
      if (post.remainingCapacity === 0) {
        post.status = 'full';
      }
    }
    event.spotsRemaining = Math.max(0, event.spotsRemaining - 1);

    // Also record in the volunteer's submitted applications list
    this.applications.unshift({
      id: newApplication.id,
      eventId: newApplication.eventId,
      eventTitle: event.title,
      postId: newApplication.postId,
      postTitle: newApplication.postTitle,
      status: newApplication.status,
      appliedAt: newApplication.appliedAt,
      volunteerNote: newApplication.volunteerNote,
    });

    return {
      success: true,
      message: 'Demo only — not submitted to server',
      application: newApplication,
    };
  }

  public async getUserApplications(): Promise<VolunteerApplicationItem[]> {
    return deepClone(this.applications);
  }

  public async withdrawApplication(
    applicationId: string,
  ): Promise<{ success: boolean; message: string }> {
    const app = this.applications.find(a => a.id === applicationId);
    if (!app) {
      return { success: false, message: 'Application not found' };
    }
    if (app.status === 'withdrawn') {
      return { success: false, message: 'Application is already withdrawn' };
    }

    app.status = 'withdrawn';

    // Synchronize event.userApplication if matching
    const event = this.events.find(e => e.id === app.eventId);
    if (event?.userApplication && event.userApplication.id === applicationId) {
      event.userApplication.status = 'withdrawn';
    }

    return {
      success: true,
      message: 'Application withdrawn locally (Demo only — not submitted to server)',
    };
  }

  public async getUserAssignments(): Promise<VolunteerAssignmentItem[]> {
    return deepClone(this.assignments);
  }

  public async confirmAssignment(
    assignmentId: string,
  ): Promise<{ success: boolean; message: string }> {
    const asgn = this.assignments.find(a => a.id === assignmentId);
    if (!asgn) {
      return { success: false, message: 'Assignment not found' };
    }

    if (asgn.status !== 'assigned') {
      return {
        success: false,
        message: `Cannot confirm an assignment with status '${asgn.status}'.`,
      };
    }

    asgn.status = 'confirmed';

    return {
      success: true,
      message: 'Assignment confirmed locally (Demo only — not submitted to server)',
    };
  }

  public async cancelAssignment(
    assignmentId: string,
  ): Promise<{ success: boolean; message: string }> {
    const asgn = this.assignments.find(a => a.id === assignmentId);
    if (!asgn) {
      return { success: false, message: 'Assignment not found' };
    }

    // Completed participation cannot be cancelled per business rules
    if (asgn.status === 'completed') {
      return {
        success: false,
        message: 'Completed participation cannot be cancelled.',
      };
    }

    if (asgn.status === 'cancelled') {
      return {
        success: false,
        message: 'Assignment is already cancelled',
      };
    }

    asgn.status = 'cancelled';

    return {
      success: true,
      message: 'Participation cancelled locally (Demo only — not submitted to server)',
    };
  }

  public async getEventOnboarding(eventId: string): Promise<{
    eventId: string;
    onboardingText: string | null;
    onboardingVersion: number;
    requireOnboardingAck: boolean;
    acknowledged: boolean;
  }> {
    const ev = this.events.find(e => e.id === eventId);
    return {
      eventId,
      onboardingText:
        ev?.onboardingText ??
        'Please review the event mission, safety instructions, and gear requirements before reporting for your shift.',
      onboardingVersion: 1,
      requireOnboardingAck: true,
      acknowledged: this.acknowledgedOnboarding.has(eventId),
    };
  }

  public async acknowledgeOnboarding(
    eventId: string,
    _notes?: string,
  ): Promise<{ success: boolean; message: string; acknowledged: boolean }> {
    this.acknowledgedOnboarding.add(eventId);
    return {
      success: true,
      message: 'Onboarding acknowledged locally (Demo only)',
      acknowledged: true,
    };
  }

  public async submitGeoCheckIn(
    eventId: string,
    _latitude: number,
    _longitude: number,
    _accuracyM?: number,
  ): Promise<{
    success: boolean;
    message: string;
    result?: string;
    distanceM?: number;
    confirmationStatus?: string;
    attendanceId?: string;
  }> {
    const asgn = this.assignments.find(
      a => a.eventId === eventId && (a.status === 'confirmed' || a.status === 'assigned'),
    );
    if (asgn) {
      asgn.attendanceStatus = 'checked_in';
    }

    return {
      success: true,
      message: 'Geo check-in verified successfully within event geofence.',
      result: 'accepted',
      distanceM: 32,
      confirmationStatus: 'confirmed',
      attendanceId: 'att-mock-geo-01',
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
    if (!token || !token.trim()) {
      return {
        success: false,
        message: 'Invalid or empty QR token provided.',
      };
    }

    return {
      success: true,
      message: 'QR code verified. Shift check-in completed.',
      result: 'checked_in',
      eventId: 'evt-101',
      attendanceId: 'att-mock-qr-01',
    };
  }

  public async checkOutAttendance(
    attendanceId: string,
  ): Promise<{ success: boolean; message: string; checkedOutAt?: string }> {
    const asgn = this.assignments.find(a => a.id === attendanceId || a.attendanceStatus === 'checked_in');
    if (asgn) {
      asgn.status = 'completed';
      asgn.attendanceStatus = 'completed';
      asgn.verifiedHours = 4.0;
    }

    return {
      success: true,
      message: 'Checked out of volunteer shift successfully.',
      checkedOutAt: this.clock().toISOString(),
    };
  }

  public async submitEventFeedback(
    _eventId: string,
    score: number,
    _comment?: string,
    _tags?: string[],
    _direction?:
      | 'coordinator_to_volunteer'
      | 'volunteer_to_event'
      | 'volunteer_to_coordinator',
  ): Promise<{ success: boolean; message: string; feedbackId?: string }> {
    return {
      success: true,
      message: `Thank you for rating your shift (${score}/5 stars)! Feedback recorded.`,
      feedbackId: this.idGenerator('fb'),
    };
  }

  public async resolveQrToken(token: string): Promise<QrResolveResult> {
    if (!token || !token.trim()) {
      return {
        eventId: '',
        purpose: '',
        isValid: false,
        reason: 'Invalid or empty QR token provided.',
      };
    }
    return {
      eventId: 'evt-101',
      purpose: 'checkin',
      isValid: true,
      reason: null,
    };
  }

  public async qrCheckIn(token: string): Promise<QrRedeemResult> {
    return this.redeemQrToken(token);
  }

  public async getEventFeedbackList(
    _eventId: string,
  ): Promise<EventFeedbackItem[]> {
    return [
      {
        id: 'fb-101',
        score: 5,
        comment: 'Great community project and well organized!',
        tags: ['supportive', 'organized'],
        createdAt: this.clock().toISOString(),
      },
    ];
  }
}

function toSummary(event: EventDetail): EventSummary {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    purposeType: event.purposeType,
    status: event.status,
    locationName: event.locationName,
    landmarkText: event.landmarkText,
    startAt: event.startAt,
    endAt: event.endAt,
    applicationDeadline: event.applicationDeadline,
    charityFields: [...event.charityFields],
    coordinatorName: event.coordinatorName,
    spotsRemaining: event.spotsRemaining,
    mealsProvided: event.mealsProvided,
    lodgingProvided: event.lodgingProvided,
    travelSupportProvided: event.travelSupportProvided,
    compensationKind: event.compensationKind,
  };
}

export const defaultEventRepository = new MockEventRepository();
