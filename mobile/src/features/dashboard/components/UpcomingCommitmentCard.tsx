/**
 * @format
 */

import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { UpcomingCommitment } from '../../../domain/models';
import {
  AppButton,
  AppCard,
  AppIcon,
  AppText,
  StatusBadge,
} from '../../../shared';
import { hexToRgba, useAppTheme } from '../../../theme';

export interface UpcomingCommitmentCardProps {
  commitment: UpcomingCommitment;
  onPress?: () => void;
  onCancelParticipation?: (commitment: UpcomingCommitment) => void;
  style?: StyleProp<ViewStyle>;
}

function parseMonthAndDay(isoString: string): { month: string; day: string } {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) {
      return { month: 'NOV', day: '15' };
    }
    const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const day = d.toLocaleDateString('en-US', { day: 'numeric' });
    return { month, day };
  } catch {
    return { month: 'NOV', day: '15' };
  }
}

/**
 * CommonGround Event Commitment Card (.card.ev)
 * Direct implementation of mobile-ui-style.html event row:
 * Date badge (50x56, month + day), Status pill, title, role, location with pin, and squircle arrow button.
 */
export function UpcomingCommitmentCard({
  commitment,
  onPress,
  onCancelParticipation,
  style,
}: UpcomingCommitmentCardProps): React.JSX.Element {
  const { theme, isDark } = useAppTheme();
  const isConfirmed = commitment.status === 'confirmed';
  const { month, day } = parseMonthAndDay(commitment.startAt);

  return (
    <AppCard
      variant="default"
      style={[
        styles.card,
        {
          padding: 14,
          marginBottom: 10,
        },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View details for ${commitment.eventTitle}`}
        onPress={onPress}
        style={styles.pressableRow}
      >
        {/* Date Badge: 50x56 squircle box */}
        <View
          style={[
            styles.dateBadge,
            {
              backgroundColor: hexToRgba(theme.colors.primary, isDark ? 0.22 : 0.10),
              borderColor: hexToRgba(theme.colors.primary, isDark ? 0.40 : 0.25),
              borderRadius: 14,
            },
          ]}
        >
          <AppText
            variant="eyebrow"
            weight="extrabold"
            color={theme.colors.primary}
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

        {/* Middle Content Column */}
        <View style={styles.middleColumn}>
          <StatusBadge
            status={isConfirmed ? 'emerald' : 'sky'}
            label={isConfirmed ? 'Confirmed Shift' : 'Assigned Shift'}
          />

          <AppText
            variant="title"
            weight="bold"
            color={theme.colors.textPrimary}
            numberOfLines={1}
            style={styles.eventTitle}
          >
            {commitment.eventTitle}
          </AppText>

          {commitment.roleName ? (
            <AppText
              variant="caption"
              color={theme.colors.textSecondary}
              numberOfLines={1}
              style={styles.roleName}
            >
              {commitment.roleName}
            </AppText>
          ) : null}

          {commitment.location ? (
            <View style={styles.locationRow}>
              <AppIcon
                name="pin"
                size={12}
                color={theme.colors.muted}
                style={styles.locationIcon}
              />
              <AppText
                variant="caption"
                color={theme.colors.muted}
                numberOfLines={1}
                style={styles.locationText}
              >
                {commitment.location}
              </AppText>
            </View>
          ) : null}
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
      </Pressable>

      {/* Cancel action if allowed */}
      {onCancelParticipation && (commitment.status as string) !== 'completed' ? (
        <View
          style={[
            styles.cancelContainer,
            {
              borderTopColor: theme.colors.border,
              paddingTop: 10,
              marginTop: 10,
            },
          ]}
        >
          <AppButton
            label="Cancel Participation"
            accessibilityLabel="Cancel participation"
            variant="outline"
            onPress={() => onCancelParticipation(commitment)}
            style={styles.cancelButton}
          />
        </View>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
  },
  pressableRow: {
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
  eventTitle: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 2,
  },
  roleName: {
    fontSize: 11,
    lineHeight: 15,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  locationIcon: {
    marginRight: 4,
  },
  locationText: {
    fontSize: 11,
  },
  arrowButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelContainer: {
    borderTopWidth: 1,
    alignItems: 'flex-end',
  },
  cancelButton: {
    minHeight: 36,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
});
