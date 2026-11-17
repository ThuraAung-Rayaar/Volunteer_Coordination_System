/**
 * @format
 */

import type { VolunteerAvailability } from '../../../domain/models/availability';
import type { VolunteerProfile } from '../../../domain/models/profile';
import type { VerificationCoordinatorData } from '../../../domain/models/verification';

export const mockVolunteerProfile: VolunteerProfile = {
  id: 'usr-volunteer-001',
  phone: '+959111111111',
  email: 'alex.morgan@volunteer.local',
  accountStatus: 'active',
  verificationStatus: 'verified',
  coordinatorStatus: 'none',
  isAdmin: false,
  isStaff: false,
  ratingAverage: 4.88,
  ratingCount: 26,

  displayName: 'Alex Morgan',
  preferredLanguage: 'en',
  homeArea: 'Kamayut Township',
  emergencyContactName: 'Taylor Morgan',
  emergencyContactPhone: '+959123456789',
  skills: ['cleaning', 'first_aid', 'logistics', 'teaching'],
  charityInterests: ['environment', 'food_distribution', 'disaster_support'],

  capabilities: {
    physicalOk: true,
    goodEyesight: true,
    needsGlasses: false,
    canLiftHeavy: true,
    canWorkOutdoor: true,
    hasLeaderExperience: false,
    newToVolunteer: false,
  },

  supportPreferences: {
    needsMealSupport: true,
    needsTravelSupport: false,
    acceptsUnpaid: true,
  },

  donationPreferences: {
    bloodType: 'O+',
    isWillingToDonate: true,
    isWillingToDonateBlood: true,
    isWillingToDonateItems: true,
  },
};

export const mockAvailabilityFixture: VolunteerAvailability = {
  weeklyRules: [
    {
      id: 'rule-001',
      weekday: 6, // Saturday
      weekdayName: 'Saturday',
      startTime: '08:00',
      endTime: '13:00',
      validFrom: '2026-11-01',
      validTo: '2026-12-31',
    },
    {
      id: 'rule-002',
      weekday: 7, // Sunday
      weekdayName: 'Sunday',
      startTime: '13:00',
      endTime: '18:00',
      validFrom: '2026-11-01',
      validTo: '2026-12-31',
    },
  ],
  exceptions: [
    {
      id: 'exc-001',
      date: '2026-11-21',
      isAvailable: false,
      note: 'Family commitment / Out of township',
    },
    {
      id: 'exc-002',
      date: '2026-11-28',
      isAvailable: true,
      startTime: '09:00',
      endTime: '12:00',
      note: 'Available for morning relief packing only',
    },
  ],
};

export const mockVerificationStatusFixture: VerificationCoordinatorData = {
  verificationStatus: 'verified',
  coordinatorStatus: 'none',
  canApplyForCoordinator: true,
  imageSlots: [
    {
      imageType: 'mock_selfie',
      label: 'Photo Verification (Selfie)',
      description: 'Facial image matching photo identification',
      status: 'verified',
      fileFormat: 'jpeg',
      uploadedAt: '2026-10-15T10:30:00Z',
    },
    {
      imageType: 'id_license',
      label: 'National Identity Document',
      description: 'Official government-issued citizenship ID card',
      status: 'verified',
      fileFormat: 'jpeg',
      uploadedAt: '2026-10-15T10:32:00Z',
    },
    {
      imageType: 'driver_license',
      label: "Driver's License (Optional)",
      description: 'Required only for driving and logistics transport roles',
      status: 'none',
      fileFormat: 'jpeg',
    },
  ],
  coordinatorApplicationNote: undefined,
};
