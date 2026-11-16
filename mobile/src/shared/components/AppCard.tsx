/**
 * @format
 */

import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { hexToRgba, useAppTheme } from '../../theme';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type CardVariant =
  | 'default'
  | 'raised'
  | 'outlined'
  | 'hero'
  | 'alert'
  | 'metric';

export interface AppCardProps {
  children: React.ReactNode;
  padding?: CardPadding;
  variant?: CardVariant;
  glowColor?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function AppCard({
  children,
  padding = 'lg',
  variant = 'default',
  glowColor,
  onPress,
  style,
  accessibilityLabel,
}: AppCardProps): React.JSX.Element {
  const { theme, isDark } = useAppTheme();

  const paddingValue =
    padding === 'none'
      ? 0
      : padding === 'sm'
      ? theme.spacing.sm
      : padding === 'md'
      ? theme.spacing.md
      : padding === 'xl'
      ? theme.spacing.xl
      : 14;

  let backgroundColor = theme.colors.surface;
  let borderColor = theme.colors.border;
  let borderWidth = 1;
  let borderRadius = theme.radius.card ?? 20;
  let shadowStyle: ViewStyle = {
    shadowColor: theme.colors.shadowColor,
    shadowOffset: { width: 0, height: isDark ? 6 : 4 },
    shadowOpacity: isDark ? 0.35 : 0.10,
    shadowRadius: isDark ? 16 : 12,
    elevation: isDark ? 4 : 2,
  };

  switch (variant) {
    case 'raised':
      backgroundColor = theme.colors.surfaceRaised;
      borderWidth = 1;
      borderColor = theme.colors.border;
      break;
    case 'outlined':
      backgroundColor = 'transparent';
      borderWidth = 1;
      borderColor = theme.colors.border;
      shadowStyle = {};
      break;
    case 'hero':
      backgroundColor = isDark ? '#0F172A' : '#F6F9FF';
      borderColor = isDark ? '#1E293B' : '#DFE9FE';
      borderRadius = 24;
      break;
    case 'alert':
      backgroundColor = hexToRgba(theme.colors.warning, isDark ? 0.16 : 0.10);
      borderColor = hexToRgba(theme.colors.warning, isDark ? 0.45 : 0.35);
      borderRadius = 18;
      break;
    case 'metric':
      backgroundColor = theme.colors.surface;
      borderRadius = 18;
      break;
    case 'default':
    default:
      backgroundColor = theme.colors.surface;
      break;
  }

  const containerStyle: ViewStyle = {
    backgroundColor,
    borderColor,
    borderWidth,
    borderRadius,
    padding: paddingValue,
  };

  const resolvedGlowColor = glowColor ?? theme.colors.primary;

  const content = (
    <>
      {variant === 'hero' ? (
        <View
          pointerEvents="none"
          style={[
            styles.heroOrb,
            {
              backgroundColor: theme.colors.primary,
              opacity: isDark ? 0.22 : 0.14,
            },
          ]}
        />
      ) : null}

      {variant === 'metric' && glowColor ? (
        <View
          pointerEvents="none"
          style={[
            styles.metricGlow,
            {
              backgroundColor: resolvedGlowColor,
              opacity: theme.colors.glowOpacity ?? (isDark ? 0.35 : 0.18),
            },
          ]}
        />
      ) : null}

      {children}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [
          styles.base,
          containerStyle,
          shadowStyle,
          { opacity: pressed ? 0.92 : 1 },
          style,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.base, containerStyle, shadowStyle, style]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  heroOrb: {
    position: 'absolute',
    right: -30,
    top: -40,
    width: 130,
    height: 130,
    borderRadius: 65,
  },
  metricGlow: {
    position: 'absolute',
    right: -14,
    top: -16,
    width: 60,
    height: 60,
    borderRadius: 30,
  },
});
