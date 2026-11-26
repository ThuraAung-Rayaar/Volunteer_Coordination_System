/**
 * @format
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { CoordinatorRepository } from '../../../data/contracts/coordinatorRepository';
import {
  defaultCoordinatorRepository,
  MockCoordinatorRepository,
} from '../../../data/mock/MockCoordinatorRepository';
import { useRepositories } from '../../../app/RepositoryProvider';
import { isMockMode } from '../../../app/configuration/dataMode';
import type {
  CoordinatorApplicationItem,
  CoordinatorApplicationStatus,
  CoordinatorEventSummary,
} from '../../../domain/models/coordinator';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppIcon,
  AppInput,
  AppText,
  EmptyState,
  FilterChip,
  KeyboardLiftView,
  LoadingState,
  SearchInput,
  StatusBadge,
} from '../../../shared';
import { useAppTheme } from '../../../theme';
import {
  ApplicationReviewCard,
  CoordinatorDynamicIsland,
  CoordinatorEventHeader,
  CoordinatorGuard,
  CoordinatorSwipeWrapper,
} from '../components';

export interface CoordinatorApplicationsScreenProps
  extends Partial<MainDrawerScreenProps<'CoordinatorApplications'>> {
  repository?: CoordinatorRepository;
}

type FilterOption = 'all' | CoordinatorApplicationStatus;

export function CoordinatorApplicationsScreen({
  route,
  navigation,
  repository: propRepository,
}: CoordinatorApplicationsScreenProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const repositories = useRepositories();
  const repo = propRepository ?? repositories.coordinatorRepository ?? defaultCoordinatorRepository;

  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<CoordinatorEventSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>(
    route?.params?.eventId ?? '',
  );
  const selectedEventIdRef = React.useRef(selectedEventId);
  selectedEventIdRef.current = selectedEventId;

  const [applications, setApplications] = useState<CoordinatorApplicationItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteVolunteerUuid, setInviteVolunteerUuid] = useState('');
  const [invitePostId, setInvitePostId] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  const loadData = useCallback(
    async (targetId?: string) => {
      setIsLoading(true);
      try {
        const evList = await repo.getMyEvents();
        const isMockRepo = isMockMode() || repo instanceof MockCoordinatorRepository;
        const operationalEvents = evList.filter(
          e =>
            e.status !== 'cancelled' &&
            e.status !== 'completed' &&
            e.status !== 'ended' &&
            (isMockRepo || !e.endAt || new Date(e.endAt).getTime() >= Date.now()),
        );
        setEvents(operationalEvents);

        const eventIdToUse =
          targetId ||
          selectedEventIdRef.current ||
          route?.params?.eventId ||
          operationalEvents[0]?.id ||
          'evt-coord-001';

        const appList = await repo.getApplications(eventIdToUse);
        setApplications(appList);
      } catch {
        setFeedbackBanner('Unable to load applications list.');
      } finally {
        setIsLoading(false);
      }
    },
    [repo, route?.params?.eventId],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedEvent = useMemo(
    () => events.find(e => e.id === selectedEventId) ?? events[0],
    [events, selectedEventId],
  );

  const isMonitorMode = selectedEvent?.isOwnerAsMonitor ?? false;

  const counts = useMemo(() => {
    return {
      all: applications.length,
      pending: applications.filter(a => a.status === 'pending').length,
      accepted: applications.filter(a => a.status === 'accepted').length,
      waitlisted: applications.filter(a => a.status === 'waitlisted').length,
      rejected: applications.filter(a => a.status === 'rejected').length,
    };
  }, [applications]);

  const filteredApplications = useMemo(() => {
    return applications.filter(app => {
      if (activeFilter !== 'all' && app.status !== activeFilter) {
        return false;
      }
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        const matchesName = (app.applicantName || '').toLowerCase().includes(q);
        const matchesPost = app.postTitle?.toLowerCase().includes(q) ?? false;
        if (!matchesName && !matchesPost) {
          return false;
        }
      }
      return true;
    });
  }, [applications, activeFilter, searchQuery]);

  const handleUpdateStatus = async (
    applicationId: string,
    targetStatus: CoordinatorApplicationStatus,
  ) => {
    const result = await repo.updateApplicationStatus(
      applicationId,
      targetStatus,
    );
    if (result.success && result.data) {
      setFeedbackBanner(result.message);
      setApplications(prev =>
        prev.map(a => (a.id === applicationId ? result.data! : a)),
      );
    } else {
      setFeedbackBanner(result.message);
    }
  };

  const handleInviteVolunteer = async () => {
    if (!selectedEventId || isMonitorMode) return;
    const userIdValue = inviteUserId.trim();
    const uuidValue = inviteVolunteerUuid.trim();
    if (Boolean(userIdValue) === Boolean(uuidValue)) {
      setFeedbackBanner('Enter either a volunteer user ID or a volunteer UUID, not both.');
      return;
    }
    if (userIdValue && (!Number.isInteger(Number(userIdValue)) || Number(userIdValue) < 1)) {
      setFeedbackBanner('Volunteer user ID must be a positive whole number.');
      return;
    }
    const postIdValue = invitePostId.trim();
    if (postIdValue && (!Number.isInteger(Number(postIdValue)) || Number(postIdValue) < 1)) {
      setFeedbackBanner('Post ID must be a positive whole number or left blank.');
      return;
    }
    setIsInviting(true);
    try {
      const result = await repo.inviteVolunteer(
        selectedEventId,
        userIdValue ? Number(userIdValue) : undefined,
        postIdValue ? Number(postIdValue) : undefined,
        inviteNote.trim() || undefined,
        uuidValue || undefined,
      );
      if (!result.success) {
        setFeedbackBanner(result.message);
        return;
      }
      if (result.data) {
        setApplications(prev => [result.data!, ...prev]);
      } else {
        await loadData();
      }
      setInviteUserId('');
      setInviteVolunteerUuid('');
      setInvitePostId('');
      setInviteNote('');
      setFeedbackBanner(result.message);
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Failed to invite volunteer.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleBack = () => {
    if (selectedEventId && !route?.params?.eventId) {
      setSelectedEventId('');
      selectedEventIdRef.current = '';
    } else if (navigation && navigation.canGoBack()) {
      navigation.goBack();
    } else if (navigation) {
      navigation.navigate('CoordinatorWorkspace');
    }
  };

  const renderHeader = () => (
    <View style={styles.listHeaderContainer}>
      {/* Event Context Header */}
      <CoordinatorEventHeader
        events={events}
        selectedEventId={selectedEventId}
        onSelectEvent={id => {
          setSelectedEventId(id);
          selectedEventIdRef.current = id;
          loadData(id);
        }}
        onSwitchEvent={() => {
          setSelectedEventId('');
          selectedEventIdRef.current = '';
        }}
      />

      {/* Feedback Banner */}
      {feedbackBanner ? (
        <View
          style={[
            styles.feedbackBanner,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderColor: theme.colors.primary,
              borderRadius: theme.radius.sm,
            },
          ]}
        >
          <AppText
            variant="caption"
            weight="semibold"
            color={theme.colors.primary}
            style={styles.feedbackText}
          >
            {feedbackBanner}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss feedback"
            onPress={() => setFeedbackBanner(null)}
          >
            <AppIcon name="close" size={14} color={theme.colors.primary} />
          </Pressable>
        </View>
      ) : null}

      {/* Invite Volunteer — existing BFF supports user ID or UUID */}
      <AppCard style={styles.inviteCard}>
        <View style={styles.inviteHeader}>
          <AppText variant="body" weight="bold" color={theme.colors.textPrimary}>
            Invite a Volunteer
          </AppText>
          {isMonitorMode ? (
            <AppText variant="caption" color={theme.colors.accent}>Read-only monitor mode</AppText>
          ) : null}
        </View>
        <AppText variant="caption" color={theme.colors.textSecondary}>
          Provide exactly one identifier. This uses the existing coordinator invite endpoint.
        </AppText>
        <AppInput
          label="Volunteer User ID"
          value={inviteUserId}
          onChangeText={setInviteUserId}
          placeholder="Numeric user ID"
          keyboardType="number-pad"
          style={styles.inviteField}
          editable={!isMonitorMode && !isInviting}
        />
        <AppInput
          label="Volunteer UUID"
          value={inviteVolunteerUuid}
          onChangeText={setInviteVolunteerUuid}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          autoCapitalize="none"
          style={styles.inviteField}
          editable={!isMonitorMode && !isInviting}
        />
        <AppInput
          label="Target Post ID (optional)"
          value={invitePostId}
          onChangeText={setInvitePostId}
          placeholder="Leave blank for general event invitation"
          keyboardType="number-pad"
          style={styles.inviteField}
          editable={!isMonitorMode && !isInviting}
        />
        <AppInput
          label="Invitation Note (optional)"
          value={inviteNote}
          onChangeText={setInviteNote}
          placeholder="Add a short invitation message"
          multiline
          numberOfLines={2}
          style={styles.inviteField}
          editable={!isMonitorMode && !isInviting}
        />
        <AppButton
          label="Send Invitation"
          variant="primary"
          loading={isInviting}
          disabled={isMonitorMode || !selectedEventId}
          onPress={handleInviteVolunteer}
        />
      </AppCard>

      {/* Search Input */}
      <View style={styles.searchWrapper}>
        <SearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search applicants by name or post..."
        />
      </View>

      {/* Status Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
      >
        <FilterChip
          label={`All (${counts.all})`}
          selected={activeFilter === 'all'}
          onPress={() => setActiveFilter('all')}
        />
        <FilterChip
          label={`Pending (${counts.pending})`}
          selected={activeFilter === 'pending'}
          onPress={() => setActiveFilter('pending')}
        />
        <FilterChip
          label={`Accepted (${counts.accepted})`}
          selected={activeFilter === 'accepted'}
          onPress={() => setActiveFilter('accepted')}
        />
        <FilterChip
          label={`Waitlisted (${counts.waitlisted})`}
          selected={activeFilter === 'waitlisted'}
          onPress={() => setActiveFilter('waitlisted')}
        />
        <FilterChip
          label={`Rejected (${counts.rejected})`}
          selected={activeFilter === 'rejected'}
          onPress={() => setActiveFilter('rejected')}
        />
      </ScrollView>
    </View>
  );

  return (
    <CoordinatorGuard navigation={navigation}>
      <CoordinatorSwipeWrapper currentTab="applications" navigation={navigation}>
        <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Volunteer Applications"
          subtitle={selectedEventId ? selectedEvent?.title : 'Select an active event'}
          onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
          onBackPress={selectedEventId ? handleBack : undefined}
        />

        {!selectedEventId ? (
          <ScrollView contentContainerStyle={styles.pickerContainer}>
            {events.length === 0 ? (
              <EmptyState
                title="No Active Events"
                description="There are no active events to manage. Completed and ended events are archived."
              />
            ) : (
              events.map(ev => (
                <Pressable
                  key={ev.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Manage applications for ${ev.title}`}
                  onPress={() => {
                    setSelectedEventId(ev.id);
                    selectedEventIdRef.current = ev.id;
                    loadData(ev.id);
                  }}
                  style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
                >
                  <AppCard style={styles.pickerCard}>
                    <View style={styles.pickerHeader}>
                      <AppText
                        variant="title"
                        weight="bold"
                        color={theme.colors.textPrimary}
                        style={{ flex: 1 }}
                      >
                        {ev.title}
                      </AppText>
                      <StatusBadge status="success" label="ACTIVE" />
                    </View>

                    <View style={styles.pickerMetaRow}>
                      <View style={styles.pickerMetaItem}>
                        <AppIcon
                          name="calendar"
                          size={14}
                          color={theme.colors.textSecondary}
                        />
                        <AppText variant="caption" color={theme.colors.textSecondary}>
                          {new Date(ev.startAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </AppText>
                      </View>
                      <View style={[styles.pickerMetaItem, { flex: 1 }]}>
                        <AppIcon
                          name="location"
                          size={14}
                          color={theme.colors.textSecondary}
                        />
                        <AppText
                          variant="caption"
                          color={theme.colors.textSecondary}
                          numberOfLines={1}
                        >
                          {ev.locationName}
                        </AppText>
                      </View>
                    </View>

                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 2,
                      }}
                    >
                      <AppText
                        variant="caption"
                        weight="semibold"
                        color={theme.colors.primary}
                      >
                        {ev.pendingApplicationCount ?? 0} pending review •{' '}
                        {ev.acceptedApplicantCount ?? 0} accepted
                      </AppText>
                    </View>

                    <AppButton
                      label="Manage Applications"
                      variant="primary"
                      onPress={() => {
                        setSelectedEventId(ev.id);
                        selectedEventIdRef.current = ev.id;
                        loadData(ev.id);
                      }}
                      style={{ marginTop: 4 }}
                    />
                  </AppCard>
                </Pressable>
              ))
            )}
          </ScrollView>
        ) : isLoading ? (
          <LoadingState label="Loading applications..." />
        ) : (
          <KeyboardLiftView>
            <FlatList
              data={filteredApplications}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={renderHeader}
              renderItem={({ item }) => (
                <ApplicationReviewCard
                  application={item}
                  isMonitorMode={isMonitorMode}
                  onAccept={id => handleUpdateStatus(id, 'accepted')}
                  onReject={id => handleUpdateStatus(id, 'rejected')}
                  onWaitlist={id => handleUpdateStatus(id, 'waitlisted')}
                />
              )}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <EmptyState
                  title="No Applications"
                  description={`No applications match the "${activeFilter}" filter.`}
                />
              }
            />
          </KeyboardLiftView>
        )}

        <CoordinatorDynamicIsland
          activeTab="applications"
          navigation={navigation}
          pendingApplicationsCount={applications.filter(a => a.status === 'pending').length}
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
  listContent: {
    padding: 16,
    paddingBottom: 88,
  },
  listHeaderContainer: {
    marginBottom: 8,
  },
  feedbackBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  feedbackText: {
    flex: 1,
    marginRight: 8,
  },
  searchWrapper: {
    marginBottom: 10,
  },
  inviteCard: {
    padding: 14,
    marginBottom: 12,
    gap: 8,
  },
  inviteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inviteField: {
    marginTop: 2,
  },
  filterScroll: {
    gap: 8,
    paddingBottom: 10,
  },
  pickerContainer: {
    padding: 16,
    paddingBottom: 88,
    gap: 12,
  },
  pickerCard: {
    padding: 16,
    gap: 10,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  pickerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  pickerMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
