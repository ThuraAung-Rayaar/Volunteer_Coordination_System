/**
 * @format
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import {
  AppHeader,
  EmptyState,
  ScreenContainer,
} from '../../../shared';
import { useAppTheme } from '../../../theme';

export interface FriendsPlaceholderScreenProps
  extends Partial<MainDrawerScreenProps<'Friends'>> {}

export function FriendsPlaceholderScreen({
  navigation,
}: FriendsPlaceholderScreenProps): React.JSX.Element {
  const { theme } = useAppTheme();

  const handleOpenDrawer = () => {
    if (navigation && typeof navigation.openDrawer === 'function') {
      navigation.openDrawer();
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title="Friends"
        onMenuPress={navigation ? handleOpenDrawer : undefined}
      />

      <ScreenContainer applySafeAreaInsets={false} style={styles.container}>
        <View style={styles.emptyContainer}>
          <EmptyState
            icon="user"
            title="Friends"
            description="Volunteer connections will be available when this feature is implemented."
          />
        </View>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  emptyContainer: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
});
