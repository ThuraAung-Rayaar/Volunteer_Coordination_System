/**
 * @format
 */

import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { CoordinatorEventSummary } from '../../../domain/models/coordinator';
import { AppButton, AppCard, AppIcon, AppText, FilterChip, StatusBadge } from '../../../shared';
import { useAppTheme } from '../../../theme';

interface CoordinatorEventHeaderProps {
  events: CoordinatorEventSummary[];
  selectedEventId: string;
  onSelectEvent: (eventId: string) => void;
  onSwitchEvent?: () => void;
}

export function CoordinatorEventHeader({
  events,
  selectedEventId,
  onSelectEvent,
  onSwitchEvent,
}: CoordinatorEventHeaderProps): React.JSX.Element | null {
  const { theme } = useAppTheme();

  const currentEvent = events.find(e => e.id === selectedEventId) ?? events[0];
  if (!currentEvent) {
    return null;
  }

  const isMonitorMode = currentEvent.isOwnerAsMonitor;
  const isEnded =
    currentEvent.status === 'completed' ||
    currentEvent.status === 'ended' ||
    Boolean(
      currentEvent.endAt && new Date(currentEvent.endAt).getTime() < Date.now(),
    );

  const displayStatus = isEnded ? 'ENDED' : currentEvent.status.toUpperCase();
  const badgeStatus = isEnded
    ? 'muted'
    : currentEvent.status === 'active'
    ? 'success'
    : 'info';

  const activeEvents = events.filter(
    e =>
      e.status !== 'completed' &&
      e.status !== 'cancelled' &&
      e.status !== 'ended' &&
      (!e.endAt || new Date(e.endAt).getTime() >= Date.now()),
  );

  return (
    <View style={styles.container}>
      {/* Event Selection Switcher Chips */}
      {activeEvents.length > 1 ? (
        <View style={styles.selectorWrapper}>
          <AppText
            variant="label"
            color={theme.colors.textSecondary}
            style={styles.selectorLabel}
          >
            ACTIVE EVENT CONTEXT
          </AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
          >
            {activeEvents.map(ev => {
              const isSelected = ev.id === currentEvent.id;
              const label = ev.isOwnerAsMonitor
                ? `${ev.title} (Monitor)`
                : ev.title;
              return (
                <FilterChip
                  key={ev.id}
                  label={label}
                  selected={isSelected}
                  onPress={() => onSelectEvent(ev.id)}
                />
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* Selected Event Card Summary */}
      <AppCard style={styles.headerCard}>
        {isMonitorMode ? (
          <View
            style={[
              styles.monitorBanner,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.accent,
                borderRadius: theme.radius.sm,
              },
            ]}
          >
            <AppIcon name="alert" size={16} color={theme.colors.accent} />
            <AppText
              variant="caption"
              weight="bold"
              color={theme.colors.accent}
              style={styles.monitorText}
            >
              Read-Only Monitor Mode — Write actions are disabled for owner
            </AppText>
          </View>
        ) : null}

        <View style={styles.titleRow}>
          <View style={styles.titleTextContainer}>
            <AppText
              variant="title"
              weight="bold"
              color={theme.colors.textPrimary}
              numberOfLines={2}
            >
              {currentEvent.title}
            </AppText>
          </View>
          <StatusBadge
            status={badgeStatus}
            label={displayStatus}
          />
        </View>

        {onSwitchEvent ? (
          <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'flex-end' }}>
            <AppButton
              label="Switch Event"
              variant="outline"
              onPress={onSwitchEvent}
              style={{ minHeight: 28, paddingHorizontal: 10 }}
            />
          </View>
        ) : null}

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <AppIcon name="calendar" size={14} color={theme.colors.textSecondary} />
            <AppText
              variant="caption"
              color={theme.colors.textSecondary}
              style={styles.metaText}
            >
              {new Date(currentEvent.startAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </AppText>
          </View>

          <View style={styles.metaItem}>
            <AppIcon name="location" size={14} color={theme.colors.textSecondary} />
            <AppText
              variant="caption"
              color={theme.colors.textSecondary}
              numberOfLines={1}
              style={[styles.metaText, styles.locationText]}
            >
              {currentEvent.locationName}
            </AppText>
          </View>
        </View>
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  selectorWrapper: {
    marginBottom: 8,
  },
  selectorLabel: {
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  chipsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  headerCard: {
    padding: 14,
  },
  monitorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    marginBottom: 10,
  },
  monitorText: {
    marginLeft: 6,
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  titleTextContainer: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    marginLeft: 4,
  },
  locationText: {
    maxWidth: 200,
  },
});
