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
import {
  CHARITY_CATEGORIES,
  CharityCategoryCode,
  EventFilters,
  EventStatus,
} from '../../../domain/models/event';
import {
  AppButton,
  AppIcon,
  AppText,
  FilterChip,
} from '../../../shared';
import { useAppTheme } from '../../../theme';

export interface EventFilterSheetProps {
  visible: boolean;
  filters: EventFilters;
  onApply: (newFilters: EventFilters) => void;
  onClose: () => void;
}

export function EventFilterSheet({
  visible,
  filters,
  onApply,
  onClose,
}: EventFilterSheetProps): React.JSX.Element {
  const { theme } = useAppTheme();

  // Local draft state
  const [selectedStatuses, setSelectedStatuses] = useState<EventStatus[]>(
    filters.statuses ?? [],
  );
  const [selectedCategories, setSelectedCategories] = useState<
    CharityCategoryCode[]
  >(filters.charityFieldCodes ?? []);
  const [meals, setMeals] = useState<boolean>(filters.mealsProvided ?? false);
  const [lodging, setLodging] = useState<boolean>(
    filters.lodgingProvided ?? false,
  );
  const [travel, setTravel] = useState<boolean>(
    filters.travelSupportProvided ?? false,
  );

  // Sync draft state with incoming filters whenever the modal becomes visible or filters update
  useEffect(() => {
    if (visible) {
      setSelectedStatuses(filters.statuses ?? []);
      setSelectedCategories(filters.charityFieldCodes ?? []);
      setMeals(filters.mealsProvided ?? false);
      setLodging(filters.lodgingProvided ?? false);
      setTravel(filters.travelSupportProvided ?? false);
    }
  }, [visible, filters]);

  const toggleStatus = (status: EventStatus) => {
    setSelectedStatuses(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status],
    );
  };

  const toggleCategory = (code: CharityCategoryCode) => {
    setSelectedCategories(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code],
    );
  };

  const handleReset = () => {
    setSelectedStatuses([]);
    setSelectedCategories([]);
    setMeals(false);
    setLodging(false);
    setTravel(false);
  };

  const handleApply = () => {
    onApply({
      ...filters,
      statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
      charityFieldCodes:
        selectedCategories.length > 0 ? selectedCategories : undefined,
      mealsProvided: meals ? true : undefined,
      lodgingProvided: lodging ? true : undefined,
      travelSupportProvided: travel ? true : undefined,
    });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss filters"
          style={styles.backdropPressable}
          onPress={onClose}
        />

        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
            },
          ]}
        >
          {/* Handle bar */}
          <View
            style={[
              styles.handleBar,
              { backgroundColor: theme.colors.border },
            ]}
          />

          {/* Header */}
          <View
            style={[
              styles.headerRow,
              { borderBottomColor: theme.colors.border },
            ]}
          >
            <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
              Filter Events
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close filter sheet"
              onPress={onClose}
              hitSlop={8}
            >
              <AppIcon name="close" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollArea}>
            {/* Event Status Section */}
            <View style={styles.section}>
              <AppText variant="label" color={theme.colors.textSecondary} style={styles.sectionLabel}>
                EVENT STATUS
              </AppText>
              <View style={styles.chipsRow}>
                <FilterChip
                  label="Published"
                  selected={selectedStatuses.includes('published')}
                  onPress={() => toggleStatus('published')}
                />
                <FilterChip
                  label="Live / Active"
                  selected={selectedStatuses.includes('active')}
                  onPress={() => toggleStatus('active')}
                />
              </View>
            </View>

            {/* Volunteer Support Options */}
            <View style={styles.section}>
              <AppText variant="label" color={theme.colors.textSecondary} style={styles.sectionLabel}>
                VOLUNTEER SUPPORT
              </AppText>
              <View style={styles.chipsRow}>
                <FilterChip
                  label="Meals Provided"
                  selected={meals}
                  onPress={() => setMeals(!meals)}
                />
                <FilterChip
                  label="Lodging Provided"
                  selected={lodging}
                  onPress={() => setLodging(!lodging)}
                />
                <FilterChip
                  label="Travel Support"
                  selected={travel}
                  onPress={() => setTravel(!travel)}
                />
              </View>
            </View>

            {/* Charity Categories */}
            <View style={styles.section}>
              <AppText variant="label" color={theme.colors.textSecondary} style={styles.sectionLabel}>
                CHARITY CATEGORIES
              </AppText>
              <View style={styles.categoriesWrap}>
                {CHARITY_CATEGORIES.map(category => (
                  <FilterChip
                    key={category.code}
                    label={category.label}
                    selected={selectedCategories.includes(category.code)}
                    onPress={() => toggleCategory(category.code)}
                  />
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View
            style={[
              styles.footerRow,
              {
                borderTopColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceRaised,
              },
            ]}
          >
            <View style={styles.footerButtonWrap}>
              <AppButton
                label="Clear all"
                variant="outline"
                onPress={handleReset}
                accessibilityLabel="Clear all filters"
              />
            </View>
            <View style={styles.footerButtonWrap}>
              <AppButton
                label="Apply filters"
                variant="primary"
                onPress={handleApply}
                accessibilityLabel="Apply filters"
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 30, 0.55)',
    justifyContent: 'flex-end',
  },
  backdropPressable: {
    flex: 1,
  },
  handleBar: {
    width: 44,
    height: 4,
    borderRadius: 9,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetContainer: {
    maxHeight: '80%',
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  scrollArea: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    marginBottom: 8,
    letterSpacing: 0.8,
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
  footerRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
  },
  footerButtonWrap: {
    flex: 1,
  },
});
