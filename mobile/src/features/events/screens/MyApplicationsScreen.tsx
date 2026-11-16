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
import {
  defaultEventRepository,
  MockEventRepository,
} from '../../../data/mock/MockEventRepository';
import { isMockMode } from '../../../app/configuration/dataMode';
import { useRepositories } from '../../../app/RepositoryProvider';
import {
  EventApplicationStatus,
  VolunteerApplicationItem,
} from '../../../domain/models/event';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppText,
  BadgeStatus,
  EmptyState,
  ErrorState,
  FilterChip,
  LoadingState,
  StatusBadge,
} from '../../../shared';
import { useAppTheme } from '../../../theme';

export interface ApplicationsStateCache {
  statusFilter: EventApplicationStatus | 'all';
  scrollOffset: number;
}

let applicationsCache: ApplicationsStateCache = {
  statusFilter: 'all',
  scrollOffset: 0,
};

export function resetApplicationsCache(): void {
  applicationsCache = {
    statusFilter: 'all',
    scrollOffset: 0,
  };
}

export function getApplicationsCache(): ApplicationsStateCache {
  return { ...applicationsCache };
}

export interface MyApplicationsScreenProps
  extends Partial<MainDrawerScreenProps<'MyApplications'>> {
  repository?: EventRepository;
}

