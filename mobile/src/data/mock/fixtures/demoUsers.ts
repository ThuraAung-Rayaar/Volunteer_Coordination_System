/**
 * @format
 */

import { UserProfileSnapshot } from '../../../domain/models';

export const ordinaryVolunteerUser: UserProfileSnapshot = {
  id: 'usr-volunteer-001',
  displayName: 'Alex Morgan',
  phone: '+959111111111',
  email: 'alex.morgan@volunteer.local',
  coordinatorStatus: 'none',
  accountStatus: 'active',
};

export const approvedCoordinatorUser: UserProfileSnapshot = {
  id: 'usr-coordinator-002',
  displayName: 'Jordan Lee (Coordinator)',
  phone: '+959222222222',
  email: 'jordan.lee@volunteer.local',
  coordinatorStatus: 'approved',
  accountStatus: 'active',
};

export const pendingCoordinatorUser: UserProfileSnapshot = {
  id: 'usr-pending-003',
  displayName: 'Sam Taylor (Applicant)',
  phone: '+959333333333',
  email: 'sam.taylor@volunteer.local',
  coordinatorStatus: 'pending',
  accountStatus: 'active',
};

export const suspendedCoordinatorUser: UserProfileSnapshot = {
  id: 'usr-suspended-004',
  displayName: 'Chris Nolan (Suspended)',
  phone: '+959444444444',
  email: 'chris.nolan@volunteer.local',
  coordinatorStatus: 'suspended',
  accountStatus: 'active',
};
