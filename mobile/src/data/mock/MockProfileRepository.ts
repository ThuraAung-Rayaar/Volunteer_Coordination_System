/**
 * @format
 */

import type {
  AvailabilityException,
  VolunteerAvailability,
  WeeklyAvailabilityRule,
} from '../../domain/models/availability';
import type { CoordinatorStatus } from '../../domain/models';
import type { VolunteerProfile } from '../../domain/models/profile';
import type {
  VerificationCoordinatorData,
  VerificationStatus,
} from '../../domain/models/verification';
import {
  normalizeSkills,
  validateEmergencyContact,
} from '../../shared/utils/profileValidation';
import type {
  AttendanceHistoryItem,
  AvailabilityCheckResult,
  CoordinatorEligibilityData,
  ProfileOperationResult,
  ProfileRepository,
  UserUuidLookupResult,
  VerificationImageUploadResult,
} from '../contracts/profileRepository';
import type { MyFeedbackResponse } from '../../domain/models/feedback';
import {
  Clock,
  createAvailabilityFixture,
  createSequentialIdGenerator,
  createVerificationFixture,
  createVolunteerProfileFixture,
  deepClone,
  IdGenerator,
} from './mockUtils';

export interface MockProfileRepositoryOptions {
  idGenerator?: IdGenerator;
  clock?: Clock;
}

export class MockProfileRepository implements ProfileRepository {
  private profile: VolunteerProfile;
  private availability: VolunteerAvailability;
  private verification: VerificationCoordinatorData;
  private mockMeetsGoodRating: boolean | null = null;
  private mockCompletedEventsCount: number | null = null;
  private idGenerator: IdGenerator;
  private clock: Clock;

  constructor(
    initialProfile: VolunteerProfile = createVolunteerProfileFixture(),
    initialAvailability: VolunteerAvailability = createAvailabilityFixture(),
    initialVerification: VerificationCoordinatorData = createVerificationFixture(),
    options?: MockProfileRepositoryOptions,
  ) {
    this.profile = deepClone(initialProfile);
    this.availability = deepClone(initialAvailability);
    this.verification = deepClone(initialVerification);
    this.idGenerator = options?.idGenerator ?? createSequentialIdGenerator(3000);
    this.clock = options?.clock ?? (() => new Date());
  }

  public reset(
    profile?: VolunteerProfile,
    availability?: VolunteerAvailability,
    verification?: VerificationCoordinatorData,
    options?: MockProfileRepositoryOptions,
  ): void {
    this.profile = deepClone(profile ?? createVolunteerProfileFixture());
    this.availability = deepClone(
      availability ?? createAvailabilityFixture(),
    );
    this.verification = deepClone(
      verification ?? createVerificationFixture(),
    );
    this.mockMeetsGoodRating = null;
    this.mockCompletedEventsCount = null;
    if (options?.idGenerator) {
      this.idGenerator = options.idGenerator;
    } else {
      this.idGenerator = createSequentialIdGenerator(3000);
    }
    if (options?.clock) {
      this.clock = options.clock;
    }
  }

