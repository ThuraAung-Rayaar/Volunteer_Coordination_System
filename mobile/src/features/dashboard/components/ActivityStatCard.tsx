/**
 * @format
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { AppCard, AppText, IconName } from '../../../shared';
import { useAppTheme } from '../../../theme';

export interface ActivityStatCardProps {
  label: string;
  value: number | string;
  icon?: IconName;
  color?: string;
  subtext?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * CommonGround Activity Metric Card (.card.metric)
 * Direct implementation of mobile-ui-style.html metric card:
 * Ambient glow circle in top right, 9px uppercase bold eyebrow, 26px bold metric value, 10px context line.
 */
export function ActivityStatCard({
  label,
  value,
  color,
  subtext,
  style,
}: ActivityStatCardProps): React.JSX.Element {
  const { theme, isDark } = useAppTheme();
  const tintColor = color ?? theme.colors.primary;

  return (
    <AppCard
      variant="metric"
      glowColor={tintColor}
      style={[
        styles.card,
        {
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      <AppText
        variant="eyebrow"
        color={theme.colors.muted}
        numberOfLines={1}
        style={styles.eyebrow}
      >
        {label}
      </AppText>

      <AppText
        variant="metric"
        weight="extrabold"
        color={tintColor}
        style={styles.metricValue}
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
    flex: 1,
    minHeight: 96,
    padding: 12,
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 26,
    letterSpacing: -0.6,
    marginVertical: 4,
  },
  subtext: {
    fontSize: 10,
    lineHeight: 14,
  },
});
