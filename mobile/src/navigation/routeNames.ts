/**
 * @format
 */

export const RouteNames = {
  Dashboard: 'Dashboard',
  Events: 'Events',
  Friends: 'Friends',
  MyApplications: 'MyApplications',
  MyAssignments: 'MyAssignments',
  Profile: 'Profile',
  Availability: 'Availability',
  VerificationCoordinatorStatus: 'VerificationCoordinatorStatus',
  CoordinatorWorkspace: 'CoordinatorWorkspace',
  Settings: 'Settings',
  EventDetail: 'EventDetail',
  CoordinatorEvents: 'CoordinatorEvents',
  CreateEventWizard: 'CreateEventWizard',
  CoordinatorEventDetail: 'CoordinatorEventDetail',
  CoordinatorApplications: 'CoordinatorApplications',
  CoordinatorAssignments: 'CoordinatorAssignments',
  CoordinatorAttendance: 'CoordinatorAttendance',
} as const;

export type RouteName = (typeof RouteNames)[keyof typeof RouteNames];