  public seed(data: {
    profile?: VolunteerProfile;
    availability?: VolunteerAvailability;
    verification?: VerificationCoordinatorData;
    idGenerator?: IdGenerator;
    clock?: Clock;
  }): void {
    this.reset(data.profile, data.availability, data.verification, {
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

  public setMockMeetsGoodRating(value: boolean | null): void {
    this.mockMeetsGoodRating = value;
  }

  public setMockCompletedEventsCount(count: number | null): void {
    this.mockCompletedEventsCount = count;
  }

  public setVerificationStatus(status: VerificationStatus): void {
    this.verification.verificationStatus = status;
    this.profile = {
      ...this.profile,
      verificationStatus: status,
    };
  }

  public setCoordinatorStatus(status: CoordinatorStatus): void {
    this.verification.coordinatorStatus = status;
    this.profile = {
      ...this.profile,
      coordinatorStatus: status,
    };
  }

  public setRatingSummary(average: number | null, count: number): void {
    this.profile = {
      ...this.profile,
      ratingAverage: average,
      ratingCount: count,
    };
  }

  public async getProfile(): Promise<VolunteerProfile> {
    return deepClone(this.profile);
  }

  public async updateProfile(
    updates: Partial<VolunteerProfile>,
  ): Promise<ProfileOperationResult<VolunteerProfile>> {
    const candidateName =
      updates.emergencyContactName !== undefined
        ? updates.emergencyContactName
        : this.profile.emergencyContactName;
    const candidatePhone =
      updates.emergencyContactPhone !== undefined
        ? updates.emergencyContactPhone
        : this.profile.emergencyContactPhone;

    const contactValidation = validateEmergencyContact(
      candidateName,
      candidatePhone,
    );
    if (!contactValidation.isValid) {
      return {
        success: false,
        message:
          contactValidation.errorMessage ??
          'Invalid emergency contact information.',
      };
    }

    // Apply allow-listed fields only
    if (updates.displayName !== undefined) {
      this.profile.displayName = updates.displayName.trim();
    }
    if (updates.preferredLanguage !== undefined) {
      this.profile.preferredLanguage = updates.preferredLanguage;
    }
    if (updates.homeArea !== undefined) {
      this.profile.homeArea = updates.homeArea.trim();
    }
    if (updates.emergencyContactName !== undefined) {
      this.profile.emergencyContactName = updates.emergencyContactName.trim();
    }
    if (updates.emergencyContactPhone !== undefined) {
      this.profile.emergencyContactPhone = updates.emergencyContactPhone.trim();
    }
    if (updates.skills !== undefined) {
      this.profile.skills = normalizeSkills(updates.skills);
    }
    if (updates.charityInterests !== undefined) {
      this.profile.charityInterests = [...updates.charityInterests];
    }
    if (updates.capabilities !== undefined) {
      this.profile.capabilities = {
        ...this.profile.capabilities,
        ...updates.capabilities,
      };
    }
    if (updates.supportPreferences !== undefined) {
      this.profile.supportPreferences = {
        ...this.profile.supportPreferences,
        ...updates.supportPreferences,
      };
    }
    if (updates.donationPreferences !== undefined) {
      this.profile.donationPreferences = {
        ...this.profile.donationPreferences,
        ...updates.donationPreferences,
      };
    }

    return {
      success: true,
      message: 'Demo only — not submitted to server',
      data: deepClone(this.profile),
    };
  }

  public async getAvailability(): Promise<VolunteerAvailability> {
    return deepClone(this.availability);
  }

  public async saveWeeklyRule(
    rule: Omit<WeeklyAvailabilityRule, 'id'>,
  ): Promise<ProfileOperationResult<WeeklyAvailabilityRule>> {
    const newRule: WeeklyAvailabilityRule = {
      ...rule,
      id: this.idGenerator('rule'),
    };
    this.availability.weeklyRules.push(newRule);

    return {
      success: true,
      message: 'Demo only — not submitted to server',
      data: deepClone(newRule),
    };
  }

  public async deleteWeeklyRule(
    ruleId: string,
  ): Promise<ProfileOperationResult> {
    this.availability.weeklyRules = this.availability.weeklyRules.filter(
      r => r.id !== ruleId,
    );

    return {
      success: true,
      message: 'Demo only — not submitted to server',
    };
  }

  public async saveException(
    exception: Omit<AvailabilityException, 'id'>,
  ): Promise<ProfileOperationResult<AvailabilityException>> {
    const newException: AvailabilityException = {
      ...exception,
      id: this.idGenerator('exc'),
    };
    this.availability.exceptions.push(newException);

    return {
      success: true,
      message: 'Demo only — not submitted to server',
      data: deepClone(newException),
    };
  }

  public async deleteException(
    exceptionId: string,
  ): Promise<ProfileOperationResult> {
    this.availability.exceptions = this.availability.exceptions.filter(
      e => e.id !== exceptionId,
    );

    return {
      success: true,
      message: 'Demo only — not submitted to server',
    };
  }

  public async getVerificationStatus(): Promise<VerificationCoordinatorData> {
    return deepClone(this.verification);
  }

  public async getCoordinatorEligibility(): Promise<CoordinatorEligibilityData> {
    const isVerified = this.verification.verificationStatus === 'verified';
    // Count attendance-backed completed events (defaults to 9 matching preview activities fixture)
    const completedAttendanceEventsCount =
      this.mockCompletedEventsCount !== null
        ? this.mockCompletedEventsCount
        : 9;
    const meetsCompletedEventsRequirement =
      completedAttendanceEventsCount >= 5;

    return {
      verificationStatus: this.verification.verificationStatus,
      isVerified,
      completedAttendanceEventsCount,
      meetsCompletedEventsRequirement,
      meetsGoodRatingRequirement: this.mockMeetsGoodRating,
      ratingAverage: this.profile.ratingAverage ?? null,
      ratingCount: this.profile.ratingCount ?? 0,
      coordinatorStatus: this.verification.coordinatorStatus,
    };
  }

  public async submitCoordinatorApplication(
    note: string,
  ): Promise<ProfileOperationResult> {
    if (this.verification.verificationStatus !== 'verified') {
      return {
        success: false,
        message: 'Must be verified to apply for coordinator authority.',
      };
    }
    this.verification.coordinatorStatus = 'pending';
    this.verification.coordinatorApplicationNote = note;
    this.profile = {
      ...this.profile,
      coordinatorStatus: 'pending',
    };

    return {
      success: true,
      message: 'Demo only — not submitted to server',
    };
  }

  public async checkAvailabilityForEvent(
    eventId: string | number,
  ): Promise<AvailabilityCheckResult> {
    return {
      isAvailable: true,
      scheduleConflict: false,
      eventId: String(eventId),
      startAt: '2026-12-15T08:00:00+06:30',
      endAt: '2026-12-15T12:00:00+06:30',
    };
  }

  public async checkAvailabilityForWindow(
    startAt: string,
    endAt: string,
  ): Promise<AvailabilityCheckResult> {
    return {
      isAvailable: true,
      scheduleConflict: false,
      startAt,
      endAt,
    };
  }

  public async uploadVerificationImage(
    imageType: string,
    fileUri: string,
    _mimeType?: string,
    _fileName?: string,
  ): Promise<VerificationImageUploadResult> {
    const slot = this.verification.imageSlots.find(
      s => s.imageType === imageType,
    );
    if (slot) {
      slot.status = 'pending';
      slot.uploadedAt = this.clock().toISOString();
    }
    return {
      id: this.idGenerator('vimg'),
      imageType,
      status: 'pending',
      comparisonStatus: 'pending',
      isCurrent: true,
      createdAt: this.clock().toISOString(),
    };
  }

  public async updateCoordinatorApplicationNotes(
    notes: string,
  ): Promise<ProfileOperationResult> {
    this.verification.coordinatorApplicationNote = notes;
    return {
      success: true,
      message: 'Demo only — not submitted to server',
    };
  }

  public async lookupUserByUuid(
    uuid: string,
    _eventId?: string | number,
  ): Promise<UserUuidLookupResult> {
    return {
      userId: 88,
      uuid,
      displayName: 'Demo Volunteer',
      verificationStatus: 'verified',
      skills: ['teaching', 'first_aid'],
      physicalOk: true,
      goodEyesight: true,
      needsGlasses: false,
      canLiftHeavy: true,
      canWorkOutdoor: true,
      hasLeaderExperience: true,
      newToVolunteer: false,
      preferredLanguage: 'en',
      homeArea: 'Kamayut, Yangon',
      needsMealSupport: true,
      needsTravelSupport: false,
      acceptsUnpaid: true,
    };
  }

  public async getAttendanceHistory(): Promise<AttendanceHistoryItem[]> {
    return [
      {
        id: 'att-hist-001',
        assignmentId: 'asgn-303',
        eventId: 'evt-104',
        eventTitle: 'Animal Shelter Wellness & Adoption Fair',
        locationName: 'Bahan Community Animal Sanctuary',
        postId: 'post-104-1',
        postTitle: 'Kennel Grooming & Exercise Assistant',
        scheduleStart: '2026-11-01T10:00:00Z',
        scheduleEnd: '2026-11-01T16:00:00Z',
        status: 'completed',
        method: 'geo',
        checkinAt: '2026-11-01T09:55:00Z',
        checkoutAt: '2026-11-01T16:05:00Z',
        confirmationStatus: 'confirmed',
        walkInFlag: false,
        verifiedHours: 4.5,
      },
    ];
  }

  public async getOwnFeedback(): Promise<MyFeedbackResponse> {
    return {
      authoredFeedback: [
        {
          id: 'fb-001',
          eventId: 'evt-104',
          eventTitle: 'Animal Shelter Wellness & Adoption Fair',
          direction: 'volunteer_to_event',
          ratingOverall: 5,
          tags: ['supportive', 'organized'],
          comments: 'Rewarding experience helping the animals.',
          createdAt: '2026-11-02T10:00:00Z',
        },
      ],
      receivedSummary: {
        overallAvgRating: this.profile.ratingAverage ?? 4.88,
        totalCount: this.profile.ratingCount ?? 26,
        volunteerAvgRating: this.profile.ratingAverage ?? 4.88,
        volunteerRatingCount: this.profile.ratingCount ?? 26,
        coordinatorAvgRating: null,
        coordinatorRatingCount: 0,
        asVolunteer: {
          count: this.profile.ratingCount ?? 26,
          avgOverall: this.profile.ratingAverage ?? 4.88,
        },
        asCoordinator: {
          count: 0,
          avgOverall: null,
        },
        ratingDistribution: {
          '5': 20,
          '4': 6,
        },
      },
    };
  }
}

export const defaultProfileRepository = new MockProfileRepository();
