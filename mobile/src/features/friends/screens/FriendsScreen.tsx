/**
 * @format
 */

import React from 'react';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import { FriendsPlaceholderScreen } from './FriendsPlaceholderScreen';

export function FriendsScreen({
  navigation,
  route,
}: MainDrawerScreenProps<'Friends'>): React.JSX.Element {
  return <FriendsPlaceholderScreen navigation={navigation} route={route} />;
}
