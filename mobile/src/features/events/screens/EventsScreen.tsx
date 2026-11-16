/**
 * @format
 */

import React from 'react';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import { EventDiscoveryScreen } from './EventDiscoveryScreen';

export function EventsScreen({
  navigation,
  route,
}: MainDrawerScreenProps<'Events'>): React.JSX.Element {
  return <EventDiscoveryScreen navigation={navigation} route={route} />;
}
