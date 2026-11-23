/**
 * @format
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { defaultProfileRepository } from '../../../data/mock/MockProfileRepository';
import type {
  CoordinatorEligibilityData,
  ProfileRepository,
} from '../../../data/contracts/profileRepository';
import { useRepositories } from '../../../app/RepositoryProvider';
import { CHARITY_CATEGORIES } from '../../../domain/models/event';
import type { VolunteerProfile } from '../../../domain/models/profile';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppIcon,
  AppText,
  ErrorState,
  LoadingState,
  RatingSummary,
  ScreenContainer,
  SectionHeader,
  StatusBadge,
} from '../../../shared';
import { useAppTheme } from '../../../theme';

export interface ProfileScreenProps
  extends Partial<MainDrawerScreenProps<'Profile'>> {
  repository?: ProfileRepository;
}

const CATEGORY_MAP: Record<string, string> = Object.fromEntries(
  CHARITY_CATEGORIES.map(c => [c.code, c.label]),
);

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'V';
  }
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ProfileScreen({
  navigation,
  repository: propRepository,
}: ProfileScreenProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const repositories = useRepositories();
  const repository = propRepository ?? repositories.profileRepository ?? defaultProfileRepository;

  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [eligibility, setEligibility] =
    useState<CoordinatorEligibilityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoadError(null);
      const [profileData, eligibilityData] = await Promise.all([
        repository.getProfile(),
        repository.getCoordinatorEligibility(),
      ]);
      setProfile(profileData);
      setEligibility(eligibilityData);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load profile details',
      );
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    loadData();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadData();
    });
    return unsubscribe;
  }, [loadData, navigation]);

  const handleApplyCoordinator = async () => {
    if (!eligibility) {
      return;
    }

    const canApply =
      eligibility.isVerified &&
      eligibility.meetsCompletedEventsRequirement &&
      eligibility.meetsGoodRatingRequirement === true;

    if (!canApply) {
      return;
    }

    setIsApplying(true);
    try {
      const result = await repository.submitCoordinatorApplication(
        'Volunteer coordinator application',
      );
      if (result.success) {
        setFeedbackBanner(
          `Coordinator application submitted (${result.message})`,
        );
        // Refresh eligibility data
        const updatedEligibility = await repository.getCoordinatorEligibility();
        setEligibility(updatedEligibility);
      } else {
        setFeedbackBanner(result.message);
      }
    } catch (err) {
      setFeedbackBanner(
        err instanceof Error
          ? err.message
          : 'Failed to submit coordinator application',
      );
    } finally {
      setIsApplying(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Profile"
          onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
        />
        <LoadingState label="Loading profile summary..." />
      </View>
    );
  }

  if (loadError || !profile || !eligibility) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Profile"
          onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
        />
        <ErrorState
          title="Profile Unavailable"
          description={loadError ?? 'Could not find profile summary.'}
          onRetry={loadData}
        />
      </View>
    );
  }

  const initials = getInitials(profile.displayName);
  const ratingAverage = eligibility.ratingAverage ?? profile.ratingAverage;
  const ratingCount = eligibility.ratingCount ?? profile.ratingCount ?? 0;

  const canApplyCoordinator =
    eligibility.coordinatorStatus === 'none' &&
    eligibility.isVerified &&
    eligibility.meetsCompletedEventsRequirement &&
    eligibility.meetsGoodRatingRequirement === true;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title="Profile"
        subtitle="Volunteer summary & verification"
        onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
      />

      <ScreenContainer scroll style={styles.scroll}>
        {/* Feedback / Demo confirmation banner */}
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

        {/* Concise Profile Summary Card */}
        <AppCard style={styles.cardSpacing}>
          {/* Card Header Row: Avatar, Name & Badges, Edit Button */}
          <View style={styles.summaryHeaderRow}>
            <View
              style={[
                styles.avatarContainer,
                { backgroundColor: theme.colors.primary },
              ]}
              accessibilityRole="image"
              accessibilityLabel={`Avatar for ${profile.displayName}`}
            >
              <AppText variant="title" weight="bold" color="#ffffff">
                {initials}
              </AppText>
            </View>

            <View style={styles.identityDetails}>
              <AppText
                variant="title"
                weight="bold"
                color={theme.colors.textPrimary}
                numberOfLines={1}
              >
                {profile.displayName}
              </AppText>
              <View style={styles.badgeRow}>
                <StatusBadge
                  status={profile.accountStatus === 'active' ? 'success' : 'danger'}
                  label={
                    profile.accountStatus === 'active'
                      ? 'Active Volunteer'
                      : `Account: ${profile.accountStatus}`
                  }
                />
                <StatusBadge
                  status={
                    profile.verificationStatus === 'verified'
                      ? 'success'
                      : 'warning'
                  }
                  label={
                    profile.verificationStatus === 'verified'
                      ? 'Verified'
                      : `Identity: ${profile.verificationStatus}`
                  }
                />
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit Profile"
              onPress={() => navigation?.navigate?.('ProfileEdit')}
              style={[
                styles.editButton,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceRaised,
                },
              ]}
            >
              <AppIcon name="edit" size={16} color={theme.colors.primary} />
              <AppText
                variant="caption"
                weight="bold"
                color={theme.colors.primary}
                style={styles.editText}
              >
                Edit
              </AppText>
            </Pressable>
          </View>

          {/* Aggregate Volunteer Rating */}
          <View style={styles.ratingSection}>
            <RatingSummary average={ratingAverage} count={ratingCount} />
          </View>

          <View
            style={[styles.divider, { backgroundColor: theme.colors.border }]}
          />

          {/* Selected Summary Fields (Strictly no hash, password, token, admin/staff, or private paths) */}
          <View style={styles.summaryFieldList}>
            <View style={styles.summaryRow}>
              <AppText
                variant="caption"
                weight="semibold"
                color={theme.colors.textSecondary}
                style={styles.summaryLabel}
              >
                Phone
              </AppText>
              <AppText
                variant="body"
                color={theme.colors.textPrimary}
                style={styles.summaryValue}
              >
                {profile.phone ?? profile.email ?? 'No phone on file'}
              </AppText>
            </View>

            <View style={styles.summaryRow}>
              <AppText
                variant="caption"
                weight="semibold"
                color={theme.colors.textSecondary}
                style={styles.summaryLabel}
              >
                Home Area
              </AppText>
              <AppText
                variant="body"
                color={theme.colors.textPrimary}
                style={styles.summaryValue}
              >
                {profile.homeArea || 'Not specified'}
              </AppText>
            </View>

            <View style={styles.summaryRow}>
              <AppText
                variant="caption"
                weight="semibold"
                color={theme.colors.textSecondary}
                style={styles.summaryLabel}
              >
                Language
              </AppText>
              <AppText
                variant="body"
                color={theme.colors.textPrimary}
                style={styles.summaryValue}
              >
                {profile.preferredLanguage === 'my'
                  ? 'Myanmar (Burmese)'
                  : 'English'}
              </AppText>
            </View>

            <View style={styles.summaryRow}>
              <AppText
                variant="caption"
                weight="semibold"
                color={theme.colors.textSecondary}
                style={styles.summaryLabel}
              >
                Emergency Contact
              </AppText>
              <AppText
                variant="body"
                color={theme.colors.textPrimary}
                style={styles.summaryValue}
              >
                {profile.emergencyContactName
                  ? `${profile.emergencyContactName} (${profile.emergencyContactPhone})`
                  : 'Not configured'}
              </AppText>
            </View>
          </View>

          {/* Skills Chips */}
          <View style={styles.tagsContainer}>
            <AppText
              variant="caption"
              weight="semibold"
              color={theme.colors.textSecondary}
              style={styles.tagSectionLabel}
            >
              Skills
            </AppText>
            <View style={styles.tagsRow}>
              {profile.skills.length > 0 ? (
                profile.skills.map(skill => (
                  <View
                    key={skill}
                    style={[
                      styles.tagChip,
                      {
                        backgroundColor: theme.colors.surfaceRaised,
                        borderColor: theme.colors.border,
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
                ))
              ) : (
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  No skills listed
                </AppText>
              )}
            </View>
          </View>

          {/* Charity Interests Chips */}
          <View style={styles.tagsContainer}>
            <AppText
              variant="caption"
              weight="semibold"
              color={theme.colors.textSecondary}
              style={styles.tagSectionLabel}
            >
              Charity Interests
            </AppText>
            <View style={styles.tagsRow}>
              {profile.charityInterests.length > 0 ? (
                profile.charityInterests.map(code => (
                  <View
                    key={code}
                    style={[
                      styles.tagChip,
                      {
                        backgroundColor: theme.colors.surfaceRaised,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      weight="semibold"
                      color={theme.colors.primary}
                    >
                      {CATEGORY_MAP[code] ?? code}
                    </AppText>
                  </View>
                ))
              ) : (
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  No charity interests selected
                </AppText>
              )}
            </View>
          </View>
        </AppCard>

        {/* Become a Coordinator Card */}
        <SectionHeader title="Coordinator Program" />
        <AppCard style={styles.cardSpacing}>
          <View style={styles.coordinatorCardHeader}>
            <AppText
              variant="title"
              weight="bold"
              color={theme.colors.textPrimary}
            >
              Become a Coordinator
            </AppText>
            <AppText
              variant="caption"
              color={theme.colors.textSecondary}
              style={styles.coordinatorSubtitle}
            >
              Coordinate community events, oversee shifts, and support volunteer teams.
            </AppText>
          </View>

          {/* Non-none coordinator status view: show status badge & descriptive message */}
          {eligibility.coordinatorStatus !== 'none' ? (
            <View
              style={[
                styles.statusNotificationBox,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.statusBadgeWrap}>
                <StatusBadge
                  status={
                    eligibility.coordinatorStatus === 'approved'
                      ? 'success'
                      : eligibility.coordinatorStatus === 'pending'
                      ? 'warning'
                      : 'danger'
                  }
                  label={
                    eligibility.coordinatorStatus === 'pending'
                      ? 'Application Pending'
                      : eligibility.coordinatorStatus === 'approved'
                      ? 'Active Coordinator'
                      : eligibility.coordinatorStatus === 'suspended'
                      ? 'Coordinator Suspended'
                      : 'Coordinator Revoked'
                  }
                />
              </View>

              <AppText
                variant="body"
                color={theme.colors.textPrimary}
                style={styles.statusDescriptionText}
              >
                {eligibility.coordinatorStatus === 'pending' &&
                  'Your coordinator application is under review. Our team will verify your qualifications.'}
                {eligibility.coordinatorStatus === 'approved' &&
                  'You are an active coordinator with event management and shift leadership privileges.'}
                {eligibility.coordinatorStatus === 'suspended' &&
                  'Your coordinator privileges are currently suspended. Please contact administration.'}
                {eligibility.coordinatorStatus === 'revoked' &&
                  'Your coordinator privileges have been revoked.'}
              </AppText>
            </View>
          ) : (
            /* Coordinator Status === 'none': Present 3 eligibility checks */
            <View style={styles.checksContainer}>
              {/* Check 1: Account Verified */}
              <View style={styles.checkItem}>
                <View
                  style={[
                    styles.checkIconWrap,
                    {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderColor: eligibility.isVerified
                        ? theme.colors.success
                        : theme.colors.border,
                    },
                  ]}
                >
                  <AppIcon
                    name={eligibility.isVerified ? 'check' : 'alert'}
                    size={14}
                    color={
                      eligibility.isVerified
                        ? theme.colors.success
                        : theme.colors.warning
                    }
                  />
                </View>
                <View style={styles.checkTextWrap}>
                  <AppText
                    variant="body"
                    weight="semibold"
                    color={theme.colors.textPrimary}
                  >
                    Account Verified
                  </AppText>
                  <AppText variant="caption" color={theme.colors.textSecondary}>
                    {eligibility.isVerified
                      ? 'Account verified (Tier 1 identity confirmed)'
                      : `Identity verification required (Status: ${eligibility.verificationStatus})`}
                  </AppText>
                </View>
              </View>

              {/* Check 2: At least 5 completed events (Attendance-backed) */}
              <View style={styles.checkItem}>
                <View
                  style={[
                    styles.checkIconWrap,
                    {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderColor: eligibility.meetsCompletedEventsRequirement
                        ? theme.colors.success
                        : theme.colors.border,
                    },
                  ]}
                >
                  <AppIcon
                    name={
                      eligibility.meetsCompletedEventsRequirement
                        ? 'check'
                        : 'alert'
                    }
                    size={14}
                    color={
                      eligibility.meetsCompletedEventsRequirement
                        ? theme.colors.success
                        : theme.colors.warning
                    }
                  />
                </View>
                <View style={styles.checkTextWrap}>
                  <AppText
                    variant="body"
                    weight="semibold"
                    color={theme.colors.textPrimary}
                  >
                    At least 5 completed events
                  </AppText>
                  <AppText variant="caption" color={theme.colors.textSecondary}>
                    {`${eligibility.completedAttendanceEventsCount}/5 attendance-backed events completed`}
                  </AppText>
                </View>
              </View>

              {/* Check 3: Good Rating (Null represents missing rule configuration / pending confirmation) */}
              <View style={styles.checkItem}>
                <View
                  style={[
                    styles.checkIconWrap,
                    {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderColor:
                        eligibility.meetsGoodRatingRequirement === true
                          ? theme.colors.success
                          : eligibility.meetsGoodRatingRequirement === false
                          ? theme.colors.danger
                          : theme.colors.border,
                    },
                  ]}
                >
                  <AppIcon
                    name={
                      eligibility.meetsGoodRatingRequirement === true
                        ? 'check'
                        : 'alert'
                    }
                    size={14}
                    color={
                      eligibility.meetsGoodRatingRequirement === true
                        ? theme.colors.success
                        : eligibility.meetsGoodRatingRequirement === false
                        ? theme.colors.danger
                        : theme.colors.warning
                    }
                  />
                </View>
                <View style={styles.checkTextWrap}>
                  <AppText
                    variant="body"
                    weight="semibold"
                    color={theme.colors.textPrimary}
                  >
                    Good Volunteer Rating
                  </AppText>
                  <AppText variant="caption" color={theme.colors.textSecondary}>
                    {eligibility.meetsGoodRatingRequirement === true
                      ? 'Good rating requirement met'
                      : eligibility.meetsGoodRatingRequirement === false
                      ? 'Volunteer rating requirement not met'
                      : 'Requirement pending server confirmation (no threshold configured)'}
                  </AppText>
                </View>
              </View>

              {/* Apply Button */}
              <View style={styles.applyActionWrap}>
                <AppButton
                  label="Apply for Coordinator"
                  variant="primary"
                  accessibilityLabel="Apply for Coordinator"
                  disabled={!canApplyCoordinator}
                  loading={isApplying}
                  onPress={handleApplyCoordinator}
                />
                {!canApplyCoordinator ? (
                  <AppText
                    variant="caption"
                    color={theme.colors.textSecondary}
                    style={styles.disabledHelperText}
                  >
                    Complete all eligibility requirements above to apply for coordinator status.
                  </AppText>
                ) : null}
              </View>
            </View>
          )}
        </AppCard>

        {/* Schedule & Verification Tools Navigation */}
        <SectionHeader title="Schedule & Verification Tools" />
        <View style={styles.navStack}>
          <AppButton
            label="Manage Weekly Availability"
            variant="secondary"
            leftIcon="calendar"
            onPress={() => navigation?.navigate?.('Availability')}
          />
          <AppButton
            label="Verification & Identity Documents"
            variant="secondary"
            leftIcon="info"
            onPress={() =>
              navigation?.navigate?.('VerificationCoordinatorStatus')
            }
          />
        </View>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    paddingVertical: 16,
    paddingBottom: 40,
  },
  feedbackBanner: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 16,
  },
  cardSpacing: {
    marginBottom: 16,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarContainer: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityDetails: {
    flex: 1,
    gap: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 6,
  },
  editText: {
    fontSize: 12,
  },
  ratingSection: {
    marginTop: 12,
  },
  divider: {
    height: 1,
    marginVertical: 14,
  },
  summaryFieldList: {
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'column',
    gap: 2,
  },
  summaryLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 14,
  },
  tagsContainer: {
    marginTop: 12,
    gap: 6,
  },
  tagSectionLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  coordinatorCardHeader: {
    marginBottom: 14,
    gap: 4,
  },
  coordinatorSubtitle: {
    lineHeight: 16,
  },
  statusNotificationBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  statusBadgeWrap: {
    flexDirection: 'row',
  },
  statusDescriptionText: {
    fontSize: 13,
    lineHeight: 18,
  },
  checksContainer: {
    gap: 12,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkTextWrap: {
    flex: 1,
  },
  applyActionWrap: {
    marginTop: 8,
    gap: 6,
  },
  disabledHelperText: {
    fontSize: 11,
    textAlign: 'center',
  },
  navStack: {
    gap: 10,
    marginBottom: 24,
  },
});
