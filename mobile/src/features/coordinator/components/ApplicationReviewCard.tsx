/**
 * @format
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { CoordinatorApplicationItem } from '../../../domain/models/coordinator';
import { AppButton, AppCard, AppIcon, AppText, StatusBadge } from '../../../shared';
import { useAppTheme } from '../../../theme';

interface ApplicationReviewCardProps {
  application: CoordinatorApplicationItem;
  isMonitorMode: boolean;
  onAccept?: (applicationId: string) => void;
  onReject?: (applicationId: string) => void;
  onWaitlist?: (applicationId: string) => void;
}

export function ApplicationReviewCard({
  application,
  isMonitorMode,
  onAccept,
  onReject,
  onWaitlist,
}: ApplicationReviewCardProps): React.JSX.Element {
  const { theme } = useAppTheme();

  const isAccepted = application.status === 'accepted';
  const t2 = application.t2Capabilities;

  const getStatusBadgeProps = (status: CoordinatorApplicationItem['status']) => {
    switch (status) {
      case 'accepted':
        return { status: 'success' as const, label: 'Accepted' };
      case 'pending':
        return { status: 'warning' as const, label: 'Pending Review' };
      case 'waitlisted':
        return { status: 'muted' as const, label: 'Waitlisted' };
      case 'rejected':
        return { status: 'danger' as const, label: 'Rejected' };
      default:
        return { status: 'muted' as const, label: status.toUpperCase() };
    }
  };

  const badgeProps = getStatusBadgeProps(application.status);

  return (
    <AppCard style={styles.card}>
      {/* Header Row: Applicant Name and Status */}
      <View style={styles.headerRow}>
        <View style={styles.nameContainer}>
          <AppText
            variant="title"
            weight="bold"
            color={theme.colors.textPrimary}
          >
            {application.applicantName || 'Applicant'}
          </AppText>
          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            style={styles.appliedDate}
          >
            Applied on{' '}
            {application.appliedAt
              ? new Date(application.appliedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'N/A'}
          </AppText>
        </View>

        <StatusBadge status={badgeProps.status} label={badgeProps.label} />
      </View>

      {/* T1 Minimal Identity Details */}
      <View style={styles.t1Details}>
        <View style={styles.detailRow}>
          <AppText variant="caption" color={theme.colors.textSecondary}>
            Applied Post:
          </AppText>
          <AppText
            variant="caption"
            weight="semibold"
            color={theme.colors.textPrimary}
            style={styles.detailValue}
          >
            {application.postTitle ?? 'General Volunteer Support'}
          </AppText>
        </View>

        <View style={styles.detailRow}>
          <AppText variant="caption" color={theme.colors.textSecondary}>
            Source:
          </AppText>
          <AppText
            variant="caption"
            weight="semibold"
            color={theme.colors.textPrimary}
            style={styles.detailValue}
          >
            {application.source === 'qr_walkin'
              ? 'QR Walk-in'
              : application.source === 'invite'
              ? 'Coordinator Invite'
              : 'Browse Event'}
          </AppText>
        </View>

        <View style={styles.detailRow}>
          <AppText variant="caption" color={theme.colors.textSecondary}>
            Applicant ID:
          </AppText>
          <AppText
            variant="caption"
            color={theme.colors.muted}
            style={styles.detailValue}
          >
            {application.userId}
          </AppText>
        </View>
      </View>

      {/* T2 Semi-Private Capabilities: RENDERED ONLY FOR ACCEPTED APPLICANTS */}
      {isAccepted && t2 ? (
        <View
          style={[
            styles.t2Container,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.sm,
            },
          ]}
        >
          <View style={styles.t2Header}>
            <AppIcon name="check" size={14} color={theme.colors.primary} />
            <AppText
              variant="caption"
              weight="bold"
              color={theme.colors.primary}
              style={styles.t2Title}
            >
              T2 Volunteer Capabilities & Profile
            </AppText>
          </View>

          {/* Verification & Location */}
          <View style={styles.t2MetaRow}>
            <View style={styles.t2Tag}>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                Verification:{' '}
              </AppText>
              <AppText
                variant="caption"
                weight="bold"
                color={
                  t2.verificationStatus === 'verified'
                    ? theme.colors.success
                    : theme.colors.warning
                }
              >
                {t2.verificationStatus.toUpperCase()}
              </AppText>
            </View>

            <View style={styles.t2Tag}>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                Area:{' '}
              </AppText>
              <AppText
                variant="caption"
                weight="semibold"
                color={theme.colors.textPrimary}
              >
                {t2.homeArea}
              </AppText>
            </View>

            <View style={styles.t2Tag}>
              <AppText variant="caption" color={theme.colors.textSecondary}>
                Lang:{' '}
              </AppText>
              <AppText
                variant="caption"
                weight="semibold"
                color={theme.colors.textPrimary}
              >
                {t2.preferredLanguage.toUpperCase()}
              </AppText>
            </View>
          </View>

          {/* Skills Chips */}
          <View style={styles.skillsSection}>
            <AppText
              variant="caption"
              color={theme.colors.textSecondary}
              style={styles.skillsLabel}
            >
              Skills:
            </AppText>
            <View style={styles.chipsWrap}>
              {t2.skills.map(skill => (
                <View
                  key={skill}
                  style={[
                    styles.skillPill,
                    {
                      backgroundColor: theme.colors.background,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.pill,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    weight="semibold"
                    color={theme.colors.textPrimary}
                  >
                    {skill}
                  </AppText>
                </View>
              ))}
            </View>
          </View>

          {/* Operational Capability Badges */}
          <View style={styles.capabilitiesGrid}>
            {t2.canLiftHeavy ? (
              <AppText
                variant="caption"
                weight="semibold"
                color={theme.colors.textPrimary}
                style={styles.capabilityBadge}
              >
                ✓ Heavy Lifting OK
              </AppText>
            ) : null}
            {t2.canWorkOutdoor ? (
              <AppText
                variant="caption"
                weight="semibold"
                color={theme.colors.textPrimary}
                style={styles.capabilityBadge}
              >
                ✓ Outdoor OK
              </AppText>
            ) : null}
            {t2.hasLeaderExperience ? (
              <AppText
                variant="caption"
                weight="semibold"
                color={theme.colors.primary}
                style={styles.capabilityBadge}
              >
                ⭐ Leadership Experience
              </AppText>
            ) : null}
            {t2.newToVolunteer ? (
              <AppText
                variant="caption"
                color={theme.colors.accent}
                style={styles.capabilityBadge}
              >
                • First-time Volunteer
              </AppText>
            ) : null}
            {t2.needsMealSupport ? (
              <AppText
                variant="caption"
                color={theme.colors.textSecondary}
                style={styles.capabilityBadge}
              >
                • Meal Support Requested
              </AppText>
            ) : null}
            {t2.needsTravelSupport ? (
              <AppText
                variant="caption"
                color={theme.colors.textSecondary}
                style={styles.capabilityBadge}
              >
                • Travel Support Requested
              </AppText>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.t1Notice}>
          <AppText variant="caption" color={theme.colors.muted}>
            T2 capabilities hidden per BR-PRIV-T2 (visible only for accepted volunteers).
          </AppText>
        </View>
      )}

      {/* Action Controls */}
      <View style={styles.actionsContainer}>
        {isMonitorMode ? (
          <AppText
            variant="caption"
            weight="semibold"
            color={theme.colors.accent}
            style={styles.monitorNotice}
          >
            Review actions disabled in Read-Only Monitor Mode
          </AppText>
        ) : (
          <View style={styles.buttonRow}>
            {application.status === 'pending' ? (
              <>
                <View style={styles.actionBtn}>
                  <AppButton
                    label="Accept"
                    variant="primary"
                    disabled={isMonitorMode}
                    onPress={() => onAccept?.(application.id)}
                  />
                </View>
                <View style={styles.actionBtn}>
                  <AppButton
                    label="Waitlist"
                    variant="secondary"
                    disabled={isMonitorMode}
                    onPress={() => onWaitlist?.(application.id)}
                  />
                </View>
                <View style={styles.actionBtn}>
                  <AppButton
                    label="Reject"
                    variant="danger"
                    disabled={isMonitorMode}
                    onPress={() => onReject?.(application.id)}
                  />
                </View>
              </>
            ) : application.status === 'waitlisted' ? (
              <>
                <View style={styles.actionBtn}>
                  <AppButton
                    label="Accept"
                    variant="primary"
                    disabled={isMonitorMode}
                    onPress={() => onAccept?.(application.id)}
                  />
                </View>
                <View style={styles.actionBtn}>
                  <AppButton
                    label="Reject"
                    variant="danger"
                    disabled={isMonitorMode}
                    onPress={() => onReject?.(application.id)}
                  />
                </View>
              </>
            ) : null}
          </View>
        )}
      </View>
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
    marginBottom: 10,
  },
  nameContainer: {
    flex: 1,
    marginRight: 8,
  },
  appliedDate: {
    marginTop: 2,
  },
  t1Details: {
    marginBottom: 8,
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailValue: {
    marginLeft: 8,
  },
  t1Notice: {
    marginTop: 4,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  t2Container: {
    padding: 10,
    borderWidth: 1,
    marginTop: 6,
    marginBottom: 10,
  },
  t2Header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  t2Title: {
    marginLeft: 6,
  },
  t2MetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  t2Tag: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  skillsSection: {
    marginBottom: 8,
  },
  skillsLabel: {
    marginBottom: 4,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  skillPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  capabilitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  capabilityBadge: {
    paddingVertical: 2,
  },
  actionsContainer: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
    paddingTop: 8,
  },
  monitorNotice: {
    textAlign: 'center',
    paddingVertical: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    flex: 1,
  },
});
