/**
 * @format
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { CoordinatorRepository } from '../../../data/contracts/coordinatorRepository';
import { defaultCoordinatorRepository } from '../../../data/mock/MockCoordinatorRepository';
import { useRepositories } from '../../../app/RepositoryProvider';
import type {
  CoordinatorEventSummary,
  CoordinatorOverviewMetrics,
} from '../../../domain/models/coordinator';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppIcon,
  AppText,
  ErrorState,
  LoadingState,
  ScreenContainer,
  SectionHeader,
  SegmentedControl,
} from '../../../shared';
import { hexToRgba, useAppTheme } from '../../../theme';
import { appEventBus, AppEvents } from '../../../core/events/eventBus';
import {
  CoordinatorDynamicIsland,
  CoordinatorEventCard,
  CoordinatorGuard,
  CoordinatorMetricCard,
  CoordinatorSwipeWrapper,
} from '../components';

export interface CoordinatorOverviewScreenProps
  extends Partial<MainDrawerScreenProps<'CoordinatorWorkspace'>> {
  repository?: CoordinatorRepository;
}

export function CoordinatorOverviewScreen({
  navigation,
  repository: propRepository,
}: CoordinatorOverviewScreenProps): React.JSX.Element {
  const { theme, isDark } = useAppTheme();
  const repositories = useRepositories();
  const repository = propRepository ?? repositories.coordinatorRepository ?? defaultCoordinatorRepository;

  const [metrics, setMetrics] = useState<CoordinatorOverviewMetrics | null>(null);
  const [events, setEvents] = useState<CoordinatorEventSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeSegment, setActiveSegment] = useState<'applications' | 'assignments' | 'attendance'>('applications');

  const loadDashboard = useCallback(async () => {
    try {
      setErrorMessage(null);
      const [m, evts] = await Promise.all([
        repository.getOverviewMetrics(),
        repository.getMyEvents(),
      ]);
      setMetrics(m);
      setEvents(evts);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load workspace data',
      );
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Re-load coordinator overview on focus or when event status changes
  useEffect(() => {
    const unsubFocus = navigation?.addListener?.('focus', () => {
      loadDashboard();
    });
    const unsubBus = appEventBus.on(AppEvents.EVENT_STATUS_CHANGED, () => {
      if (!navigation?.isFocused || navigation.isFocused()) {
        loadDashboard();
      }
    });
    return () => {
      unsubFocus?.();
      unsubBus();
    };
  }, [navigation, loadDashboard]);

  const handleEventPress = (eventId: string) => {
    navigation?.navigate?.('CoordinatorEventDetail', { eventId });
  };

  const handleSegmentSelect = (key: 'applications' | 'assignments' | 'attendance') => {
    setActiveSegment(key);
    if (key === 'applications') {
      navigation?.navigate?.('CoordinatorApplications');
    } else if (key === 'assignments') {
      navigation?.navigate?.('CoordinatorAssignments');
    } else if (key === 'attendance') {
      navigation?.navigate?.('CoordinatorAttendance');
    }
  };

  return (
    <CoordinatorGuard navigation={navigation}>
      <CoordinatorSwipeWrapper currentTab="dashboard" navigation={navigation}>
        <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Coordinator Workspace"
          subtitle="Events & roster operations"
          onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
          rightAction={
            <AppButton
              label="+ New"
              variant="outline"
              onPress={() => navigation?.navigate?.('CreateEventWizard')}
              style={styles.newHeaderButton}
            />
          }
        />

        {isLoading ? (
          <LoadingState label="Loading coordinator metrics..." />
        ) : errorMessage || !metrics ? (
          <ErrorState
            title="Workspace Unavailable"
            description={errorMessage ?? 'Could not load coordinator metrics.'}
            onRetry={loadDashboard}
          />
        ) : (
          <ScreenContainer scroll style={styles.scroll}>
            {/* Action Needed Card (.alert) */}
            {metrics.pendingApplicationsCount > 0 ? (
              <AppCard
                variant="alert"
                style={styles.alertCard}
              >
                <View style={styles.alertRow}>
                  <View
                    style={[
                      styles.alertIconBox,
                      {
                        backgroundColor: hexToRgba(theme.colors.warning, isDark ? 0.30 : 0.18),
                      },
                    ]}
                  >
                    <AppIcon name="alert" size={18} color={theme.colors.warning} />
                  </View>

                  <View style={styles.alertTextCol}>
                    <AppText
                      variant="title"
                      weight="extrabold"
                      color={theme.colors.textPrimary}
                      style={styles.alertTitle}
                    >
                      Action Needed: {metrics.pendingApplicationsCount} Pending Applications
                    </AppText>
                    <AppText
                      variant="caption"
                      color={theme.colors.textSecondary}
                      style={styles.alertSub}
                    >
                      Waiting for roster placement and team assignments.
                    </AppText>
                  </View>

                  <AppButton
                    label="Review"
                    variant="warning"
                    onPress={() => navigation?.navigate?.('CoordinatorApplications')}
                    style={styles.reviewButton}
                  />
                </View>
              </AppCard>
            ) : null}

            {/* Metrics 2x2 Grid (.grid2) */}
            <SectionHeader title="Operational Metrics" />
            <View style={styles.metricGrid}>
              <View style={styles.metricCol}>
                <CoordinatorMetricCard
                  label="Total Events"
                  value={metrics.totalEventsCount}
                  icon="calendar"
                  color={theme.colors.sky ?? theme.colors.accent}
                  subtext={`${events.filter(e => (e.status === 'active' || e.status === 'published') && (!e.endAt || new Date(e.endAt).getTime() >= Date.now())).length} currently live`}
                />
              </View>
              <View style={styles.metricCol}>
                <CoordinatorMetricCard
                  label="Pending Apps"
                  value={metrics.pendingApplicationsCount}
                  icon="user"
                  color={theme.colors.amber ?? theme.colors.warning}
                  subtext="Review required"
                />
              </View>
              <View style={styles.metricCol}>
                <CoordinatorMetricCard
                  label="Accepted Roster"
                  value={metrics.acceptedApplicantsCount}
                  icon="check"
                  color={theme.colors.emerald ?? theme.colors.success}
                  subtext="Volunteers placed"
                />
              </View>
              <View style={styles.metricCol}>
                <CoordinatorMetricCard
                  label="Checked-in Today"
                  value={metrics.checkedInTodayCount}
                  icon="star"
                  color={theme.colors.indigo ?? theme.colors.primary}
                  subtext="Active on-site"
                />
              </View>
            </View>

            {/* Primary Action Button */}
            <View style={styles.createCtaContainer}>
              <AppButton
                label="Organize a Charity Event"
                accessibilityLabel="Organize a Charity Event"
                variant="primary"
                leftIcon="plus"
                onPress={() => navigation?.navigate?.('CreateEventWizard')}
              />
            </View>

            {/* Operational Management Quick Jump */}
            <SectionHeader title="Operational Roster Management" />
            <View style={styles.rosterQuickRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go to Applications"
                onPress={() => navigation?.navigate?.('CoordinatorApplications')}
                style={[
                  styles.rosterCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <AppIcon name="user" size={18} color={theme.colors.warning} />
                <View style={styles.rosterCardText}>
                  <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                    Applications
                  </AppText>
                  <AppText variant="caption" color={theme.colors.textSecondary}>
                    {metrics.pendingApplicationsCount} pending review
                  </AppText>
                </View>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go to Assignments"
                onPress={() => navigation?.navigate?.('CoordinatorAssignments')}
                style={[
                  styles.rosterCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <AppIcon name="brief" size={18} color={theme.colors.success} />
                <View style={styles.rosterCardText}>
                  <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                    Assignments
                  </AppText>
                  <AppText variant="caption" color={theme.colors.textSecondary}>
                    {metrics.acceptedApplicantsCount} placed in roster
                  </AppText>
                </View>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go to Attendance"
                onPress={() => navigation?.navigate?.('CoordinatorAttendance')}
                style={[
                  styles.rosterCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <AppIcon name="clock" size={18} color={theme.colors.primary} />
                <View style={styles.rosterCardText}>
                  <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                    Attendance
                  </AppText>
                  <AppText variant="caption" color={theme.colors.textSecondary}>
                    {metrics.checkedInTodayCount} checked in today
                  </AppText>
                </View>
              </Pressable>
            </View>

            {/* Managed Events Section (Excludes completed, cancelled, and ended events from main dashboard) */}
            <SectionHeader
              title="My Managed Events"
              actionLabel="View All"
              onActionPress={() => navigation?.navigate?.('CoordinatorEvents')}
            />

            {(() => {
              const liveEvents = events.filter(
                e =>
                  e.status !== 'completed' &&
                  e.status !== 'cancelled' &&
                  e.status !== 'ended' &&
                  (!e.endAt || new Date(e.endAt).getTime() >= Date.now()),
              );
              if (liveEvents.length === 0) {
                return (
                  <View
                    style={[
                      styles.emptyEventsBox,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <AppText
                      variant="body"
                      weight="semibold"
                      color={theme.colors.textSecondary}
                    >
                      No active events
                    </AppText>
                    <AppText
                      variant="caption"
                      color={theme.colors.textSecondary}
                    >
                      All previous events have ended. View event history in all events.
                    </AppText>
                  </View>
                );
              }
              return liveEvents.slice(0, 4).map(event => (
                <CoordinatorEventCard
                  key={event.id}
                  event={event}
                  onPress={handleEventPress}
                />
              ));
            })()}
          </ScreenContainer>
        )}

        {/* Dynamic Island Bottom Navigation */}
        <CoordinatorDynamicIsland
          activeTab="dashboard"
          navigation={navigation}
          pendingApplicationsCount={metrics?.pendingApplicationsCount ?? 0}
          acceptedApplicantsCount={metrics?.acceptedApplicantsCount ?? 0}
          checkedInTodayCount={metrics?.checkedInTodayCount ?? 0}
        />
      </View>
    </CoordinatorSwipeWrapper>
  </CoordinatorGuard>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    paddingVertical: 12,
    paddingBottom: 88,
  },
  newHeaderButton: {
    minHeight: 36,
    paddingHorizontal: 12,
  },
  alertCard: {
    marginBottom: 12,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  alertIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTextCol: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  alertSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  reviewButton: {
    minHeight: 36,
    paddingHorizontal: 14,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  metricCol: {
    width: '48.5%',
  },
  emptyEventsBox: {
    padding: 18,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    gap: 4,
    marginVertical: 8,
  },
  createCtaContainer: {
    marginBottom: 14,
  },
  rosterQuickRow: {
    gap: 8,
    marginBottom: 14,
  },
  rosterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  rosterCardText: {
    flex: 1,
  },
  segmentedControl: {
    marginBottom: 14,
  },
});
