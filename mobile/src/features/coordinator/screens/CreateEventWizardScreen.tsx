/**
 * @format
 */

import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useCurrentUser } from '../../../app/UserContext';
import type { CoordinatorRepository } from '../../../data/contracts/coordinatorRepository';
import { defaultCoordinatorRepository } from '../../../data/mock/MockCoordinatorRepository';
import { useRepositories } from '../../../app/RepositoryProvider';
import type {
  AcceptanceMode,
  CompensationKind,
  EventPurposeType,
  LeaderStrategy,
} from '../../../domain/models/coordinator';
import {
  CHARITY_CATEGORIES,
  CharityCategoryCode,
} from '../../../domain/models/event';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppIcon,
  AppInput,
  AppText,
  DatePickerModal,
  FilterChip,
  ScreenContainer,
} from '../../../shared';
import {
  combineDateTimeToMyanmarISO,
  MYANMAR_TIMEZONE_LABEL,
  validateEventSchedule,
} from '../../../shared/utils/dateTimeUtils';
import { hexToRgba, useAppTheme } from '../../../theme';
import { CoordinatorGuard } from '../components';

export interface CreateEventWizardScreenProps
  extends Partial<MainDrawerScreenProps<'CreateEventWizard'>> {
  repository?: CoordinatorRepository;
}

const TOTAL_STEPS = 7;
const STEP_TITLES = [
  'Basics',
  'Location',
  'Schedule',
  'Capacity',
  'Support',
  'Onboarding',
  'Review',
];