function formatDate(isoString?: string): string {
  if (!isoString) {
    return '';
  }
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

function getBadgeConfig(status: EventApplicationStatus): {
  badgeStatus: BadgeStatus;
  label: string;
} {
  switch (status) {
    case 'accepted':
      return { badgeStatus: 'emerald', label: 'Accepted' };
    case 'pending':
      return { badgeStatus: 'amber', label: 'Pending Review' };
    case 'waitlisted':
      return { badgeStatus: 'sky', label: 'Waitlisted' };
    case 'rejected':
      return { badgeStatus: 'rose', label: 'Not Selected' };
    case 'withdrawn':
      return { badgeStatus: 'muted', label: 'Withdrawn' };
    case 'expired':
      return { badgeStatus: 'muted', label: 'Expired' };
    default:
      return { badgeStatus: 'muted', label: status };
  }
}

export function MyApplicationsScreen({
  navigation,
  repository: propRepository,
}: MyApplicationsScreenProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const repositories = useRepositories();
  const repository = propRepository ?? repositories.eventRepository ?? defaultEventRepository;

  const [applications, setApplications] = useState<VolunteerApplicationItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<EventApplicationStatus | 'all'>(
    () => applicationsCache.statusFilter,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Withdraw application confirmation state
  const [appToWithdraw, setAppToWithdraw] =
    useState<VolunteerApplicationItem | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const flatListRef = useRef<FlatList<VolunteerApplicationItem>>(null);

  const fetchApplications = useCallback(async () => {
    try {
      setErrorMessage(null);
      const data = await repository.getUserApplications();
      setApplications(data);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load applications',
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [repository]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // Restore scroll offset if returning to list
  useEffect(() => {
    if (applications.length > 0 && applicationsCache.scrollOffset > 0) {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToOffset({
          offset: applicationsCache.scrollOffset,
          animated: false,
        });
      });
    }
  }, [applications.length]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchApplications();
  };

  const handleFilterChange = (newFilter: EventApplicationStatus | 'all') => {
    setStatusFilter(newFilter);
    applicationsCache.statusFilter = newFilter;
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    applicationsCache.scrollOffset = event.nativeEvent.contentOffset.y;
  };

  const handleOpenDetail = (eventId: string) => {
    if (navigation) {
      navigation.navigate('EventDetail', {
        eventId,
        returnTo: 'MyApplications',
      });
    }
  };

  const handleConfirmWithdraw = async () => {
    if (!appToWithdraw) {
      return;
    }

    setIsWithdrawing(true);
    try {
      const result = await repository.withdrawApplication(appToWithdraw.id);
      if (result.success) {
        setFeedbackBanner(
          isMockMode()
            ? `Application for "${appToWithdraw.eventTitle}" (${appToWithdraw.postTitle}) withdrawn (${result.message})`
            : result.message,
        );
        setAppToWithdraw(null);
        await fetchApplications();
      } else {
        setFeedbackBanner(result.message);
      }
    } catch (err) {
      setFeedbackBanner(
        err instanceof Error ? err.message : 'Failed to withdraw application',
      );
    } finally {
      setIsWithdrawing(false);
    }
  };

  const filteredApplications = useMemo(() => {
    if (statusFilter === 'all') {
      return applications;
    }
    return applications.filter(a => a.status === statusFilter);
  }, [applications, statusFilter]);

  const filterOptions: Array<{
    key: EventApplicationStatus | 'all';
    label: string;
  }> = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'accepted', label: 'Accepted' },
    { key: 'waitlisted', label: 'Waitlisted' },
    { key: 'withdrawn', label: 'Withdrawn' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title="My Applications"
        subtitle="Submitted volunteer requests"
        onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
      />

      {/* Status Filter Chip Row */}
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
          {filterOptions.map(opt => (
            <FilterChip
              key={opt.key}
              label={opt.label}
              selected={statusFilter === opt.key}
              onPress={() => handleFilterChange(opt.key)}
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
        <LoadingState label="Loading submitted applications..." />
      ) : errorMessage ? (
        <ErrorState
          title="Could not load applications"
          description={errorMessage}
          onRetry={fetchApplications}
        />
      ) : (
        <FlatList
          ref={flatListRef}
          data={filteredApplications}
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
            const badge = getBadgeConfig(item.status);
            const canWithdraw =
              item.status === 'pending' ||
              item.status === 'waitlisted' ||
              item.status === 'accepted';

            return (
              <AppCard style={styles.cardSpacing}>
                {/* Header row: Status and Applied date */}
                <View style={styles.cardHeader}>
                  <StatusBadge status={badge.badgeStatus} label={badge.label} />
                  <AppText variant="caption" color={theme.colors.textSecondary}>
                    Applied {formatDate(item.appliedAt)}
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
                    Applied Role: {item.postTitle}
                  </AppText>

                  {item.volunteerNote ? (
                    <AppText
                      variant="caption"
                      color={theme.colors.textSecondary}
                      style={styles.noteSpacing}
                    >
                      Note: "{item.volunteerNote}"
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
                {canWithdraw ? (
                  <View style={styles.cardActions}>
                    <AppButton
                      label="Withdraw application"
                      variant="outline"
                      onPress={() => setAppToWithdraw(item)}
                      accessibilityLabel={`Withdraw application for ${item.postTitle}`}
                    />
                  </View>
                ) : item.status === 'accepted' ? (
                  <View style={styles.acceptedNotice}>
                    <AppText
                      variant="caption"
                      weight="semibold"
                      color={theme.colors.success}
                    >
                      ✓ Application accepted — see My Assignments for confirmed shift.
                    </AppText>
                  </View>
                ) : null}
              </AppCard>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              title="No applications found"
              description={
                statusFilter !== 'all'
                  ? `No volunteer applications match the "${statusFilter}" status filter.`
                  : 'You have not submitted any volunteer applications yet.'
              }
              actionLabel={
                statusFilter !== 'all'
                  ? 'Show All Applications'
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

      {/* Withdraw confirmation modal */}
      <Modal
        visible={!!appToWithdraw}
        transparent
        animationType="fade"
        onRequestClose={() => setAppToWithdraw(null)}
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
              Withdraw Application
            </AppText>

            <AppText
              variant="body"
              color={theme.colors.textPrimary}
              style={styles.modalBody}
            >
              Are you sure you want to withdraw your application for "
              {appToWithdraw?.postTitle}" on "{appToWithdraw?.eventTitle}"?
            </AppText>

            {isMockMode() ? (
              <AppText
                variant="caption"
                color={theme.colors.textSecondary}
                style={styles.modalDemoNotice}
              >
                Demo only — your application status will be marked withdrawn in local preview.
              </AppText>
            ) : null}

            <View style={styles.modalActions}>
              <View style={styles.modalButtonWrap}>
                <AppButton
                  label="Keep Application"
                  variant="outline"
                  onPress={() => setAppToWithdraw(null)}
                  disabled={isWithdrawing}
                />
              </View>
              <View style={styles.modalButtonWrap}>
                <AppButton
                  label="Confirm Withdrawal"
                  variant="danger"
                  onPress={handleConfirmWithdraw}
                  loading={isWithdrawing}
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
  noteSpacing: {
    marginBottom: 6,
    fontStyle: 'italic',
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
  acceptedNotice: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E3E7',
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
