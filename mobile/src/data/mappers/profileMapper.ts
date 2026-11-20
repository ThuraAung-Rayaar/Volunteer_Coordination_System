/**
 * @format
 */

import type {
  AvailabilityResponseDto,
  AvailabilityRulesReplaceDto,
  CoordinatorProfileEnvelopeDto,
  FeedbackSummaryResponseDto,
  ProfileUpdateRequestDto,
  UserProfileDto,
  VerificationStatusResponseDto,
} from '../dto/profileDto';
import type {
  AvailabilityException,
  VolunteerAvailability,
  WeeklyAvailabilityRule,
} from '../../domain/models/availability';
import type { CoordinatorStatus } from '../../domain/models';
import type {
  BloodType,
  UserLanguage,
  VolunteerProfile,
} from '../../domain/models/profile';
import type {
  AuthoredFeedbackItem,
  FeedbackRatingSummary,
  MyFeedbackResponse,
} from '../../domain/models/feedback';
import type {
  VerificationCoordinatorData,
  VerificationImageSlot,
  VerificationImageType,
  VerificationStatus,
} from '../../domain/models/verification';
import type { CharityCategoryCode } from '../../domain/models/event';

const WEEKDAY_NAMES: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

/**
 * Trims PostgreSQL TimeField values ("08:00:00" -> "08:00").
 */
export function normalizeTimeString(timeStr?: string | null): string {
  if (!timeStr) {
    return '00:00';
  }
  const parts = timeStr.trim().split(':');
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }
  return timeStr;
}

/**
 * Ensures TimeField string has seconds ("08:00" -> "08:00:00").
 */
export function formatToTimeWithSeconds(timeStr: string): string {
  const normalized = normalizeTimeString(timeStr);
  return `${normalized}:00`;
}

/**
 * Maps UserProfileDto composite into domain VolunteerProfile.
 * P1-01 / MAP-01: phone maps strictly to phone; absent email remains null/undefined (no fallback).
 */
export function mapUserProfile(
  userDto: UserProfileDto,
  coordinatorEnvelope?: CoordinatorProfileEnvelopeDto | null,
  feedbackSummary?: FeedbackSummaryResponseDto | null,
): VolunteerProfile {
  const coordStatus: CoordinatorStatus =
    (coordinatorEnvelope?.coordinator?.status as CoordinatorStatus) || 'none';

  const verifStatus =
    (userDto.verification_status as 'none' | 'pending' | 'verified' | 'rejected') || 'none';

  const acctStatus =
    (userDto.account_status as 'active' | 'blocked' | 'closed') || 'active';

  const summary = feedbackSummary?.summary;
  const ratingAverage =
    summary?.volunteer_avg_rating ??
    summary?.overall_avg_rating ??
    summary?.as_volunteer?.avg_overall ??
    null;

  const ratingCount =
    summary?.volunteer_rating_count ??
    summary?.total_count ??
    summary?.as_volunteer?.count ??
    0;

  return {
    id: String(userDto.id),
    phone: userDto.phone ?? null,
    email: (userDto as { email?: string | null }).email ?? undefined,
    accountStatus: acctStatus,
    verificationStatus: verifStatus,
    coordinatorStatus: coordStatus,
    isAdmin: false,
    isStaff: false,
    ratingAverage,
    ratingCount,

    displayName: userDto.display_name || 'Volunteer',
    preferredLanguage: (userDto.preferred_language as UserLanguage) || 'en',
    homeArea: userDto.home_area || '',
    emergencyContactName: userDto.emergency_contact_name || '',
    emergencyContactPhone: userDto.emergency_contact_phone || '',
    skills: Array.isArray(userDto.skills) ? userDto.skills : [],
    charityInterests: (userDto.charity_interests || []) as CharityCategoryCode[],

    capabilities: {
      physicalOk: Boolean(userDto.physical_ok),
      goodEyesight: Boolean(userDto.good_eyesight),
      needsGlasses: Boolean(userDto.needs_glasses),
      canLiftHeavy: Boolean(userDto.can_lift_heavy),
      canWorkOutdoor: Boolean(userDto.can_work_outdoor),
      hasLeaderExperience: Boolean(userDto.has_leader_experience),
      newToVolunteer: Boolean(userDto.new_to_volunteer),
    },

    supportPreferences: {
      needsMealSupport: Boolean(userDto.needs_meal_support),
      needsTravelSupport: Boolean(userDto.needs_travel_support),
      acceptsUnpaid: Boolean(userDto.accepts_unpaid),
    },

    donationPreferences: {
      bloodType: (userDto.blood_type as BloodType) || 'unknown',
      isWillingToDonate: Boolean(
        userDto.is_willing_to_donate ??
          (userDto.is_willing_to_donate_blood || userDto.is_willing_to_donate_items),
      ),
      isWillingToDonateBlood: Boolean(userDto.is_willing_to_donate_blood),
      isWillingToDonateItems: Boolean(userDto.is_willing_to_donate_items),
    },
  };
}

