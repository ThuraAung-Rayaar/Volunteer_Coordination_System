/**
 * @format
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme';
import { AppButton } from './AppButton';
import { AppIcon, IconName } from './AppIcon';
import { AppText } from './AppText';

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: IconName;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  title,
  description,
  icon = 'info',
  actionLabel,
  onActionPress,
  style,
}: EmptyStateProps): React.JSX.Element {
  const { theme } = useAppTheme();

  return (
    <View
      style={[
        styles.container,
        {
          padding: 24,
          backgroundColor: theme.colors.surface,
          borderRadius: 20,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.iconSquircle,
          {
            backgroundColor: theme.colors.surfaceRaised,
            borderColor: theme.colors.border,
            borderRadius: 16,
          },
        ]}
      >
        <AppIcon
          name={icon}
          size={22}
          color={theme.colors.muted}
        />
      </View>

      <AppText
        variant="title"
        weight="extrabold"
        color={theme.colors.textPrimary}
        style={styles.title}
      >
        {title}
      </AppText>

      <AppText
        variant="body"
        color={theme.colors.textSecondary}
        style={styles.description}
      >
        {description}
      </AppText>

      {actionLabel && onActionPress ? (
        <AppButton
          label={actionLabel}
          onPress={onActionPress}
          variant="secondary"
          style={styles.actionButton}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    borderWidth: 1,
    marginVertical: 12,
  },
  iconSquircle: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 14,
  },
  title: {
    textAlign: 'center',
    marginBottom: 6,
    fontSize: 16,
  },
  description: {
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 18,
  },
  actionButton: {
    minWidth: 140,
  },
});
