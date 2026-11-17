/**
 * @format
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { AppButton } from '../../../shared';
import { useAppTheme } from '../../../theme';

export interface CoordinatorDashboardCardProps {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Subtle full-width entry button for approved Coordinators.
 * Placed immediately below activity statistics per UX specification.
 */
export function CoordinatorDashboardCard({
  onPress,
  style,
}: CoordinatorDashboardCardProps): React.JSX.Element {
  const { theme } = useAppTheme();

  return (
    <View style={[styles.container, { marginBottom: theme.spacing.md }, style]}>
      <AppButton
        label="Open Coordinator Workspace"
        variant="secondary"
        leftIcon="chevron-right"
        onPress={onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});
