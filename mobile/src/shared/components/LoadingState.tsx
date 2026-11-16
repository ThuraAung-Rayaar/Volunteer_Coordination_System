/**
 * @format
 */

import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useAppTheme } from '../../theme';
import { AppText } from './AppText';

export interface LoadingStateProps {
  label?: string;
  style?: StyleProp<ViewStyle>;
}

export function LoadingState({
  label = 'Loading...',
  style,
}: LoadingStateProps): React.JSX.Element {
  const { theme } = useAppTheme();

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={[
        styles.container,
        {
          padding: theme.spacing.xl,
        },
        style,
      ]}
    >
      <ActivityIndicator
        size="large"
        color={theme.colors.primary}
        style={{ marginBottom: theme.spacing.sm }}
      />
      {label ? (
        <AppText
          variant="caption"
          color={theme.colors.textSecondary}
        >
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
});