/**
 * Maps partial VolunteerProfile updates to strict ProfileUpdateSerializer allow-list.
 * CRITICAL: Emits ONLY the 20 approved keys; any extraneous property causes HTTP 400.
 * Merges with currentProfile?.donationPreferences to avoid partial patches clobbering sub-flags.
 */
export function mapProfileUpdateRequest(
  updates: Partial<VolunteerProfile>,
  currentProfile?: VolunteerProfile | null,
): ProfileUpdateRequestDto {
  const payload: ProfileUpdateRequestDto = {};

  if (updates.displayName !== undefined) {
    payload.display_name = updates.displayName.trim();
  }
  if (updates.preferredLanguage !== undefined) {
    payload.preferred_language = updates.preferredLanguage;
  }
  if (updates.homeArea !== undefined) {
    payload.home_area = updates.homeArea.trim();
  }
  if (updates.emergencyContactName !== undefined) {
    payload.emergency_contact_name = updates.emergencyContactName.trim();
  }
  if (updates.emergencyContactPhone !== undefined) {
    payload.emergency_contact_phone = updates.emergencyContactPhone.trim();
  }
  if (updates.skills !== undefined) {
    payload.skills = updates.skills;
  }

  if (updates.capabilities) {
    if (updates.capabilities.physicalOk !== undefined) {
      payload.physical_ok = updates.capabilities.physicalOk;
    }
    if (updates.capabilities.goodEyesight !== undefined) {
      payload.good_eyesight = updates.capabilities.goodEyesight;
    }
    if (updates.capabilities.needsGlasses !== undefined) {
      payload.needs_glasses = updates.capabilities.needsGlasses;
    }
    if (updates.capabilities.canLiftHeavy !== undefined) {
      payload.can_lift_heavy = updates.capabilities.canLiftHeavy;
    }
    if (updates.capabilities.canWorkOutdoor !== undefined) {
      payload.can_work_outdoor = updates.capabilities.canWorkOutdoor;
    }
    if (updates.capabilities.hasLeaderExperience !== undefined) {
      payload.has_leader_experience = updates.capabilities.hasLeaderExperience;
    }
    if (updates.capabilities.newToVolunteer !== undefined) {
      payload.new_to_volunteer = updates.capabilities.newToVolunteer;
    }
  }

  if (updates.supportPreferences) {
    if (updates.supportPreferences.needsMealSupport !== undefined) {
      payload.needs_meal_support = updates.supportPreferences.needsMealSupport;
    }
    if (updates.supportPreferences.needsTravelSupport !== undefined) {
      payload.needs_travel_support = updates.supportPreferences.needsTravelSupport;
    }
    if (updates.supportPreferences.acceptsUnpaid !== undefined) {
      payload.accepts_unpaid = updates.supportPreferences.acceptsUnpaid;
    }
  }

  if (updates.donationPreferences) {
    if (updates.donationPreferences.bloodType !== undefined) {
      payload.blood_type = updates.donationPreferences.bloodType;
    }

    if (updates.donationPreferences.isWillingToDonate === false) {
      // P1-02: Setting master donation flag to false cascades both sub-flags to false
      // to avoid DB constraint violation and keep consistency with backend PATCH rules.
      payload.is_willing_to_donate = false;
      payload.is_willing_to_donate_blood =
        updates.donationPreferences.isWillingToDonateBlood ?? false;
      payload.is_willing_to_donate_items =
        updates.donationPreferences.isWillingToDonateItems ?? false;
    } else {
      const currentDonateBlood =
        currentProfile?.donationPreferences?.isWillingToDonateBlood;
      const currentDonateItems =
        currentProfile?.donationPreferences?.isWillingToDonateItems;

      const donateBlood =
        updates.donationPreferences.isWillingToDonateBlood !== undefined
          ? updates.donationPreferences.isWillingToDonateBlood
          : currentDonateBlood;

      const donateItems =
        updates.donationPreferences.isWillingToDonateItems !== undefined
          ? updates.donationPreferences.isWillingToDonateItems
          : currentDonateItems;

      if (donateBlood !== undefined) {
        payload.is_willing_to_donate_blood = donateBlood;
      }
      if (donateItems !== undefined) {
        payload.is_willing_to_donate_items = donateItems;
      }

      if (updates.donationPreferences.isWillingToDonate !== undefined) {
        payload.is_willing_to_donate = updates.donationPreferences.isWillingToDonate;
      } else if (donateBlood !== undefined || donateItems !== undefined) {
        payload.is_willing_to_donate = Boolean(donateBlood || donateItems);
      }
    }
  }

  return payload;
}

