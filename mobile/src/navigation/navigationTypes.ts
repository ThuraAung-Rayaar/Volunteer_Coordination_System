/**
 * @format
 */

import type {
  DrawerNavigationProp,
  DrawerScreenProps,
} from '@react-navigation/drawer';

export type MainDrawerParamList = {
  Dashboard: undefined;
  Events: undefined;
  Friends: undefined;
  MyApplications: undefined;
  MyAssignments: undefined;
  Profile: undefined;
  ProfileEdit: undefined;
  Availability: undefined;
  VerificationCoordinatorStatus: undefined;
  CoordinatorWorkspace: undefined;
  Settings: undefined;
  EventDetail: {
    eventId: string;
    returnTo?: 'Dashboard' | 'Events' | 'MyApplications' | 'MyAssignments';
  };
  CoordinatorEvents: undefined;
  CreateEventWizard: { eventId?: string } | undefined;
  CoordinatorEventDetail: { eventId: string };
  CoordinatorApplications: { eventId?: string } | undefined;
  CoordinatorAssignments: { eventId?: string } | undefined;
  CoordinatorAttendance: { eventId?: string } | undefined;
};

export type MainDrawerScreenProps<
  RouteName extends keyof MainDrawerParamList,
> = DrawerScreenProps<MainDrawerParamList, RouteName>;

export type MainDrawerNavigationProp =
  DrawerNavigationProp<MainDrawerParamList>;
