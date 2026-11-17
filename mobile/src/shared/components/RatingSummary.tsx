/**
 * @format
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme';
import { AppIcon } from './AppIcon';
import { AppText } from './AppText';

export interface RatingSummaryProps {
  average: number | null | undefined;
  count: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Displays aggregate volunteer rating average and feedback count.
 * Displays "No ratings yet" when average is null or count is 0 without fabricating score data.
 */
export function RatingSummary({
  average,
  count,
  style,
}: RatingSummaryProps): React.JSX.Element {
  const { theme } = useAppTheme();

  const hasRatings =
    average !== null &&
    average !== undefined &&
    !isNaN(average) &&
    count > 0;

  if (!hasRatings) {
    return (
      <View
        accessibilityRole="text"
        accessibilityLabel="No ratings yet"
        style={[styles.container, style]}
      >
        <AppText
          variant="caption"
          color={theme.colors.textSecondary}
          style={styles.emptyText}
        >
          No ratings yet
        </AppText>
      </View>
    );
  }

  const formattedAverage = average.toFixed(1);
  const reviewText = count === 1 ? 'review' : 'reviews';
  const accessibilityLabel = `Rating: ${formattedAverage} out of 5 based on ${count} ${reviewText}`;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      style={[styles.container, style]}
    >
      <AppIcon
        name="star"
        size={16}
        color={theme.colors.accent}
        style={{ marginRight: theme.spacing.xs }}
      />
      <AppText
        variant="body"
        weight="bold"
        color={theme.colors.textPrimary}
        style={{ marginRight: theme.spacing.xs }}
      >
        {formattedAverage}
      </AppText>
      <AppText
        variant="caption"
        color={theme.colors.textSecondary}
      >
        ({count} {reviewText})
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  emptyText: {
    fontStyle: 'italic',
  },
});
