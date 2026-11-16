/**
 * @format
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { CoordinatorRepository } from '../../../data/contracts/coordinatorRepository';
import { defaultCoordinatorRepository } from '../../../data/mock/MockCoordinatorRepository';
import { useRepositories } from '../../../app/RepositoryProvider';
import type {
  CoordinatorEventDetail,
  CoordinatorEventStatus,
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
  SectionHeader,
  StatusBadge,
} from '../../../shared';
import { useAppTheme } from '../../../theme';
import { CoordinatorGuard } from '../components';

export interface CoordinatorEventDetailScreenProps
  extends Partial<MainDrawerScreenProps<'CoordinatorEventDetail'>> {
  eventId?: string;
  repository?: CoordinatorRepository;
}

export function CoordinatorEventDetailScreen({
  route,
  navigation,
  eventId: propEventId,
  repository: propRepository,
}: CoordinatorEventDetailScreenProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const repositories = useRepositories();
  const repository = propRepository ?? repositories.coordinatorRepository ?? defaultCoordinatorRepository;
  const eventId = propEventId ?? route?.params?.eventId;

  const [event, setEvent] = useState<CoordinatorEventDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Transition Confirmation Dialog State
  const [pendingTargetStatus, setPendingTargetStatus] =
    useState<CoordinatorEventStatus | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!eventId) {
      setErrorMessage('No event ID provided');
      setIsLoading(false);
      return;
    }

    try {
      setErrorMessage(null);
      const data = await repository.getEventDetail(eventId);
      if (!data) {
        setErrorMessage('Coordinator event not found');
      } else {
        setEvent(data);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load event details',
      );
    } finally {
      setIsLoading(false);
    }
  }, [eventId, repository]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleConfirmTransition = async () => {
    if (!event || !pendingTargetStatus) {
      return;
    }

    setIsTransitioning(true);
    try {
      const result = await repository.transitionEventStatus(
        event.id,
        pendingTargetStatus,
      );

      if (result.success && result.data) {
        setFeedbackBanner(
          `Event status updated to ${pendingTargetStatus.toUpperCase()} (${result.message})`,
        );
        setEvent(result.data);
      } else {
        setFeedbackBanner(result.message);
      }
    } catch (err) {
      setFeedbackBanner(
        err instanceof Error ? err.message : 'Transition failed',
      );
    } finally {
      setIsTransitioning(false);
      setPendingTargetStatus(null);
    }
  };

  const handleBack = () => {
    if (navigation && navigation.canGoBack()) {
      navigation.goBack();
    } else if (navigation) {
      navigation.navigate('CoordinatorEvents');
    }
  };

  if (isLoading) {
    return (
      <CoordinatorGuard navigation={navigation}>
        <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
          <AppHeader title="Event Management" onBackPress={handleBack} />
          <LoadingState label="Loading event management details..." />
        </View>
      </CoordinatorGuard>
    );
  }

  if (errorMessage || !event) {
    return (
      <CoordinatorGuard navigation={navigation}>
        <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
          <AppHeader title="Event Management" onBackPress={handleBack} />
          <ErrorState
            title="Event Not Found"
            description={errorMessage ?? 'Could not find coordinator event.'}
            onRetry={loadDetail}
          />
        </View>
      </CoordinatorGuard>
    );
  }

  const isMonitorMode = event.isOwnerAsMonitor;
  const isFinalState =
    event.status === 'completed' || event.status === 'cancelled';

  return (
    <CoordinatorGuard navigation={navigation}>
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Event Management"
          subtitle={event.title}
          onBackPress={handleBack}
        />

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { padding: theme.spacing.md },
          ]}
        >
          {/* Feedback Banner */}
          {feedbackBanner ? (
            <View
              style={[
                styles.feedbackBanner,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.primary,
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

          {/* OWNER-AS-MONITOR READ-ONLY BANNER */}
          {isMonitorMode ? (
            <View
              style={[
                styles.monitorBanner,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.accent,
                },
              ]}
            >
              <AppIcon name="alert" size={20} color={theme.colors.accent} />
              <View style={styles.monitorTextCol}>
                <AppText
                  variant="body"
                  weight="bold"
                  color={theme.colors.accent}
                >
                  Read-Only Monitor Mode
                </AppText>
                <AppText
                  variant="caption"
                  color={theme.colors.textSecondary}
                  style={styles.monitorSubtext}
                >
                  Coordination of this event has been handed over to{' '}
                  <AppText variant="caption" weight="bold">
                    {event.coordinatorName}
                  </AppText>
                  . As event owner, you can monitor rosters and attendance, but
                  all edit and lifecycle transitions are disabled.
                </AppText>
              </View>
            </View>
          ) : null}

          {/* Event Header Card */}
          <AppCard style={styles.cardSpacing}>
            <View style={styles.headerRow}>
              <View style={styles.statusGroup}>
                <StatusBadge
                  status={
                    event.status === 'active'
                      ? 'info'
                      : event.status === 'published'
                      ? 'success'
                      : event.status === 'draft'
                      ? 'warning'
                      : event.status === 'completed'
                      ? 'success'
                      : 'danger'
                  }
                  label={event.status.toUpperCase()}
                />
                {isMonitorMode ? (
                  <StatusBadge status="warning" label="MONITOR ONLY" />
                ) : null}
              </View>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                Coordinator: {event.coordinatorName}
              </AppText>
            </View>

            <AppText
              variant="heading"
              weight="bold"
              color={theme.colors.textPrimary}
              style={styles.title}
            >
              {event.title}
            </AppText>

            <AppText
              variant="body"
              color={theme.colors.textSecondary}
              style={styles.description}
            >
              {event.description}
            </AppText>

            <View style={styles.categoriesRow}>
              {event.charityFields.map(code => (
                <View
                  key={code}
                  style={[
                    styles.categoryPill,
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
                    {code}
                  </AppText>
                </View>
              ))}
            </View>
          </AppCard>

          {/* Lifecycle Transitions Control Bar */}
          <SectionHeader title="Event Lifecycle Actions" />
          <AppCard style={styles.cardSpacing}>
            {isFinalState ? (
              <AppText variant="caption" color={theme.colors.textSecondary}>
                Event is in final {event.status.toUpperCase()} state. No further
                lifecycle transitions are permitted.
              </AppText>
            ) : isMonitorMode ? (
              <AppText variant="caption" color={theme.colors.accent}>
                Write and status transition actions are disabled for owner in
                monitor mode.
              </AppText>
            ) : (
              <View style={styles.actionsBar}>
                {/* Draft Actions */}
                {event.status === 'draft' && (
                  <>
                    <AppButton
                      label="Publish Event"
                      variant="primary"
                      disabled={isMonitorMode}
                      onPress={() => setPendingTargetStatus('published')}
                    />
                    <AppButton
                      label="Cancel Event"
                      variant="danger"
                      disabled={isMonitorMode}
                      onPress={() => setPendingTargetStatus('cancelled')}
                    />
                  </>
                )}

                {/* Published Actions */}
                {event.status === 'published' && (
                  <>
                    <AppButton
                      label="Activate Event (Shift Live)"
                      variant="primary"
                      disabled={isMonitorMode}
                      onPress={() => setPendingTargetStatus('active')}
                    />
                    <AppButton
                      label="Cancel Event"
                      variant="danger"
                      disabled={isMonitorMode}
                      onPress={() => setPendingTargetStatus('cancelled')}
                    />
                  </>
                )}

                {/* Active Actions */}
                {event.status === 'active' && (
                  <>
                    <AppButton
                      label="Mark Completed"
                      variant="primary"
                      disabled={isMonitorMode}
                      onPress={() => setPendingTargetStatus('completed')}
                    />
                    <AppButton
                      label="Cancel Event"
                      variant="danger"
                      disabled={isMonitorMode}
                      onPress={() => setPendingTargetStatus('cancelled')}
                    />
                  </>
                )}
              </View>
            )}
          </AppCard>

          {/* Operational Metrics Panel */}
          <SectionHeader title="Operational Roster Summary" />
          <AppCard style={styles.cardSpacing}>
            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Pending Apps
                </AppText>
                <AppText
                  variant="heading"
                  weight="bold"
                  color={
                    event.pendingApplicationCount > 0
                      ? theme.colors.warning
                      : theme.colors.textPrimary
                  }
                >
                  {event.pendingApplicationCount}
                </AppText>
              </View>

              <View style={styles.metricItem}>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Accepted Roster
                </AppText>
                <AppText
                  variant="heading"
                  weight="bold"
                  color={theme.colors.primary}
                >
                  {event.acceptedApplicantCount}
                </AppText>
              </View>

              <View style={styles.metricItem}>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Assigned Shifts
                </AppText>
                <AppText
                  variant="heading"
                  weight="bold"
                  color={theme.colors.textPrimary}
                >
                  {event.assignedCount}
                </AppText>
              </View>

              <View style={styles.metricItem}>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Checked In
                </AppText>
                <AppText
                  variant="heading"
                  weight="bold"
                  color={theme.colors.success}
                >
                  {event.checkedInCount}
                </AppText>
              </View>
            </View>

            {/* Operational Management Quick Links */}
            <View style={styles.rosterActionButtons}>
              <View style={styles.rosterBtnCol}>
                <AppButton
                  label="Applications"
                  variant="secondary"
                  onPress={() =>
                    navigation?.navigate?.('CoordinatorApplications', {
                      eventId: event.id,
                    })
                  }
                />
              </View>
              <View style={styles.rosterBtnCol}>
                <AppButton
                  label="Assignments"
                  variant="secondary"
                  onPress={() =>
                    navigation?.navigate?.('CoordinatorAssignments', {
                      eventId: event.id,
                    })
                  }
                />
              </View>
              <View style={styles.rosterBtnCol}>
                <AppButton
                  label="Attendance"
                  variant="secondary"
                  onPress={() =>
                    navigation?.navigate?.('CoordinatorAttendance', {
                      eventId: event.id,
                    })
                  }
                />
              </View>
            </View>
          </AppCard>

          {/* Location & Rules Summary */}
          <SectionHeader title="Location & Access Configuration" />
          <AppCard style={styles.cardSpacing}>
            <View style={styles.detailRow}>
              <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                Location:
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                {event.locationName}
              </AppText>
            </View>

            {event.landmarkText ? (
              <View style={styles.detailRow}>
                <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                  Landmark:
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  {event.landmarkText}
                </AppText>
              </View>
            ) : null}

            <View style={styles.detailRow}>
              <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                Geo Check-In:
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                {event.geoCheckinEnabled
                  ? `Enabled (${event.geoRadiusM}m radius, ${event.geoCheckinOpensBeforeMin} min buffer)`
                  : 'Disabled'}
              </AppText>
            </View>

            <View style={styles.detailRow}>
              <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
                Schedule:
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                {event.startAt} to {event.endAt}
              </AppText>
            </View>
          </AppCard>
        </ScrollView>

        {/* Consequential Transition Confirmation Modal */}
        <Modal
          visible={Boolean(pendingTargetStatus)}
          transparent
          animationType="fade"
          onRequestClose={() => setPendingTargetStatus(null)}
        >
          <View style={styles.modalBackdrop}>
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderRadius: theme.radius.lg,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.modalHeader}>
                <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
                  Confirm Status Transition
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close confirmation"
                  onPress={() => setPendingTargetStatus(null)}
                  hitSlop={8}
                >
                  <AppIcon name="close" size={20} color={theme.colors.textSecondary} />
                </Pressable>
              </View>

              <View
                style={[
                  styles.demoWarningBox,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.warning,
                  },
                ]}
              >
                <AppText
                  variant="caption"
                  weight="bold"
                  color={theme.colors.warning}
                >
                  ⚠️ Demo Preview — not submitted to server
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  This transition will update local mock state for this preview
                  session.
                </AppText>
              </View>

              <AppText variant="body" color={theme.colors.textPrimary} style={styles.confirmPrompt}>
                Are you sure you want to transition this event from{' '}
                <AppText variant="body" weight="bold">
                  {event.status.toUpperCase()}
                </AppText>{' '}
                to{' '}
                <AppText variant="body" weight="bold">
                  {pendingTargetStatus?.toUpperCase()}
                </AppText>
                ?
              </AppText>

              <View style={styles.modalActionsRow}>
                <View style={styles.modalButtonWrap}>
                  <AppButton
                    label="Cancel"
                    variant="outline"
                    onPress={() => setPendingTargetStatus(null)}
                  />
                </View>
                <View style={styles.modalButtonWrap}>
                  <AppButton
                    label="Confirm (Demo)"
                    variant={
                      pendingTargetStatus === 'cancelled'
                        ? 'danger'
                        : 'primary'
                    }
                    loading={isTransitioning}
                    onPress={handleConfirmTransition}
                  />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </CoordinatorGuard>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  feedbackBanner: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 16,
  },
  monitorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderWidth: 1,
    borderRadius: 8,
    gap: 10,
    marginBottom: 16,
  },
  monitorTextCol: {
    flex: 1,
    gap: 4,
  },
  monitorSubtext: {
    lineHeight: 18,
  },
  cardSpacing: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    marginBottom: 8,
  },
  description: {
    lineHeight: 20,
    marginBottom: 12,
  },
  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  actionsBar: {
    gap: 10,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  metricItem: {
    alignItems: 'center',
    gap: 4,
  },
  rosterActionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  rosterBtnCol: {
    flex: 1,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    padding: 20,
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  demoWarningBox: {
    padding: 10,
    borderWidth: 1,
    borderRadius: 6,
    marginBottom: 14,
    gap: 2,
  },
  confirmPrompt: {
    marginBottom: 16,
    lineHeight: 20,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButtonWrap: {
    flex: 1,
  },
});
