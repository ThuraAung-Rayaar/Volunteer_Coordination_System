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
import {
  CHARITY_CATEGORIES,
  CharityCategoryCode,
  EventSummary,
} from '../../../domain/models/event';
import {
  AppCard,
  AppIcon,
  AppText,
  StatusBadge,
} from '../../../shared';
import { useAppTheme } from '../../../theme';

export interface EventCardProps {
  event: EventSummary;
  onPress: (eventId: string) => void;
  style?: StyleProp<ViewStyle>;
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

function getCategoryLabel(code: CharityCategoryCode): string {
  const match = CHARITY_CATEGORIES.find(c => c.code === code);
  return match ? match.label : code;
}

export function EventCard({
  event,
  onPress,
  style,
}: EventCardProps): React.JSX.Element {
  const { theme } = useAppTheme();

  const isLive = event.status === 'active';
  const statusBadgeType = isLive ? 'info' : 'success';
  const statusLabel = isLive ? 'Live / Active' : 'Published';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Event: ${event.title}, Status: ${statusLabel}, Date: ${formatDate(
        event.startAt,
      )}, Location: ${event.locationName}`}
      onPress={() => onPress(event.id)}
      style={({ pressed }) => [
        styles.pressable,
        pressed && { opacity: 0.92 },
      ]}
    >
      <AppCard style={[styles.card, style]}>
        {/* Header row: Status badge + Date */}
        <View style={styles.headerRow}>
          <StatusBadge
            status={isLive ? 'sky' : 'emerald'}
            label={statusLabel}
          />
          <AppText variant="caption" color={theme.colors.textSecondary}>
            {formatDate(event.startAt)}
          </AppText>
        </View>

        {/* Title */}
        <AppText
          variant="title"
          weight="bold"
          color={theme.colors.textPrimary}
          style={styles.title}
        >
          {event.title}
        </AppText>

        {/* Location */}
        <View style={styles.metaRow}>
          <AppIcon
            name="location"
            size={14}
            color={theme.colors.primary}
            style={styles.metaIcon}
          />
          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            numberOfLines={1}
            style={styles.locationText}
          >
            {event.locationName}
          </AppText>
        </View>

        {/* Description preview */}
        <AppText
          variant="body"
          color={theme.colors.textSecondary}
          numberOfLines={2}
          style={styles.description}
        >
          {event.description}
        </AppText>

        {/* Charity category chips */}
        <View style={styles.categoriesRow}>
          {event.charityFields.map(code => (
            <View
              key={code}
              style={[
                styles.categoryChip,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.sm,
                },
              ]}
            >
              <AppText
                variant="caption"
                weight="semibold"
                color={theme.colors.primary}
              >
                {getCategoryLabel(code)}
              </AppText>
            </View>
          ))}
        </View>

        {/* Footer row: Capacity spots remaining + support perks */}
        <View
          style={[
            styles.footerRow,
            { borderTopColor: theme.colors.border },
          ]}
        >
          <View style={styles.capacityContainer}>
            <AppText
              variant="caption"
              weight="bold"
              color={
                event.spotsRemaining > 0
                  ? theme.colors.success
                  : theme.colors.warning
              }
            >
              {event.spotsRemaining > 0
                ? `${event.spotsRemaining} spots remaining`
                : 'Full capacity'}
            </AppText>
          </View>

          {/* Perks */}
          <View style={styles.perksRow}>
            {event.mealsProvided ? (
              <View
                style={[
                  styles.perkBadge,
                  { backgroundColor: theme.colors.surfaceRaised },
                ]}
              >
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Meals
                </AppText>
              </View>
            ) : null}
            {event.travelSupportProvided ? (
              <View
                style={[
                  styles.perkBadge,
                  { backgroundColor: theme.colors.surfaceRaised },
                ]}
              >
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Travel
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },
  card: {
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  metaIcon: {
    marginRight: 4,
  },
  locationText: {
    flex: 1,
  },
  description: {
    marginBottom: 10,
    lineHeight: 18,
  },
  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  capacityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  perksRow: {
    flexDirection: 'row',
    gap: 6,
  },
  perkBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
