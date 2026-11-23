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
  CoordinatorAssignmentItem,
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
  LoadingState,
  SectionHeader,
} from '../../../shared';
import { useAppTheme } from '../../../theme';
import {
  AssignmentRow,
  CoordinatorDynamicIsland,
  CoordinatorEventHeader,
  CoordinatorGuard,
  CoordinatorSwipeWrapper,
} from '../components';

export interface CoordinatorAssignmentsScreenProps
  extends Partial<MainDrawerScreenProps<'CoordinatorAssignments'>> {
  repository?: CoordinatorRepository;
}

type TabFilter = 'all' | 'unassigned' | 'assigned';

export function CoordinatorAssignmentsScreen({
  route,
  navigation,
  repository: propRepository,
}: CoordinatorAssignmentsScreenProps): React.JSX.Element {
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

  const [assignments, setAssignments] = useState<CoordinatorAssignmentItem[]>([]);
  const [unassignedApps, setUnassignedApps] = useState<
    CoordinatorApplicationItem[]
  >([]);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualTargetPostId, setManualTargetPostId] = useState('');
  const [manualGroupCode, setManualGroupCode] = useState('');
  const [manualIsGroupLeader, setManualIsGroupLeader] = useState(false);

  const loadData = useCallback(
    async (targetId?: string) => {
      setIsLoading(true);
      try {
        const evList = await repo.getMyEvents();
        const operationalEvents = evList.filter(
          e => e.status !== 'cancelled' && e.status !== 'completed',
        );
        setEvents(operationalEvents);

        const eventIdToUse =
          targetId ||
          selectedEventIdRef.current ||
          route?.params?.eventId ||
          operationalEvents[0]?.id ||
          'evt-coord-001';

        if (selectedEventIdRef.current !== eventIdToUse) {
          selectedEventIdRef.current = eventIdToUse;
          setSelectedEventId(eventIdToUse);
        }

        const [asgList, unassignedList] = await Promise.all([
          repo.getAssignments(eventIdToUse),
          repo.getUnassignedApplications(eventIdToUse),
        ]);
        setAssignments(asgList);
        setUnassignedApps(unassignedList);
      } catch {
        setFeedbackBanner('Unable to load assignments data.');
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

  const handleRunAutoAssignment = async () => {
    if (!selectedEvent) {
      return;
    }
    setIsProcessing(true);
    try {
      const result = await repo.runAutoAssignment(
        selectedEvent.id,
      );
      setFeedbackBanner(result.message);
      if (result.success) {
        await loadData();
      }
    } catch {
      setFeedbackBanner('Failed to execute auto-assignment.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualAssign = async (applicationId: string) => {
    setIsProcessing(true);
    try {
      const app = unassignedApps.find(a => a.id === applicationId);
      const postIdToAssign = manualTargetPostId.trim() || app?.postId || '';
      const result = await repo.assignVolunteerManually(
        applicationId,
        postIdToAssign,
        manualGroupCode.trim() || undefined,
        manualIsGroupLeader,
        selectedEventId,
      );
      setFeedbackBanner(result.message);
      if (result.success) {
        await loadData();
      }
    } catch {
      setFeedbackBanner('Failed to assign volunteer.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelAssignment = async (assignmentId: string) => {
    setIsProcessing(true);
    try {
      const result = await repo.cancelAssignment(
        assignmentId,
      );
      setFeedbackBanner(result.message);
      if (result.success) {
        await loadData();
      }
    } catch {
      setFeedbackBanner('Failed to cancel assignment.');
    } finally {
      setIsProcessing(false);
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

      {/* Auto-Assignment CTA Card */}
      <AppCard style={styles.autoAssignCard}>
        <View style={styles.autoAssignHeader}>
          <AppIcon name="refresh" size={18} color={theme.colors.primary} />
          <AppText
            variant="title"
            weight="bold"
            color={theme.colors.textPrimary}
            style={styles.autoAssignTitle}
          >
            Auto-Assignment Engine
          </AppText>
        </View>

        <AppText
          variant="caption"
          color={theme.colors.textSecondary}
          style={styles.autoAssignDesc}
        >
          Post matching, group sizing, and capacity rules are evaluated by
          server-authoritative functions. Preview auto-placement locally.
        </AppText>

        <View style={styles.autoAssignButtonWrapper}>
          <AppButton
            label="Run Auto-Assignment (Demo Preview)"
            variant="primary"
            loading={isProcessing}
            disabled={isMonitorMode || unassignedApps.length === 0}
            onPress={handleRunAutoAssignment}
          />
        </View>
      </AppCard>

      {/* Tab Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabScroll}
      >
        <FilterChip
          label={`All (${unassignedApps.length + assignments.length})`}
          selected={activeTab === 'all'}
          onPress={() => setActiveTab('all')}
        />
        <FilterChip
          label={`Unassigned (${unassignedApps.length})`}
          selected={activeTab === 'unassigned'}
          onPress={() => setActiveTab('unassigned')}
        />
        <FilterChip
          label={`Assigned (${assignments.length})`}
          selected={activeTab === 'assigned'}
          onPress={() => setActiveTab('assigned')}
        />
      </ScrollView>

      {/* Manual Assignment Parameters — exact optional BFF inputs */}
      {!isMonitorMode && activeTab !== 'assigned' && unassignedApps.length > 0 ? (
        <View style={styles.sectionWrapper}>
          <SectionHeader title="Manual Assignment Parameters" />
          <AppCard style={styles.assignmentOptionsCard}>
            <AppText variant="caption" color={theme.colors.textSecondary}>
              Choose the target post and optional group settings before assigning an accepted application. If the post ID is blank, the application's requested post is used when available.
            </AppText>
            <AppInput
              label="Target Post ID (optional)"
              value={manualTargetPostId}
              onChangeText={setManualTargetPostId}
              placeholder="Use application's preferred post"
              style={styles.manualField}
            />
            <AppInput
              label="Group Code (optional)"
              value={manualGroupCode}
              onChangeText={setManualGroupCode}
              placeholder="e.g. TEAM-YGN-01"
              style={styles.manualField}
            />
            <View style={styles.chipRow}>
              <FilterChip
                label="Regular Member"
                selected={!manualIsGroupLeader}
                onPress={() => setManualIsGroupLeader(false)}
              />
              <FilterChip
                label="Assign as Group Leader"
                selected={manualIsGroupLeader}
                onPress={() => setManualIsGroupLeader(true)}
              />
            </View>
            <AppText variant="caption" color={theme.colors.textSecondary}>
              The selected application ID is taken from the accepted application card. The BFF remains authoritative for post/event ownership and assignment rules.
            </AppText>
          </AppCard>
        </View>
      ) : null}

      {/* Section 1: Unassigned Accepted Volunteers */}
      {activeTab !== 'assigned' ? (
        <View style={styles.sectionWrapper}>
          <SectionHeader
            title={`Unassigned Accepted Volunteers (${unassignedApps.length})`}
          />
          {unassignedApps.length === 0 ? (
            <AppText
              variant="caption"
              color={theme.colors.muted}
              style={styles.emptyInlineText}
            >
              All accepted volunteers for this event have been assigned to shifts.
            </AppText>
          ) : (
            unassignedApps.map(unassigned => (
              <AssignmentRow
                key={unassigned.id}
                unassignedApplication={unassigned}
                isMonitorMode={isMonitorMode}
                onManualAssign={handleManualAssign}
              />
            ))
          )}
        </View>
      ) : null}

      {/* Section 2 Heading if showing all */}
      {activeTab !== 'unassigned' ? (
        <View style={styles.sectionWrapper}>
          <SectionHeader
            title={`Current Shift Assignments (${assignments.length})`}
          />
        </View>
      ) : null}
    </View>
  );

  const displayAssignments =
    activeTab === 'unassigned' ? [] : assignments;

  return (
    <CoordinatorGuard navigation={navigation}>
      <CoordinatorSwipeWrapper currentTab="assignments" navigation={navigation}>
        <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Shift Assignments"
          subtitle={selectedEvent?.title}
          onBackPress={handleBack}
        />

        {isLoading ? (
          <LoadingState label="Loading shift assignments..." />
        ) : (
          <FlatList
            data={displayAssignments}
            keyExtractor={item => item.id}
            ListHeaderComponent={renderHeader}
            renderItem={({ item }) => (
              <AssignmentRow
                assignment={item}
                isMonitorMode={isMonitorMode}
                onCancelAssignment={handleCancelAssignment}
              />
            )}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              activeTab === 'assigned' ? (
                <EmptyState
                  title="No Assignments Found"
                  description="No volunteers have been assigned to shifts yet."
                />
              ) : undefined
            }
          />
        )}

        <CoordinatorDynamicIsland
          activeTab="assignments"
          navigation={navigation}
          acceptedApplicantsCount={assignments.filter(a => a.status === 'assigned').length}
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
  autoAssignCard: {
    padding: 14,
    marginBottom: 14,
  },
  autoAssignHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  autoAssignTitle: {
    marginLeft: 8,
  },
  autoAssignDesc: {
    marginBottom: 10,
    lineHeight: 18,
  },
  autoAssignButtonWrapper: {
    alignItems: 'flex-start',
  },
  tabScroll: {
    gap: 8,
    marginBottom: 12,
  },
  sectionWrapper: {
    marginBottom: 8,
  },
  assignmentOptionsCard: {
    padding: 14,
    gap: 8,
  },
  manualField: {
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emptyInlineText: {
    fontStyle: 'italic',
    paddingHorizontal: 4,
    paddingVertical: 8,
    marginBottom: 8,
  },
});
