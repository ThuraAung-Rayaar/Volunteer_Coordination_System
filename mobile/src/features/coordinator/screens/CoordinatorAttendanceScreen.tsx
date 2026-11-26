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
import QRCode from 'react-native-qrcode-svg';
import { CoordinatorRepository } from '../../../data/contracts/coordinatorRepository';
import {
  defaultCoordinatorRepository,
  MockCoordinatorRepository,
} from '../../../data/mock/MockCoordinatorRepository';
import { useRepositories } from '../../../app/RepositoryProvider';
import { isMockMode } from '../../../app/configuration/dataMode';
import type {
  AttendanceRecordStatus,
  CoordinatorAttendanceItem,
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
  SectionHeader,
  StatusBadge,
} from '../../../shared';
import { useAppTheme } from '../../../theme';
import {
  AttendanceRow,
  CoordinatorDynamicIsland,
  CoordinatorEventHeader,
  CoordinatorGuard,
  CoordinatorSwipeWrapper,
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
  const [manualCheckInNote, setManualCheckInNote] = useState('');
  const [qrPurpose, setQrPurpose] = useState<'walkin_registration' | 'checkin' | 'join_event'>('checkin');
  const [qrMaxUses, setQrMaxUses] = useState('');
  const [qrTtlMinutes, setQrTtlMinutes] = useState('60');
  const [isCreatingQr, setIsCreatingQr] = useState(false);
  const [createdQrToken, setCreatedQrToken] = useState<{ id: number; rawToken: string; expiresAt: string } | null>(null);
  const [revokeQrId, setRevokeQrId] = useState('');

  // Clear QR state on component unmount
  useEffect(() => {
    return () => {
      setCreatedQrToken(null);
    };
  }, []);

  const isQrExpired = useMemo(() => {
    if (!createdQrToken?.expiresAt) return false;
    const expiryTime = new Date(createdQrToken.expiresAt).getTime();
    return !Number.isNaN(expiryTime) && expiryTime < Date.now();
  }, [createdQrToken]);

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
        note: manualCheckInNote.trim() || undefined,
      });
    } else {
      result = await repo.manualCheckIn(attendanceId);
    }

    setFeedbackBanner(result.message);
    if (result.success) {
      await loadData();
    }
  };

  const handleCreateQrToken = async () => {
    if (!selectedEvent || isMonitorMode) return;
    const ttlMinutes = Number(qrTtlMinutes.trim());
    if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 10080) {
      setFeedbackBanner('QR token lifetime must be between 1 and 10080 minutes.');
      return;
    }
    const maxUsesValue = qrMaxUses.trim() ? Number(qrMaxUses.trim()) : null;
    if (maxUsesValue !== null && (!Number.isInteger(maxUsesValue) || maxUsesValue < 1)) {
      setFeedbackBanner('Maximum uses must be a positive whole number, or left blank for the BFF default.');
      return;
    }

    setIsCreatingQr(true);
    try {
      const result = await repo.createQrToken(
        selectedEvent.id,
        qrPurpose,
        maxUsesValue,
        ttlMinutes,
      );
      if (!result.success || !result.data) {
        setFeedbackBanner(result.message);
        return;
      }
      setCreatedQrToken(result.data);
      setRevokeQrId(String(result.data.id));
      setFeedbackBanner(result.message);
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Failed to create QR token.');
    } finally {
      setIsCreatingQr(false);
    }
  };

  const handleRevokeQrToken = async () => {
    if (isMonitorMode) return;
    const targetId = revokeQrId.trim() || (createdQrToken ? String(createdQrToken.id) : '');
    if (!targetId) {
      setFeedbackBanner('Enter a QR token ID to revoke.');
      return;
    }
    try {
      const result = await repo.revokeQrToken(targetId);
      setFeedbackBanner(result.message);
      if (result.success) {
        if (createdQrToken?.id === Number(targetId)) setCreatedQrToken(null);
        setRevokeQrId('');
      }
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Failed to revoke QR token.');
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
    <View style={styles.headerContainer}>
      <CoordinatorEventHeader
        events={events}
        selectedEventId={selectedEventId}
        onSelectEvent={id => {
          setSelectedEventId(id);
          selectedEventIdRef.current = id;
          setCreatedQrToken(null);
          setRevokeQrId('');
          loadData(id);
        }}
        onSwitchEvent={() => {
          setSelectedEventId('');
          selectedEventIdRef.current = '';
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

      {/* Template-editable coordinator check-in note */}
      <View style={styles.sectionSpacing}>
        <SectionHeader title="Manual Check-In Note" />
        <AppInput
          label="Coordinator verification note (optional)"
          value={manualCheckInNote}
          onChangeText={setManualCheckInNote}
          placeholder="e.g. Identity and on-site attendance checked by coordinator"
          editable={!isMonitorMode}
          multiline
          numberOfLines={2}
        />
        <AppText variant="caption" color={theme.colors.textSecondary}>
          This note is submitted with manual check-in. It is not used for geo or QR check-in.
        </AppText>
      </View>

      {/* Coordinator QR-token management — existing BFF create/revoke routes */}
      <View style={styles.sectionSpacing}>
        <SectionHeader title="Coordinator QR Token" />
        <View style={[styles.emptyQueueCard, { flexDirection: 'column', alignItems: 'stretch', gap: 10, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <AppText variant="caption" color={theme.colors.textSecondary}>
            Create a server-authoritative token for walk-in registration, event check-in, or joining an event.
          </AppText>
          <View style={styles.filterScroll}>
            <FilterChip label="Check-In" selected={qrPurpose === 'checkin'} onPress={() => setQrPurpose('checkin')} />
            <FilterChip label="Walk-In Registration" selected={qrPurpose === 'walkin_registration'} onPress={() => setQrPurpose('walkin_registration')} />
            <FilterChip label="Join Event" selected={qrPurpose === 'join_event'} onPress={() => setQrPurpose('join_event')} />
          </View>
          <AppInput label="Maximum Uses (optional)" value={qrMaxUses} onChangeText={setQrMaxUses} placeholder="Leave blank for BFF default" keyboardType="number-pad" editable={!isMonitorMode} />
          <AppInput label="Lifetime in Minutes (1–10080)" value={qrTtlMinutes} onChangeText={setQrTtlMinutes} placeholder="60" keyboardType="number-pad" editable={!isMonitorMode} />
          <AppButton
            label="Create QR Token"
            variant="primary"
            loading={isCreatingQr}
            disabled={isMonitorMode || !selectedEvent}
            onPress={handleCreateQrToken}
          />
          {createdQrToken ? (
            <View style={[styles.qrTokenPreview, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceRaised }]}>
              <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>Created Token #{createdQrToken.id}</AppText>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                {repositories.dataMode === 'mock'
                  ? 'Offline preview token — connect to server to save.'
                  : 'Server-issued token value — handle securely.'}
              </AppText>
              {isQrExpired ? (
                <View style={[styles.qrExpiredBadge, { backgroundColor: theme.colors.surface, borderColor: theme.colors.danger }]}>
                  <AppIcon name="alert" size={16} color={theme.colors.danger} />
                  <AppText variant="caption" weight="bold" color={theme.colors.danger}>
                    TOKEN EXPIRED — Generate a new token for check-in
                  </AppText>
                </View>
              ) : (
                <View style={styles.qrCodeWrapper} testID="coordinator-qr-container">
                  <View style={styles.qrCodeInner}>
                    <QRCode
                      value={createdQrToken.rawToken}
                      size={180}
                      backgroundColor="#FFFFFF"
                      color="#000000"
                    />
                  </View>
                  <AppText variant="caption" weight="semibold" color={theme.colors.primary} style={{ marginTop: 8 }}>
                    Raw: {createdQrToken.rawToken}
                  </AppText>
                </View>
              )}
              <View style={styles.qrMetadataRow}>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Event: {selectedEvent?.title ?? 'Selected Event'} • Purpose: {qrPurpose}
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Expires: {createdQrToken.expiresAt}
                </AppText>
              </View>
            </View>
          ) : null}
          <AppInput label="QR Token ID to Revoke" value={revokeQrId} onChangeText={setRevokeQrId} placeholder="Enter the token ID" keyboardType="number-pad" editable={!isMonitorMode} />
          <AppButton
            label="Revoke QR Token"
            variant="danger"
            disabled={isMonitorMode || !revokeQrId.trim()}
            onPress={handleRevokeQrToken}
          />
          {isMonitorMode ? (
            <AppText variant="caption" color={theme.colors.accent}>QR token management is disabled in read-only monitor mode.</AppText>
          ) : null}
        </View>
      </View>

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
        coordinates and device telemetry are hidden per Privacy Rule BR-PRIV-T4.
      </AppText>
    </View>
  );

  return (
    <CoordinatorGuard navigation={navigation}>
      <CoordinatorSwipeWrapper currentTab="attendance" navigation={navigation}>
        <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Attendance & Check-In"
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
                  accessibilityLabel={`Manage attendance for ${ev.title}`}
                  onPress={() => {
                    setSelectedEventId(ev.id);
                    selectedEventIdRef.current = ev.id;
                    setCreatedQrToken(null);
                    setRevokeQrId('');
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
                        {ev.checkedInTodayCount ?? 0} checked in today
                      </AppText>
                    </View>

                    <AppButton
                      label="Manage Attendance & Check-In"
                      variant="primary"
                      onPress={() => {
                        setSelectedEventId(ev.id);
                        selectedEventIdRef.current = ev.id;
                        setCreatedQrToken(null);
                        setRevokeQrId('');
                        loadData(ev.id);
                      }}
                      style={{ marginTop: 4 }}
                    />
                  </AppCard>
                </Pressable>
              ))
            )}
            {renderFooter()}
          </ScrollView>
        ) : isLoading ? (
          <LoadingState label="Loading attendance records..." />
        ) : (
          <KeyboardLiftView>
            <FlatList
              data={filteredRoster}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
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
          </KeyboardLiftView>
        )}

        <CoordinatorDynamicIsland
          activeTab="attendance"
          navigation={navigation}
          checkedInTodayCount={counts.checkedIn}
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
  qrTokenPreview: {
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
    gap: 4,
  },
  qrCodeWrapper: {
    alignItems: 'center',
    marginVertical: 10,
  },
  qrCodeInner: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrExpiredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderRadius: 6,
    marginVertical: 8,
  },
  qrMetadataRow: {
    marginTop: 4,
    gap: 2,
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