/**
 * Maps FeedbackSummaryResponseDto into domain MyFeedbackResponse with separate authored feedback
 * and received aggregate metrics (V-41, V-42, P2-02).
 */
export function mapMyFeedbackResponse(
  dto: FeedbackSummaryResponseDto,
): MyFeedbackResponse {
  const results = Array.isArray(dto.results) ? dto.results : [];
  const authoredFeedback: AuthoredFeedbackItem[] = results.map(item => ({
    id: String(item.id),
    eventId: String(item.event_id),
    eventTitle: item.event_title ?? undefined,
    direction: item.direction,
    ratingOverall: item.rating_overall,
    tags: Array.isArray(item.tags) ? item.tags : [],
    comments: item.comments ?? undefined,
    createdAt: item.created_at,
  }));

  const s = dto.summary || {};
  const asVol = s.as_volunteer || {
    count: s.volunteer_rating_count ?? 0,
    avg_overall: s.volunteer_avg_rating ?? null,
  };
  const asCoord = s.as_coordinator || {
    count: s.coordinator_rating_count ?? 0,
    avg_overall: s.coordinator_avg_rating ?? null,
  };

  const totalCount =
    s.total_count ?? (asVol.count + asCoord.count);
  const overallAvg =
    s.overall_avg_rating ??
    (totalCount > 0 ? asVol.avg_overall ?? asCoord.avg_overall : null);

  const receivedSummary: FeedbackRatingSummary = {
    userId: s.user_id !== undefined ? String(s.user_id) : undefined,
    overallAvgRating: overallAvg,
    totalCount,
    volunteerAvgRating: s.volunteer_avg_rating ?? asVol.avg_overall ?? null,
    volunteerRatingCount: s.volunteer_rating_count ?? asVol.count ?? 0,
    coordinatorAvgRating: s.coordinator_avg_rating ?? asCoord.avg_overall ?? null,
    coordinatorRatingCount: s.coordinator_rating_count ?? asCoord.count ?? 0,
    asVolunteer: {
      count: asVol.count,
      avgOverall: asVol.avg_overall,
    },
    asCoordinator: {
      count: asCoord.count,
      avgOverall: asCoord.avg_overall,
    },
    ratingDistribution: s.rating_distribution || {},
  };

  return {
    authoredFeedback,
    receivedSummary,
  };
}

/**
 * Maps AvailabilityResponseDto to domain VolunteerAvailability model.
 */
