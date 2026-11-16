/**
 * @format
 */

import React from 'react';
import {
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import {
  AppCard,
  AppText,
  IconName,
} from '../../../shared';
import { useAppTheme } from '../../../theme';

export interface CoordinatorMetricCardProps {
  label: string;
  value: number | string;
  icon?: IconName;
  subtext?: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * CommonGround Coordinator Metric Card (.grid2 .metric)
 * Direct implementation of mobile-ui-style.html:
 * 9px uppercase eyebrow, 26px bold metric value, ambient colored corner glow, 10px context line.
 */
export function CoordinatorMetricCard({
  label,
  value,
  subtext,
  color,
  style,
}: CoordinatorMetricCardProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const tintColor = color ?? theme.colors.primary;

  return (
    <AppCard
      variant="metric"
      glowColor={tintColor}
      style={[styles.card, style]}
    >
      <AppText
        variant="eyebrow"
        color={theme.colors.muted}
        numberOfLines={1}
        style={styles.label}
      >
        {label}
      </AppText>

      <AppText
        variant="metric"
        weight="extrabold"
        color={tintColor}
        style={styles.value}
      >
        {value}
      </AppText>

      {subtext ? (
        <AppText
          variant="caption"
          color={theme.colors.textSecondary}
          numberOfLines={1}
          style={styles.subtext}
        >
          {subtext}
        </AppText>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    minHeight: 96,
    justifyContent: 'space-between',
    flex: 1,
  },
  label: {
    fontSize: 9,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 26,
    letterSpacing: -0.6,
    marginVertical: 4,
  },
  subtext: {
    fontSize: 10,
    lineHeight: 14,
  },
});
