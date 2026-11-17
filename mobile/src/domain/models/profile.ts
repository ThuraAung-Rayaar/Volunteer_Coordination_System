/**
 * @format
 */

import type { CharityCategoryCode } from './event';

export type UserLanguage = 'en' | 'my';

export type BloodType =
  | 'unknown'
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'AB+'
  | 'AB-'
  | 'O+'
  | 'O-';

export interface VolunteerCapabilities {
  physicalOk: boolean;
  goodEyesight: boolean;
  needsGlasses: boolean;
  canLiftHeavy: boolean;
  canWorkOutdoor: boolean;
  hasLeaderExperience: boolean;
  newToVolunteer: boolean;
}

export interface VolunteerSupportPreferences {
  needsMealSupport: boolean;
  needsTravelSupport: boolean;
  acceptsUnpaid: boolean;
}

export interface VolunteerDonationPreferences {
  bloodType: BloodType;
  isWillingToDonateBlood: boolean;
  isWillingToDonateItems: boolean;
}

/**
 * Full volunteer profile data model matching the backend users table and allow-list.
 */
export interface VolunteerProfile {
  // Read-only system and security attributes (never editable controls)
  readonly id: string;
  readonly email: string;
  readonly accountStatus: 'active' | 'blocked' | 'closed';
  readonly verificationStatus: 'none' | 'pending' | 'verified' | 'rejected';
  readonly coordinatorStatus:
    | 'none'
    | 'pending'
    | 'approved'
    | 'suspended'
    | 'revoked';
  readonly isAdmin: boolean;
  readonly isStaff: boolean;
  readonly ratingAverage?: number | null;
  readonly ratingCount?: number;

  // Documented editable profile allow-list fields
  displayName: string;
  preferredLanguage: UserLanguage;
  homeArea: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  skills: string[];
  charityInterests: CharityCategoryCode[];
  capabilities: VolunteerCapabilities;
  supportPreferences: VolunteerSupportPreferences;
  donationPreferences: VolunteerDonationPreferences;
}
