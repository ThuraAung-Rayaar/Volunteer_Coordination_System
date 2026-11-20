/**
 * @format
 */

import {
  formatToTimeWithSeconds,
  mapAvailability,
  mapAvailabilityRulesReplaceRequest,
  mapMyFeedbackResponse,
  mapProfileUpdateRequest,
  mapUserProfile,
  mapVerificationCoordinatorData,
  normalizeTimeString,
} from '../profileMapper';
import type {
  AvailabilityResponseDto,
  CoordinatorProfileEnvelopeDto,
  FeedbackSummaryResponseDto,
  UserProfileDto,
  VerificationStatusResponseDto,
} from '../../dto/profileDto';
import type { VolunteerProfile } from '../../../domain/models/profile';

describe('profileMapper', () => {
  const sampleUserDto: UserProfileDto = {
    id: 201,
    uuid: 'usr-uuid-201',
    display_name: 'Ko Thura',
    phone: '+95912345678',
    preferred_language: 'my',
    home_area: 'Kamayut, Yangon',
    emergency_contact_name: 'Daw Nu Nu',
    emergency_contact_phone: '+95987654321',
    blood_type: 'O+',
    is_willing_to_donate: true,
    is_willing_to_donate_blood: true,
    is_willing_to_donate_items: false,
    physical_ok: true,
    good_eyesight: true,
    needs_glasses: false,
    can_lift_heavy: true,
    can_work_outdoor: true,
    has_leader_experience: true,
    new_to_volunteer: false,
    skills: ['first aid', 'logistics'],
    needs_meal_support: false,
    needs_travel_support: true,
    accepts_unpaid: true,
    verification_status: 'verified',
    account_status: 'active',
    charity_interests: ['disaster_support', 'health'],
    created_at: '2026-01-10T08:00:00Z',
  };

  describe('Time normalization helpers', () => {
    it('normalizes HH:mm:ss to HH:mm correctly', () => {
      expect(normalizeTimeString('08:30:00')).toBe('08:30');
      expect(normalizeTimeString('9:5:00')).toBe('09:05');
      expect(normalizeTimeString('18:00')).toBe('18:00');
      expect(normalizeTimeString(null)).toBe('00:00');
    });

    it('formats HH:mm to HH:mm:00 for TimeField backend storage', () => {
      expect(formatToTimeWithSeconds('08:30')).toBe('08:30:00');
      expect(formatToTimeWithSeconds('14:45:00')).toBe('14:45:00');
    });
  });

  describe('mapUserProfile', () => {
    const sampleCoordEnvelope: CoordinatorProfileEnvelopeDto = {
      coordinator: {
        user_id: 201,
        status: 'approved',
        approved_by_id: 1,
        approved_at: '2026-03-01T10:00:00Z',
        notes: 'Experienced volunteer coordinator',
        created_at: '2026-02-15T09:00:00Z',
        updated_at: '2026-03-01T10:00:00Z',
      },
    };

    const sampleFeedbackSummary: FeedbackSummaryResponseDto = {
      results: [],
      summary: {
        volunteer_avg_rating: 4.85,
        volunteer_rating_count: 14,
        total_count: 14,
      },
    };

    it('maps UserProfileDto composite into domain VolunteerProfile', () => {
      const profile = mapUserProfile(
        sampleUserDto,
        sampleCoordEnvelope,
        sampleFeedbackSummary,
      );

      expect(profile.id).toBe('201');
      // P1-01 / MAP-01: phone maps strictly to phone; absent email is undefined
      expect(profile.phone).toBe('+95912345678');
      expect(profile.email).toBeUndefined();
      expect(profile.displayName).toBe('Ko Thura');
      expect(profile.preferredLanguage).toBe('my');
      expect(profile.homeArea).toBe('Kamayut, Yangon');
      expect(profile.accountStatus).toBe('active');
      expect(profile.verificationStatus).toBe('verified');
      expect(profile.coordinatorStatus).toBe('approved');
      expect(profile.ratingAverage).toBe(4.85);
      expect(profile.ratingCount).toBe(14);
      expect(profile.capabilities.canLiftHeavy).toBe(true);
      expect(profile.supportPreferences.needsTravelSupport).toBe(true);
      expect(profile.donationPreferences.bloodType).toBe('O+');
      expect(profile.charityInterests).toEqual(['disaster_support', 'health']);
    });

    it('handles null phone, coordinator envelope, and feedback metrics safely', () => {
      const userWithoutPhone: UserProfileDto = {
        ...sampleUserDto,
        phone: null,
      };

      const profile = mapUserProfile(userWithoutPhone, null, null);
      expect(profile.phone).toBeNull();
      expect(profile.email).toBeUndefined();
      expect(profile.coordinatorStatus).toBe('none');
      expect(profile.ratingAverage).toBeNull();
      expect(profile.ratingCount).toBe(0);
    });
  });

  describe('mapProfileUpdateRequest', () => {
    it('strictly outputs ONLY allow-listed keys matching ProfileUpdateSerializer', () => {
      const updates: Partial<VolunteerProfile> = {
        displayName: 'Thura Updated',
        preferredLanguage: 'en',
        homeArea: 'Bahan, Yangon',
        emergencyContactName: 'U Tin',
        emergencyContactPhone: '+95911112222',
        skills: ['teaching', 'cooking'],
        capabilities: {
          physicalOk: true,
          goodEyesight: true,
          needsGlasses: true,
          canLiftHeavy: false,
          canWorkOutdoor: true,
          hasLeaderExperience: true,
          newToVolunteer: false,
        },
        supportPreferences: {
          needsMealSupport: true,
          needsTravelSupport: false,
          acceptsUnpaid: true,
        },
        donationPreferences: {
          bloodType: 'B+',
          isWillingToDonate: true,
          isWillingToDonateBlood: true,
          isWillingToDonateItems: true,
        },
      };

      const payload = mapProfileUpdateRequest(updates);

      // Verify exact allow-listed keys exist
      expect(payload.display_name).toBe('Thura Updated');
      expect(payload.preferred_language).toBe('en');
      expect(payload.home_area).toBe('Bahan, Yangon');
      expect(payload.emergency_contact_name).toBe('U Tin');
      expect(payload.emergency_contact_phone).toBe('+95911112222');
      expect(payload.skills).toEqual(['teaching', 'cooking']);
      expect(payload.needs_glasses).toBe(true);
      expect(payload.can_lift_heavy).toBe(false);
      expect(payload.needs_meal_support).toBe(true);
      expect(payload.blood_type).toBe('B+');
      expect(payload.is_willing_to_donate_blood).toBe(true);
      expect(payload.is_willing_to_donate).toBe(true);

      // Verify that non-allow-listed keys are NOT in the payload
      const payloadKeys = Object.keys(payload);
      expect(payloadKeys).not.toContain('id');
      expect(payloadKeys).not.toContain('email');
      expect(payloadKeys).not.toContain('account_status');
      expect(payloadKeys).not.toContain('verification_status');
      expect(payloadKeys).not.toContain('coordinator_status');
      expect(payloadKeys).not.toContain('charity_interests'); // handled via separate PUT endpoint
    });

    it('coherently merges donation sub-flags with currentProfile to preserve is_willing_to_donate', () => {
      const currentProfile: VolunteerProfile = {
        ...(sampleUserDto as any),
        donationPreferences: {
          bloodType: 'A+',
          isWillingToDonate: true,
          isWillingToDonateBlood: false,
          isWillingToDonateItems: true,
        },
      };

      const partialUpdates: Partial<VolunteerProfile> = {
        donationPreferences: {
          bloodType: 'A+',
          isWillingToDonate: true,
          isWillingToDonateBlood: false,
        } as any,
      };

      const partialPayload = mapProfileUpdateRequest(partialUpdates, currentProfile);
      expect(partialPayload.is_willing_to_donate).toBe(true);
      expect(partialPayload.is_willing_to_donate_blood).toBe(false);
      expect(partialPayload.is_willing_to_donate_items).toBe(true);
    });
  });

  describe('mapAvailability & mapAvailabilityRulesReplaceRequest', () => {
    it('maps AvailabilityResponseDto and normalizes time strings and weekday names', () => {
      const responseDto: AvailabilityResponseDto = {
        rules: [
          {
            id: 11,
            weekday: 1, // Monday
            start_time: '08:00:00',
            end_time: '12:00:00',
          },
          {
            id: 12,
            weekday: 6, // Saturday
            start_time: '13:30:00',
            end_time: '17:00:00',
          },
        ],
        exceptions: [
          {
            id: 21,
            date: '2026-12-25',
            is_available: false,
            note: 'Christmas blackout',
          },
        ],
      };

      const availability = mapAvailability(responseDto);
      expect(availability.weeklyRules).toHaveLength(2);
      expect(availability.weeklyRules[0].weekdayName).toBe('Monday');
      expect(availability.weeklyRules[0].startTime).toBe('08:00');
      expect(availability.weeklyRules[0].endTime).toBe('12:00');
      expect(availability.weeklyRules[1].weekdayName).toBe('Saturday');
      expect(availability.weeklyRules[1].startTime).toBe('13:30');

      expect(availability.exceptions).toHaveLength(1);
      expect(availability.exceptions[0].date).toBe('2026-12-25');
      expect(availability.exceptions[0].isAvailable).toBe(false);
      expect(availability.exceptions[0].note).toBe('Christmas blackout');
    });

    it('maps weekly rules to replacement DTO with seconds appended', () => {
      const rules = [
        {
          id: '1',
          weekday: 2,
          weekdayName: 'Tuesday',
          startTime: '09:00',
          endTime: '15:00',
        },
      ];

      const replaceDto = mapAvailabilityRulesReplaceRequest(rules);
      expect(replaceDto.rules).toEqual([
        {
          weekday: 2,
          start_time: '09:00:00',
          end_time: '15:00:00',
        },
      ]);
    });
  });

  describe('mapVerificationCoordinatorData', () => {
    it('maps verification response and translates "approved" image status to "verified"', () => {
      const verifDto: VerificationStatusResponseDto = {
        verification_status: 'verified',
        images: [
          {
            id: 301,
            image_type: 'mock_selfie',
            status: 'approved',
            is_current: true,
            reviewed_at: '2026-02-01T12:00:00Z',
            created_at: '2026-01-30T10:00:00Z',
          },
          {
            id: 302,
            image_type: 'id_license',
            status: 'pending',
            is_current: true,
            reviewed_at: null,
            created_at: '2026-02-01T08:00:00Z',
          },
        ],
      };

      const data = mapVerificationCoordinatorData(verifDto, null);
      expect(data.verificationStatus).toBe('verified');
      expect(data.canApplyForCoordinator).toBe(true);
      expect(data.imageSlots).toHaveLength(3);

      const selfieSlot = data.imageSlots.find(s => s.imageType === 'mock_selfie');
      expect(selfieSlot?.status).toBe('verified'); // mapped from 'approved'

      const idSlot = data.imageSlots.find(s => s.imageType === 'id_license');
      expect(idSlot?.status).toBe('pending');

      const driverSlot = data.imageSlots.find(s => s.imageType === 'driver_license');
      expect(driverSlot?.status).toBe('none'); // not uploaded
    });
  });

  describe('mapMyFeedbackResponse', () => {
    it('separates authored feedback list from received summary metrics', () => {
      const dto: FeedbackSummaryResponseDto = {
        results: [
          {
            id: 101,
            event_id: 50,
            event_title: 'Health Fair',
            direction: 'volunteer_to_coordinator',
            rating_overall: 5,
            tags: ['organized', 'supportive'],
            comments: 'Great coordinator!',
            created_at: '2026-11-15T12:00:00Z',
          },
        ],
        summary: {
          user_id: 10,
          overall_avg_rating: 4.8,
          total_count: 12,
          volunteer_avg_rating: 4.9,
          volunteer_rating_count: 10,
          coordinator_avg_rating: 4.5,
          coordinator_rating_count: 2,
          as_volunteer: { count: 10, avg_overall: 4.9 },
          as_coordinator: { count: 2, avg_overall: 4.5 },
        },
      };

      const mapped = mapMyFeedbackResponse(dto);
      expect(mapped.authoredFeedback).toHaveLength(1);
      expect(mapped.authoredFeedback[0].id).toBe('101');
      expect(mapped.authoredFeedback[0].eventId).toBe('50');
      expect(mapped.authoredFeedback[0].eventTitle).toBe('Health Fair');
      expect(mapped.authoredFeedback[0].ratingOverall).toBe(5);
      expect(mapped.authoredFeedback[0].tags).toEqual(['organized', 'supportive']);

      expect(mapped.receivedSummary.overallAvgRating).toBe(4.8);
      expect(mapped.receivedSummary.totalCount).toBe(12);
      expect(mapped.receivedSummary.asVolunteer.avgOverall).toBe(4.9);
      expect(mapped.receivedSummary.asCoordinator.avgOverall).toBe(4.5);
    });
  });
});