export function CreateEventWizardScreen({
  navigation,
  repository: propRepository,
}: CreateEventWizardScreenProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const { currentUser } = useCurrentUser();
  const repositories = useRepositories();
  const repository = propRepository ?? repositories.coordinatorRepository ?? defaultCoordinatorRepository;

  useEffect(() => {
    if (
      currentUser &&
      'setCoordinatorIdentity' in repository &&
      typeof (repository as any).setCoordinatorIdentity === 'function'
    ) {
      (repository as any).setCoordinatorIdentity({
        id: currentUser.id,
        displayName: currentUser.displayName,
        email: currentUser.email,
      });
    }
  }, [currentUser, repository]);

  const [currentStep, setCurrentStep] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Basics
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [purposeType, setPurposeType] =
    useState<EventPurposeType>('charity_event');
  const [charityFieldCodes, setCharityFieldCodes] = useState<
    CharityCategoryCode[]
  >(['environment']);

  // Step 2: Location
  const [locationName, setLocationName] = useState('');
  const [landmarkText, setLandmarkText] = useState('');
  const [latitude, setLatitude] = useState('16.8000');
  const [longitude, setLongitude] = useState('96.1500');
  const [geoRadiusM, setGeoRadiusM] = useState('200');
  const [geoCheckinEnabled, setGeoCheckinEnabled] = useState(false);
  const [geoOpensBeforeMin] = useState('30');
  const [requireConfirmation, setRequireConfirmation] = useState(true);

  // Step 3: Schedule & Deadlines (Separated date and 24h MMT time)
  const [startDate, setStartDate] = useState('2026-12-10');
  const [startTime, setStartTime] = useState('08:00');
  const [endDate, setEndDate] = useState('2026-12-10');
  const [endTime, setEndTime] = useState('14:00');
  const [deadlineDate, setDeadlineDate] = useState('2026-12-08');
  const [deadlineTime, setDeadlineTime] = useState('18:00');

  // Calendar Date Picker Modal Target: 'start' | 'end' | 'deadline' | null
  const [datePickerTarget, setDatePickerTarget] = useState<
    'start' | 'end' | 'deadline' | null
  >(null);

  // Step 4: Capacity & Acceptance
  const [acceptanceMode, setAcceptanceMode] =
    useState<AcceptanceMode>('manual');
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(true);
  const [groupSize, setGroupSize] = useState('5');
  const [leaderStrategy, setLeaderStrategy] =
    useState<LeaderStrategy>('none');
  const [maxParticipants, setMaxParticipants] = useState('20');

  // Step 5: Support & Perks
  const [mealsProvided, setMealsProvided] = useState(true);
  const [lodgingProvided, setLodgingProvided] = useState(false);
  const [travelSupportProvided, setTravelSupportProvided] = useState(true);
  const [compensationKind, setCompensationKind] =
    useState<CompensationKind>('unpaid');
  const [compensationNote, setCompensationNote] = useState(
    'Lunch and shuttle provided on-site',
  );

  // Step 6: Onboarding & QR
  const [onboardingText, setOnboardingText] = useState(
    'Wear closed-toe shoes and safety equipment. Follow shift supervisor instructions.',
  );
  const [requireOnboardingAck, setRequireOnboardingAck] = useState(true);
  const [qrRegistrationEnabled, setQrRegistrationEnabled] = useState(true);

  // Charity Category Selection (Limit 1 to 3)
  const toggleCharityCategory = (code: CharityCategoryCode) => {
    setCharityFieldCodes(prev => {
      if (prev.includes(code)) {
        if (prev.length === 1) {
          return prev; // keep at least 1
        }
        return prev.filter(c => c !== code);
      } else {
        if (prev.length >= 3) {
          setErrorMessage('Maximum 3 charity categories allowed.');
          return prev;
        }
        return [...prev, code];
      }
    });
  };

  // Step Navigation & Validation (Strict, no silent fallbacks)
  const handleNext = () => {
    setErrorMessage(null);

    // Validate Step 1: Basics
    if (currentStep === 1) {
      if (!title.trim()) {
        setErrorMessage('Event title is required.');
        return;
      }
      if (charityFieldCodes.length < 1 || charityFieldCodes.length > 3) {
        setErrorMessage('Select between 1 and 3 charity categories.');
        return;
      }
    }

    // Validate Step 2: Location
    if (currentStep === 2) {
      if (!locationName.trim()) {
        setErrorMessage('Location name is required.');
        return;
      }

      const latNum = parseFloat(latitude.trim());
      if (isNaN(latNum) || latNum < -90 || latNum > 90) {
        setErrorMessage('Latitude must be a valid number between -90 and 90.');
        return;
      }

      const lngNum = parseFloat(longitude.trim());
      if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
        setErrorMessage(
          'Longitude must be a valid number between -180 and 180.',
        );
        return;
      }

      const radiusNum = parseInt(geoRadiusM.trim(), 10);
      if (isNaN(radiusNum) || radiusNum < 20 || radiusNum > 5000) {
        setErrorMessage(
          'Geofence radius must be between 20 and 5000 meters.',
        );
        return;
      }
    }

    // Validate Step 3: Schedule & Deadlines (Timezone-Aware)
    if (currentStep === 3) {
      const scheduleValidation = validateEventSchedule({
        startDate: startDate.trim(),
        startTime: startTime.trim(),
        endDate: endDate.trim(),
        endTime: endTime.trim(),
        deadlineDate: deadlineDate.trim() || undefined,
        deadlineTime: deadlineTime.trim() || undefined,
      });

      if (!scheduleValidation.isValid) {
        setErrorMessage(
          scheduleValidation.errorMessage ?? 'Invalid schedule configuration.',
        );
        return;
      }
    }

    // Validate Step 4: Capacity
    if (currentStep === 4) {
      if (groupSize.trim()) {
        const gs = parseInt(groupSize.trim(), 10);
        if (isNaN(gs) || gs < 1) {
          setErrorMessage('Group size must be a positive number of at least 1.');
          return;
        }
      }

      if (maxParticipants.trim()) {
        const mp = parseInt(maxParticipants.trim(), 10);
        if (isNaN(mp) || mp < 1) {
          setErrorMessage(
            'Max participants must be a positive number of at least 1.',
          );
          return;
        }
      }

      if (groupSize.trim() && maxParticipants.trim()) {
        const gs = parseInt(groupSize.trim(), 10);
        const mp = parseInt(maxParticipants.trim(), 10);
        if (gs > mp) {
          setErrorMessage('Group size cannot exceed max participants.');
          return;
        }
      }
    }

    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    setErrorMessage(null);
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  // Save Draft (Step 7)
  const handleSaveDraft = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    // Final schedule conversion to explicit Myanmar offset timestamps
    let startAtIso = '';
    let endAtIso = '';
    let deadlineIso: string | undefined;

    try {
      const scheduleRes = validateEventSchedule({
        startDate: startDate.trim(),
        startTime: startTime.trim(),
        endDate: endDate.trim(),
        endTime: endTime.trim(),
        deadlineDate: deadlineDate.trim() || undefined,
        deadlineTime: deadlineTime.trim() || undefined,
      });

      if (!scheduleRes.isValid) {
        setErrorMessage(scheduleRes.errorMessage ?? 'Invalid schedule.');
        setIsSubmitting(false);
        return;
      }

      startAtIso = scheduleRes.startAtIso!;
      endAtIso = scheduleRes.endAtIso!;
      deadlineIso = scheduleRes.applicationDeadlineIso;
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Invalid schedule timestamps',
      );
      setIsSubmitting(false);
      return;
    }

    const latNum = parseFloat(latitude.trim());
    const lngNum = parseFloat(longitude.trim());
    const radiusNum = parseInt(geoRadiusM.trim(), 10);

    try {
      const result = await repository.createDraftEvent({
        title,
        description: description || undefined,
        purposeType,
        charityFieldCodes,
        locationName,
        landmarkText: landmarkText || undefined,
        latitude: latNum,
        longitude: lngNum,
        geoRadiusM: radiusNum,
        geoCheckinEnabled,
        geoCheckinOpensBeforeMin: parseInt(geoOpensBeforeMin, 10) || 30,
        requireCheckinConfirmation: requireConfirmation,
        mapProvider: 'openstreetmap',
        startAt: startAtIso,
        endAt: endAtIso,
        applicationDeadline: deadlineIso,
        acceptanceMode,
        autoAssignEnabled,
        groupSize: groupSize.trim() ? parseInt(groupSize.trim(), 10) : undefined,
        leaderStrategy,
        maxParticipants: maxParticipants.trim()
          ? parseInt(maxParticipants.trim(), 10)
          : undefined,
        mealsProvided,
        lodgingProvided,
        travelSupportProvided,
        compensationKind,
        compensationNote: compensationNote || undefined,
        onboardingText: onboardingText || undefined,
        requireOnboardingAck,
        qrRegistrationEnabled,
      });

      if (result.success && result.data) {
        navigation?.navigate?.('CoordinatorEvents');
      } else {
        setErrorMessage(result.message);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to create draft event',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (navigation && navigation.canGoBack()) {
      navigation.goBack();
    } else if (navigation) {
      navigation.navigate('CoordinatorWorkspace');
    }
  };

  // Helper for DatePicker selection
  const handleDatePickerSelect = (dateString: string) => {
    if (datePickerTarget === 'start') {
      setStartDate(dateString);
    } else if (datePickerTarget === 'end') {
      setEndDate(dateString);
    } else if (datePickerTarget === 'deadline') {
      setDeadlineDate(dateString);
    }
    setDatePickerTarget(null);
  };

  const getDatePickerInitial = () => {
    if (datePickerTarget === 'start') {
      return startDate;
    }
    if (datePickerTarget === 'end') {
      return endDate;
    }
    if (datePickerTarget === 'deadline') {
      return deadlineDate;
    }
    return undefined;
  };

  // Computed Review values
  let reviewStartIso = 'Pending';
  let reviewEndIso = 'Pending';
  let reviewDeadlineIso = 'None configured';
  try {
    reviewStartIso = combineDateTimeToMyanmarISO(startDate, startTime);
    reviewEndIso = combineDateTimeToMyanmarISO(endDate, endTime);
    if (deadlineDate && deadlineTime) {
      reviewDeadlineIso = combineDateTimeToMyanmarISO(
        deadlineDate,
        deadlineTime,
      );
    }
  } catch {
    // Keep fallback label on review if invalid during preview
  }

  return (
    <CoordinatorGuard navigation={navigation}>
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Create Event Wizard"
          subtitle={`Step ${currentStep} of ${TOTAL_STEPS}: ${STEP_TITLES[currentStep - 1]}`}
          onBackPress={handleCancel}
        />

        {/* Wizard Progress Bar */}
        <View
          style={[
            styles.progressContainer,
            {
              backgroundColor: theme.colors.surface,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          {/* Linear bar progress matching .prog */}
          <View
            style={[
              styles.linearProgressBar,
              { backgroundColor: theme.colors.surfaceRaised },
            ]}
          >
            <View
              style={[
                styles.linearProgressFill,
                {
                  width: `${(currentStep / TOTAL_STEPS) * 100}%`,
                  backgroundColor: theme.colors.primary,
                },
              ]}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stepperScroll}
          >
            {STEP_TITLES.map((name, index) => {
              const stepNumber = index + 1;
              const isCurrent = stepNumber === currentStep;
              const isCompleted = stepNumber < currentStep;

              return (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  accessibilityLabel={`Step ${stepNumber}: ${name}`}
                  onPress={() => {
                    if (isCompleted) {
                      setErrorMessage(null);
                      setCurrentStep(stepNumber);
                    }
                  }}
                  style={[
                    styles.stepBadge,
                    {
                      backgroundColor: isCurrent
                        ? theme.colors.primary
                        : isCompleted
                        ? theme.colors.surfaceRaised
                        : 'transparent',
                      borderColor: isCurrent
                        ? theme.colors.primary
                        : theme.colors.border,
                      borderRadius: theme.radius.sm,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    weight={isCurrent ? 'bold' : 'regular'}
                    color={
                      isCurrent
                        ? theme.colors.onPrimary
                        : isCompleted
                        ? theme.colors.primary
                        : theme.colors.textSecondary
                    }
                  >
                    {stepNumber}. {name}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <ScreenContainer scroll style={styles.scroll}>
          {/* Error Message Banner */}
          {errorMessage ? (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.danger,
                },
              ]}
            >
              <AppIcon name="alert" size={16} color={theme.colors.danger} />
              <AppText
                variant="caption"
                weight="bold"
                color={theme.colors.danger}
                style={styles.errorText}
              >
                {errorMessage}
              </AppText>
            </View>
          ) : null}

          {/* STEP 1: BASICS */}
          {currentStep === 1 && (
            <AppCard style={styles.cardSpacing}>
              <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
                Event Basics
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary} style={styles.stepHint}>
                Provide title, purpose, and 1 to 3 charity categories.
              </AppText>

              <AppInput
                label="Event Title *"
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Riverbank Cleanup & Recycling Drive"
                style={styles.fieldSpacing}
              />

              <AppInput
                label="Public Description"
                value={description}
                onChangeText={setDescription}
                placeholder="Overview of volunteer tasks and community impact"
                multiline
                numberOfLines={3}
                style={styles.fieldSpacing}
              />

              <AppText variant="caption" weight="semibold" color={theme.colors.textSecondary} style={styles.labelMargin}>
                Purpose Type
              </AppText>
              <View style={styles.chipsRow}>
                <FilterChip
                  label="Charity Event"
                  selected={purposeType === 'charity_event'}
                  onPress={() => setPurposeType('charity_event')}
                />
                <FilterChip
                  label="Help Wanted Event"
                  selected={purposeType === 'help_wanted_event'}
                  onPress={() => setPurposeType('help_wanted_event')}
                />
              </View>

              <AppText variant="caption" weight="semibold" color={theme.colors.textSecondary} style={styles.labelMargin}>
                Charity Categories (1 to 3 required) *
              </AppText>
              <View style={styles.categoriesWrap}>
                {CHARITY_CATEGORIES.map(category => (
                  <FilterChip
                    key={category.code}
                    label={category.label}
                    selected={charityFieldCodes.includes(category.code)}
                    onPress={() => toggleCharityCategory(category.code)}
                  />
                ))}
              </View>
            </AppCard>
          )}

          {/* STEP 2: LOCATION */}
          {currentStep === 2 && (
            <AppCard style={styles.cardSpacing}>
              <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
                Location & Geo Check-In
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary} style={styles.stepHint}>
                Specify arrival landmark and optional geo check-in parameters.
              </AppText>

              <AppInput
                label="Location Name *"
                value={locationName}
                onChangeText={setLocationName}
                placeholder="e.g. Downtown Riverwalk Plaza, Pier 4"
                style={styles.fieldSpacing}
              />

              <AppInput
                label="Landmark Text"
                value={landmarkText}
                onChangeText={setLandmarkText}
                placeholder="e.g. Next to central ferry terminal"
                style={styles.fieldSpacing}
              />

              <View style={styles.rowInputs}>
                <View style={styles.halfCol}>
                  <AppInput
                    label="Latitude (-90 to 90) *"
                    value={latitude}
                    onChangeText={setLatitude}
                    placeholder="16.8000"
                  />
                </View>
                <View style={styles.halfCol}>
                  <AppInput
                    label="Longitude (-180 to 180) *"
                    value={longitude}
                    onChangeText={setLongitude}
                    placeholder="96.1500"
                  />
                </View>
              </View>

              <AppInput
                label="Geofence Radius (20 to 5000 meters) *"
                value={geoRadiusM}
                onChangeText={setGeoRadiusM}
                placeholder="200"
                style={styles.fieldSpacing}
              />

              {/* Geofence Radar Visual Preview (.map, .fence, .pin) */}
              <View
                style={[
                  styles.mapVisual,
                  {
                    backgroundColor: hexToRgba(theme.colors.sky ?? theme.colors.accent, 0.10),
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.radarFence,
                    {
                      borderColor: theme.colors.sky ?? theme.colors.accent,
                      backgroundColor: hexToRgba(theme.colors.sky ?? theme.colors.accent, 0.16),
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.radarPin,
                      {
                        backgroundColor: theme.colors.primary,
                      },
                    ]}
                  >
                    <AppIcon name="pin" size={16} color="#FFFFFF" />
                  </View>
                </View>
              </View>

              <AppText variant="caption" weight="semibold" color={theme.colors.textSecondary} style={styles.labelMargin}>
                Geo Check-In Options
              </AppText>
              <View style={styles.chipsRow}>
                <FilterChip
                  label="Enable Geo Check-In"
                  selected={geoCheckinEnabled}
                  onPress={() => setGeoCheckinEnabled(!geoCheckinEnabled)}
                />
                <FilterChip
                  label="Require Check-In Confirmation"
                  selected={requireConfirmation}
                  onPress={() => setRequireConfirmation(!requireConfirmation)}
                />
              </View>
            </AppCard>
          )}

          {/* STEP 3: SCHEDULE & DEADLINES (SEPARATE DATE & TIME CONTROLS WITH TIMEZONE HELPER) */}
          {currentStep === 3 && (
            <AppCard style={styles.cardSpacing}>
              <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
                Schedule & Deadlines
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary} style={styles.stepHint}>
                Enter event dates and 24-hour Myanmar times. End time must be later than start time.
              </AppText>

              {/* Explicit Timezone Helper Box matching .card with sky tint */}
              <View
                style={[
                  styles.timezoneBox,
                  {
                    backgroundColor: hexToRgba(theme.colors.sky ?? theme.colors.accent, 0.10),
                    borderColor: hexToRgba(theme.colors.sky ?? theme.colors.accent, 0.30),
                  },
                ]}
              >
                <View style={styles.timezoneHeaderRow}>
                  <AppIcon name="globe" size={18} color={theme.colors.sky ?? theme.colors.accent} />
                  <View style={{ flex: 1 }}>
                    <AppText
                      variant="caption"
                      weight="extrabold"
                      color={theme.colors.textPrimary}
                    >
                      {MYANMAR_TIMEZONE_LABEL} · MMT / UTC+06:30
                    </AppText>
                    <AppText variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                      All dates and times are interpreted in Myanmar Time (MMT). Device timezone settings will not alter event hours.
                    </AppText>
                  </View>
                </View>
              </View>

              {/* Start Schedule */}
              <AppText
                variant="caption"
                weight="bold"
                color={theme.colors.textPrimary}
                style={styles.scheduleGroupHeading}
              >
                EVENT START *
              </AppText>
              <View style={styles.dateTimePairRow}>
                <View style={styles.dateCol}>
                  <View style={styles.dateInputWithButton}>
                    <View style={styles.flexOne}>
                      <AppInput
                        label="Start Date *"
                        value={startDate}
                        onChangeText={setStartDate}
                        placeholder="YYYY-MM-DD"
                      />
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Open start date picker"
                      onPress={() => setDatePickerTarget('start')}
                      style={[
                        styles.calendarPickerButton,
                        {
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surfaceRaised,
                        },
                      ]}
                      hitSlop={6}
                    >
                      <AppIcon
                        name="calendar"
                        size={18}
                        color={theme.colors.primary}
                      />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.timeCol}>
                  <AppInput
                    label="Start Time (24h MMT) *"
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="08:00"
                  />
                </View>
              </View>

              {/* End Schedule */}
              <AppText
                variant="caption"
                weight="bold"
                color={theme.colors.textPrimary}
                style={styles.scheduleGroupHeading}
              >
                EVENT END *
              </AppText>
              <View style={styles.dateTimePairRow}>
                <View style={styles.dateCol}>
                  <View style={styles.dateInputWithButton}>
                    <View style={styles.flexOne}>
                      <AppInput
                        label="End Date *"
                        value={endDate}
                        onChangeText={setEndDate}
                        placeholder="YYYY-MM-DD"
                      />
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Open end date picker"
                      onPress={() => setDatePickerTarget('end')}
                      style={[
                        styles.calendarPickerButton,
                        {
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surfaceRaised,
                        },
                      ]}
                      hitSlop={6}
                    >
                      <AppIcon
                        name="calendar"
                        size={18}
                        color={theme.colors.primary}
                      />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.timeCol}>
                  <AppInput
                    label="End Time (24h MMT) *"
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="14:00"
                  />
                </View>
              </View>

              {/* Application Deadline */}
              <AppText
                variant="caption"
                weight="bold"
                color={theme.colors.textPrimary}
                style={styles.scheduleGroupHeading}
              >
                APPLICATION DEADLINE (OPTIONAL)
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary} style={styles.deadlineSubhint}>
                Must be on or before the event start time.
              </AppText>
              <View style={styles.dateTimePairRow}>
                <View style={styles.dateCol}>
                  <View style={styles.dateInputWithButton}>
                    <View style={styles.flexOne}>
                      <AppInput
                        label="Deadline Date"
                        value={deadlineDate}
                        onChangeText={setDeadlineDate}
                        placeholder="YYYY-MM-DD"
                      />
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Open deadline date picker"
                      onPress={() => setDatePickerTarget('deadline')}
                      style={[
                        styles.calendarPickerButton,
                        {
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surfaceRaised,
                        },
                      ]}
                      hitSlop={6}
                    >
                      <AppIcon
                        name="calendar"
                        size={18}
                        color={theme.colors.primary}
                      />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.timeCol}>
                  <AppInput
                    label="Deadline Time (24h MMT)"
                    value={deadlineTime}
                    onChangeText={setDeadlineTime}
                    placeholder="18:00"
                  />
                </View>
              </View>
            </AppCard>
          )}

          {/* STEP 4: CAPACITY & ACCEPTANCE */}
          {currentStep === 4 && (
            <AppCard style={styles.cardSpacing}>
              <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
                Capacity & Roster Acceptance
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary} style={styles.stepHint}>
                Define auto-assignment, group sizing, and max participants.
              </AppText>

              <AppText variant="caption" weight="semibold" color={theme.colors.textSecondary} style={styles.labelMargin}>
                Acceptance Mode
              </AppText>
              <View style={styles.chipsRow}>
                <FilterChip
                  label="Manual Coordinator Review"
                  selected={acceptanceMode === 'manual'}
                  onPress={() => setAcceptanceMode('manual')}
                />
                <FilterChip
                  label="Auto Accept on Capacity"
                  selected={acceptanceMode === 'auto'}
                  onPress={() => setAcceptanceMode('auto')}
                />
              </View>

              <View style={[styles.chipsRow, styles.labelMargin]}>
                <FilterChip
                  label="Auto Assign Enabled"
                  selected={autoAssignEnabled}
                  onPress={() => setAutoAssignEnabled(!autoAssignEnabled)}
                />
              </View>

              <View style={styles.rowInputs}>
                <View style={styles.halfCol}>
                  <AppInput
                    label="Group Size (Optional)"
                    value={groupSize}
                    onChangeText={setGroupSize}
                    placeholder="5"
                  />
                </View>
                <View style={styles.halfCol}>
                  <AppInput
                    label="Max Participants (Optional)"
                    value={maxParticipants}
                    onChangeText={setMaxParticipants}
                    placeholder="20"
                  />
                </View>
              </View>

              <AppText variant="caption" weight="semibold" color={theme.colors.textSecondary} style={styles.labelMargin}>
                Group Leader Strategy
              </AppText>
              <View style={styles.chipsRow}>
                <FilterChip
                  label="None"
                  selected={leaderStrategy === 'none'}
                  onPress={() => setLeaderStrategy('none')}
                />
                <FilterChip
                  label="First Assigned"
                  selected={leaderStrategy === 'first_assigned'}
                  onPress={() => setLeaderStrategy('first_assigned')}
                />
                <FilterChip
                  label="Highest Rated"
                  selected={leaderStrategy === 'highest_rated'}
                  onPress={() => setLeaderStrategy('highest_rated')}
                />
              </View>
            </AppCard>
          )}

          {/* STEP 5: SUPPORT */}
          {currentStep === 5 && (
            <AppCard style={styles.cardSpacing}>
              <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
                Volunteer Support & Perks
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary} style={styles.stepHint}>
                Informational recruiting benefits provided during the shift.
              </AppText>

              <View style={styles.togglesWrap}>
                <FilterChip
                  label="Meals Provided"
                  selected={mealsProvided}
                  onPress={() => setMealsProvided(!mealsProvided)}
                />
                <FilterChip
                  label="Lodging Provided"
                  selected={lodgingProvided}
                  onPress={() => setLodgingProvided(!lodgingProvided)}
                />
                <FilterChip
                  label="Travel Support"
                  selected={travelSupportProvided}
                  onPress={() => setTravelSupportProvided(!travelSupportProvided)}
                />
              </View>

              <AppText variant="caption" weight="semibold" color={theme.colors.textSecondary} style={styles.labelMargin}>
                Compensation Kind
              </AppText>
              <View style={styles.chipsRow}>
                <FilterChip
                  label="Unpaid"
                  selected={compensationKind === 'unpaid'}
                  onPress={() => setCompensationKind('unpaid')}
                />
                <FilterChip
                  label="Stipend"
                  selected={compensationKind === 'stipend'}
                  onPress={() => setCompensationKind('stipend')}
                />
                <FilterChip
                  label="Travel Reimbursement"
                  selected={compensationKind === 'travel_reimbursement'}
                  onPress={() => setCompensationKind('travel_reimbursement')}
                />
              </View>

              <AppInput
                label="Compensation / Support Note"
                value={compensationNote}
                onChangeText={setCompensationNote}
                placeholder="e.g. Lunch box and shuttle pickup provided"
                style={styles.fieldSpacing}
              />
            </AppCard>
          )}

          {/* STEP 6: ONBOARDING & QR */}
          {currentStep === 6 && (
            <AppCard style={styles.cardSpacing}>
              <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
                Onboarding & QR Registration
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary} style={styles.stepHint}>
                Instructions and walk-in check-in settings.
              </AppText>

              <AppInput
                label="Volunteer Onboarding Briefing Text"
                value={onboardingText}
                onChangeText={setOnboardingText}
                placeholder="Safety instructions or arrival requirements"
                multiline
                numberOfLines={3}
                style={styles.fieldSpacing}
              />

              <View style={styles.togglesWrap}>
                <FilterChip
                  label="Require Onboarding Acknowledgment"
                  selected={requireOnboardingAck}
                  onPress={() => setRequireOnboardingAck(!requireOnboardingAck)}
                />
                <FilterChip
                  label="Enable QR Walk-In Registration"
                  selected={qrRegistrationEnabled}
                  onPress={() => setQrRegistrationEnabled(!qrRegistrationEnabled)}
                />
              </View>
            </AppCard>
          )}

          {/* STEP 7: REVIEW & SAVE DRAFT (SEPARATED DATES & TIMES CLEARLY DISPLAYED) */}
          {currentStep === 7 && (
            <AppCard style={styles.cardSpacing}>
              <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
                Review Event Configuration
              </AppText>

              {/* Demo-only banner */}
              <View
                style={[
                  styles.demoBanner,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.warning,
                  },
                ]}
              >
                <AppText
                  variant="caption"
                  weight="bold"
                  color={theme.colors.warning}
                >
                  ⚠️ Demo only — not submitted to server
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Saving will create an in-memory draft event fixture for this
                  session.
                </AppText>
              </View>

              <View style={styles.reviewSection}>
                <AppText variant="caption" weight="bold" color={theme.colors.textSecondary}>
                  TITLE & LOCATION
                </AppText>
                <AppText variant="body" weight="bold" color={theme.colors.textPrimary}>
                  {title}
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Location: {locationName} • Radius: {geoRadiusM}m
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Coordinates: {latitude}, {longitude}
                </AppText>
              </View>

              {/* Schedule clearly separated by Date and Time */}
              <View style={styles.reviewSection}>
                <AppText variant="caption" weight="bold" color={theme.colors.textSecondary}>
                  SCHEDULE & TIMEZONE ({MYANMAR_TIMEZONE_LABEL})
                </AppText>
                <AppText variant="body" color={theme.colors.textPrimary}>
                  {`Start: Date ${startDate} • Time ${startTime} (MMT)`}
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  {`Start ISO: ${reviewStartIso}`}
                </AppText>

                <AppText variant="body" color={theme.colors.textPrimary} style={styles.marginTopSmall}>
                  {`End: Date ${endDate} • Time ${endTime} (MMT)`}
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  {`End ISO: ${reviewEndIso}`}
                </AppText>

                <AppText variant="body" color={theme.colors.textPrimary} style={styles.marginTopSmall}>
                  {`Deadline: ${deadlineDate && deadlineTime ? `Date ${deadlineDate} • Time ${deadlineTime} (MMT)` : 'None'}`}
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  {`Deadline ISO: ${reviewDeadlineIso}`}
                </AppText>
              </View>

              <View style={styles.reviewSection}>
                <AppText variant="caption" weight="bold" color={theme.colors.textSecondary}>
                  CHARITY CATEGORIES
                </AppText>
                <AppText variant="caption" color={theme.colors.primary}>
                  {charityFieldCodes.join(', ')}
                </AppText>
              </View>

              <View style={styles.reviewSection}>
                <AppText variant="caption" weight="bold" color={theme.colors.textSecondary}>
                  IMMUTABLE SYSTEM ATTRIBUTES (ENFORCED BY SERVICE)
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  {`Status: Draft • Onboarding Version: 1 • Coordinator: ${
                    currentUser?.displayName ??
                    ('getCoordinatorIdentity' in repository &&
                    typeof (repository as any).getCoordinatorIdentity === 'function'
                      ? (repository as any).getCoordinatorIdentity().displayName
                      : 'Coordinator')
                  }`}
                </AppText>
              </View>
            </AppCard>
          )}

          {/* Stepper Buttons (Previous / Next / Save) */}
          <View style={styles.actionButtonsRow}>
            {currentStep > 1 ? (
              <View style={styles.actionButtonWrap}>
                <AppButton
                  label="Previous"
                  variant="outline"
                  onPress={handlePrevious}
                />
              </View>
            ) : null}

            <View style={styles.actionButtonWrap}>
              {currentStep < TOTAL_STEPS ? (
                <AppButton
                  label="Next"
                  variant="primary"
                  onPress={handleNext}
                />
              ) : (
                <AppButton
                  label="Save Draft (Demo)"
                  variant="primary"
                  loading={isSubmitting}
                  onPress={handleSaveDraft}
                />
              )}
            </View>
          </View>
        </ScreenContainer>

        {/* Date Picker Modal */}
        <DatePickerModal
          visible={datePickerTarget !== null}
          initialDate={getDatePickerInitial()}
          title={`Select ${datePickerTarget === 'start' ? 'Start' : datePickerTarget === 'end' ? 'End' : 'Deadline'} Date`}
          onSelectDate={handleDatePickerSelect}
          onClose={() => setDatePickerTarget(null)}
        />
      </View>
    </CoordinatorGuard>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  progressContainer: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  stepperScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  stepBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  scroll: {
    paddingVertical: 16,
    paddingBottom: 40,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
    gap: 8,
    marginBottom: 14,
  },
  errorText: {
    flex: 1,
  },
  cardSpacing: {
    marginBottom: 16,
  },
  stepHint: {
    marginTop: 2,
    marginBottom: 12,
  },
  fieldSpacing: {
    marginBottom: 12,
  },
  labelMargin: {
    marginTop: 8,
    marginBottom: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoriesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  halfCol: {
    flex: 1,
  },
  togglesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  demoBanner: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 14,
  },
  reviewSection: {
    marginBottom: 12,
    gap: 2,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 24,
  },
  actionButtonWrap: {
    flex: 1,
  },
  timezoneBox: {
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 14,
    gap: 4,
  },
  timezoneHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scheduleGroupHeading: {
    marginTop: 8,
    marginBottom: 4,
  },
  deadlineSubhint: {
    marginBottom: 6,
  },
  dateTimePairRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  dateCol: {
    flex: 1.2,
  },
  timeCol: {
    flex: 0.8,
  },
  dateInputWithButton: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  calendarPickerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 12,
  },
  flexOne: {
    flex: 1,
  },
  marginTopSmall: {
    marginTop: 6,
  },
  linearProgressBar: {
    height: 5,
    borderRadius: 9,
    marginHorizontal: 16,
    marginBottom: 8,
    overflow: 'hidden',
  },
  linearProgressFill: {
    height: '100%',
    borderRadius: 9,
  },
  mapVisual: {
    height: 140,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  radarFence: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarPin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
});
