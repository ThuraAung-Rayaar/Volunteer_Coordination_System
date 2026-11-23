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
  CreateEventWizardDraft,
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
import { MapLocationPickerModal } from '../components/MapLocationPickerModal';

export interface CreateEventWizardScreenProps
  extends Partial<MainDrawerScreenProps<'CreateEventWizard'>> {
  repository?: CoordinatorRepository;
}

export function parse24hTo12h(time24: string): { time12: string; period: 'AM' | 'PM' } {
  if (!time24 || !time24.includes(':')) {
    return { time12: time24 || '', period: 'AM' };
  }
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  if (isNaN(h)) {
    return { time12: time24, period: 'AM' };
  }
  const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const m = mStr !== undefined ? mStr.slice(0, 2) : '00';
  return {
    time12: `${String(h).padStart(2, '0')}:${m}`,
    period,
  };
}

export function convert12hTo24h(time12: string, period: 'AM' | 'PM'): string {
  if (!time12) return '';
  const trimmed = time12.trim();
  const parts = trimmed.split(':');
  let h = parseInt(parts[0], 10);
  if (isNaN(h)) return trimmed;
  let m = parts[1] !== undefined ? parts[1].slice(0, 2) : '00';
  if (m.length === 1) m = `0${m}`;

  if (period === 'PM') {
    if (h < 12) h += 12;
  } else if (period === 'AM') {
    if (h === 12) h = 0;
  }
  return `${String(h).padStart(2, '0')}:${m}`;
}

