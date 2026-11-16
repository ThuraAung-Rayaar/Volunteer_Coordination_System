/**
 * @format
 */

import type { CoordinatorStatus } from './index';

export type VerificationStatus = 'none' | 'pending' | 'verified' | 'rejected';

export type VerificationImageType =
  | 'mock_selfie'
  | 'id_license'
  | 'driver_license';

export interface VerificationImageSlot {
  imageType: VerificationImageType;
  label: string;
  description: string;
  status: VerificationStatus;
  fileFormat: 'jpeg';
  uploadedAt?: string;
}

export interface VerificationCoordinatorData {
  verificationStatus: VerificationStatus;
  coordinatorStatus: CoordinatorStatus;
  canApplyForCoordinator: boolean;
  imageSlots: VerificationImageSlot[];
  coordinatorApplicationNote?: string;
}
