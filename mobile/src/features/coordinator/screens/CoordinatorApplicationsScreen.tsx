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
import { defaultCoordinatorRepository } from '../../../data/mock/MockCoordinatorRepository';
import { useRepositories } from '../../../app/RepositoryProvider';
import type {
  CoordinatorApplicationItem,
  CoordinatorApplicationStatus,
  CoordinatorEventSummary,
} from '../../../domain/models/coordinator';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import {
  AppHeader,
  AppIcon,
  AppText,
  EmptyState,
  FilterChip,
  LoadingState,
  SearchInput,
} from '../../../shared';
import { useAppTheme } from '../../../theme';
import {
  ApplicationReviewCard,
  CoordinatorEventHeader,
  CoordinatorGuard,
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

  const loadData = useCallback(
    async (targetId?: string) => {
      setIsLoading(true);
      try {
        const evList = await repo.getMyEvents();
        setEvents(evList);

        const eventIdToUse =
          targetId ||
          selectedEventIdRef.current ||
          route?.params?.eventId ||
          evList[0]?.id ||
          'evt-coord-001';

        if (selectedEventIdRef.current !== eventIdToUse) {
          selectedEventIdRef.current = eventIdToUse;
          setSelectedEventId(eventIdToUse);
        }

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
        const matchesName = app.applicantName.toLowerCase().includes(q);
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

  const handleBack = () => {
    if (navigation && navigation.canGoBack()) {
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
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Volunteer Applications"
          subtitle={selectedEvent?.title}
          onBackPress={handleBack}
        />

        {isLoading ? (
          <LoadingState label="Loading applications..." />
        ) : (
          <FlatList
            data={filteredApplications}
            keyExtractor={item => item.id}
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
        )}
      </View>
    </CoordinatorGuard>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
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
  filterScroll: {
    gap: 8,
    paddingBottom: 10,
  },
});
