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
  AttendanceRecordStatus,
  CoordinatorAttendanceItem,
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
  SectionHeader,
} from '../../../shared';
import { useAppTheme } from '../../../theme';
import {
  AttendanceRow,
  CoordinatorEventHeader,
  CoordinatorGuard,
} from '../components';

export interface CoordinatorAttendanceScreenProps
  extends Partial<MainDrawerScreenProps<'CoordinatorAttendance'>> {
  repository?: CoordinatorRepository;
}

type RosterFilter = 'all' | AttendanceRecordStatus;

export function CoordinatorAttendanceScreen({
  route,
  navigation,
  repository: propRepository,
}: CoordinatorAttendanceScreenProps): React.JSX.Element {
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

  const [attendanceList, setAttendanceList] = useState<
    CoordinatorAttendanceItem[]
  >([]);
  const [pendingGeoList, setPendingGeoList] = useState<
    CoordinatorAttendanceItem[]
  >([]);
  const [activeFilter, setActiveFilter] = useState<RosterFilter>('all');
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

        const [roster, geoPending] = await Promise.all([
          repo.getAttendanceRoster(eventIdToUse),
          repo.getPendingGeoConfirmations(eventIdToUse),
        ]);
        setAttendanceList(roster);
        setPendingGeoList(geoPending);
      } catch {
        setFeedbackBanner('Unable to load attendance roster.');
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
      all: attendanceList.length,
      checkedIn: attendanceList.filter(a => a.status === 'checked_in').length,
      scheduled: attendanceList.filter(a => a.status === 'scheduled').length,
      completed: attendanceList.filter(a => a.status === 'completed').length,
      pendingGeo: pendingGeoList.length,
    };
  }, [attendanceList, pendingGeoList]);

  const filteredRoster = useMemo(() => {
    if (activeFilter === 'all') {
      return attendanceList;
    }
    return attendanceList.filter(a => a.status === activeFilter);
  }, [attendanceList, activeFilter]);

  const handleConfirmGeo = async (attendanceId: string) => {
    const result = await repo.confirmGeoAttendance(
      attendanceId,
    );
    setFeedbackBanner(result.message);
    if (result.success) {
      await loadData();
    }
  };

  const handleRejectGeo = async (attendanceId: string) => {
    const result = await repo.rejectGeoAttendance(
      attendanceId,
    );
    setFeedbackBanner(result.message);
    if (result.success) {
      await loadData();
    }
  };

  const handleManualCheckIn = async (
    attendanceId: string,
    eventId?: string,
    volunteerUserId?: string,
  ) => {
    const targetEventId = eventId || selectedEventId;
    let result;
    if (targetEventId && volunteerUserId) {
      result = await repo.manualCheckIn({
        eventId: targetEventId,
        volunteerUserId,
        note: 'Manual on-site check-in verified by coordinator',
      });
    } else {
      result = await repo.manualCheckIn(attendanceId);
    }

    setFeedbackBanner(result.message);
    if (result.success) {
      await loadData();
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
    <View style={styles.headerContainer}>
      <CoordinatorEventHeader
        events={events}
        selectedEventId={selectedEventId}
        onSelectEvent={id => {
          setSelectedEventId(id);
          selectedEventIdRef.current = id;
          loadData(id);
        }}
      />

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

      {/* Section 1: Pending Geo Confirmation Queue */}
      <View style={styles.sectionSpacing}>
        <SectionHeader
          title={`Pending Geo Confirmation Queue (${pendingGeoList.length})`}
        />
        {pendingGeoList.length === 0 ? (
          <View
            style={[
              styles.emptyQueueCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.sm,
              },
            ]}
          >
            <AppIcon name="check" size={18} color={theme.colors.success} />
            <AppText
              variant="caption"
              color={theme.colors.textSecondary}
              style={styles.emptyQueueText}
            >
              No geo check-in attempts are currently awaiting review.
            </AppText>
          </View>
        ) : (
          pendingGeoList.map(item => (
            <AttendanceRow
              key={item.id}
              attendance={item}
              isMonitorMode={isMonitorMode}
              onConfirmGeo={handleConfirmGeo}
              onRejectGeo={handleRejectGeo}
            />
          ))
        )}
      </View>

      {/* Section 2: Attendance Roster Filters */}
      <View style={styles.rosterHeaderRow}>
        <SectionHeader title={`Attendance Roster (${counts.all})`} />
      </View>

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
          label={`Checked In (${counts.checkedIn})`}
          selected={activeFilter === 'checked_in'}
          onPress={() => setActiveFilter('checked_in')}
        />
        <FilterChip
          label={`Scheduled (${counts.scheduled})`}
          selected={activeFilter === 'scheduled'}
          onPress={() => setActiveFilter('scheduled')}
        />
        <FilterChip
          label={`Completed (${counts.completed})`}
          selected={activeFilter === 'completed'}
          onPress={() => setActiveFilter('completed')}
        />
      </ScrollView>
    </View>
  );

  const renderFooter = () => (
    <View style={styles.footerContainer}>
      <AppText variant="caption" color={theme.colors.muted} style={styles.privacyNote}>
        Operational Notice: Authoritative distance calculated on server. Raw GPS
        coordinates and device telemetry are hidden per Privacy Rule BR-PRIV-T4. Real
        location permission and GPS capture are not active in this UI preview.
      </AppText>
    </View>
  );

  return (
    <CoordinatorGuard navigation={navigation}>
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Attendance & Check-In"
          subtitle={selectedEvent?.title}
          onBackPress={handleBack}
        />

        {isLoading ? (
          <LoadingState label="Loading attendance records..." />
        ) : (
          <FlatList
            data={filteredRoster}
            keyExtractor={item => item.id}
            ListHeaderComponent={renderHeader}
            renderItem={({ item }) => (
              <AttendanceRow
                attendance={item}
                isMonitorMode={isMonitorMode}
                onConfirmGeo={handleConfirmGeo}
                onRejectGeo={handleRejectGeo}
                onManualCheckIn={handleManualCheckIn}
              />
            )}
            ListFooterComponent={renderFooter}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <EmptyState
                title="No Records Found"
                description={`No attendance records found matching the "${activeFilter}" filter.`}
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
  headerContainer: {
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
  sectionSpacing: {
    marginBottom: 14,
  },
  emptyQueueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  emptyQueueText: {
    marginLeft: 8,
    flex: 1,
  },
  rosterHeaderRow: {
    marginBottom: 6,
  },
  filterScroll: {
    gap: 8,
    marginBottom: 12,
  },
  footerContainer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
  },
  privacyNote: {
    fontStyle: 'italic',
    lineHeight: 18,
    textAlign: 'center',
  },
});
