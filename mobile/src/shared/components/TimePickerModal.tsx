/**
 * @format
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { hexToRgba, useAppTheme } from '../../theme';
import { AppButton } from './AppButton';
import { AppIcon } from './AppIcon';
import { AppText } from './AppText';

export interface TimePickerModalProps {
  visible: boolean;
  initialTime?: string; // Can be 24h "HH:mm" or 12h "hh:mm"
  initialPeriod?: 'AM' | 'PM';
  title?: string;
  onSelectTime: (time24: string, time12: string, period: 'AM' | 'PM') => void;
  onClose: () => void;
}

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = ['00', '15', '30', '45'];
const EXTENDED_MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export function TimePickerModal({
  visible,
  initialTime,
  initialPeriod = 'AM',
  title = 'Select Time',
  onSelectTime,
  onClose,
}: TimePickerModalProps): React.JSX.Element {
  const { theme, isDark } = useAppTheme();

  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState('00');
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');

  useEffect(() => {
    if (!visible) return;

    if (initialTime && initialTime.includes(':')) {
      const parts = initialTime.trim().split(':');
      let h = parseInt(parts[0], 10);
      const m = parts[1] ? parts[1].slice(0, 2).padStart(2, '0') : '00';

      if (!isNaN(h)) {
        if (h >= 12) {
          setPeriod('PM');
          if (h > 12) h -= 12;
        } else {
          setPeriod(initialPeriod || 'AM');
          if (h === 0) h = 12;
        }
        setHour(h);
      }
      setMinute(m);
    } else {
      setHour(8);
      setMinute('00');
      setPeriod(initialPeriod || 'AM');
    }
  }, [visible, initialTime, initialPeriod]);

  const pad = (n: number | string) => String(n).padStart(2, '0');

  const compute24h = (): string => {
    let h24 = hour;
    if (period === 'PM' && h24 < 12) h24 += 12;
    if (period === 'AM' && h24 === 12) h24 = 0;
    return `${pad(h24)}:${minute}`;
  };

  const handleConfirm = () => {
    const time24 = compute24h();
    const time12 = `${pad(hour)}:${minute}`;
    onSelectTime(time24, time12, period);
    onClose();
  };

  const time12Display = `${pad(hour)}:${minute} ${period}`;
  const time24Display = compute24h();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.scrim}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <AppText variant="title" weight="extrabold" color={theme.colors.textPrimary}>
                {title}
              </AppText>
              <AppText variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                Tap hour, minute, and AM/PM
              </AppText>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close time picker"
              onPress={onClose}
              hitSlop={8}
              style={[
                styles.closeButton,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <AppIcon name="close" size={14} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          {/* Time Display Box */}
          <View
            style={[
              styles.displayBox,
              {
                backgroundColor: hexToRgba(theme.colors.primary, isDark ? 0.20 : 0.08),
                borderColor: hexToRgba(theme.colors.primary, 0.35),
              },
            ]}
          >
            <AppText
              variant="hero"
              weight="extrabold"
              color={theme.colors.primary}
              style={styles.timeDisplayText}
            >
              {time12Display}
            </AppText>
            <AppText variant="caption" color={theme.colors.textSecondary}>
              Myanmar Time (MMT) · 24-hour: {time24Display}
            </AppText>
          </View>

          {/* Period Toggle AM / PM */}
          <View style={styles.periodRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select AM"
              onPress={() => setPeriod('AM')}
              style={[
                styles.periodBtn,
                {
                  backgroundColor:
                    period === 'AM' ? theme.colors.primary : theme.colors.surfaceRaised,
                  borderColor: period === 'AM' ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              <AppText
                variant="label"
                weight="bold"
                color={period === 'AM' ? '#FFFFFF' : theme.colors.textSecondary}
              >
                AM (Morning)
              </AppText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select PM"
              onPress={() => setPeriod('PM')}
              style={[
                styles.periodBtn,
                {
                  backgroundColor:
                    period === 'PM' ? theme.colors.primary : theme.colors.surfaceRaised,
                  borderColor: period === 'PM' ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              <AppText
                variant="label"
                weight="bold"
                color={period === 'PM' ? '#FFFFFF' : theme.colors.textSecondary}
              >
                PM (Afternoon / Evening)
              </AppText>
            </Pressable>
          </View>

          {/* Hour Selector (1-12) */}
          <AppText variant="eyebrow" color={theme.colors.muted} style={styles.sectionLabel}>
            HOUR
          </AppText>
          <View style={styles.grid}>
            {HOURS.map(h => {
              const isSelected = hour === h;
              return (
                <Pressable
                  key={h}
                  accessibilityRole="button"
                  accessibilityLabel={`Select hour ${h}`}
                  onPress={() => setHour(h)}
                  style={[
                    styles.gridBtn,
                    {
                      backgroundColor: isSelected
                        ? theme.colors.primary
                        : theme.colors.surfaceRaised,
                      borderColor: isSelected
                        ? theme.colors.primary
                        : theme.colors.border,
                    },
                  ]}
                >
                  <AppText
                    variant="body"
                    weight="bold"
                    color={isSelected ? '#FFFFFF' : theme.colors.textPrimary}
                  >
                    {h}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Minute Selector */}
          <AppText variant="eyebrow" color={theme.colors.muted} style={styles.sectionLabel}>
            MINUTE
          </AppText>
          <View style={styles.minuteGrid}>
            {EXTENDED_MINUTES.map(m => {
              const isSelected = minute === m;
              return (
                <Pressable
                  key={m}
                  accessibilityRole="button"
                  accessibilityLabel={`Select minute ${m}`}
                  onPress={() => setMinute(m)}
                  style={[
                    styles.minuteBtn,
                    {
                      backgroundColor: isSelected
                        ? theme.colors.primary
                        : theme.colors.surfaceRaised,
                      borderColor: isSelected
                        ? theme.colors.primary
                        : theme.colors.border,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    weight="bold"
                    color={isSelected ? '#FFFFFF' : theme.colors.textPrimary}
                  >
                    :{m}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            <View style={styles.actionBtnWrap}>
              <AppButton
                label="Cancel"
                variant="secondary"
                onPress={onClose}
              />
            </View>
            <View style={styles.actionBtnWrap}>
              <AppButton
                label="Confirm Time"
                variant="primary"
                leftIcon="check"
                onPress={handleConfirm}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 30, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayBox: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  timeDisplayText: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  periodBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    marginTop: 4,
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  gridBtn: {
    width: '15%',
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minuteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  minuteBtn: {
    width: '15%',
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtnWrap: {
    flex: 1,
  },
});
