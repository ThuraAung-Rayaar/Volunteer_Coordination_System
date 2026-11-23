/**
 * @format
 */

import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useCurrentUser } from '../../../app/UserContext';
import { IDashboardRepository } from '../../../data/contracts';
import { CompletedActivity, UpcomingCommitment } from '../../../domain/models';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppIcon,
  AppText,
  EmptyState,
  ErrorState,
  LoadingState,
  RatingSummary,
  ScreenContainer,
  SectionHeader,
  StatusBadge,
} from '../../../shared';
import { hexToRgba, useAppTheme } from '../../../theme';
import {
  ActivityStatCard,
  CompletedEventCard,
  CoordinatorDashboardCard,
  UpcomingCommitmentCard,
} from '../components';
import { useRepositories } from '../../../app/RepositoryProvider';
import { isMockMode } from '../../../app/configuration/dataMode';
import { useDashboard } from '../hooks/useDashboard';

export interface DashboardScreenProps
  extends Partial<MainDrawerScreenProps<'Dashboard'>> {
  repository?: IDashboardRepository;
}

export function DashboardScreen({
  navigation,
  repository: propRepository,
}: DashboardScreenProps): React.JSX.Element {
  const { theme, isDark } = useAppTheme();
  const { currentUser, isCoordinator } = useCurrentUser();
  const repositories = useRepositories();
  const repository = propRepository ?? repositories.dashboardRepository;
  const { summary, loading, error, refresh, cancelParticipation } =
    useDashboard(repository);

  // Cancel Participation confirmation modal state
  const [commitmentToCancel, setCommitmentToCancel] =
    useState<UpcomingCommitment | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Attendance-backed verification: strictly completed status
  const verifiedCompletedActivities = useMemo(() => {
    return (summary?.recentCompletedActivities ?? []).filter(
      activity => activity.attendanceStatus === 'completed',
    );
  }, [summary]);

  // Sum of verified hours from completed activities (falling back neatly to 0)
  const totalVerifiedHours = useMemo(() => {
    if (!summary?.recentCompletedActivities) return 0;
    return summary.recentCompletedActivities.reduce(
      (sum, act) => sum + (act.verifiedHours || 0),
      0,
    );
  }, [summary]);

  const handleOpenEventDetail = useCallback(
    (eventId: string) => {
      navigation?.navigate?.('EventDetail', {
        eventId,
        returnTo: 'Dashboard',
      });
    },
    [navigation],
  );

  const handleConfirmCancelParticipation = async () => {
    if (!commitmentToCancel) {
      return;
    }

    setIsCancelling(true);
    try {
      const result = await cancelParticipation(commitmentToCancel.id);
      if (result.success) {
        setFeedbackBanner(
          `Participation in "${commitmentToCancel.eventTitle}" cancelled. ${result.message}`,
        );
        setCommitmentToCancel(null);
      } else {
        setFeedbackBanner(`Cancellation was not completed: ${result.message}`);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to cancel participation.";
      setFeedbackBanner(`Cancellation failed: ${message}`);
    } finally {
      setIsCancelling(false);
    }
  };

  const renderCompletedActivityItem = ({
    item,
  }: {
    item: CompletedActivity;
  }) => (
    <CompletedEventCard
      activity={item}
      onPress={() => handleOpenEventDetail(item.eventId)}
    />
  );

  const keyExtractor = (item: CompletedActivity) => item.id;

  const listHeader = useMemo(() => {
    if (!summary) {
      return undefined;
    }

    return (
      <View style={styles.headerContainer}>
        {/* Section 1: Hero Welcome Card */}
        <AppCard variant="hero" style={styles.heroCard}>
          <View style={styles.heroPillRow}>
            <StatusBadge status="sky" label="Volunteer workspace" icon="spark" />
          </View>

          <AppText
            variant="label"
            weight="bold"
            color={theme.colors.primary}
            style={styles.heroKick}
          >
            Good morning, {currentUser.displayName}
          </AppText>

          <AppText
            variant="hero"
            weight="extrabold"
            color={theme.colors.textPrimary}
            style={styles.heroTitle}
          >
            Your time is making a difference.
          </AppText>

          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            style={styles.heroSub}
          >
            {`${summary.upcomingCommitmentCount} confirmed shifts this week · ${totalVerifiedHours} hours given`}
          </AppText>

          <View style={styles.badgeRow}>
            <StatusBadge status="emerald" label="Active Volunteer" />
            {isCoordinator ? (
              <StatusBadge status="sky" label="Approved Coordinator" />
            ) : null}
          </View>
        </AppCard>

        {/* Feedback / Demo confirmation banner */}
        {feedbackBanner ? (
          <View
            style={[
              styles.feedbackBanner,
              {
                backgroundColor: hexToRgba(theme.colors.primary, isDark ? 0.18 : 0.10),
                borderColor: hexToRgba(theme.colors.primary, 0.30),
              },
            ]}
          >
            <AppText
              variant="caption"
              weight="bold"
              color={theme.colors.primary}
            >
              {feedbackBanner}
            </AppText>
          </View>
        ) : null}

        {/* Section 2: Activity Statistics (3-column grid) */}
        <SectionHeader title="Activity Statistics" />
        <View style={styles.statsRow}>
          <ActivityStatCard
            label="Shifts Completed"
            value={summary.completedShiftCount}
            icon="check"
            subtext="+3 this month"
            color={theme.colors.emerald ?? theme.colors.success}
          />
          <ActivityStatCard
            label="Events Attended"
            value={summary.completedEventCount}
            icon="calendar"
            subtext="4 causes"
            color={theme.colors.indigo ?? theme.colors.primary}
          />
          <ActivityStatCard
            label="Upcoming"
            value={summary.upcomingCommitmentCount}
            icon="star"
            subtext="Next Sunday"
            color={theme.colors.sky ?? theme.colors.accent}
          />
        </View>

        {/* Section 3: Coordinator Workspace Subtle Entry Button */}
        {isCoordinator ? (
          <CoordinatorDashboardCard
            onPress={() => navigation?.navigate?.('CoordinatorWorkspace')}
          />
        ) : null}

        {/* Section 4: Aggregate Rating Summary */}
        <AppCard
          variant="raised"
          style={styles.ratingCard}
        >
          <AppText
            variant="eyebrow"
            color={theme.colors.muted}
            style={styles.ratingLabel}
          >
            COMMUNITY FEEDBACK (AGGREGATE ONLY)
          </AppText>
          <RatingSummary
            average={summary.ratingAverage}
            count={summary.ratingCount}
          />
          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            style={styles.ratingNotice}
          >
            Individual ratings and authored feedback rows remain private per governance rules.
          </AppText>
        </AppCard>

        {/* Section 5: Upcoming Commitments */}
        <SectionHeader
          title="Upcoming Commitments"
          actionLabel="Browse Events"
          onActionPress={() => navigation?.navigate?.('Events')}
        />
        {summary.upcomingCommitments.length > 0 ? (
          summary.upcomingCommitments.map(commitment => (
            <UpcomingCommitmentCard
              key={commitment.id}
              commitment={commitment}
              onPress={() => handleOpenEventDetail(commitment.eventId)}
              onCancelParticipation={c => setCommitmentToCancel(c)}
            />
          ))
        ) : (
          <EmptyState
            title="No upcoming commitments"
            description="You have no scheduled shifts. Find and apply for open events."
            actionLabel="Discover Events"
            onActionPress={() => navigation?.navigate?.('Events')}
            style={styles.emptyCommitments}
          />
        )}

        {/* Section 6 Header: Attendance-Backed Activities */}
        <SectionHeader
          title="Recent Completed Activities"
          actionLabel="View All"
          onActionPress={() => navigation?.navigate?.('MyAssignments')}
        />
      </View>
    );
  }, [
    summary,
    currentUser,
    isCoordinator,
    theme,
    isDark,
    navigation,
    feedbackBanner,
    handleOpenEventDetail,
  ]);

  const listEmptyComponent = useMemo(() => {
    if (loading) {
      return undefined;
    }

    return (
      <EmptyState
        title="No completed activities yet"
        description="Shifts with verified coordinator attendance records will appear here."
        style={styles.emptyActivities}
      />
    );
  }, [loading]);

  return (
    <View style={styles.root}>
      <AppHeader
        title="Dashboard"
        subtitle="Your volunteering, at a glance"
        onMenuPress={() => navigation?.openDrawer?.()}
      />

      <ScreenContainer applySafeAreaInsets={false} style={styles.screen}>
        {loading ? (
          <View style={styles.centerContainer}>
            <LoadingState label="Loading volunteer dashboard data..." />
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <ErrorState
              title="Failed to load dashboard"
              description={error}
              retryLabel="Retry Dashboard"
              onRetry={refresh}
            />
          </View>
        ) : (
          <FlatList
            data={verifiedCompletedActivities}
            renderItem={renderCompletedActivityItem}
            keyExtractor={keyExtractor}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={listEmptyComponent}
            contentContainerStyle={[
              styles.listContent,
              { paddingHorizontal: 16 },
            ]}
            showsVerticalScrollIndicator={false}
          />
        )}
      </ScreenContainer>

      {/* Cancel Participation Confirmation Bottom Sheet / Modal */}
      <Modal
        visible={Boolean(commitmentToCancel)}
        transparent
        animationType="fade"
        onRequestClose={() => setCommitmentToCancel(null)}
      >
        <View style={styles.scrimBackdrop}>
          <View
            style={[
              styles.sheetCard,
              {
                backgroundColor: theme.colors.surface,
                borderTopColor: theme.colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.handleBar,
                { backgroundColor: theme.colors.border },
              ]}
            />

            <View style={styles.modalHeader}>
              <AppText variant="title" weight="extrabold" color={theme.colors.textPrimary}>
                Cancel Participation
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close cancel modal"
                onPress={() => setCommitmentToCancel(null)}
                hitSlop={8}
                style={[
                  styles.closeIconBtn,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <AppIcon name="close" size={14} color={theme.colors.textSecondary} />
              </Pressable>
            </View>

            {/* Prominent Demo Warning */}
            {isMockMode() ? (
              <View
                style={[
                  styles.demoAlertBox,
                  {
                    backgroundColor: hexToRgba(theme.colors.warning, isDark ? 0.16 : 0.10),
                    borderColor: hexToRgba(theme.colors.warning, isDark ? 0.40 : 0.28),
                  },
                ]}
              >
                <AppText
                  variant="caption"
                  weight="bold"
                  color={theme.colors.warning}
                  style={styles.demoWarningTitle}
                >
                  ⚠️ Demo only — not submitted to server
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Cancelling will update your local session preview only. The
                  event itself remains active for other volunteers.
                </AppText>
              </View>
            ) : null}

            {/* Commitment Context */}
            {commitmentToCancel ? (
              <View style={styles.modalEventSummary}>
                <AppText
                  variant="body"
                  color={theme.colors.textSecondary}
                  style={styles.confirmPromptText}
                >
                  Cancel your participation in this event?
                </AppText>
                <AppText variant="body" weight="extrabold" color={theme.colors.textPrimary}>
                  {commitmentToCancel.eventTitle}
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                  Role: {commitmentToCancel.roleName}
                </AppText>
                <AppText variant="caption" color={theme.colors.muted} style={{ marginTop: 2 }}>
                  Location: {commitmentToCancel.location}
                </AppText>
              </View>
            ) : null}

            {/* Actions */}
            <View style={styles.modalActionsRow}>
              <View style={styles.modalButtonWrap}>
                <AppButton
                  label="Keep participation"
                  variant="secondary"
                  onPress={() => setCommitmentToCancel(null)}
                />
              </View>
              <View style={styles.modalButtonWrap}>
                <AppButton
                  label="Confirm Cancellation"
                  variant="primary"
                  loading={isCancelling}
                  onPress={handleConfirmCancelParticipation}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screen: {
    flex: 1,
    paddingHorizontal: 0,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  listContent: {
    paddingBottom: 40,
    paddingTop: 8,
  },
  headerContainer: {
    marginBottom: 4,
  },
  heroCard: {
    marginBottom: 12,
  },
  heroPillRow: {
    marginBottom: 8,
  },
  heroKick: {
    fontSize: 12,
    marginTop: 2,
  },
  heroTitle: {
    fontSize: 24,
    lineHeight: 28,
    marginTop: 4,
    letterSpacing: -0.6,
  },
  heroSub: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  feedbackBanner: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  ratingCard: {
    marginBottom: 12,
    padding: 14,
  },
  ratingLabel: {
    marginBottom: 8,
  },
  ratingNotice: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  emptyCommitments: {
    marginBottom: 12,
  },
  emptyActivities: {
    marginTop: 8,
  },
  scrimBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 30, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  handleBar: {
    width: 44,
    height: 4,
    borderRadius: 9,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  closeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoAlertBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  demoWarningTitle: {
    marginBottom: 4,
  },
  modalEventSummary: {
    marginBottom: 18,
  },
  confirmPromptText: {
    marginBottom: 6,
    fontSize: 13,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButtonWrap: {
    flex: 1,
  },
});
