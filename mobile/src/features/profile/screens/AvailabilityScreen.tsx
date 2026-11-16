/**
 * @format
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
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
  EmptyState,
  ErrorState,
  FilterChip,
  LoadingState,
  ScreenContainer,
  SectionHeader,
  StatusBadge,
} from '../../../shared';
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
  const [selectedWeekday, setSelectedWeekday] = useState<number>(6); // Default Saturday
  const [ruleStartTime, setRuleStartTime] = useState('08:00');
  const [ruleEndTime, setRuleEndTime] = useState('13:00');
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
  const [exceptionNote, setExceptionNote] = useState('');
  const [exceptionDateError, setExceptionDateError] = useState<string | null>(null);
  const [exceptionTimeError, setExceptionTimeError] = useState<string | null>(null);

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

  // Handle Save Weekly Rule
  const handleSaveWeeklyRule = async () => {
    setRuleTimeError(null);
    setRuleValidityError(null);

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

    const weekdayObj = WEEKDAYS.find(w => w.day === selectedWeekday);
    const weekdayName = weekdayObj ? weekdayObj.name : 'Saturday';

    const result = await repository.saveWeeklyRule({
      weekday: selectedWeekday,
      weekdayName,
      startTime: ruleStartTime,
      endTime: ruleEndTime,
      validFrom: ruleValidFrom || undefined,
      validTo: ruleValidTo || undefined,
    });

    if (result.success) {
      setIsRuleModalVisible(false);
      setFeedbackBanner(`Weekly schedule rule saved (${result.message})`);
      await loadAvailability();
    } else {
      setRuleTimeError(result.message);
    }
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
        <View style={styles.scrimBackdrop}>
          <View
            style={[
              styles.sheetCard,
              {
                backgroundColor: theme.colors.surface,
                borderTopColor: theme.colors.border,
              },
            ]}
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
                  Choose a time you can reliably commit.
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
              DAY OF WEEK
            </AppText>
            <View style={styles.daysRow}>
              {WEEKDAYS.map(w => {
                const isSelected = selectedWeekday === w.day;
                return (
                  <Pressable
                    key={w.day}
                    onPress={() => setSelectedWeekday(w.day)}
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

            {/* Time inputs 2-col row (.f2) */}
            <View style={styles.twoColRow}>
              <View style={styles.colHalf}>
                <AppInput
                  label="Start Time (HH:mm)"
                  value={ruleStartTime}
                  rightIcon="clock"
                  onChangeText={text => {
                    setRuleStartTime(text);
                    if (ruleTimeError) {
                      setRuleTimeError(null);
                    }
                  }}
                  placeholder="08:00"
                />
              </View>
              <View style={styles.colHalf}>
                <AppInput
                  label="End Time (HH:mm)"
                  value={ruleEndTime}
                  rightIcon="clock"
                  onChangeText={text => {
                    setRuleEndTime(text);
                    if (ruleTimeError) {
                      setRuleTimeError(null);
                    }
                  }}
                  placeholder="13:00"
                />
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

            {/* Validity dates 2-col row (.f2) */}
            <View style={styles.twoColRow}>
              <View style={styles.colHalf}>
                <AppInput
                  label="Valid From (Optional)"
                  value={ruleValidFrom}
                  rightIcon="cal"
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
          </View>
        </View>
      </Modal>

      {/* Add Date Exception Bottom Sheet */}
      <Modal
        visible={isExceptionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsExceptionModalVisible(false)}
      >
        <View style={styles.scrimBackdrop}>
          <View
            style={[
              styles.sheetCard,
              {
                backgroundColor: theme.colors.surface,
                borderTopColor: theme.colors.border,
              },
            ]}
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
          </View>
        </View>
      </Modal>
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
});
