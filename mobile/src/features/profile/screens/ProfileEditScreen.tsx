/**
 * @format
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { ProfileRepository } from '../../../data/contracts/profileRepository';
import { defaultProfileRepository } from '../../../data/mock/MockProfileRepository';
import { isMockMode } from '../../../app/configuration/dataMode';
import { useRepositories } from '../../../app/RepositoryProvider';
import { CHARITY_CATEGORIES, CharityCategoryCode } from '../../../domain/models/event';
import type {
  BloodType,
  UserLanguage,
  VolunteerProfile,
} from '../../../domain/models/profile';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppIcon,
  AppInput,
  AppText,
  ErrorState,
  FilterChip,
  LoadingState,
  ScreenContainer,
  SectionHeader,
  StatusBadge,
} from '../../../shared';
import {
  normalizeSkills,
  validateEmergencyContact,
} from '../../../shared/utils/profileValidation';
import { useAppTheme } from '../../../theme';

export interface ProfileEditScreenProps
  extends Partial<MainDrawerScreenProps<'ProfileEdit'>> {
  repository?: ProfileRepository;
}

const BLOOD_TYPES: BloodType[] = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
  'unknown',
];

export function ProfileEditScreen({
  navigation,
  repository: propRepository,
}: ProfileEditScreenProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const repositories = useRepositories();
  const repository = propRepository ?? repositories.profileRepository ?? defaultProfileRepository;

  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form Draft State
  const [displayName, setDisplayName] = useState('');
  const [preferredLanguage, setPreferredLanguage] =
    useState<UserLanguage>('en');
  const [homeArea, setHomeArea] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkillText, setNewSkillText] = useState('');
  const [charityInterests, setCharityInterests] = useState<
    CharityCategoryCode[]
  >([]);

  // Capabilities
  const [physicalOk, setPhysicalOk] = useState(false);
  const [canLiftHeavy, setCanLiftHeavy] = useState(false);
  const [canWorkOutdoor, setCanWorkOutdoor] = useState(false);
  const [goodEyesight, setGoodEyesight] = useState(true);
  const [needsGlasses, setNeedsGlasses] = useState(false);
  const [hasLeaderExperience, setHasLeaderExperience] = useState(false);
  const [newToVolunteer, setNewToVolunteer] = useState(false);

  // Support & Donation
  const [needsMealSupport, setNeedsMealSupport] = useState(false);
  const [needsTravelSupport, setNeedsTravelSupport] = useState(false);
  const [acceptsUnpaid, setAcceptsUnpaid] = useState(true);
  const [bloodType, setBloodType] = useState<BloodType>('unknown');
  const [isWillingToDonateBlood, setIsWillingToDonateBlood] = useState(false);
  const [isWillingToDonateItems, setIsWillingToDonateItems] = useState(false);

  // UI Feedback
  const [emergencyContactError, setEmergencyContactError] = useState<
    string | null
  >(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoadError(null);
      const data = await repository.getProfile();
      setProfile(data);

      // Populate draft fields
      setDisplayName(data.displayName);
      setPreferredLanguage(data.preferredLanguage);
      setHomeArea(data.homeArea);
      setEmergencyName(data.emergencyContactName);
      setEmergencyPhone(data.emergencyContactPhone);
      setSkills(data.skills);
      setCharityInterests(data.charityInterests);

      setPhysicalOk(data.capabilities.physicalOk);
      setCanLiftHeavy(data.capabilities.canLiftHeavy);
      setCanWorkOutdoor(data.capabilities.canWorkOutdoor);
      setGoodEyesight(data.capabilities.goodEyesight);
      setNeedsGlasses(data.capabilities.needsGlasses);
      setHasLeaderExperience(data.capabilities.hasLeaderExperience);
      setNewToVolunteer(data.capabilities.newToVolunteer);

      setNeedsMealSupport(data.supportPreferences.needsMealSupport);
      setNeedsTravelSupport(data.supportPreferences.needsTravelSupport);
      setAcceptsUnpaid(data.supportPreferences.acceptsUnpaid);

      setBloodType(data.donationPreferences.bloodType);
      setIsWillingToDonateBlood(
        data.donationPreferences.isWillingToDonateBlood,
      );
      setIsWillingToDonateItems(
        data.donationPreferences.isWillingToDonateItems,
      );
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load profile',
      );
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddSkill = () => {
    if (newSkillText.trim().length === 0) {
      return;
    }
    const updated = normalizeSkills([...skills, newSkillText]);
    setSkills(updated);
    setNewSkillText('');
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(prev => prev.filter(s => s !== skillToRemove));
  };

  const toggleCharityInterest = (code: CharityCategoryCode) => {
    setCharityInterests(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code],
    );
  };

  const handleToggleGoodEyesight = () => {
    const nextVal = !goodEyesight;
    setGoodEyesight(nextVal);
    if (nextVal) {
      setNeedsGlasses(false);
    }
  };

  const handleToggleNeedsGlasses = () => {
    const nextVal = !needsGlasses;
    setNeedsGlasses(nextVal);
    if (nextVal) {
      setGoodEyesight(false);
    }
  };

  const handleToggleLeaderExperience = () => {
    const nextVal = !hasLeaderExperience;
    setHasLeaderExperience(nextVal);
    if (nextVal) {
      setNewToVolunteer(false);
    }
  };

  const handleToggleNewToVolunteer = () => {
    const nextVal = !newToVolunteer;
    setNewToVolunteer(nextVal);
    if (nextVal) {
      setHasLeaderExperience(false);
    }
  };

  const handleSave = async () => {
    setEmergencyContactError(null);
    setFeedbackBanner(null);

    // Validate emergency contact pairing
    const validation = validateEmergencyContact(emergencyName, emergencyPhone);
    if (!validation.isValid) {
      setEmergencyContactError(
        validation.errorMessage ?? 'Emergency contact validation failed',
      );
      return;
    }

    setIsSaving(true);
    try {
      const result = await repository.updateProfile({
        displayName: displayName.trim(),
        preferredLanguage,
        homeArea: homeArea.trim(),
        emergencyContactName: emergencyName.trim(),
        emergencyContactPhone: emergencyPhone.trim(),
        skills: normalizeSkills(skills),
        charityInterests,
        capabilities: {
          physicalOk,
          goodEyesight: goodEyesight && !needsGlasses,
          needsGlasses: needsGlasses && !goodEyesight,
          canLiftHeavy,
          canWorkOutdoor,
          hasLeaderExperience: hasLeaderExperience && !newToVolunteer,
          newToVolunteer: newToVolunteer && !hasLeaderExperience,
        },
        supportPreferences: {
          needsMealSupport,
          needsTravelSupport,
          acceptsUnpaid,
        },
        donationPreferences: {
          bloodType,
          isWillingToDonate: isWillingToDonateBlood || isWillingToDonateItems,
          isWillingToDonateBlood,
          isWillingToDonateItems,
        },
      });

      if (result.success && result.data) {
        setProfile(result.data);
        setFeedbackBanner(
          isMockMode()
            ? `Profile saved in local mock state (${result.message})`
            : result.message,
        );
        if (navigation?.navigate) {
          navigation.navigate('Profile');
        } else if (navigation?.goBack) {
          navigation.goBack();
        }
      } else {
        setFeedbackBanner(result.message);
      }
    } catch (err) {
      setFeedbackBanner(
        err instanceof Error ? err.message : 'Failed to update profile',
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Edit Profile"
          onBackPress={() => navigation?.goBack?.()}
        />
        <LoadingState label="Loading profile details..." />
      </View>
    );
  }

  if (loadError || !profile) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Edit Profile"
          onBackPress={() => navigation?.goBack?.()}
        />
        <ErrorState
          title="Profile Unavailable"
          description={loadError ?? 'Could not find profile details.'}
          onRetry={loadData}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title="Edit Profile"
        subtitle="Update volunteer details & preferences"
        onBackPress={() => navigation?.goBack?.()}
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

        {/* Read-Only System Identity Card */}
        <AppCard style={styles.cardSpacing}>
          <View style={styles.systemBadgeRow}>
            <StatusBadge
              status={profile.accountStatus === 'active' ? 'success' : 'danger'}
              label={`Account: ${profile.accountStatus}`}
            />
            <StatusBadge
              status={
                profile.verificationStatus === 'verified'
                  ? 'success'
                  : 'warning'
              }
              label={`Identity: ${profile.verificationStatus}`}
            />
            <StatusBadge
              status={
                profile.coordinatorStatus === 'approved' ? 'info' : 'muted'
              }
              label={`Coordinator: ${profile.coordinatorStatus}`}
            />
          </View>

          <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
            {profile.displayName}
          </AppText>
          <AppText
            variant="body"
            color={theme.colors.textSecondary}
            style={styles.emailSpacing}
          >
            {profile.phone ?? profile.email ?? 'No phone on file'}
          </AppText>

          <View
            style={[
              styles.privilegedNoticeBox,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <AppIcon name="info" size={14} color={theme.colors.textSecondary} />
            <AppText
              variant="caption"
              color={theme.colors.textSecondary}
              style={styles.privilegedNoticeText}
            >
              System privileges and verification statuses are managed by server
              administrators and are read-only.
            </AppText>
          </View>
        </AppCard>

        {/* Basic Allow-listed Profile Fields */}
        <SectionHeader title="Basic Information" />
        <AppCard style={styles.cardSpacing}>
          <AppInput
            label="Display Name *"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your public volunteer name"
            style={styles.fieldSpacing}
          />

          <AppInput
            label="Home Township / Area"
            value={homeArea}
            onChangeText={setHomeArea}
            placeholder="e.g. Kamayut Township"
            style={styles.fieldSpacing}
          />

          <AppText
            variant="caption"
            weight="semibold"
            color={theme.colors.textSecondary}
            style={styles.sectionSublabel}
          >
            Preferred Language
          </AppText>
          <View style={styles.chipsRow}>
            <FilterChip
              label="English (en)"
              selected={preferredLanguage === 'en'}
              onPress={() => setPreferredLanguage('en')}
            />
            <FilterChip
              label="Myanmar (my)"
              selected={preferredLanguage === 'my'}
              onPress={() => setPreferredLanguage('my')}
            />
          </View>
        </AppCard>

        {/* Emergency Contact Pair */}
        <SectionHeader title="Emergency Contact" />
        <AppCard style={styles.cardSpacing}>
          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            style={styles.emergencyNotice}
          >
            Emergency contact name and phone number must both be provided or both
            cleared.
          </AppText>

          <AppInput
            label="Contact Full Name"
            value={emergencyName}
            onChangeText={text => {
              setEmergencyName(text);
              if (emergencyContactError) {
                setEmergencyContactError(null);
              }
            }}
            placeholder="e.g. Taylor Morgan"
            style={styles.fieldSpacing}
          />

          <AppInput
            label="Contact Phone Number"
            value={emergencyPhone}
            onChangeText={text => {
              setEmergencyPhone(text);
              if (emergencyContactError) {
                setEmergencyContactError(null);
              }
            }}
            placeholder="e.g. +959123456789"
            error={emergencyContactError ?? undefined}
            style={styles.fieldSpacing}
          />
        </AppCard>

        {/* Volunteer Skills */}
        <SectionHeader title="Skills & Competencies" />
        <AppCard style={styles.cardSpacing}>
          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            style={styles.emergencyNotice}
          >
            Skills are automatically trimmed, lowercased, deduplicated, and
            sorted.
          </AppText>

          {/* Add skill row */}
          <View style={styles.addSkillRow}>
            <View style={styles.addSkillInputWrap}>
              <AppInput
                value={newSkillText}
                onChangeText={setNewSkillText}
                placeholder="Add skill (e.g. first_aid, driving)"
              />
            </View>
            <AppButton
              label="Add"
              variant="outline"
              onPress={handleAddSkill}
              style={styles.addSkillButton}
            />
          </View>

          {/* Current skills chips */}
          <View style={styles.skillsWrap}>
            {skills.map(skill => (
              <Pressable
                key={skill}
                accessibilityRole="button"
                accessibilityLabel={`Remove skill ${skill}`}
                onPress={() => handleRemoveSkill(skill)}
                style={[
                  styles.skillChip,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.sm,
                  },
                ]}
              >
                <AppText variant="caption" weight="semibold" color={theme.colors.primary}>
                  {skill} ✕
                </AppText>
              </Pressable>
            ))}
          </View>
        </AppCard>

        {/* Charity Interests */}
        <SectionHeader title="Charity Interests" />
        <AppCard style={styles.cardSpacing}>
          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            style={styles.emergencyNotice}
          >
            Select charity sectors you are interested in supporting:
          </AppText>
          <View style={styles.categoriesWrap}>
            {CHARITY_CATEGORIES.map(category => (
              <FilterChip
                key={category.code}
                label={category.label}
                selected={charityInterests.includes(category.code)}
                onPress={() => toggleCharityInterest(category.code)}
              />
            ))}
          </View>
        </AppCard>

        {/* Volunteer Suitability & Capabilities */}
        <SectionHeader title="Suitability & Work Preferences" />
        <AppCard style={styles.cardSpacing}>
          <View style={styles.togglesWrap}>
            <FilterChip
              label="Physical OK"
              selected={physicalOk}
              onPress={() => setPhysicalOk(!physicalOk)}
            />
            <FilterChip
              label="Can Lift Heavy (>15kg)"
              selected={canLiftHeavy}
              onPress={() => setCanLiftHeavy(!canLiftHeavy)}
            />
            <FilterChip
              label="Can Work Outdoor"
              selected={canWorkOutdoor}
              onPress={() => setCanWorkOutdoor(!canWorkOutdoor)}
            />
            <FilterChip
              label="Good Eyesight"
              selected={goodEyesight}
              onPress={handleToggleGoodEyesight}
            />
            <FilterChip
              label="Needs Glasses"
              selected={needsGlasses}
              onPress={handleToggleNeedsGlasses}
            />
            <FilterChip
              label="Team Leader Experience"
              selected={hasLeaderExperience}
              onPress={handleToggleLeaderExperience}
            />
            <FilterChip
              label="New to Volunteering"
              selected={newToVolunteer}
              onPress={handleToggleNewToVolunteer}
            />
          </View>

          <AppText
            variant="caption"
            weight="semibold"
            color={theme.colors.textSecondary}
            style={styles.sectionSublabel}
          >
            Support Requirements
          </AppText>
          <View style={styles.togglesWrap}>
            <FilterChip
              label="Requires Meal Support"
              selected={needsMealSupport}
              onPress={() => setNeedsMealSupport(!needsMealSupport)}
            />
            <FilterChip
              label="Requires Travel Support"
              selected={needsTravelSupport}
              onPress={() => setNeedsTravelSupport(!needsTravelSupport)}
            />
            <FilterChip
              label="Accepts Unpaid Roles"
              selected={acceptsUnpaid}
              onPress={() => setAcceptsUnpaid(!acceptsUnpaid)}
            />
          </View>
        </AppCard>

        {/* Blood Donation & Community Giving */}
        <SectionHeader title="Community Contribution" />
        <AppCard style={styles.cardSpacing}>
          <AppText
            variant="caption"
            weight="semibold"
            color={theme.colors.textSecondary}
            style={styles.sectionSublabel}
          >
            Blood Type
          </AppText>
          <View style={styles.togglesWrap}>
            {BLOOD_TYPES.map(bt => (
              <FilterChip
                key={bt}
                label={bt}
                selected={bloodType === bt}
                onPress={() => setBloodType(bt)}
              />
            ))}
          </View>

          <View style={[styles.togglesWrap, styles.givingTopMargin]}>
            <FilterChip
              label="Willing to Donate Blood"
              selected={isWillingToDonateBlood}
              onPress={() => setIsWillingToDonateBlood(!isWillingToDonateBlood)}
            />
            <FilterChip
              label="Willing to Donate Relief Items"
              selected={isWillingToDonateItems}
              onPress={() => setIsWillingToDonateItems(!isWillingToDonateItems)}
            />
          </View>
        </AppCard>

        {/* Save Button */}
        <View style={styles.saveActionContainer}>
          <AppButton
            label="Save Profile Changes"
            variant="primary"
            loading={isSaving}
            onPress={handleSave}
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
  systemBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  emailSpacing: {
    marginTop: 2,
    marginBottom: 10,
  },
  privilegedNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    borderRadius: 6,
    gap: 8,
  },
  privilegedNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
  },
  fieldSpacing: {
    marginBottom: 12,
  },
  sectionSublabel: {
    marginTop: 4,
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  emergencyNotice: {
    marginBottom: 10,
    lineHeight: 16,
  },
  addSkillRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  addSkillInputWrap: {
    flex: 1,
  },
  addSkillButton: {
    marginTop: 22,
    minHeight: 44,
  },
  skillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  categoriesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  togglesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  givingTopMargin: {
    marginTop: 12,
  },
  saveActionContainer: {
    marginTop: 8,
    marginBottom: 20,
  },
});