function toMyanmarDateTimeParts(value?: string | null): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return { date: '', time: '' };
  // Shift the instant to Myanmar Time (UTC+06:30), independent of device timezone.
  const mmt = new Date(timestamp + 390 * 60 * 1000);
  const pad = (part: number) => String(part).padStart(2, '0');
  return {
    date: `${mmt.getUTCFullYear()}-${pad(mmt.getUTCMonth() + 1)}-${pad(mmt.getUTCDate())}`,
    time: `${pad(mmt.getUTCHours())}:${pad(mmt.getUTCMinutes())}`,
  };
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
  route,
  repository: propRepository,
}: CreateEventWizardScreenProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const { currentUser } = useCurrentUser();
  const repositories = useRepositories();
  const repository = propRepository ?? repositories.coordinatorRepository ?? defaultCoordinatorRepository;
  const eventId = route?.params?.eventId;
  const isEditMode = Boolean(eventId);

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
  const [isLoadingExisting, setIsLoadingExisting] = useState(Boolean(eventId));
  const [existingEventStatus, setExistingEventStatus] = useState<string | null>(null);

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
  const [geoOpensBeforeMin, setGeoOpensBeforeMin] = useState('30');
  const [requireConfirmation, setRequireConfirmation] = useState(true);
  const [mapProvider, setMapProvider] = useState<'openstreetmap' | 'google'>('openstreetmap');
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);

  // Step 3: Schedule & Deadlines (Separated date and 12h AM/PM MMT time)
  const [startDate, setStartDate] = useState('2026-12-10');
  const [startTime12, setStartTime12] = useState('08:00');
  const [startPeriod, setStartPeriod] = useState<'AM' | 'PM'>('AM');
  const [endDate, setEndDate] = useState('2026-12-10');
  const [endTime12, setEndTime12] = useState('02:00');
  const [endPeriod, setEndPeriod] = useState<'AM' | 'PM'>('PM');
  const [deadlineDate, setDeadlineDate] = useState('2026-12-08');
  const [deadlineTime12, setDeadlineTime12] = useState('06:00');
  const [deadlinePeriod, setDeadlinePeriod] = useState<'AM' | 'PM'>('PM');

  const startTime = convert12hTo24h(startTime12, startPeriod);
  const endTime = convert12hTo24h(endTime12, endPeriod);
  const deadlineTime = deadlineTime12.trim()
    ? convert12hTo24h(deadlineTime12, deadlinePeriod)
    : '';

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

  // Reuse the same seven-step form for manager-authorized event editing.
  useEffect(() => {
    if (!eventId) {
      setIsLoadingExisting(false);
      setExistingEventStatus(null);
      return;
    }

    let active = true;
    setIsLoadingExisting(true);
    setErrorMessage(null);

    repository.getEventDetail(eventId)
      .then(existing => {
        if (!active) return;
        if (!existing) {
          setErrorMessage('Event not found or you do not have permission to edit it.');
          return;
        }
        if (existing.isOwnerAsMonitor) {
          setErrorMessage('This event is read-only while another coordinator manages it.');
          return;
        }
        if (existing.status === 'completed' || existing.status === 'cancelled') {
          setErrorMessage('Finalized events cannot be edited.');
          return;
        }

        const start = toMyanmarDateTimeParts(existing.startAt);
        const end = toMyanmarDateTimeParts(existing.endAt);
        const deadline = toMyanmarDateTimeParts(existing.applicationDeadline);

        setExistingEventStatus(existing.status);
        setTitle(existing.title);
        setDescription(existing.description ?? '');
        setPurposeType(existing.purposeType);
        setCharityFieldCodes((existing.charityFields ?? []) as CharityCategoryCode[]);
        setLocationName(existing.locationName ?? '');
        setLandmarkText(existing.landmarkText ?? '');
        setLatitude(existing.latitude === null || existing.latitude === undefined ? '' : String(existing.latitude));
        setLongitude(existing.longitude === null || existing.longitude === undefined ? '' : String(existing.longitude));
        setGeoRadiusM(String(existing.geoRadiusM ?? 200));
        setGeoCheckinEnabled(existing.geoCheckinEnabled);
        setGeoOpensBeforeMin(String(existing.geoCheckinOpensBeforeMin));
        setRequireConfirmation(existing.requireCheckinConfirmation);
        setMapProvider(existing.mapProvider);
        const parsedStart = parse24hTo12h(start.time);
        const parsedEnd = parse24hTo12h(end.time);
        const parsedDeadline = parse24hTo12h(deadline.time);

        setStartDate(start.date);
        setStartTime12(parsedStart.time12);
        setStartPeriod(parsedStart.period);
        setEndDate(end.date);
        setEndTime12(parsedEnd.time12);
        setEndPeriod(parsedEnd.period);
        setDeadlineDate(deadline.date);
        setDeadlineTime12(parsedDeadline.time12);
        setDeadlinePeriod(parsedDeadline.period);
        setAcceptanceMode(existing.acceptanceMode);
        setAutoAssignEnabled(existing.autoAssignEnabled);
        setGroupSize(existing.groupSize === undefined ? '' : String(existing.groupSize));
        setLeaderStrategy(existing.leaderStrategy);
        setMaxParticipants(existing.maxParticipants === undefined ? '' : String(existing.maxParticipants));
        setMealsProvided(existing.mealsProvided);
        setLodgingProvided(existing.lodgingProvided);
        setTravelSupportProvided(existing.travelSupportProvided);
        setCompensationKind(existing.compensationKind);
        setCompensationNote(existing.compensationNote ?? '');
        setOnboardingText(existing.onboardingText ?? '');
        setRequireOnboardingAck(existing.requireOnboardingAck);
        setQrRegistrationEnabled(existing.qrRegistrationEnabled);
      })
      .catch(err => {
        if (active) {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to load event for editing.');
        }
      })
      .finally(() => {
        if (active) setIsLoadingExisting(false);
      });

    return () => {
      active = false;
    };
  }, [eventId, repository]);

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
      const hasLatitude = Boolean(latitude.trim());
      const hasLongitude = Boolean(longitude.trim());
      if (hasLatitude !== hasLongitude) {
        setErrorMessage('Enter both latitude and longitude, or leave both blank.');
        return;
      }

      if (hasLatitude && hasLongitude) {
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
      }

      const radiusNum = parseInt(geoRadiusM.trim(), 10);
      if (isNaN(radiusNum) || radiusNum < 20 || radiusNum > 5000) {
        setErrorMessage(
          'Geofence radius must be between 20 and 5000 meters.',
        );
        return;
      }

      const geoWindowNum = parseInt(geoOpensBeforeMin.trim(), 10);
      if (isNaN(geoWindowNum) || geoWindowNum < 0 || geoWindowNum > 240) {
        setErrorMessage(
          'Geo check-in opening window must be between 0 and 240 minutes.',
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

  // Save Draft / Publish Event (Step 7)
  const handleSaveDraft = async (publish: boolean = false) => {
    if (isLoadingExisting || (isEditMode && existingEventStatus === null)) return;
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

    const latNum = latitude.trim() ? parseFloat(latitude.trim()) : null;
    const lngNum = longitude.trim() ? parseFloat(longitude.trim()) : null;
    const radiusNum = parseInt(geoRadiusM.trim(), 10);

    try {
      const draft: CreateEventWizardDraft = {
        title,
        description: description.trim() ? description : isEditMode ? null : undefined,
        purposeType,
        charityFieldCodes,
        locationName,
        landmarkText: landmarkText.trim() ? landmarkText : isEditMode ? null : undefined,
        latitude: latNum,
        longitude: lngNum,
        geoRadiusM: radiusNum,
        geoCheckinEnabled,
        geoCheckinOpensBeforeMin: parseInt(geoOpensBeforeMin.trim(), 10),
        requireCheckinConfirmation: requireConfirmation,
        mapProvider,
        startAt: startAtIso,
        endAt: endAtIso,
        applicationDeadline: deadlineIso ?? (isEditMode ? null : undefined),
        acceptanceMode,
        autoAssignEnabled,
        groupSize: groupSize.trim() ? parseInt(groupSize.trim(), 10) : isEditMode ? null : undefined,
        leaderStrategy,
        maxParticipants: maxParticipants.trim()
          ? parseInt(maxParticipants.trim(), 10)
          : isEditMode ? null : undefined,
        mealsProvided,
        lodgingProvided,
        travelSupportProvided,
        compensationKind,
        compensationNote: compensationNote.trim() ? compensationNote : isEditMode ? null : undefined,
        onboardingText: onboardingText.trim() ? onboardingText : isEditMode ? null : undefined,
        requireOnboardingAck,
        qrRegistrationEnabled,
        publish: !isEditMode ? publish : undefined,
      };
      const result = eventId
        ? await repository.updateEvent(eventId, draft)
        : await repository.createDraftEvent(draft);

      if (result.success && result.data) {
        if (eventId) {
          navigation?.navigate?.('CoordinatorEventDetail', { eventId });
        } else {
          navigation?.navigate?.('CoordinatorEvents');
        }
      } else {
        setErrorMessage(result.message);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : isEditMode
            ? 'Failed to update event'
            : publish
              ? 'Failed to publish event'
              : 'Failed to create draft event',
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
          title={isEditMode ? 'Edit Event' : 'Create Event Wizard'}
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

              <AppInput
                label="Geo Check-In Opens Before Event (0–240 minutes)"
                value={geoOpensBeforeMin}
                onChangeText={setGeoOpensBeforeMin}
                placeholder="30"
                style={styles.fieldSpacing}
              />

              <AppText variant="caption" weight="semibold" color={theme.colors.textSecondary} style={styles.labelMargin}>
                Map Provider
              </AppText>
              <View style={styles.chipsRow}>
                <FilterChip
                  label="OpenStreetMap"
                  selected={mapProvider === 'openstreetmap'}
                  onPress={() => setMapProvider('openstreetmap')}
                />
                <FilterChip
                  label="Google Maps"
                  selected={mapProvider === 'google'}
                  onPress={() => setMapProvider('google')}
                />
              </View>

              <View style={{ marginVertical: 8 }}>
                <AppButton
                  label="Pick Pin on Map"
                  variant="primary"
                  onPress={() => setIsMapPickerOpen(true)}
                />
              </View>

              <AppText variant="caption" color={theme.colors.textSecondary} style={styles.stepHint}>
                Template preview only. Native map display and device geofence execution are not active in this screen.
              </AppText>

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
              <View style={styles.dateRow}>
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
                    size={20}
                    color={theme.colors.primary}
                  />
                </Pressable>
              </View>
              <View style={styles.timeRow}>
                <View style={styles.flexOne}>
                  <AppInput
                    label="Start Time (AM/PM MMT) *"
                    value={startTime12}
                    onChangeText={setStartTime12}
                    placeholder="08:00"
                  />
                </View>
                <View style={styles.ampmCol}>
                  <AppText variant="label" color={theme.colors.muted} style={styles.ampmLabel}>
                    PERIOD
                  </AppText>
                  <View
                    style={[
                      styles.ampmContainer,
                      {
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surfaceRaised,
                      },
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Start time AM"
                      onPress={() => setStartPeriod('AM')}
                      style={[
                        styles.ampmButton,
                        startPeriod === 'AM' && {
                          backgroundColor: theme.colors.primary,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        weight="bold"
                        color={startPeriod === 'AM' ? '#FFFFFF' : theme.colors.textSecondary}
                      >
                        AM
                      </AppText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Start time PM"
                      onPress={() => setStartPeriod('PM')}
                      style={[
                        styles.ampmButton,
                        startPeriod === 'PM' && {
                          backgroundColor: theme.colors.primary,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        weight="bold"
                        color={startPeriod === 'PM' ? '#FFFFFF' : theme.colors.textSecondary}
                      >
                        PM
                      </AppText>
                    </Pressable>
                  </View>
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
              <View style={styles.dateRow}>
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
                    size={20}
                    color={theme.colors.primary}
                  />
                </Pressable>
              </View>
              <View style={styles.timeRow}>
                <View style={styles.flexOne}>
                  <AppInput
                    label="End Time (AM/PM MMT) *"
                    value={endTime12}
                    onChangeText={setEndTime12}
                    placeholder="02:00"
                  />
                </View>
                <View style={styles.ampmCol}>
                  <AppText variant="label" color={theme.colors.muted} style={styles.ampmLabel}>
                    PERIOD
                  </AppText>
                  <View
                    style={[
                      styles.ampmContainer,
                      {
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surfaceRaised,
                      },
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="End time AM"
                      onPress={() => setEndPeriod('AM')}
                      style={[
                        styles.ampmButton,
                        endPeriod === 'AM' && {
                          backgroundColor: theme.colors.primary,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        weight="bold"
                        color={endPeriod === 'AM' ? '#FFFFFF' : theme.colors.textSecondary}
                      >
                        AM
                      </AppText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="End time PM"
                      onPress={() => setEndPeriod('PM')}
                      style={[
                        styles.ampmButton,
                        endPeriod === 'PM' && {
                          backgroundColor: theme.colors.primary,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        weight="bold"
                        color={endPeriod === 'PM' ? '#FFFFFF' : theme.colors.textSecondary}
                      >
                        PM
                      </AppText>
                    </Pressable>
                  </View>
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
              <View style={styles.dateRow}>
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
                    size={20}
                    color={theme.colors.primary}
                  />
                </Pressable>
              </View>
              <View style={styles.timeRow}>
                <View style={styles.flexOne}>
                  <AppInput
                    label="Deadline Time (AM/PM MMT)"
                    value={deadlineTime12}
                    onChangeText={setDeadlineTime12}
                    placeholder="06:00"
                  />
                </View>
                <View style={styles.ampmCol}>
                  <AppText variant="label" color={theme.colors.muted} style={styles.ampmLabel}>
                    PERIOD
                  </AppText>
                  <View
                    style={[
                      styles.ampmContainer,
                      {
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surfaceRaised,
                      },
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Deadline time AM"
                      onPress={() => setDeadlinePeriod('AM')}
                      style={[
                        styles.ampmButton,
                        deadlinePeriod === 'AM' && {
                          backgroundColor: theme.colors.primary,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        weight="bold"
                        color={deadlinePeriod === 'AM' ? '#FFFFFF' : theme.colors.textSecondary}
                      >
                        AM
                      </AppText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Deadline time PM"
                      onPress={() => setDeadlinePeriod('PM')}
                      style={[
                        styles.ampmButton,
                        deadlinePeriod === 'PM' && {
                          backgroundColor: theme.colors.primary,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        weight="bold"
                        color={deadlinePeriod === 'PM' ? '#FFFFFF' : theme.colors.textSecondary}
                      >
                        PM
                      </AppText>
                    </Pressable>
                  </View>
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
                  label="First Experienced"
                  selected={leaderStrategy === 'first_experienced'}
                  onPress={() => setLeaderStrategy('first_experienced')}
                />
                <FilterChip
                  label="Manual Selection"
                  selected={leaderStrategy === 'manual'}
                  onPress={() => setLeaderStrategy('manual')}
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
                  label="Arranged Outside System"
                  selected={compensationKind === 'arranged_outside_system'}
                  onPress={() => setCompensationKind('arranged_outside_system')}
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
                {isEditMode ? 'Review Event Changes' : 'Review Event Configuration'}
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
                  {repositories.dataMode === 'mock'
                    ? 'Template Preview — not submitted to server'
                    : 'HTTP Mode — event draft will be submitted to the BFF'}
                </AppText>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  {repositories.dataMode === 'mock'
                    ? 'Saving updates a local in-memory event fixture for this session.'
                    : 'Saving sends the event draft to the configured Django BFF.'}
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
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  Geo window: {geoOpensBeforeMin} minutes • Map provider: {mapProvider}
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
                  {`${isEditMode
                    ? `Existing status: ${existingEventStatus ?? 'unchanged'} • Status is unchanged by this form • Onboarding version is server-managed • Coordinator: `
                    : 'Status: Draft • Onboarding Version: 1 • Coordinator: '}${
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

          {/* Stepper Buttons (Previous / Next / Save / Publish) */}
          {currentStep < TOTAL_STEPS ? (
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
                <AppButton
                  label="Next"
                  variant="primary"
                  onPress={handleNext}
                />
              </View>
            </View>
          ) : (
            <View style={styles.step7ButtonsCol}>
              {isEditMode ? (
                <View style={styles.actionButtonsRow}>
                  <View style={styles.actionButtonWrap}>
                    <AppButton
                      label="Previous"
                      variant="outline"
                      onPress={handlePrevious}
                    />
                  </View>
                  <View style={styles.actionButtonWrap}>
                    <AppButton
                      label={repositories.dataMode === 'mock' ? 'Save Changes (Template)' : 'Save Event Changes'}
                      variant="primary"
                      loading={isSubmitting || isLoadingExisting}
                      disabled={isLoadingExisting || existingEventStatus === null}
                      onPress={() => handleSaveDraft(false)}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.newActionsContainer}>
                  <AppButton
                    label={repositories.dataMode === 'mock' ? 'Publish Event (Template)' : 'Publish Event'}
                    variant="primary"
                    loading={isSubmitting}
                    disabled={isLoadingExisting}
                    onPress={() => handleSaveDraft(true)}
                  />
                  <View style={styles.actionButtonsRow}>
                    <View style={styles.actionButtonWrap}>
                      <AppButton
                        label="Previous"
                        variant="outline"
                        onPress={handlePrevious}
                      />
                    </View>
                    <View style={styles.actionButtonWrap}>
                      <AppButton
                        label={repositories.dataMode === 'mock' ? 'Save as Draft (Template)' : 'Save as Draft'}
                        variant="outline"
                        loading={isSubmitting}
                        disabled={isLoadingExisting}
                        onPress={() => handleSaveDraft(false)}
                      />
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}
        </ScreenContainer>

        {/* Date Picker Modal */}
        <DatePickerModal
          visible={datePickerTarget !== null}
          initialDate={getDatePickerInitial()}
          title={`Select ${datePickerTarget === 'start' ? 'Start' : datePickerTarget === 'end' ? 'End' : 'Deadline'} Date`}
          onSelectDate={handleDatePickerSelect}
          onClose={() => setDatePickerTarget(null)}
        />

        {/* Map Location Picker Modal */}
        <MapLocationPickerModal
          visible={isMapPickerOpen}
          onClose={() => setIsMapPickerOpen(false)}
          initialLatitude={Number(latitude) || 16.8}
          initialLongitude={Number(longitude) || 96.15}
          venueName={locationName}
          onConfirm={(newLat, newLng) => {
            setLatitude(newLat.toFixed(4));
            setLongitude(newLng.toFixed(4));
          }}
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
  dateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 10,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 14,
  },
  calendarPickerButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    marginBottom: 0,
  },
  ampmCol: {
    width: 104,
  },
  ampmLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  ampmContainer: {
    height: 48,
    flexDirection: 'row',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 3,
    alignItems: 'center',
  },
  ampmButton: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  step7ButtonsCol: {
    marginTop: 8,
    marginBottom: 24,
  },
  newActionsContainer: {
    gap: 10,
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
