/**
 * @format
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { CoordinatorAttendanceItem } from '../../../domain/models/coordinator';
import { AppButton, AppCard, AppIcon, AppText, StatusBadge } from '../../../shared';
import { useAppTheme } from '../../../theme';

interface AttendanceRowProps {
  attendance: CoordinatorAttendanceItem;
  isMonitorMode: boolean;
  onConfirmGeo?: (attendanceId: string) => void;
  onRejectGeo?: (attendanceId: string) => void;
  onManualCheckIn?: (
    attendanceId: string,
    eventId?: string,
    volunteerUserId?: string,
  ) => void;
}

export function AttendanceRow({
  attendance,
  isMonitorMode,
  onConfirmGeo,
  onRejectGeo,
  onManualCheckIn,
}: AttendanceRowProps): React.JSX.Element {
  const { theme } = useAppTheme();

  const getStatusBadge = (status: CoordinatorAttendanceItem['status']) => {
    switch (status) {
      case 'checked_in':
        return { status: 'success' as const, label: 'Checked In' };
      case 'pending_confirmation':
        return { status: 'warning' as const, label: 'Pending Geo Review' };
      case 'scheduled':
        return { status: 'muted' as const, label: 'Scheduled' };
      case 'checked_out':
        return { status: 'info' as const, label: 'Checked Out' };
      case 'completed':
        return { status: 'success' as const, label: 'Completed' };
      case 'no_show':
        return { status: 'danger' as const, label: 'No Show' };
    }
  };

  const badgeProps = getStatusBadge(attendance.status);

  // Enable manual check-in action only when row state permits it and coordinator has write capability
  const canManualCheckIn =
    !isMonitorMode &&
    (attendance.status === 'scheduled' ||
      attendance.status === 'pending_confirmation');

  return (
    <AppCard style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.nameCol}>
          <AppText
            variant="title"
            weight="bold"
            color={theme.colors.textPrimary}
          >
            {attendance.volunteerName}
          </AppText>
          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            style={styles.postTitle}
          >
            Post: {attendance.postTitle}
          </AppText>
        </View>

        <StatusBadge status={badgeProps.status} label={badgeProps.label} />
      </View>

      {/* Meta Row: Group code, Check-in Method, Timestamp */}
      <View style={styles.metaRow}>
        {attendance.groupCode ? (
          <View
            style={[
              styles.groupCodePill,
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
              Group: {attendance.groupCode}
            </AppText>
          </View>
        ) : null}

        {attendance.checkInMethod ? (
          <View style={styles.methodTag}>
            <AppIcon
              name={attendance.checkInMethod === 'geo' ? 'location' : 'check'}
              size={12}
              color={theme.colors.textSecondary}
            />
            <AppText
              variant="caption"
              color={theme.colors.textSecondary}
              style={styles.methodText}
            >
              {attendance.checkInMethod === 'geo'
                ? 'Geo Check-In'
                : attendance.checkInMethod === 'qr' ||
                  attendance.checkInMethod === 'qr_scan'
                ? 'QR Scan'
                : attendance.checkInMethod === 'coordinator_manual'
                ? 'Coordinator Manual'
                : 'Manual Verification'}
            </AppText>
          </View>
        ) : null}

        {attendance.checkedInAt ? (
          <AppText variant="caption" color={theme.colors.textSecondary}>
            Time:{' '}
            {(() => {
              try {
                return new Date(attendance.checkedInAt).toLocaleTimeString(
                  undefined,
                  {
                    hour: '2-digit',
                    minute: '2-digit',
                  },
                );
              } catch {
                return attendance.checkedInAt;
              }
            })()}
          </AppText>
        ) : null}
      </View>

      {/* Pending Geo Confirmation Queue Details */}
      {attendance.isPendingGeoConfirmation && attendance.geoAttempt ? (
        <View
          style={[
            styles.geoReviewContainer,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderColor: theme.colors.warning,
              borderRadius: theme.radius.sm,
            },
          ]}
        >
          <View style={styles.geoReviewHeader}>
            <AppIcon name="alert" size={16} color={theme.colors.warning} />
            <AppText
              variant="caption"
              weight="bold"
              color={theme.colors.warning}
              style={styles.geoReviewTitle}
            >
              Pending Geo Check-In Confirmation
            </AppText>
          </View>

          <View style={styles.geoReviewBody}>
            <AppText variant="caption" color={theme.colors.textPrimary}>
              Operational Status:{' '}
              <AppText
                variant="caption"
                weight="bold"
                color={theme.colors.success}
              >
                {attendance.geoAttempt.withinGeofence
                  ? 'Within Event Geofence'
                  : 'Outside Radius'}
              </AppText>
              {attendance.geoAttempt.distanceMeters !== undefined
                ? ` (~${attendance.geoAttempt.distanceMeters}m from center)`
                : ''}
            </AppText>

            <AppText
              variant="caption"
              color={theme.colors.muted}
              style={styles.geoPrivacyNote}
            >
              Authoritative validation evaluated on server. Raw GPS coordinates
              and device telemetry are hidden per Privacy Rule BR-PRIV-T4.
            </AppText>
          </View>

          {/* Confirm / Reject Buttons */}
          <View style={styles.geoActionsRow}>
            {isMonitorMode ? (
              <AppText
                variant="caption"
                color={theme.colors.accent}
                style={styles.monitorText}
              >
                Geo confirmation disabled in monitor mode
              </AppText>
            ) : (
              <View style={styles.buttonGroup}>
                <View style={styles.actionBtn}>
                  <AppButton
                    label="Confirm Check-In"
                    variant="primary"
                    disabled={isMonitorMode}
                    onPress={() => onConfirmGeo?.(attendance.id)}
                  />
                </View>
                <View style={styles.actionBtn}>
                  <AppButton
                    label="Reject"
                    variant="danger"
                    disabled={isMonitorMode}
                    onPress={() => onRejectGeo?.(attendance.id)}
                  />
                </View>
              </View>
            )}
          </View>
        </View>
      ) : null}

      {/* Manual Check-in Action for scheduled / eligible volunteers */}
      {canManualCheckIn ? (
        <View style={styles.manualCheckinRow}>
          <AppButton
            label="Manual Check-In"
            variant="secondary"
            disabled={isMonitorMode}
            onPress={() =>
              onManualCheckIn?.(
                attendance.id,
                attendance.eventId,
                attendance.userId,
              )
            }
          />
        </View>
      ) : isMonitorMode &&
        (attendance.status === 'scheduled' ||
          attendance.status === 'pending_confirmation') ? (
        <View style={styles.manualCheckinRow}>
          <AppText
            variant="caption"
            color={theme.colors.accent}
            style={styles.monitorText}
          >
            Check-in disabled in monitor mode
          </AppText>
        </View>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  nameCol: {
    flex: 1,
    marginRight: 8,
  },
  postTitle: {
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  groupCodePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  methodTag: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  methodText: {
    marginLeft: 4,
  },
  geoReviewContainer: {
    padding: 10,
    borderWidth: 1,
    marginTop: 6,
    marginBottom: 6,
  },
  geoReviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  geoReviewTitle: {
    marginLeft: 6,
  },
  geoReviewBody: {
    marginBottom: 8,
  },
  geoPrivacyNote: {
    marginTop: 4,
    fontStyle: 'italic',
  },
  geoActionsRow: {
    marginTop: 4,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
  },
  manualCheckinRow: {
    marginTop: 6,
    alignItems: 'flex-end',
  },
  monitorText: {
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 4,
  },
});
