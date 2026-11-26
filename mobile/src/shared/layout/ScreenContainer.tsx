/**
 * @format
 */

import React, { useEffect, useRef } from 'react';
import {
  Keyboard,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme';
import { KeyboardLiftView } from '../components/KeyboardLiftView';

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

  const scrollDragCount = useRef(0);

  useEffect(() => {
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      scrollDragCount.current = 0;
    });
    return () => {
      hideSub.remove();
    };
  }, []);

  const handleScrollBeginDrag = (e: any) => {
    scrollDragCount.current += 1;
    // Dismiss keyboard after 4 intentional scroll gestures, not on the first single swipe
    if (scrollDragCount.current >= 4) {
      Keyboard.dismiss();
      scrollDragCount.current = 0;
    }
    if (typeof (restProps as any).onScrollBeginDrag === 'function') {
      (restProps as any).onScrollBeginDrag(e);
    }
  };

  if (scroll) {
    return (
      <KeyboardLiftView style={styles.container}>
        <ScrollView
          style={[styles.container, dynamicBaseStyle, insetsStyle, style]}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: 16, paddingVertical: 12 },
            contentContainerStyle,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          onScrollBeginDrag={handleScrollBeginDrag}
          {...restProps}
        >
          {children}
        </ScrollView>
      </KeyboardLiftView>
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
