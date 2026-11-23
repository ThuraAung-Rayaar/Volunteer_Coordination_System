/**
 * @format
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { EventRepository } from '../../../data/contracts/eventRepository';
import { defaultLocationProvider } from '../../../core';
import {
  defaultEventRepository,
  MockEventRepository,
} from '../../../data/mock/MockEventRepository';
import { isMockMode } from '../../../app/configuration/dataMode';
import { useRepositories } from '../../../app/RepositoryProvider';
import {
  VolunteerAssignmentItem,
  VolunteerAssignmentStatus,
} from '../../../domain/models/event';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppIcon,
  AppInput,
  AppText,
  BadgeStatus,
  EmptyState,
  ErrorState,
  FilterChip,
  LoadingState,
  StatusBadge,
} from '../../../shared';
import { useAppTheme } from '../../../theme';

export type AssignmentFilterTab = 'all' | 'active' | 'completed' | 'cancelled';

export interface AssignmentsStateCache {
  statusFilter: AssignmentFilterTab;
  scrollOffset: number;
}

let assignmentsCache: AssignmentsStateCache = {
  statusFilter: 'all',
  scrollOffset: 0,
};

export function resetAssignmentsCache(): void {
  assignmentsCache = {
    statusFilter: 'all',
    scrollOffset: 0,
  };
}

export function getAssignmentsCache(): AssignmentsStateCache {
  return { ...assignmentsCache };
}

export interface MyAssignmentsScreenProps
  extends Partial<MainDrawerScreenProps<'MyAssignments'>> {
  repository?: EventRepository;
  hideHeader?: boolean;
}

function formatDateTimeRange(startIso?: string, endIso?: string): string {
  if (!startIso) {
    return '';
  }
  try {
    const start = new Date(startIso);
    const dateStr = start.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const startTime = start.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    if (endIso) {
      const end = new Date(endIso);
      const endTime = end.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${dateStr} • ${startTime} - ${endTime}`;
    }
    return `${dateStr} • ${startTime}`;
  } catch {
    return startIso;
  }
}

function getAssignmentBadgeConfig(
  status: VolunteerAssignmentStatus,
  attendanceStatus?: string,
): {
  badgeStatus: BadgeStatus;
  label: string;
} {
  if (status === 'completed' || attendanceStatus === 'completed') {
    return { badgeStatus: 'emerald', label: 'Attendance Verified' };
  }
  switch (status) {
    case 'confirmed':
      return { badgeStatus: 'emerald', label: 'Confirmed Shift' };
    case 'assigned':
      return { badgeStatus: 'sky', label: 'Assigned Shift' };
    case 'cancelled':
      return { badgeStatus: 'rose', label: 'Participation Cancelled' };
    default:
      return { badgeStatus: 'muted', label: status };
  }
}

export function MyAssignmentsScreen({
  navigation,
  repository: propRepository,
  hideHeader = false,
}: MyAssignmentsScreenProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const repositories = useRepositories();
  const repository = propRepository ?? repositories.eventRepository ?? defaultEventRepository;

  const [assignments, setAssignments] = useState<VolunteerAssignmentItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<AssignmentFilterTab>(
    () => assignmentsCache.statusFilter,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cancel participation confirmation state
  const [assignmentToCancel, setAssignmentToCancel] =
    useState<VolunteerAssignmentItem | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Onboarding modal state
  const [onboardingItem, setOnboardingItem] =
    useState<VolunteerAssignmentItem | null>(null);
  const [onboardingData, setOnboardingData] = useState<{
    onboardingText: string | null;
    requireOnboardingAck: boolean;
    acknowledged: boolean;
  } | null>(null);
  const [isOnboardingLoading, setIsOnboardingLoading] = useState(false);
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  // Check-In modal state
  const [checkInItem, setCheckInItem] =
    useState<VolunteerAssignmentItem | null>(null);
  const [qrTokenInput, setQrTokenInput] = useState('');
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  // Feedback modal state
  const [feedbackItem, setFeedbackItem] =
    useState<VolunteerAssignmentItem | null>(null);
  const [feedbackScore, setFeedbackScore] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const flatListRef = useRef<FlatList<VolunteerAssignmentItem>>(null);

  const fetchAssignments = useCallback(async () => {
    try {
      setErrorMessage(null);
      const data = await repository.getUserAssignments();
      setAssignments(data);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load assignments',
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [repository]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  // Restore scroll offset if returning to list
  useEffect(() => {
    if (assignments.length > 0 && assignmentsCache.scrollOffset > 0) {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToOffset({
          offset: assignmentsCache.scrollOffset,
          animated: false,
        });
      });
    }
  }, [assignments.length]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchAssignments();
  };

  const handleFilterChange = (newFilter: AssignmentFilterTab) => {
    setStatusFilter(newFilter);
    assignmentsCache.statusFilter = newFilter;
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    assignmentsCache.scrollOffset = event.nativeEvent.contentOffset.y;
  };

  const handleOpenDetail = (eventId: string) => {
    if (navigation) {
      navigation.navigate('EventDetail', {
        eventId,
        returnTo: 'MyAssignments',
      });
    }
  };

  const handleConfirmShift = async (item: VolunteerAssignmentItem) => {
    if (!repository.confirmAssignment) {
      return;
    }
    setConfirmingId(item.id);
    try {
      const result = await repository.confirmAssignment(item.id);
      if (result.success) {
        setFeedbackBanner(
          isMockMode()
            ? `Shift for "${item.eventTitle}" confirmed (${result.message})`
            : result.message,
        );
        await fetchAssignments();
      } else {
        setFeedbackBanner(result.message);
      }
    } catch (err) {
      setFeedbackBanner(
        err instanceof Error ? err.message : 'Failed to confirm assignment',
      );
    } finally {
      setConfirmingId(null);
    }
  };

  const handleConfirmCancelParticipation = async () => {
    if (!assignmentToCancel) {
      return;
    }

    setIsCancelling(true);
    try {
      const result = await repository.cancelAssignment(assignmentToCancel.id);
      if (result.success) {
        setFeedbackBanner(
          isMockMode()
            ? `Participation in "${assignmentToCancel.eventTitle}" (${assignmentToCancel.postTitle}) cancelled (${result.message})`
            : result.message,
        );
        setAssignmentToCancel(null);
        await fetchAssignments();
      } else {
        setFeedbackBanner(result.message);
      }
    } catch (err) {
      setFeedbackBanner(
        err instanceof Error ? err.message : 'Failed to cancel participation',
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const handleOpenOnboarding = async (item: VolunteerAssignmentItem) => {
    setOnboardingItem(item);
    setIsOnboardingLoading(true);
    try {
      if (repository.getEventOnboarding) {
        const data = await repository.getEventOnboarding(item.eventId);
        setOnboardingData(data);
      } else {
        setOnboardingData({
          onboardingText:
            'Please review safety guidelines and bring required gear for your shift.',
          requireOnboardingAck: true,
          acknowledged: false,
        });
      }
    } catch {
      setFeedbackBanner('Unable to load onboarding briefing.');
    } finally {
      setIsOnboardingLoading(false);
    }
  };

  const handleAcknowledgeOnboarding = async () => {
    if (!onboardingItem || !repository.acknowledgeOnboarding) {
      return;
    }
    setIsAcknowledging(true);
    try {
      const res = await repository.acknowledgeOnboarding(onboardingItem.eventId);
      setFeedbackBanner(res.message);
      if (res.success) {
        setOnboardingData(prev =>
          prev ? { ...prev, acknowledged: true } : null,
        );
      }
    } catch {
      setFeedbackBanner('Failed to acknowledge onboarding briefing.');
    } finally {
      setIsAcknowledging(false);
    }
  };

  const handleSubmitGeoCheckIn = async () => {
    if (!checkInItem || !repository.submitGeoCheckIn) {
      return;
    }
    setIsCheckingIn(true);
    try {
      const permission = await defaultLocationProvider.requestPermission();
      if (permission === 'denied') {
        setFeedbackBanner('Location permission denied. Please allow location access to check in.');
        return;
      }
      if (permission === 'unavailable') {
        setFeedbackBanner('Location services are unavailable on this device.');
        return;
      }

      const fix = await defaultLocationProvider.getCurrentPosition();
      const res = await repository.submitGeoCheckIn(
        checkInItem.eventId,
        fix.latitude,
        fix.longitude,
        fix.accuracyM ?? undefined,
      );
      setFeedbackBanner(res.message);
      if (res.success) {
        setCheckInItem(null);
        await fetchAssignments();
      }
    } catch (err) {
      setFeedbackBanner(
        err instanceof Error ? err.message : 'Geo check-in request failed.',
      );
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleRedeemQrCheckIn = async () => {
    if (!checkInItem || !repository.redeemQrToken || !qrTokenInput.trim()) {
      return;
    }
    setIsCheckingIn(true);
    try {
      const res = await repository.redeemQrToken(qrTokenInput.trim());
      setFeedbackBanner(res.message);
      if (res.success) {
        setCheckInItem(null);
        setQrTokenInput('');
        await fetchAssignments();
      }
    } catch {
      setFeedbackBanner('QR check-in request failed.');
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleCheckOut = async (item: VolunteerAssignmentItem) => {
    if (!repository.checkOutAttendance) {
      return;
    }
    setIsLoading(true);
    try {
      const res = await repository.checkOutAttendance(item.id);
      setFeedbackBanner(res.message);
      if (res.success) {
        await fetchAssignments();
      }
    } catch {
      setFeedbackBanner('Failed to check out of shift.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackItem || !repository.submitEventFeedback) {
      return;
    }
    setIsSubmittingFeedback(true);
    try {
      const res = await repository.submitEventFeedback(
        feedbackItem.eventId,
        feedbackScore,
        feedbackComment,
        ['volunteer_experience'],
        'volunteer_to_event',
      );
      setFeedbackBanner(res.message);
      if (res.success) {
        setFeedbackItem(null);
        setFeedbackComment('');
        await fetchAssignments();
      }
    } catch {
      setFeedbackBanner('Failed to submit event feedback.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const filteredAssignments = useMemo(() => {
    // Cancelled events are erased from volunteer history (only owner can know about cancellations)
    const nonCancelled = assignments.filter(a => a.status !== 'cancelled');
    if (statusFilter === 'all') {
      return nonCancelled;
    }
    if (statusFilter === 'active') {
      return nonCancelled.filter(
        a => a.status === 'assigned' || a.status === 'confirmed',
      );
    }
    if (statusFilter === 'completed') {
      return nonCancelled.filter(
        a => a.status === 'completed' || a.attendanceStatus === 'completed',
      );
    }
    return nonCancelled;
  }, [assignments, statusFilter]);

  const filterTabs: Array<{
    key: AssignmentFilterTab;
    label: string;
  }> = [
    { key: 'all', label: 'All Shifts' },
    { key: 'active', label: 'Active Shifts' },
    { key: 'completed', label: 'Completed' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {!hideHeader && (
        <AppHeader
          title="My Assignments"
          subtitle="Confirmed shifts & attendance"
          onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
        />
      )}

      {/* Filter tab bar */}
      <View
        style={[
          styles.filtersContainer,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsRow}
        >
          {filterTabs.map(tab => (
            <FilterChip
              key={tab.key}
              label={tab.label}
              selected={statusFilter === tab.key}
              onPress={() => handleFilterChange(tab.key)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Feedback banner */}
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

      {/* List content */}
      {isLoading ? (
        <LoadingState label="Loading your shift assignments..." />
      ) : errorMessage ? (
        <ErrorState
          title="Could not load assignments"
          description={errorMessage}
          onRetry={fetchAssignments}
        />
      ) : (
        <FlatList
          ref={flatListRef}
          data={filteredAssignments}
          keyExtractor={item => item.id}
          contentContainerStyle={[
            styles.listContent,
            { padding: theme.spacing.md },
          ]}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
            />
          }
          renderItem={({ item }) => {
            const badge = getAssignmentBadgeConfig(
              item.status,
              item.attendanceStatus,
            );
            const canCancel =
              item.status === 'assigned' || item.status === 'confirmed';
            const isCompleted =
              item.status === 'completed' ||
              item.attendanceStatus === 'completed';

            return (
              <AppCard style={styles.cardSpacing}>
                {/* Header row: Status and Scheduled Date/Time */}
                <View style={styles.cardHeader}>
                  <StatusBadge status={badge.badgeStatus} label={badge.label} />
                  <AppText variant="caption" color={theme.colors.textSecondary}>
                    {formatDateTimeRange(item.startAt, item.endAt)}
                  </AppText>
                </View>

                {/* Main Card Tap Target for Event Detail */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View details for ${item.eventTitle}`}
                  onPress={() => handleOpenDetail(item.eventId)}
                  style={styles.cardContentPressable}
                >
                  <AppText variant="title" weight="bold" style={styles.titleSpacing}>
                    {item.eventTitle}
                  </AppText>

                  <AppText
                    variant="body"
                    color={theme.colors.textSecondary}
                    style={styles.roleSpacing}
                  >
                    Role: {item.postTitle}
                  </AppText>

                  <AppText
                    variant="caption"
                    color={theme.colors.textSecondary}
                    style={styles.locationSpacing}
                  >
                    📍 {item.location}
                  </AppText>

                  {isCompleted && item.verifiedHours ? (
                    <AppText
                      variant="caption"
                      color={theme.colors.success}
                      weight="semibold"
                      style={styles.verifiedSpacing}
                    >
                      ✓ {item.verifiedHours.toFixed(1)} hrs verified coordinator attendance
                    </AppText>
                  ) : null}

                  <View style={styles.viewDetailLink}>
                    <AppText
                      variant="caption"
                      weight="semibold"
                      color={theme.colors.primary}
                    >
                      View Event Details →
                    </AppText>
                  </View>
                </Pressable>

                {/* Action footer */}
                <View style={styles.cardActions}>
                  {item.status === 'assigned' ? (
                    <AppButton
                      label="Confirm Shift"
                      variant="primary"
                      loading={confirmingId === item.id}
                      onPress={() => handleConfirmShift(item)}
                      accessibilityLabel={`Confirm shift for ${item.postTitle}`}
                      style={{ marginRight: 8, marginBottom: 8 }}
                    />
                  ) : null}

                  <AppButton
                    label="Onboarding"
                    variant="secondary"
                    onPress={() => handleOpenOnboarding(item)}
                    accessibilityLabel={`View onboarding for ${item.eventTitle}`}
                    style={{ marginRight: 8, marginBottom: 8 }}
                  />

                  {(item.status === 'confirmed' || item.status === 'assigned') &&
                  item.attendanceStatus !== 'checked_in' ? (
                    <AppButton
                      label="Check-In"
                      variant="primary"
                      onPress={() => setCheckInItem(item)}
                      accessibilityLabel={`Check in for ${item.postTitle}`}
                      style={{ marginRight: 8, marginBottom: 8 }}
                    />
                  ) : null}

                  {item.attendanceStatus === 'checked_in' ? (
                    <AppButton
                      label="Check-Out"
                      variant="primary"
                      onPress={() => handleCheckOut(item)}
                      accessibilityLabel={`Check out of ${item.postTitle}`}
                      style={{ marginRight: 8, marginBottom: 8 }}
                    />
                  ) : null}

                  {isCompleted ? (
                    <AppButton
                      label="Feedback"
                      variant="secondary"
                      onPress={() => setFeedbackItem(item)}
                      accessibilityLabel={`Leave feedback for ${item.eventTitle}`}
                      style={{ marginRight: 8, marginBottom: 8 }}
                    />
                  ) : null}

                  {canCancel ? (
                    <AppButton
                      label="Cancel participation"
                      variant="outline"
                      onPress={() => setAssignmentToCancel(item)}
                      accessibilityLabel={`Cancel participation for ${item.postTitle}`}
                      style={{ marginBottom: 8 }}
                    />
                  ) : null}
                </View>
              </AppCard>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              title="No assignments found"
              description={
                statusFilter !== 'all'
                  ? `No shift assignments match the "${statusFilter}" filter.`
                  : 'You have no volunteer shift assignments scheduled.'
              }
              actionLabel={
                statusFilter !== 'all'
                  ? 'Show All Shifts'
                  : 'Discover Volunteer Opportunities'
              }
              onActionPress={
                statusFilter !== 'all'
                  ? () => handleFilterChange('all')
                  : () => navigation?.navigate?.('Events')
              }
            />
          }
        />
      )}

      {/* Cancel participation confirmation modal */}
      <Modal
        visible={!!assignmentToCancel}
        transparent
        animationType="fade"
        onRequestClose={() => setAssignmentToCancel(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.md,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <AppText variant="title" weight="bold" style={styles.modalTitle}>
              Cancel Participation
            </AppText>

            <AppText
              variant="body"
              color={theme.colors.textPrimary}
              style={styles.modalBody}
            >
              Are you sure you want to cancel your scheduled participation for "
              {assignmentToCancel?.postTitle}" on "{assignmentToCancel?.eventTitle}"?
              Your shift will be released.
            </AppText>

            {isMockMode() ? (
              <AppText
                variant="caption"
                color={theme.colors.textSecondary}
                style={styles.modalDemoNotice}
              >
                Demo only — this cancels your own shift assignment in local preview, not the event.
              </AppText>
            ) : null}

            <View style={styles.modalActions}>
              <View style={styles.modalButtonWrap}>
                <AppButton
                  label="Keep Shift"
                  variant="outline"
                  onPress={() => setAssignmentToCancel(null)}
                  disabled={isCancelling}
                />
              </View>
              <View style={styles.modalButtonWrap}>
                <AppButton
                  label="Cancel Participation"
                  variant="danger"
                  onPress={handleConfirmCancelParticipation}
                  loading={isCancelling}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Onboarding Briefing Modal */}
      <Modal
        visible={!!onboardingItem}
        transparent
        animationType="fade"
        onRequestClose={() => setOnboardingItem(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.md,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <AppText variant="title" weight="bold" style={styles.modalTitle}>
              Event Onboarding Briefing
            </AppText>
            <AppText
              variant="caption"
              color={theme.colors.primary}
              style={{ marginBottom: 12 }}
            >
              {onboardingItem?.eventTitle}
            </AppText>

            {isOnboardingLoading ? (
              <LoadingState label="Loading onboarding briefing..." />
            ) : (
              <ScrollView style={{ maxHeight: 220, marginBottom: 16 }}>
                <AppText variant="body" color={theme.colors.textPrimary}>
                  {onboardingData?.onboardingText ||
                    'No specific onboarding instructions provided.'}
                </AppText>
                {onboardingData?.acknowledged ? (
                  <View
                    style={{
                      marginTop: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <AppIcon
                      name="check"
                      size={16}
                      color={theme.colors.success}
                    />
                    <AppText
                      variant="caption"
                      color={theme.colors.success}
                      weight="bold"
                      style={{ marginLeft: 6 }}
                    >
                      Onboarding Acknowledged
                    </AppText>
                  </View>
                ) : null}
              </ScrollView>
            )}

            <View style={styles.modalActions}>
              <View style={styles.modalButtonWrap}>
                <AppButton
                  label="Close"
                  variant="outline"
                  onPress={() => setOnboardingItem(null)}
                />
              </View>
              {onboardingData?.requireOnboardingAck &&
              !onboardingData.acknowledged ? (
                <View style={styles.modalButtonWrap}>
                  <AppButton
                    label="Acknowledge Briefing"
                    variant="primary"
                    onPress={handleAcknowledgeOnboarding}
                    loading={isAcknowledging}
                  />
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* Shift Check-In Modal */}
      <Modal
        visible={!!checkInItem}
        transparent
        animationType="fade"
        onRequestClose={() => setCheckInItem(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.md,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <AppText variant="title" weight="bold" style={styles.modalTitle}>
              Shift Check-In
            </AppText>
            <AppText
              variant="caption"
              color={theme.colors.textSecondary}
              style={{ marginBottom: 16 }}
            >
              {checkInItem?.eventTitle} • {checkInItem?.postTitle}
            </AppText>

            {/* Option 1: Geo Check-in */}
            <View style={{ marginBottom: 16 }}>
              <AppText
                variant="caption"
                weight="bold"
                color={theme.colors.textPrimary}
                style={{ marginBottom: 6 }}
              >
                Option 1: Location-Based Check-In
              </AppText>
              <AppButton
                label="Submit Geo Check-In"
                variant="primary"
                onPress={handleSubmitGeoCheckIn}
                loading={isCheckingIn}
              />
            </View>

            {/* Option 2: QR Token Check-in */}
            <View style={{ marginBottom: 16 }}>
              <AppText
                variant="caption"
                weight="bold"
                color={theme.colors.textPrimary}
                style={{ marginBottom: 6 }}
              >
                Option 2: On-Site QR Token
              </AppText>
              <AppInput
                value={qrTokenInput}
                onChangeText={setQrTokenInput}
                placeholder="Enter or paste QR token..."
                autoCapitalize="none"
              />
              <View style={{ marginTop: 8 }}>
                <AppButton
                  label="Redeem QR Code"
                  variant="secondary"
                  disabled={!qrTokenInput.trim() || isCheckingIn}
                  onPress={handleRedeemQrCheckIn}
                />
              </View>
            </View>

            <View style={{ marginTop: 8 }}>
              <AppButton
                label="Cancel"
                variant="outline"
                onPress={() => {
                  setCheckInItem(null);
                  setQrTokenInput('');
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Feedback Modal */}
      <Modal
        visible={!!feedbackItem}
        transparent
        animationType="fade"
        onRequestClose={() => setFeedbackItem(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.md,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <AppText variant="title" weight="bold" style={styles.modalTitle}>
              Leave Event Feedback
            </AppText>
            <AppText
              variant="caption"
              color={theme.colors.textSecondary}
              style={{ marginBottom: 16 }}
            >
              {feedbackItem?.eventTitle}
            </AppText>

            {/* Rating Stars 1-5 */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'center',
                marginBottom: 16,
                gap: 8,
              }}
            >
              {[1, 2, 3, 4, 5].map(score => (
                <Pressable
                  key={score}
                  accessibilityRole="button"
                  accessibilityLabel={`Rate ${score} stars`}
                  onPress={() => setFeedbackScore(score)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 6,
                    backgroundColor:
                      feedbackScore >= score
                        ? theme.colors.primary
                        : theme.colors.surfaceRaised,
                  }}
                >
                  <AppText
                    variant="caption"
                    weight="bold"
                    color={
                      feedbackScore >= score ? '#fff' : theme.colors.textPrimary
                    }
                  >
                    ★ {score}
                  </AppText>
                </Pressable>
              ))}
            </View>

            <AppInput
              value={feedbackComment}
              onChangeText={setFeedbackComment}
              placeholder="Tell us about your shift experience (optional)..."
              multiline
            />

            <View style={[styles.modalActions, { marginTop: 16 }]}>
              <View style={styles.modalButtonWrap}>
                <AppButton
                  label="Cancel"
                  variant="outline"
                  onPress={() => setFeedbackItem(null)}
                />
              </View>
              <View style={styles.modalButtonWrap}>
                <AppButton
                  label="Submit Rating"
                  variant="primary"
                  onPress={handleSubmitFeedback}
                  loading={isSubmittingFeedback}
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
  filtersContainer: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  filterChipsRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  feedbackBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  cardSpacing: {
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardContentPressable: {
    paddingVertical: 2,
  },
  titleSpacing: {
    marginBottom: 6,
  },
  roleSpacing: {
    marginBottom: 4,
  },
  locationSpacing: {
    marginBottom: 4,
  },
  verifiedSpacing: {
    marginBottom: 6,
  },
  viewDetailLink: {
    marginTop: 4,
    marginBottom: 8,
  },
  cardActions: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E3E7',
    paddingTop: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
    borderWidth: 1,
  },
  modalTitle: {
    marginBottom: 8,
  },
  modalBody: {
    marginBottom: 10,
    lineHeight: 22,
  },
  modalDemoNotice: {
    marginBottom: 20,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButtonWrap: {
    flex: 1,
  },
});
