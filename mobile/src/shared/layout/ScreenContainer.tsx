/**
 * @format
 */

import React from 'react';
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme';

export interface ScreenContainerProps extends ViewProps {
  children: React.ReactNode;
  scroll?: boolean;
  applySafeAreaInsets?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export function ScreenContainer({
  children,
  scroll = false,
  applySafeAreaInsets = true,
  contentContainerStyle,
  style,
  ...restProps
}: ScreenContainerProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();

  const insetsStyle: ViewStyle | undefined = applySafeAreaInsets
    ? {
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }
    : undefined;

  const dynamicBaseStyle: ViewStyle = {
    backgroundColor: theme.colors.background,
  };

  if (scroll) {
    return (
      <ScrollView
        style={[styles.container, dynamicBaseStyle, insetsStyle, style]}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: 16, paddingVertical: 12 },
          contentContainerStyle,
        ]}
        showsVerticalScrollIndicator={false}
        {...restProps}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View
      style={[
        styles.container,
        dynamicBaseStyle,
        insetsStyle,
        { paddingHorizontal: 16, paddingVertical: 8 },
        style,
      ]}
      {...restProps}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
