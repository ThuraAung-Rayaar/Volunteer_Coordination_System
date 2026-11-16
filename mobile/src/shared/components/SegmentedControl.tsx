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

export interface SegmentOption<T extends string = string> {
  key: T;
  label: string;
  count?: number;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  selectedKey: T;
  onSelect: (key: T) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * CommonGround Segmented Control (.seg)
 * Direct implementation of mobile-ui-style.html segment bar:
 * Raised container, 14px radius, 38px item height, 10px item radius, active surface with soft shadow.
 */
export function SegmentedControl<T extends string = string>({
  options,
  selectedKey,
  onSelect,
  style,
}: SegmentedControlProps<T>): React.JSX.Element {
  const { theme, isDark } = useAppTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      {options.map(option => {
        const isSelected = selectedKey === option.key;

        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${option.label}${option.count !== undefined ? ` · ${option.count}` : ''}`}
            onPress={() => onSelect(option.key)}
            style={({ pressed }) => [
              styles.segmentItem,
              isSelected && [
                styles.segmentActive,
                {
                  backgroundColor: theme.colors.surface,
                  shadowColor: isDark ? '#000000' : '#0E1A33',
                },
              ],
              pressed && { opacity: 0.8 },
            ]}
          >
            <AppText
              variant="label"
              weight="bold"
              color={isSelected ? theme.colors.textPrimary : theme.colors.muted}
              style={styles.labelText}
            >
              {option.label}
              {option.count !== undefined ? ` · ${option.count}` : ''}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    width: '100%',
  },
  segmentItem: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  labelText: {
    fontSize: 11,
    textAlign: 'center',
  },
});
