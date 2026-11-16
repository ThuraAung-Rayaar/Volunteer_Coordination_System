/**
 * @format
 */

import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useAppTheme } from '../../theme';
import { AppText } from './AppText';

export interface FilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  count?: number;
  style?: StyleProp<ViewStyle>;
}

export function FilterChip({
  label,
  selected,
  onPress,
  count,
  style,
}: FilterChipProps): React.JSX.Element {
  const { theme } = useAppTheme();

  const backgroundColor = selected
    ? theme.colors.primary
    : theme.colors.surfaceRaised;

  const textColor = selected
    ? '#FFFFFF'
    : theme.colors.textPrimary;

  const borderColor = selected
    ? theme.colors.primary
    : theme.colors.border;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${label}${count !== undefined ? ` (${count})` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor,
          borderColor,
          borderRadius: theme.radius.pill ?? 9999,
          paddingVertical: 7,
          paddingHorizontal: 14,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <AppText
        variant="label"
        color={textColor}
        weight="bold"
        style={styles.labelText}
      >
        {label}
      </AppText>

      {count !== undefined ? (
        <View
          style={[
            styles.countBadge,
            {
              backgroundColor: selected
                ? 'rgba(255, 255, 255, 0.25)'
                : theme.colors.surface,
              borderRadius: theme.radius.pill ?? 9999,
              marginLeft: 6,
              paddingHorizontal: 6,
              paddingVertical: 1,
            },
          ]}
        >
          <AppText
            variant="caption"
            color={selected ? '#FFFFFF' : theme.colors.textSecondary}
            weight="bold"
            style={styles.countText}
          >
            {count}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  labelText: {
    fontSize: 12,
  },
  countBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 10,
  },
});
