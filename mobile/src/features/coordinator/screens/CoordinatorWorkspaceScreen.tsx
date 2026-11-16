/**
 * @format
 */

import React from 'react';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import { CoordinatorOverviewScreen } from './CoordinatorOverviewScreen';

export function CoordinatorWorkspaceScreen({
  navigation,
  route,
}: MainDrawerScreenProps<'CoordinatorWorkspace'>): React.JSX.Element {
  return <CoordinatorOverviewScreen navigation={navigation} route={route} />;
}
