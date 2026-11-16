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

export interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({
  title,
  actionLabel,
  onActionPress,
  style,
}: SectionHeaderProps): React.JSX.Element {
  const { theme } = useAppTheme();

  return (
    <View
      style={[
        styles.container,
        {
          marginBottom: 8,
          marginTop: 14,
        },
        style,
      ]}
    >
      <AppText
        variant="title"
        weight="extrabold"
        color={theme.colors.textPrimary}
        style={styles.title}
      >
        {title}
      </AppText>

      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onActionPress}
          hitSlop={8}
          style={styles.actionPressable}
        >
          <AppText
            variant="label"
            color={theme.colors.primary}
            weight="bold"
            style={styles.actionText}
          >
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  title: {
    fontSize: 15,
    letterSpacing: -0.3,
  },
  actionPressable: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  actionText: {
    fontSize: 11,
  },
});
