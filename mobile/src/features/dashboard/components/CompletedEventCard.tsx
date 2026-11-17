/**
 * @format
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { CompletedActivity } from '../../../domain/models';
import {
  AppCard,
  AppIcon,
  AppText,
  formatDisplayDate,
  StatusBadge,
} from '../../../shared';
import { hexToRgba, useAppTheme } from '../../../theme';

export interface CompletedEventCardProps {
  activity: CompletedActivity;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

function parseMonthAndDay(isoString: string): { month: string; day: string } {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) {
      return { month: 'NOV', day: '12' };
    }
    const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const day = d.toLocaleDateString('en-US', { day: 'numeric' });
    return { month, day };
  } catch {
    return { month: 'NOV', day: '12' };
  }
}

export function CompletedEventCard({
  activity,
  onPress,
  style,
}: CompletedEventCardProps): React.JSX.Element {
  const { theme, isDark } = useAppTheme();
  const { month, day } = parseMonthAndDay(activity.completedAt);

  return (
    <AppCard
      variant="default"
      onPress={onPress}
      accessibilityLabel={`Completed event: ${activity.eventTitle}`}
      style={[
        styles.card,
        {
          padding: 14,
          marginBottom: 10,
        },
        style,
      ]}
    >
      <View style={styles.cardRow}>
        {/* Date badge */}
        <View
          style={[
            styles.dateBadge,
            {
              backgroundColor: hexToRgba(theme.colors.emerald ?? theme.colors.success, isDark ? 0.22 : 0.10),
              borderColor: hexToRgba(theme.colors.emerald ?? theme.colors.success, isDark ? 0.40 : 0.25),
              borderRadius: 14,
            },
          ]}
        >
          <AppText
            variant="eyebrow"
            weight="extrabold"
            color={theme.colors.emerald ?? theme.colors.success}
            style={styles.dateMonth}
          >
            {month}
          </AppText>
          <AppText
            variant="heading"
            weight="extrabold"
            color={theme.colors.textPrimary}
            style={styles.dateDay}
          >
            {day}
          </AppText>
        </View>

        {/* Content Column */}
        <View style={styles.middleColumn}>
          <StatusBadge status="emerald" label="Attendance Verified" />

          <AppText
            variant="title"
            weight="bold"
            color={theme.colors.textPrimary}
            numberOfLines={1}
            style={styles.title}
          >
            {activity.eventTitle}
          </AppText>

          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            numberOfLines={1}
            style={styles.role}
          >
            Role: {activity.roleName}
          </AppText>

          <View style={styles.footerRow}>
            <AppText
              variant="caption"
              color={theme.colors.primary}
              weight="bold"
              style={styles.hoursText}
            >
              {activity.verifiedHours.toFixed(1)} hrs recorded
            </AppText>

            <View style={styles.locationContainer}>
              <AppIcon
                name="pin"
                size={11}
                color={theme.colors.muted}
                style={{ marginRight: 3 }}
              />
              <AppText
                variant="caption"
                color={theme.colors.muted}
                numberOfLines={1}
              >
                {activity.location}
              </AppText>
            </View>
          </View>
        </View>

        {/* Right Arrow Button: 34x34 squircle */}
        <View
          style={[
            styles.arrowButton,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderColor: theme.colors.border,
              borderRadius: 11,
            },
          ]}
        >
          <AppIcon
            name="arrow"
            size={16}
            color={theme.colors.textSecondary}
          />
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateBadge: {
    width: 50,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  dateMonth: {
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.8,
  },
  dateDay: {
    fontSize: 20,
    lineHeight: 24,
    marginTop: 1,
  },
  middleColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 2,
  },
  role: {
    fontSize: 11,
    marginBottom: 4,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  hoursText: {
    fontSize: 11,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  arrowButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
