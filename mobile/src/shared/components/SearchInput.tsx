/**
 * @format
 */

import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { useAppTheme } from '../../theme';
import { AppIcon } from './AppIcon';

export interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onClear?: () => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}

export function SearchInput({
  value,
  onChangeText,
  onClear,
  placeholder = 'Search...',
  style,
}: SearchInputProps): React.JSX.Element {
  const { theme } = useAppTheme();

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else {
      onChangeText('');
    }
  };

  const showClearButton = value.length > 0;

  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.input ?? 12,
          paddingHorizontal: 14,
        },
        style,
      ]}
    >
      <AppIcon
        name="search"
        size={16}
        color={theme.colors.muted}
        style={{ marginRight: 10 }}
      />

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityRole="search"
        style={[
          styles.nativeInput,
          {
            color: theme.colors.textPrimary,
            fontSize: 13,
            fontWeight: '600',
          },
        ]}
      />

      {showClearButton ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search input"
          onPress={handleClear}
          hitSlop={8}
          style={styles.clearButton}
        >
          <AppIcon
            name="close"
            size={13}
            color={theme.colors.muted}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    width: '100%',
  },
  nativeInput: {
    flex: 1,
    paddingVertical: 0,
    includeFontPadding: false,
  },
  clearButton: {
    padding: 6,
    marginLeft: 6,
  },
});
