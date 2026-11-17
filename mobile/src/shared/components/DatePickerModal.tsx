/**
 * @format
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useAppTheme } from '../../theme';
import { AppIcon } from './AppIcon';
import { AppText } from './AppText';

export interface DatePickerModalProps {
  visible: boolean;
  initialDate?: string; // YYYY-MM-DD
  title?: string;
  onSelectDate: (date: string) => void; // Returns YYYY-MM-DD
  onClose: () => void;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function DatePickerModal({
  visible,
  initialDate,
  title = 'Select Date',
  onSelectDate,
  onClose,
}: DatePickerModalProps): React.JSX.Element {
  const { theme } = useAppTheme();

  // Parse initial year and month
  const parseInitial = () => {
    if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
      const parts = initialDate.split('-').map(Number);
      return { year: parts[0], month: parts[1] - 1, selectedDay: parts[2] };
    }
    const now = new Date();
    return {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth(),
      selectedDay: now.getUTCDate(),
    };
  };

  const initial = parseInitial();
  const [currentYear, setCurrentYear] = useState(initial.year);
  const [currentMonth, setCurrentMonth] = useState(initial.month);

  useEffect(() => {
    if (visible && initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
      const parts = initialDate.split('-').map(Number);
      setCurrentYear(parts[0]);
      setCurrentMonth(parts[1] - 1);
    }
  }, [visible, initialDate]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  // Days in current month
  const daysInMonth = new Date(
    Date.UTC(currentYear, currentMonth + 1, 0),
  ).getUTCDate();

  // First day of week (0 = Sun, 1 = Mon ... 6 = Sat) -> map to Mon=0 .. Sun=6
  const firstDayUtc = new Date(
    Date.UTC(currentYear, currentMonth, 1),
  ).getUTCDay();
  const leadingBlanks = (firstDayUtc + 6) % 7;

  const days: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(d);
  }

  const handleDaySelect = (day: number) => {
    const mStr = String(currentMonth + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    const formatted = `${currentYear}-${mStr}-${dStr}`;
    onSelectDate(formatted);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
              {title}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close date picker"
              onPress={onClose}
              hitSlop={8}
            >
              <AppIcon name="close" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          {/* Month & Year Navigation */}
          <View style={styles.navRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              onPress={handlePrevMonth}
              hitSlop={8}
              style={[
                styles.navButton,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <AppIcon
                name="chevron-left"
                size={18}
                color={theme.colors.textPrimary}
              />
            </Pressable>

            <AppText
              variant="body"
              weight="bold"
              color={theme.colors.textPrimary}
            >
              {`${MONTH_NAMES[currentMonth]} ${currentYear}`}
            </AppText>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              onPress={handleNextMonth}
              hitSlop={8}
              style={[
                styles.navButton,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <AppIcon
                name="chevron-right"
                size={18}
                color={theme.colors.textPrimary}
              />
            </Pressable>
          </View>

          {/* Day of Week Headers */}
          <View style={styles.dayLabelsRow}>
            {DAY_LABELS.map(day => (
              <View key={day} style={styles.dayCell}>
                <AppText
                  variant="caption"
                  weight="semibold"
                  color={theme.colors.textSecondary}
                  style={styles.dayLabelText}
                >
                  {day}
                </AppText>
              </View>
            ))}
          </View>

          {/* Calendar Grid */}
          <View style={styles.grid}>
            {Array.from({ length: leadingBlanks }).map((_, idx) => (
              <View key={`blank-${idx}`} style={styles.dayCell} />
            ))}

            {days.map(day => {
              const mStr = String(currentMonth + 1).padStart(2, '0');
              const dStr = String(day).padStart(2, '0');
              const dayIso = `${currentYear}-${mStr}-${dStr}`;
              const isSelected = initialDate === dayIso;

              return (
                <Pressable
                  key={`day-${day}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Select date ${dayIso}`}
                  onPress={() => handleDaySelect(day)}
                  style={[
                    styles.dayCell,
                    styles.dayButton,
                    isSelected && {
                      backgroundColor: theme.colors.primary,
                      borderRadius: theme.radius.sm,
                    },
                  ]}
                >
                  <AppText
                    variant="body"
                    weight={isSelected ? 'bold' : 'regular'}
                    color={
                      isSelected
                        ? theme.colors.onPrimary
                        : theme.colors.textPrimary
                    }
                  >
                    {day}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Footer Actions */}
          <View style={styles.footerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel date picker"
              onPress={onClose}
              style={[
                styles.cancelButton,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceRaised,
                },
              ]}
            >
              <AppText variant="caption" weight="semibold" color={theme.colors.textSecondary}>
                Cancel
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    padding: 16,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  navButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabelsRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayButton: {
    marginVertical: 2,
  },
  dayLabelText: {
    fontSize: 11,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  cancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 6,
  },
});
