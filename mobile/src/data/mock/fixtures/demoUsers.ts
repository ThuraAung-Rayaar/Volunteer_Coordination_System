/**
 * @format
 */

import { UserProfileSnapshot } from '../../../domain/models';

export const ordinaryVolunteerUser: UserProfileSnapshot = {
  id: 'usr-volunteer-001',
  displayName: 'Alex Morgan',
  email: 'alex.morgan@volunteer.local',
  coordinatorStatus: 'none',
  accountStatus: 'active',
};

export const approvedCoordinatorUser: UserProfileSnapshot = {
  id: 'usr-coordinator-002',
  displayName: 'Jordan Lee (Coordinator)',
  email: 'jordan.lee@volunteer.local',
  coordinatorStatus: 'approved',
  accountStatus: 'active',
};

export const pendingCoordinatorUser: UserProfileSnapshot = {
  id: 'usr-pending-003',
  displayName: 'Sam Taylor (Applicant)',
  email: 'sam.taylor@volunteer.local',
  coordinatorStatus: 'pending',
  accountStatus: 'active',
};

export const suspendedCoordinatorUser: UserProfileSnapshot = {
  id: 'usr-suspended-004',
  displayName: 'Chris Nolan (Suspended)',
  email: 'chris.nolan@volunteer.local',
  coordinatorStatus: 'suspended',
  accountStatus: 'active',
};
