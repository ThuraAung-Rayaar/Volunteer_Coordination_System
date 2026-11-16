/**
 * @format
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { hexToRgba, useAppTheme } from '../../theme';
import { AppIcon, IconName } from './AppIcon';
import { AppText } from './AppText';

export type BadgeStatus =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'muted'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'sky'
  | 'indigo'
  | 'blue';

export interface StatusBadgeProps {
  status: BadgeStatus;
  label: string;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_STATUS_ICONS: Record<BadgeStatus, IconName | undefined> = {
  success: 'check',
  emerald: 'check',
  warning: 'alert',
  amber: 'alert',
  danger: 'close',
  rose: 'close',
  info: 'info',
  sky: 'spark',
  indigo: 'calendar',
  blue: 'check',
  muted: undefined,
};

/**
 * CommonGround Status Badge (.pill)
 * Direct implementation of mobile-ui-style.html pill specification:
 * Capsule radius, translucent tinted background (13%), tinted border (28%), uppercase 10px bold text.
 */
export function StatusBadge({
  status,
  label,
  icon,
  style,
}: StatusBadgeProps): React.JSX.Element {
  const { theme, isDark } = useAppTheme();

  let tintColor: string;
  switch (status) {
    case 'success':
    case 'emerald':
      tintColor = theme.colors.emerald ?? theme.colors.success;
      break;
    case 'warning':
    case 'amber':
      tintColor = theme.colors.amber ?? theme.colors.warning;
      break;
    case 'danger':
    case 'rose':
      tintColor = theme.colors.rose ?? theme.colors.danger;
      break;
    case 'info':
    case 'sky':
      tintColor = theme.colors.sky ?? theme.colors.accent;
      break;
    case 'indigo':
      tintColor = theme.colors.indigo ?? '#4F46E5';
      break;
    case 'blue':
      tintColor = theme.colors.primary;
      break;
    case 'muted':
    default:
      tintColor = theme.colors.muted;
      break;
  }

  const resolvedIcon = icon ?? DEFAULT_STATUS_ICONS[status];
  const bgAlpha = isDark ? 0.20 : 0.13;
  const borderAlpha = isDark ? 0.38 : 0.28;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label}`}
      style={[
        styles.badge,
        {
          backgroundColor: hexToRgba(tintColor, bgAlpha),
          borderColor: hexToRgba(tintColor, borderAlpha),
          borderRadius: theme.radius.pill ?? 9999,
          paddingVertical: 4,
          paddingHorizontal: 9,
        },
        style,
      ]}
    >
      {resolvedIcon ? (
        <AppIcon
          name={resolvedIcon}
          size={11}
          color={tintColor}
          style={{ marginRight: 4 }}
        />
      ) : null}

      <AppText
        variant="label"
        color={tintColor}
        weight="bold"
        style={styles.label}
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  label: {
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
