/**
 * @format
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { hexToRgba, useAppTheme } from '../../theme';
import { AppIcon, IconName } from './AppIcon';
import { AppText } from './AppText';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'danger'
  | 'warning'
  | 'ghost';

export interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: IconName;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  leftIcon,
  accessibilityLabel,
  style,
}: AppButtonProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const isInteractive = !disabled && !loading;

  // Resolve colors and elevation based on variant
  let backgroundColor: string;
  let textColor: string;
  let borderColor: string = 'transparent';
  let elevationStyle: ViewStyle = {};

  switch (variant) {
    case 'secondary':
      backgroundColor = theme.colors.surfaceRaised;
      textColor = theme.colors.textPrimary;
      borderColor = theme.colors.border;
      break;
    case 'outline':
      backgroundColor = 'transparent';
      textColor = theme.colors.primary;
      borderColor = theme.colors.primary;
      break;
    case 'warning':
      backgroundColor = theme.colors.warning;
      textColor = '#FFFFFF';
      borderColor = 'transparent';
      break;
    case 'danger':
      backgroundColor = theme.colors.danger;
      textColor = '#FFFFFF';
      borderColor = 'transparent';
      break;
    case 'ghost':
      backgroundColor = 'transparent';
      textColor = theme.colors.textPrimary;
      break;
    case 'primary':
    default:
      backgroundColor = theme.colors.primary;
      textColor = '#FFFFFF';
      elevationStyle = {
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
        elevation: 4,
      };
      break;
  }

  if (disabled) {
    backgroundColor =
      variant === 'outline' || variant === 'ghost'
        ? 'transparent'
        : theme.colors.surfaceRaised;
    textColor = theme.colors.muted;
    borderColor = variant === 'outline' ? theme.colors.border : 'transparent';
    elevationStyle = {};
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !isInteractive }}
      disabled={!isInteractive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.buttonBase,
        {
          backgroundColor,
          borderColor,
          borderRadius: theme.radius.button ?? 14,
          paddingVertical: 12,
          paddingHorizontal: 16,
          opacity: pressed && isInteractive ? 0.88 : 1,
        },
        elevationStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={textColor}
          accessibilityLabel="Loading"
        />
      ) : (
        <View style={styles.contentRow}>
          {leftIcon ? (
            <AppIcon
              name={leftIcon}
              size={15}
              color={textColor}
              style={{ marginRight: 8 }}
            />
          ) : null}
          <AppText
            variant="label"
            color={textColor}
            weight="bold"
            style={styles.buttonLabel}
          >
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  buttonBase: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
});
