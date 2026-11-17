/**
 * @format
 */

import React, { useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { useAppTheme } from '../../theme';
import { AppIcon, IconName } from './AppIcon';
import { AppText } from './AppText';

export interface AppInputProps
  extends Omit<TextInputProps, 'onChangeText' | 'style'> {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  helperText?: string;
  rightIcon?: IconName;
  style?: StyleProp<ViewStyle>;
}

export function AppInput({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  helperText,
  rightIcon,
  style,
  onFocus,
  onBlur,
  ...restProps
}: AppInputProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const [isFocused, setIsFocused] = useState(false);

  const hasError = Boolean(error);

  let borderColor = theme.colors.border;
  if (hasError) {
    borderColor = theme.colors.danger;
  } else if (isFocused) {
    borderColor = theme.colors.primary;
  }

  return (
    <View style={[styles.container, style]}>
      {label ? (
        <AppText
          variant="label"
          color={hasError ? theme.colors.danger : theme.colors.muted}
          style={styles.label}
        >
          {label}
        </AppText>
      ) : null}

      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: theme.colors.surfaceRaised,
            borderColor,
            borderRadius: theme.radius.input ?? 12,
            paddingHorizontal: 14,
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.muted}
          onFocus={e => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={e => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.nativeInput,
            {
              color: theme.colors.textPrimary,
              fontSize: 13,
              fontWeight: '600',
            },
          ]}
          {...restProps}
        />

        {rightIcon ? (
          <AppIcon
            name={rightIcon}
            size={16}
            color={theme.colors.primary}
            style={styles.rightIcon}
          />
        ) : null}
      </View>

      {hasError ? (
        <AppText
          variant="caption"
          color={theme.colors.danger}
          style={styles.errorText}
        >
          {error}
        </AppText>
      ) : helperText ? (
        <AppText
          variant="caption"
          color={theme.colors.textSecondary}
          style={styles.helperText}
        >
          {helperText}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  inputWrapper: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  nativeInput: {
    flex: 1,
    paddingVertical: 0,
    includeFontPadding: false,
  },
  rightIcon: {
    marginLeft: 8,
  },
  errorText: {
    marginTop: 4,
    fontSize: 11,
  },
  helperText: {
    marginTop: 4,
    fontSize: 11,
  },
});
