/**
 * @format
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { ProfileRepository } from '../../../data/contracts/profileRepository';
import { defaultProfileRepository } from '../../../data/mock/MockProfileRepository';
import { isMockMode } from '../../../app/configuration/dataMode';
import { useRepositories } from '../../../app/RepositoryProvider';
import type {
  AvailabilityException,
  VolunteerAvailability,
  WeeklyAvailabilityRule,
} from '../../../domain/models/availability';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppIcon,
  AppInput,
  AppText,
  DatePickerModal,
  EmptyState,
  ErrorState,
  FilterChip,
  LoadingState,
  ScreenContainer,
  SectionHeader,
  StatusBadge,
  TimePickerModal,
} from '../../../shared';
import {
  convert12hTo24h,
  parse24hTo12h,
} from '../../../shared/utils/dateTimeUtils';
import { hexToRgba, useAppTheme } from '../../../theme';

export interface AvailabilityScreenProps
  extends Partial<MainDrawerScreenProps<'Availability'>> {
  repository?: ProfileRepository;
}

const WEEKDAYS = [
  { day: 1, name: 'Monday', letter: 'M' },
  { day: 2, name: 'Tuesday', letter: 'T' },
  { day: 3, name: 'Wednesday', letter: 'W' },
  { day: 4, name: 'Thursday', letter: 'T' },
  { day: 5, name: 'Friday', letter: 'F' },
  { day: 6, name: 'Saturday', letter: 'S' },
  { day: 7, name: 'Sunday', letter: 'S' },
];

export function AvailabilityScreen({
  navigation,
  repository: propRepository,
}: AvailabilityScreenProps): React.JSX.Element {
  const { theme, isDark } = useAppTheme();
  const repositories = useRepositories();
  const repository = propRepository ?? repositories.profileRepository ?? defaultProfileRepository;

  const [availability, setAvailability] =
    useState<VolunteerAvailability | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Add Weekly Rule Modal state & field-level validation errors
  const [isRuleModalVisible, setIsRuleModalVisible] = useState(false);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([6]); // Default Saturday (allows multi-select)
  const [ruleStartTime, setRuleStartTime] = useState('08:00');
  const [ruleEndTime, setRuleEndTime] = useState('13:00');
  const [ruleStartPeriod, setRuleStartPeriod] = useState<'AM' | 'PM'>('AM');
  const [ruleEndPeriod, setRuleEndPeriod] = useState<'AM' | 'PM'>('PM');
  const [ruleValidFrom, setRuleValidFrom] = useState('');
  const [ruleValidTo, setRuleValidTo] = useState('');
  const [ruleTimeError, setRuleTimeError] = useState<string | null>(null);
  const [ruleValidityError, setRuleValidityError] = useState<string | null>(null);

  // Add Exception Modal state & field-level validation errors
  const [isExceptionModalVisible, setIsExceptionModalVisible] = useState(false);
  const [exceptionDate, setExceptionDate] = useState('');
  const [isExceptionAvailable, setIsExceptionAvailable] = useState(false);
  const [exceptionStartTime, setExceptionStartTime] = useState('');
  const [exceptionEndTime, setExceptionEndTime] = useState('');
  const [exceptionStartPeriod, setExceptionStartPeriod] = useState<'AM' | 'PM'>('AM');
  const [exceptionEndPeriod, setExceptionEndPeriod] = useState<'AM' | 'PM'>('PM');
  const [exceptionNote, setExceptionNote] = useState('');
  const [exceptionDateError, setExceptionDateError] = useState<string | null>(null);
  const [exceptionTimeError, setExceptionTimeError] = useState<string | null>(null);

  // Picker modals state
  const [datePickerTarget, setDatePickerTarget] = useState<
    'rule_from' | 'rule_to' | 'exception_date' | null
  >(null);
  const [timePickerTarget, setTimePickerTarget] = useState<
    'rule_start' | 'rule_end' | 'exception_start' | 'exception_end' | null
  >(null);

  const toggleWeekday = (day: number) => {
    setSelectedWeekdays(prev => {
      if (prev.includes(day)) {
        if (prev.length === 1) return prev; // Keep at least one selected
        return prev.filter(d => d !== day);
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  };

  const handleToggleRuleStartPeriod = (newPeriod: 'AM' | 'PM') => {
    setRuleStartPeriod(newPeriod);
    setRuleStartTime(prev => {
      const p = parse24hTo12h(prev);
      return convert12hTo24h(p.time12, newPeriod);
    });
  };

  const handleToggleRuleEndPeriod = (newPeriod: 'AM' | 'PM') => {
    setRuleEndPeriod(newPeriod);
    setRuleEndTime(prev => {
      const p = parse24hTo12h(prev);
      return convert12hTo24h(p.time12, newPeriod);
    });
  };

  const handleDatePickerSelect = (dateString: string) => {
    if (datePickerTarget === 'rule_from') {
      setRuleValidFrom(dateString);
    } else if (datePickerTarget === 'rule_to') {
      setRuleValidTo(dateString);
    } else if (datePickerTarget === 'exception_date') {
      setExceptionDate(dateString);
    }
    setDatePickerTarget(null);
  };

  const handleTimePickerSelect = (time24: string, _time12: string, period: 'AM' | 'PM') => {
    if (timePickerTarget === 'rule_start') {
      setRuleStartTime(time24);
      setRuleStartPeriod(period);
    } else if (timePickerTarget === 'rule_end') {
      setRuleEndTime(time24);
      setRuleEndPeriod(period);
    } else if (timePickerTarget === 'exception_start') {
      setExceptionStartTime(time24);
      setExceptionStartPeriod(period);
    } else if (timePickerTarget === 'exception_end') {
      setExceptionEndTime(time24);
      setExceptionEndPeriod(period);
    }
    setTimePickerTarget(null);
  };

  const loadAvailability = useCallback(async () => {
    try {
      setErrorMessage(null);
      const data = await repository.getAvailability();
      setAvailability(data);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load availability',
      );
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  // Handle Save Weekly Rule (saves across all selected weekdays)
  const handleSaveWeeklyRule = async () => {
    setRuleTimeError(null);
    setRuleValidityError(null);

    if (selectedWeekdays.length === 0) {
      setRuleTimeError('Please select at least one day of the week.');
      return;
    }

    // Validate times
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timeRegex.test(ruleStartTime) || !timeRegex.test(ruleEndTime)) {
      setRuleTimeError('Times must be in 24-hour HH:mm format (e.g. 08:00)');
      return;
    }

    if (ruleStartTime >= ruleEndTime) {
      setRuleTimeError('End time must be after start time (HH:mm).');
      return;
    }

    // Validate dates if supplied
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (ruleValidFrom && !dateRegex.test(ruleValidFrom)) {
      setRuleValidityError('Valid From date must be YYYY-MM-DD');
      return;
    }
    if (ruleValidTo && !dateRegex.test(ruleValidTo)) {
      setRuleValidityError('Valid To date must be YYYY-MM-DD');
      return;
    }
    if (ruleValidFrom && ruleValidTo && ruleValidFrom > ruleValidTo) {
      setRuleValidityError('Valid From cannot be later than Valid To date.');
      return;
    }

    for (const day of selectedWeekdays) {
      const weekdayObj = WEEKDAYS.find(w => w.day === day);
      const weekdayName = weekdayObj ? weekdayObj.name : 'Saturday';

      const result = await repository.saveWeeklyRule({
        weekday: day,
        weekdayName,
        startTime: ruleStartTime,
        endTime: ruleEndTime,
        validFrom: ruleValidFrom || undefined,
        validTo: ruleValidTo || undefined,
      });

      if (!result.success) {
        setRuleTimeError(result.message);
        return;
      }
    }

    setIsRuleModalVisible(false);
    setFeedbackBanner(
      `Weekly schedule rule saved for ${selectedWeekdays.length} day(s)`,
    );
    await loadAvailability();
  };

  // Handle Delete Weekly Rule
  const handleDeleteWeeklyRule = async (ruleId: string) => {
    const result = await repository.deleteWeeklyRule(ruleId);
    if (result.success) {
      setFeedbackBanner(`Weekly rule deleted (${result.message})`);
      await loadAvailability();
    }
  };

  // Handle Save Date Exception
  const handleSaveException = async () => {
    setExceptionDateError(null);
    setExceptionTimeError(null);

    if (!exceptionDate.trim()) {
      setExceptionDateError('Date is required (YYYY-MM-DD).');
      return;
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(exceptionDate)) {
      setExceptionDateError('Date is required (YYYY-MM-DD).');
      return;
    }

    // Validate times if available slot
    if (isExceptionAvailable) {
      const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (!timeRegex.test(exceptionStartTime) || !timeRegex.test(exceptionEndTime)) {
        setExceptionTimeError('Times must be in 24-hour HH:mm format (e.g. 09:00)');
        return;
      }
      if (exceptionStartTime >= exceptionEndTime) {
        setExceptionTimeError('End time must be later than start time.');
        return;
      }
    }

    const result = await repository.saveException({
      date: exceptionDate,
      isAvailable: isExceptionAvailable,
      startTime: isExceptionAvailable ? exceptionStartTime : undefined,
      endTime: isExceptionAvailable ? exceptionEndTime : undefined,
      note: exceptionNote || undefined,
    });

    if (result.success) {
      setIsExceptionModalVisible(false);
      setFeedbackBanner(`Date exception saved (${result.message})`);
      setExceptionDate('');
      setExceptionStartTime('');
      setExceptionEndTime('');
      setExceptionNote('');
      await loadAvailability();
    } else {
      setExceptionDateError(result.message);
    }
  };

  // Handle Delete Exception
  const handleDeleteException = async (exceptionId: string) => {
    const result = await repository.deleteException(exceptionId);
    if (result.success) {
      setFeedbackBanner(`Date exception removed (${result.message})`);
      await loadAvailability();
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Availability"
          onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
        />
        <LoadingState label="Loading availability rules..." />
      </View>
    );
  }

  if (errorMessage || !availability) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Availability"
          onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
        />
        <ErrorState
          title="Availability Unavailable"
          description={errorMessage ?? 'Could not retrieve availability rules.'}
          onRetry={loadAvailability}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title="Availability"
        subtitle="Weekly hours & rules"
        onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
      />

      <ScreenContainer scroll style={styles.scroll}>
        {/* Feedback / Demo confirmation banner */}
        {feedbackBanner ? (
          <View
            style={[
              styles.feedbackBanner,
              {
                backgroundColor: hexToRgba(theme.colors.primary, isDark ? 0.20 : 0.10),
                borderColor: hexToRgba(theme.colors.primary, 0.30),
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

        {/* Weekly Recurring Availability Rules Section */}
        <SectionHeader
          title="Weekly Recurring Rules"
          actionLabel="+ Add Rule"
          onActionPress={() => {
            setRuleTimeError(null);
            setRuleValidityError(null);
            setIsRuleModalVisible(true);
          }}
        />

        {availability.weeklyRules.length === 0 ? (
          <AppCard style={styles.emptyCard}>
            <EmptyState
              icon="calendar"
              title="No Weekly Rules"
              description="No recurring weekly availability configured yet."
              actionLabel="+ Add Rule"
              onActionPress={() => {
                setRuleTimeError(null);
                setRuleValidityError(null);
                setIsRuleModalVisible(true);
              }}
            />
          </AppCard>
        ) : (
          <View style={styles.listContainer}>
            {availability.weeklyRules.map((rule: WeeklyAvailabilityRule) => (
              <AppCard key={rule.id} style={styles.ruleCard}>
                <View style={styles.cardHeaderRow}>
                  <StatusBadge status="indigo" label={rule.weekdayName} />

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${rule.weekdayName} rule`}
                    onPress={() => handleDeleteWeeklyRule(rule.id)}
                    hitSlop={8}
                    style={styles.removeAction}
                  >
                    <AppText
                      variant="caption"
                      weight="bold"
                      color={theme.colors.danger}
                    >
                      Remove
                    </AppText>
                  </Pressable>
                </View>

                {/* Big Time Display matching mockup 3 */}
                <AppText
                  variant="hero"
                  weight="extrabold"
                  color={theme.colors.textPrimary}
                  style={styles.timeTitle}
                >
                  {rule.startTime} – {rule.endTime}
                </AppText>

                <AppText
                  variant="caption"
                  color={theme.colors.textSecondary}
                  style={styles.validityText}
                >
                  MMT · Weekly · Valid: {rule.validFrom ?? 'Anytime'} to {rule.validTo ?? 'Indefinite'}
                </AppText>
              </AppCard>
            ))}
          </View>
        )}

        {/* Date Exceptions Section (Blackouts & Overrides) */}
        <SectionHeader
          title="Date Exceptions & Blackouts"
          actionLabel="+ Add Exception"
          onActionPress={() => {
            setExceptionDateError(null);
            setExceptionTimeError(null);
            setIsExceptionModalVisible(true);
          }}
        />

        {availability.exceptions.length === 0 ? (
          <AppCard style={styles.emptyCard}>
            <EmptyState
              icon="alert"
              title="No Date Exceptions"
              description="No date overrides or blackouts configured."
              actionLabel="+ Add Exception"
              onActionPress={() => {
                setExceptionDateError(null);
                setExceptionTimeError(null);
                setIsExceptionModalVisible(true);
              }}
            />
          </AppCard>
        ) : (
          <View style={styles.listContainer}>
            {availability.exceptions.map((exc: AvailabilityException) => (
              <AppCard key={exc.id} style={styles.ruleCard}>
                <View style={styles.cardHeaderRow}>
                  <StatusBadge
                    status={exc.isAvailable ? 'sky' : 'rose'}
                    icon={exc.isAvailable ? 'check' : 'close'}
                    label={
                      exc.isAvailable ? 'Available Slot' : 'Unavailable (Blackout)'
                    }
                  />

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete exception on ${exc.date}`}
                    onPress={() => handleDeleteException(exc.id)}
                    hitSlop={8}
                    style={styles.removeAction}
                  >
                    <AppText
                      variant="caption"
                      weight="bold"
                      color={theme.colors.danger}
                    >
                      Remove
                    </AppText>
                  </Pressable>
                </View>

                <AppText
                  variant="title"
                  weight="extrabold"
                  color={theme.colors.textPrimary}
                  style={styles.exceptionDateText}
                >
                  {exc.date}
                </AppText>

                {exc.isAvailable && exc.startTime && exc.endTime ? (
                  <AppText
                    variant="caption"
                    weight="bold"
                    color={theme.colors.primary}
                    style={styles.exceptionDetails}
                  >
                    Hours: {exc.startTime} – {exc.endTime}
                  </AppText>
                ) : null}

                {exc.note ? (
                  <AppText
                    variant="caption"
                    color={theme.colors.textSecondary}
                    style={styles.exceptionDetails}
                  >
                    Note: {exc.note}
                  </AppText>
                ) : null}
              </AppCard>
            ))}
          </View>
        )}
      </ScreenContainer>

      {/* Add Weekly Rule Bottom Sheet */}
      <Modal
        visible={isRuleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsRuleModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.scrimBackdrop}
        >
          <View
            style={[
              styles.sheetCard,
              {
                backgroundColor: theme.colors.surface,
                borderTopColor: theme.colors.border,
                maxHeight: '90%',
              },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetScrollContent}
            >
              {/* Handle bar (.hd) */}
              <View
                style={[
                  styles.handleBar,
                  { backgroundColor: theme.colors.border },
                ]}
              />

              <View style={styles.modalHeader}>
                <View>
                  <AppText variant="title" weight="extrabold" color={theme.colors.textPrimary}>
                    Add Weekly Availability Rule
                  </AppText>
                  <AppText variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                    Choose weekdays & hours you can commit.
                  </AppText>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close rule modal"
                  onPress={() => setIsRuleModalVisible(false)}
                  hitSlop={8}
                  style={[
                    styles.closeIconBtn,
                    {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <AppIcon name="close" size={14} color={theme.colors.textSecondary} />
                </Pressable>
              </View>

              {/* Circular Weekday Picker matching .days */}
              <AppText
                variant="eyebrow"
                color={theme.colors.muted}
                style={styles.fieldSectionLabel}
              >
                DAYS OF WEEK (SELECT ONE OR MORE)
              </AppText>
              <View style={styles.daysRow}>
                {WEEKDAYS.map(w => {
                  const isSelected = selectedWeekdays.includes(w.day);
                  return (
                    <Pressable
                      key={w.day}
                      onPress={() => toggleWeekday(w.day)}
                      style={[
                        styles.dayCircle,
                        {
                          backgroundColor: isSelected
                            ? theme.colors.primary
                            : theme.colors.surfaceRaised,
                          borderColor: isSelected
                            ? theme.colors.primary
                            : theme.colors.border,
                        },
                        isSelected && styles.dayCircleActive,
                      ]}
                    >
                      <AppText
                        variant="label"
                        weight="bold"
                        color={isSelected ? '#FFFFFF' : theme.colors.textSecondary}
                      >
                        {w.letter}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              {/* Time inputs 2-col row (.f2) with AM/PM pill selectors & clock picker trigger */}
              <View style={styles.twoColRow}>
                <View style={styles.colHalf}>
                  <AppInput
                    label="Start Time (HH:mm)"
                    value={ruleStartTime}
                    rightIcon="clock"
                    onRightIconPress={() => setTimePickerTarget('rule_start')}
                    onChangeText={text => {
                      setRuleStartTime(text);
                      if (ruleTimeError) {
                        setRuleTimeError(null);
                      }
                    }}
                    placeholder="08:00"
                  />
                  <View style={styles.periodRow}>
                    <Pressable
                      onPress={() => handleToggleRuleStartPeriod('AM')}
                      style={[
                        styles.periodPill,
                        {
                          backgroundColor:
                            ruleStartPeriod === 'AM'
                              ? theme.colors.primary
                              : theme.colors.surfaceRaised,
                          borderColor:
                            ruleStartPeriod === 'AM'
                              ? theme.colors.primary
                              : theme.colors.border,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        weight="bold"
                        color={ruleStartPeriod === 'AM' ? '#FFFFFF' : theme.colors.textSecondary}
                      >
                        AM
                      </AppText>
                    </Pressable>
                    <Pressable
                      onPress={() => handleToggleRuleStartPeriod('PM')}
                      style={[
                        styles.periodPill,
                        {
                          backgroundColor:
                            ruleStartPeriod === 'PM'
                              ? theme.colors.primary
                              : theme.colors.surfaceRaised,
                          borderColor:
                            ruleStartPeriod === 'PM'
                              ? theme.colors.primary
                              : theme.colors.border,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        weight="bold"
                        color={ruleStartPeriod === 'PM' ? '#FFFFFF' : theme.colors.textSecondary}
                      >
                        PM
                      </AppText>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.colHalf}>
                  <AppInput
                    label="End Time (HH:mm)"
                    value={ruleEndTime}
                    rightIcon="clock"
                    onRightIconPress={() => setTimePickerTarget('rule_end')}
                    onChangeText={text => {
                      setRuleEndTime(text);
                      if (ruleTimeError) {
                        setRuleTimeError(null);
                      }
                    }}
                    placeholder="13:00"
                  />
                  <View style={styles.periodRow}>
                    <Pressable
                      onPress={() => handleToggleRuleEndPeriod('AM')}
                      style={[
                        styles.periodPill,
                        {
                          backgroundColor:
                            ruleEndPeriod === 'AM'
                              ? theme.colors.primary
                              : theme.colors.surfaceRaised,
                          borderColor:
                            ruleEndPeriod === 'AM'
                              ? theme.colors.primary
                              : theme.colors.border,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        weight="bold"
                        color={ruleEndPeriod === 'AM' ? '#FFFFFF' : theme.colors.textSecondary}
                      >
                        AM
                      </AppText>
                    </Pressable>
                    <Pressable
                      onPress={() => handleToggleRuleEndPeriod('PM')}
                      style={[
                        styles.periodPill,
                        {
                          backgroundColor:
                            ruleEndPeriod === 'PM'
                              ? theme.colors.primary
                              : theme.colors.surfaceRaised,
                          borderColor:
                            ruleEndPeriod === 'PM'
                              ? theme.colors.primary
                              : theme.colors.border,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        weight="bold"
                        color={ruleEndPeriod === 'PM' ? '#FFFFFF' : theme.colors.textSecondary}
                      >
                        PM
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              </View>

              {ruleTimeError ? (
                <AppText
                  variant="caption"
                  color={theme.colors.danger}
                  style={styles.inlineError}
                >
                  {ruleTimeError}
                </AppText>
              ) : null}

              {/* Validity dates 2-col row (.f2) with calendar picker trigger */}
              <View style={styles.twoColRow}>
                <View style={styles.colHalf}>
                  <AppInput
                    label="Valid From (Optional)"
                    value={ruleValidFrom}
                    rightIcon="cal"
                    onRightIconPress={() => setDatePickerTarget('rule_from')}
                    onChangeText={text => {
                      setRuleValidFrom(text);
                      if (ruleValidityError) {
                        setRuleValidityError(null);
                      }
                    }}
                    placeholder="2026-11-01"
                  />
                </View>
                <View style={styles.colHalf}>
                  <AppInput
                    label="Valid To (Optional)"
                    value={ruleValidTo}
                    rightIcon="cal"
                    onRightIconPress={() => setDatePickerTarget('rule_to')}
                    onChangeText={text => {
                      setRuleValidTo(text);
                      if (ruleValidityError) {
                        setRuleValidityError(null);
                      }
                    }}
                    placeholder="2026-12-31"
                  />
                </View>
              </View>

              {ruleValidityError ? (
                <AppText
                  variant="caption"
                  color={theme.colors.danger}
                  style={styles.inlineError}
                >
                  {ruleValidityError}
                </AppText>
              ) : null}

              <View style={styles.sheetActionsRow}>
                <View style={styles.actionBtnWrap}>
                  <AppButton
                    label="Cancel"
                    variant="secondary"
                    onPress={() => setIsRuleModalVisible(false)}
                  />
                </View>
                <View style={styles.actionBtnWrap}>
                  <AppButton
                    label={isMockMode() ? 'Save Rule (Demo)' : 'Save Rule'}
                    variant="primary"
                    leftIcon="check"
                    accessibilityLabel={isMockMode() ? 'Add Rule (Demo)' : 'Add Rule'}
                    onPress={handleSaveWeeklyRule}
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Date Exception Bottom Sheet */}
      <Modal
        visible={isExceptionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsExceptionModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.scrimBackdrop}
        >
          <View
            style={[
              styles.sheetCard,
              {
                backgroundColor: theme.colors.surface,
                borderTopColor: theme.colors.border,
                maxHeight: '90%',
              },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetScrollContent}
            >
              {/* Handle bar (.hd) */}
              <View
                style={[
                  styles.handleBar,
                  { backgroundColor: theme.colors.border },
                ]}
              />

              <View style={styles.modalHeader}>
                <AppText variant="title" weight="extrabold" color={theme.colors.textPrimary}>
                  Add Date Exception / Blackout
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close exception modal"
                  onPress={() => setIsExceptionModalVisible(false)}
                  hitSlop={8}
                  style={[
                    styles.closeIconBtn,
                    {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <AppIcon name="close" size={14} color={theme.colors.textSecondary} />
                </Pressable>
              </View>

              <AppInput
                label="Date (YYYY-MM-DD) *"
                value={exceptionDate}
                rightIcon="cal"
                onRightIconPress={() => setDatePickerTarget('exception_date')}
                onChangeText={text => {
                  setExceptionDate(text);
                  if (exceptionDateError) {
                    setExceptionDateError(null);
                  }
                }}
                placeholder="e.g. 2026-11-25"
                style={styles.modalInputSpacing}
              />

              {exceptionDateError ? (
                <AppText
                  variant="caption"
                  color={theme.colors.danger}
                  style={styles.inlineError}
                >
                  {exceptionDateError}
                </AppText>
              ) : null}

              <AppText
                variant="eyebrow"
                color={theme.colors.muted}
                style={styles.fieldSectionLabel}
              >
                AVAILABILITY STATUS FOR THIS DATE
              </AppText>
              <View style={styles.exceptionToggleRow}>
                <FilterChip
                  label="Full-Day Blackout"
                  selected={!isExceptionAvailable}
                  onPress={() => setIsExceptionAvailable(false)}
                />
                <FilterChip
                  label="Partial-Day Slot"
                  selected={isExceptionAvailable}
                  onPress={() => setIsExceptionAvailable(true)}
                />
              </View>

              {isExceptionAvailable ? (
                <>
                  <View style={styles.twoColRow}>
                    <View style={styles.colHalf}>
                      <AppInput
                        label="Start Time (HH:mm)"
                        value={exceptionStartTime}
                        rightIcon="clock"
                        onRightIconPress={() => setTimePickerTarget('exception_start')}
                        onChangeText={text => {
                          setExceptionStartTime(text);
                          if (exceptionTimeError) {
                            setExceptionTimeError(null);
                          }
                        }}
                        placeholder="09:00"
                      />
                    </View>
                    <View style={styles.colHalf}>
                      <AppInput
                        label="End Time (HH:mm)"
                        value={exceptionEndTime}
                        rightIcon="clock"
                        onRightIconPress={() => setTimePickerTarget('exception_end')}
                        onChangeText={text => {
                          setExceptionEndTime(text);
                          if (exceptionTimeError) {
                            setExceptionTimeError(null);
                          }
                        }}
                        placeholder="12:00"
                      />
                    </View>
                  </View>
                  {exceptionTimeError ? (
                    <AppText
                      variant="caption"
                      color={theme.colors.danger}
                      style={styles.inlineError}
                    >
                      {exceptionTimeError}
                    </AppText>
                  ) : null}
                </>
              ) : null}

              <AppInput
                label="Reason / Note (Optional)"
                value={exceptionNote}
                onChangeText={setExceptionNote}
                placeholder="e.g. Family commitment, out of town"
                style={styles.modalInputSpacing}
              />

              <View style={styles.sheetActionsRow}>
                <View style={styles.actionBtnWrap}>
                  <AppButton
                    label="Cancel"
                    variant="secondary"
                    onPress={() => setIsExceptionModalVisible(false)}
                  />
                </View>
                <View style={styles.actionBtnWrap}>
                  <AppButton
                    label={isMockMode() ? 'Save Exception (Demo)' : 'Save Exception'}
                    variant="primary"
                    leftIcon="check"
                    accessibilityLabel={isMockMode() ? 'Save Exception (Demo)' : 'Save Exception'}
                    onPress={handleSaveException}
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Interactive Date Picker Modal */}
      {datePickerTarget !== null && (
        <DatePickerModal
          visible={datePickerTarget !== null}
          initialDate={
            datePickerTarget === 'rule_from'
              ? ruleValidFrom
              : datePickerTarget === 'rule_to'
              ? ruleValidTo
              : exceptionDate
          }
          title={
            datePickerTarget === 'exception_date'
              ? 'Select Exception Date'
              : datePickerTarget === 'rule_from'
              ? 'Select Valid From Date'
              : 'Select Valid To Date'
          }
          onSelectDate={handleDatePickerSelect}
          onClose={() => setDatePickerTarget(null)}
        />
      )}

      {/* Interactive Time Picker Modal */}
      {timePickerTarget !== null && (
        <TimePickerModal
          visible={timePickerTarget !== null}
          initialTime={
            timePickerTarget === 'rule_start'
              ? ruleStartTime
              : timePickerTarget === 'rule_end'
              ? ruleEndTime
              : timePickerTarget === 'exception_start'
              ? exceptionStartTime
              : exceptionEndTime
          }
          initialPeriod={
            timePickerTarget === 'rule_start'
              ? ruleStartPeriod
              : timePickerTarget === 'rule_end'
              ? ruleEndPeriod
              : timePickerTarget === 'exception_start'
              ? exceptionStartPeriod
              : exceptionEndPeriod
          }
          title={
            timePickerTarget === 'rule_start'
              ? 'Select Start Time'
              : timePickerTarget === 'rule_end'
              ? 'Select End Time'
              : timePickerTarget === 'exception_start'
              ? 'Select Exception Start Time'
              : 'Select Exception End Time'
          }
          onSelectTime={handleTimePickerSelect}
          onClose={() => setTimePickerTarget(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    paddingVertical: 12,
    paddingBottom: 40,
  },
  feedbackBanner: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
  },
  listContainer: {
    marginBottom: 14,
  },
  emptyCard: {
    marginBottom: 14,
    paddingVertical: 16,
  },
  ruleCard: {
    marginBottom: 10,
    padding: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  timeTitle: {
    fontSize: 21,
    letterSpacing: -0.6,
    marginVertical: 4,
  },
  validityText: {
    fontSize: 11,
    marginTop: 2,
  },
  exceptionDateText: {
    fontSize: 15,
    marginVertical: 4,
  },
  exceptionDetails: {
    marginTop: 2,
  },
  removeAction: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  scrimBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 30, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  handleBar: {
    width: 44,
    height: 4,
    borderRadius: 9,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  closeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldSectionLabel: {
    marginTop: 8,
    marginBottom: 8,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleActive: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 8,
    elevation: 4,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  colHalf: {
    flex: 1,
  },
  inlineError: {
    marginBottom: 8,
  },
  modalInputSpacing: {
    marginBottom: 10,
  },
  exceptionToggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  sheetActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionBtnWrap: {
    flex: 1,
  },
  sheetScrollContent: {
    paddingBottom: 16,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  periodPill: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
