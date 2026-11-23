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
import type { CoordinatorEventSummary } from '../../../domain/models/coordinator';
import {
  AppCard,
  AppIcon,
  AppText,
  StatusBadge,
} from '../../../shared';
import { useAppTheme } from '../../../theme';

export interface CoordinatorEventCardProps {
  event: CoordinatorEventSummary;
  onPress: (eventId: string) => void;
  style?: StyleProp<ViewStyle>;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * CommonGround Coordinator Event Card
 * Direct implementation of mobile-ui-style.html coordinator event item:
 * Status pill, 13px bold title, location with pin, stats badges row (3 pending, 6 accepted, 4 on-site).
 */
export function CoordinatorEventCard({
  event,
  onPress,
  style,
}: CoordinatorEventCardProps): React.JSX.Element {
  const { theme } = useAppTheme();

  const getStatusBadge = () => {
    if (
      (event.status === 'active' || event.status === 'published') &&
      event.endAt &&
      new Date(event.endAt).getTime() < Date.now()
    ) {
      return <StatusBadge status="muted" label="Ended" />;
    }
    switch (event.status) {
      case 'active':
        return <StatusBadge status="sky" label="Active Shift" />;
      case 'published':
        return <StatusBadge status="emerald" label="Published" />;
      case 'draft':
        return <StatusBadge status="amber" label="Draft" />;
      case 'completed':
        return <StatusBadge status="emerald" label="Completed" />;
      case 'cancelled':
        return <StatusBadge status="rose" label="Cancelled" />;
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Coordinator Event: ${event.title}, Status: ${event.status}`}
      onPress={() => onPress(event.id)}
      style={({ pressed }) => [styles.pressable, pressed && { opacity: 0.92 }]}
    >
      <AppCard style={[styles.card, style]}>
        {/* Header row: Status badge + Monitor badge + Date */}
        <View style={styles.headerRow}>
          <View style={styles.badgeGroup}>
            {getStatusBadge()}
            {event.isOwnerAsMonitor ? (
              <View
                style={[
                  styles.monitorPill,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <AppText
                  variant="eyebrow"
                  weight="extrabold"
                  color={theme.colors.accent}
                >
                  👁️ Monitor Mode
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText variant="caption" color={theme.colors.textSecondary}>
            {formatDate(event.startAt)}
          </AppText>
        </View>

        {/* Title */}
        <AppText
          variant="title"
          weight="extrabold"
          color={theme.colors.textPrimary}
          style={styles.title}
        >
          {event.title}
        </AppText>

        {/* Location */}
        <View style={styles.metaRow}>
          <AppIcon
            name="pin"
            size={12}
            color={theme.colors.muted}
            style={styles.metaIcon}
          />
          <AppText
            variant="caption"
            color={theme.colors.muted}
            numberOfLines={1}
            style={styles.locationText}
          >
            {event.locationName}
          </AppText>
        </View>

        {/* Stats row (.stats) */}
        <View style={styles.statsRow}>
          <View
            style={[
              styles.statPill,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <AppText
              variant="caption"
              weight="bold"
              color={
                event.pendingApplicationCount > 0
                  ? theme.colors.warning
                  : theme.colors.textSecondary
              }
              style={styles.statPillText}
            >
              {event.pendingApplicationCount} pending
            </AppText>
          </View>

          <View
            style={[
              styles.statPill,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <AppText
              variant="caption"
              weight="bold"
              color={theme.colors.primary}
              style={styles.statPillText}
            >
              {event.acceptedApplicantCount} accepted
            </AppText>
          </View>

          <View
            style={[
              styles.statPill,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <AppText
              variant="caption"
              weight="bold"
              color={theme.colors.textSecondary}
              style={styles.statPillText}
            >
              {event.assignedCount} assigned
            </AppText>
          </View>

          {event.checkedInCount > 0 ? (
            <View
              style={[
                styles.statPill,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <AppText
                variant="caption"
                weight="bold"
                color={theme.colors.emerald ?? theme.colors.success}
                style={styles.statPillText}
              >
                {event.checkedInCount} on-site
              </AppText>
            </View>
          ) : null}
        </View>
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
    marginBottom: 10,
  },
  card: {
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monitorPill: {
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  title: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  metaIcon: {
    marginRight: 4,
  },
  locationText: {
    fontSize: 11,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statPill: {
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 9,
  },
  statPillText: {
    fontSize: 10,
  },
});
