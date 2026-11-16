/**
 * @format
 */

import React from 'react';
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import {
  CHARITY_CATEGORIES,
  CharityCategoryCode,
} from '../../../domain/models/event';
import { FilterChip } from '../../../shared';
import { useAppTheme } from '../../../theme';

export interface CharityCategoryChipsProps {
  selectedCategory: CharityCategoryCode | 'all';
  onSelectCategory: (code: CharityCategoryCode | 'all') => void;
  style?: StyleProp<ViewStyle>;
}

export function CharityCategoryChips({
  selectedCategory,
  onSelectCategory,
  style,
}: CharityCategoryChipsProps): React.JSX.Element {
  const { theme } = useAppTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[
        styles.scrollContainer,
        {
          paddingHorizontal: theme.spacing.md,
          gap: theme.spacing.sm,
        },
      ]}
      style={[styles.container, style]}
    >
      <FilterChip
        label="All Categories"
        selected={selectedCategory === 'all'}
        onPress={() => onSelectCategory('all')}
      />

      {CHARITY_CATEGORIES.map(category => (
        <FilterChip
          key={category.code}
          label={category.label}
          selected={selectedCategory === category.code}
          onPress={() => onSelectCategory(category.code)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: 48,
  },
  scrollContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
});
