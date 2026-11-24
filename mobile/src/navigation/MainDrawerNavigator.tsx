/**
 * @format
 */

import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { CoordinatorWorkspaceScreen } from '../features/coordinator/screens/CoordinatorWorkspaceScreen';
import { CoordinatorEventsScreen } from '../features/coordinator/screens/CoordinatorEventsScreen';
import { CreateEventWizardScreen } from '../features/coordinator/screens/CreateEventWizardScreen';
import { CoordinatorEventDetailScreen } from '../features/coordinator/screens/CoordinatorEventDetailScreen';
import { CoordinatorApplicationsScreen } from '../features/coordinator/screens/CoordinatorApplicationsScreen';
import { CoordinatorAssignmentsScreen } from '../features/coordinator/screens/CoordinatorAssignmentsScreen';
import { CoordinatorAttendanceScreen } from '../features/coordinator/screens/CoordinatorAttendanceScreen';
import { DashboardScreen } from '../features/dashboard/screens/DashboardScreen';
import { EventsScreen } from '../features/events/screens/EventsScreen';
import { AssistantScreen } from '../features/assistant/screens/AssistantScreen';
import { EventDetailScreen } from '../features/events/screens/EventDetailScreen';
import { NotificationsScreen } from '../features/notifications/screens/NotificationsScreen';
import { MyApplicationsScreen } from '../features/events/screens/MyApplicationsScreen';
import { MyAssignmentsScreen } from '../features/events/screens/MyAssignmentsScreen';
import { VolunteerWorkspaceScreen } from '../features/events/screens/VolunteerWorkspaceScreen';
import { FriendsScreen } from '../features/friends/screens/FriendsScreen';
import { AvailabilityScreen } from '../features/profile/screens/AvailabilityScreen';
import { ProfileScreen } from '../features/profile/screens/ProfileScreen';
import { ProfileEditScreen } from '../features/profile/screens/ProfileEditScreen';
import { VerificationCoordinatorStatusScreen } from '../features/profile/screens/VerificationCoordinatorStatusScreen';
import { SettingsScreen } from '../features/settings/screens/SettingsScreen';
import { useAppTheme } from '../theme';
import { MainDrawerContent } from './MainDrawerContent';
import type { MainDrawerParamList } from './navigationTypes';

const Drawer = createDrawerNavigator<MainDrawerParamList>();

export function MainDrawerNavigator(): React.JSX.Element {
  const { theme } = useAppTheme();

  return (
    <Drawer.Navigator
      drawerContent={MainDrawerContent}
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        drawerStyle: {
          backgroundColor: theme.colors.surface,
          width: 310,
        },
        swipeEnabled: true,
      }}
    >
      <Drawer.Screen name="Dashboard" component={DashboardScreen} />
      <Drawer.Screen name="Events" component={EventsScreen} />
      <Drawer.Screen name="Assistant" component={AssistantScreen} />
      <Drawer.Screen name="Notifications" component={NotificationsScreen} />
      <Drawer.Screen name="EventDetail" component={EventDetailScreen} />
      <Drawer.Screen name="Friends" component={FriendsScreen} />
      <Drawer.Screen name="MyApplications" component={MyApplicationsScreen} />
      <Drawer.Screen name="MyAssignments" component={MyAssignmentsScreen} />
      <Drawer.Screen
        name="VolunteerWorkspace"
        component={VolunteerWorkspaceScreen}
      />
      <Drawer.Screen name="Profile" component={ProfileScreen} />
      <Drawer.Screen name="ProfileEdit" component={ProfileEditScreen} />
      <Drawer.Screen name="Availability" component={AvailabilityScreen} />
      <Drawer.Screen
        name="VerificationCoordinatorStatus"
        component={VerificationCoordinatorStatusScreen}
      />
      <Drawer.Screen
        name="CoordinatorWorkspace"
        component={CoordinatorWorkspaceScreen}
      />
      <Drawer.Screen
        name="CoordinatorEvents"
        component={CoordinatorEventsScreen}
      />
      <Drawer.Screen
        name="CreateEventWizard"
        component={CreateEventWizardScreen}
      />
      <Drawer.Screen
        name="CoordinatorEventDetail"
        component={CoordinatorEventDetailScreen}
      />
      <Drawer.Screen
        name="CoordinatorApplications"
        component={CoordinatorApplicationsScreen}
      />
      <Drawer.Screen
        name="CoordinatorAssignments"
        component={CoordinatorAssignmentsScreen}
      />
      <Drawer.Screen
        name="CoordinatorAttendance"
        component={CoordinatorAttendanceScreen}
      />
      <Drawer.Screen name="Settings" component={SettingsScreen} />
    </Drawer.Navigator>
  );
}