export function mapAvailability(
  dto: AvailabilityResponseDto,
): VolunteerAvailability {
  const weeklyRules: WeeklyAvailabilityRule[] = (dto.rules || []).map(r => {
    const normStart = normalizeTimeString(r.start_time);
    const normEnd = normalizeTimeString(r.end_time);
    const deterministicId =
      r.id != null ? String(r.id) : `${r.weekday}-${normStart}-${normEnd}`;

    return {
      id: deterministicId,
      weekday: r.weekday,
      weekdayName: WEEKDAY_NAMES[r.weekday] || `Day ${r.weekday}`,
      startTime: normStart,
      endTime: normEnd,
      validFrom: r.valid_from ?? undefined,
      validTo: r.valid_to ?? undefined,
    };
  });

  const exceptions: AvailabilityException[] = (dto.exceptions || []).map(e => ({
    id: String(e.id ?? `exc-${e.date}`),
    date: e.date,
    isAvailable: Boolean(e.is_available),
    startTime: e.start_time ? normalizeTimeString(e.start_time) : undefined,
    endTime: e.end_time ? normalizeTimeString(e.end_time) : undefined,
    note: e.note ?? undefined,
  }));

  return {
    weeklyRules,
    exceptions,
  };
}

/**
 * Maps domain weekly rules into AvailabilityRulesReplaceDto payload.
 */
export function mapAvailabilityRulesReplaceRequest(
  rules: WeeklyAvailabilityRule[],
): AvailabilityRulesReplaceDto {
  return {
    rules: rules.map(r => {
      const item: AvailabilityRulesReplaceDto['rules'][number] = {
        weekday: r.weekday,
        start_time: formatToTimeWithSeconds(r.startTime),
        end_time: formatToTimeWithSeconds(r.endTime),
      };
      if (r.validFrom !== undefined && r.validFrom !== null) {
        item.valid_from = r.validFrom;
      }
      if (r.validTo !== undefined && r.validTo !== null) {
        item.valid_to = r.validTo;
      }
      return item;
    }),
  };
}

/**
 * Normalizes backend verification image status to domain status.
 */
function normalizeVerificationStatus(statusStr: string): VerificationStatus {
  if (statusStr === 'approved' || statusStr === 'verified') {
    return 'verified';
  }
  if (statusStr === 'pending') {
    return 'pending';
  }
  if (statusStr === 'rejected') {
    return 'rejected';
  }
  return 'none';
}

/**
 * Maps VerificationStatusResponseDto and coordinator envelope to VerificationCoordinatorData.
 */
export function mapVerificationCoordinatorData(
  verificationDto: VerificationStatusResponseDto,
  coordinatorEnvelope?: CoordinatorProfileEnvelopeDto | null,
): VerificationCoordinatorData {
  const verifStatus = normalizeVerificationStatus(
    verificationDto.verification_status,
  );
  const coordStatus: CoordinatorStatus =
    (coordinatorEnvelope?.coordinator?.status as CoordinatorStatus) || 'none';

  const imageMap = new Map(
    (verificationDto.images || []).map(img => [img.image_type, img]),
  );

  const slotConfigs: Array<{
    imageType: VerificationImageType;
    label: string;
    description: string;
  }> = [
    {
      imageType: 'mock_selfie',
      label: 'Photo Selfie',
      description: 'Clear frontal photo of your face for on-site visual identity match.',
    },
    {
      imageType: 'id_license',
      label: 'NRC / Citizen ID',
      description: 'Official national identity card (front and back clearly legible).',
    },
    {
      imageType: 'driver_license',
      label: "Driver's License (Optional)",
      description: 'Required if volunteering for logistics or transport roles.',
    },
  ];

  const imageSlots: VerificationImageSlot[] = slotConfigs.map(cfg => {
    const record = imageMap.get(cfg.imageType);
    return {
      imageType: cfg.imageType,
      label: cfg.label,
      description: cfg.description,
      status: record ? normalizeVerificationStatus(record.status) : 'none',
      fileFormat: 'jpeg',
      uploadedAt: record ? record.created_at : undefined,
    };
  });

  return {
    verificationStatus: verifStatus,
    coordinatorStatus: coordStatus,
    canApplyForCoordinator: verifStatus === 'verified',
    imageSlots,
    coordinatorApplicationNote: coordinatorEnvelope?.coordinator?.notes ?? undefined,
  };
}
