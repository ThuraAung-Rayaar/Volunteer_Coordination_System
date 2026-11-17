/**
 * @format
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import type {
  CoordinatorApplicationItem,
  CoordinatorAssignmentItem,
} from '../../../domain/models/coordinator';
import { AppButton, AppCard, AppIcon, AppText, StatusBadge } from '../../../shared';
import { useAppTheme } from '../../../theme';

interface AssignmentRowProps {
  assignment?: CoordinatorAssignmentItem;
  unassignedApplication?: CoordinatorApplicationItem;
  isMonitorMode: boolean;
  onManualAssign?: (applicationId: string) => void;
  onCancelAssignment?: (assignmentId: string) => void;
}

export function AssignmentRow({
  assignment,
  unassignedApplication,
  isMonitorMode,
  onManualAssign,
  onCancelAssignment,
}: AssignmentRowProps): React.JSX.Element | null {
  const { theme } = useAppTheme();

  if (unassignedApplication) {
    return (
      <AppCard style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.nameCol}>
            <AppText
              variant="title"
              weight="bold"
              color={theme.colors.textPrimary}
            >
              {unassignedApplication.applicantName}
            </AppText>
            <AppText
              variant="caption"
              color={theme.colors.textSecondary}
              style={styles.postTitle}
            >
              Post: {unassignedApplication.postTitle ?? 'General Volunteer Support'}
            </AppText>
          </View>
          <StatusBadge status="warning" label="Unassigned" />
        </View>

        <View style={styles.actionRow}>
          {isMonitorMode ? (
            <AppText
              variant="caption"
              color={theme.colors.accent}
              style={styles.monitorText}
            >
              Assignment disabled in monitor mode
            </AppText>
          ) : (
            <AppButton
              label="Assign to Post (Demo)"
              variant="primary"
              disabled={isMonitorMode}
              onPress={() => onManualAssign?.(unassignedApplication.id)}
            />
          )}
        </View>
      </AppCard>
    );
  }

  if (!assignment) {
    return null;
  }

  const isCompleted = assignment.status === 'completed';
  const isCancelled = assignment.status === 'cancelled';

  const getStatusBadge = (status: CoordinatorAssignmentItem['status']) => {
    switch (status) {
      case 'confirmed':
        return { status: 'success' as const, label: 'Confirmed' };
      case 'assigned':
        return { status: 'info' as const, label: 'Assigned' };
      case 'completed':
        return { status: 'muted' as const, label: 'Completed' };
      case 'cancelled':
        return { status: 'danger' as const, label: 'Cancelled' };
    }
  };

  const badgeProps = getStatusBadge(assignment.status);

  return (
    <AppCard style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.nameCol}>
          <View style={styles.nameWithIcon}>
            <AppText
              variant="title"
              weight="bold"
              color={theme.colors.textPrimary}
            >
              {assignment.volunteerName}
            </AppText>
            {assignment.isGroupLeader ? (
              <View
                style={[
                  styles.leaderPill,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.accent,
                    borderRadius: theme.radius.sm,
                  },
                ]}
              >
                <AppIcon name="user" size={12} color={theme.colors.accent} />
                <AppText
                  variant="caption"
                  weight="bold"
                  color={theme.colors.accent}
                  style={styles.leaderText}
                >
                  Group Leader
                </AppText>
              </View>
            ) : null}
          </View>

          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            style={styles.postTitle}
          >
            Post: {assignment.postTitle}
          </AppText>
        </View>

        <StatusBadge status={badgeProps.status} label={badgeProps.label} />
      </View>

      {/* Group & Scheduling Meta */}
      <View style={styles.metaRow}>
        {assignment.groupCode ? (
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
              Group: {assignment.groupCode}
            </AppText>
          </View>
        ) : null}

        <AppText variant="caption" color={theme.colors.textSecondary}>
          Assigned:{' '}
          {new Date(assignment.assignedAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </AppText>
      </View>

      {/* Cancellation Action */}
      {!isCompleted && !isCancelled ? (
        <View style={styles.actionRow}>
          {isMonitorMode ? (
            <AppText
              variant="caption"
              color={theme.colors.accent}
              style={styles.monitorText}
            >
              Cancellation disabled in monitor mode
            </AppText>
          ) : (
            <AppButton
              label="Cancel Assignment (Demo)"
              variant="secondary"
              disabled={isMonitorMode}
              onPress={() => onCancelAssignment?.(assignment.id)}
            />
          )}
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
  nameWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  leaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  leaderText: {
    marginLeft: 4,
  },
  postTitle: {
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  groupCodePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  actionRow: {
    marginTop: 6,
    alignItems: 'flex-end',
  },
  monitorText: {
    fontStyle: 'italic',
  },
});
