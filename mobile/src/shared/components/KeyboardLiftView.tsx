/**
 * @format
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  KeyboardEvent,
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

export interface KeyboardLiftViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Extra vertical offset on iOS KeyboardAvoidingView. */
  keyboardVerticalOffset?: number;
  /** True when rendered inside a React Native Modal where Android adjustResize may not apply. */
  inModal?: boolean;
  /** Extra spacing (px) above the keyboard when visible. */
  extraPaddingWhenOpen?: number;
  /** Optional callback fired when keyboard opens. */
  onKeyboardShow?: () => void;
}

/**
 * Cross-platform keyboard-aware container that lifts lower TextInputs above
 * the soft keyboard on both iOS and Android (including edge-to-edge and Modals)
 * without double-padding when the OS already resizes the window.
 */
export function KeyboardLiftView({
  children,
  style,
  keyboardVerticalOffset = 0,
  inModal = false,
  extraPaddingWhenOpen = 0,
  onKeyboardShow,
}: KeyboardLiftViewProps): React.JSX.Element {
  const containerRef = useRef<React.ComponentRef<typeof View> | null>(null);
  const [androidKeyboardInset, setAndroidKeyboardInset] = useState<number>(0);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const handleShow = (event: KeyboardEvent) => {
      onKeyboardShow?.();
      const keyboardHeight = event?.endCoordinates?.height ?? 0;
      const keyboardTopY = event?.endCoordinates?.screenY ?? 0;

      const node = containerRef.current as unknown as {
        measureInWindow?: (
          cb: (x: number, y: number, width: number, height: number) => void,
        ) => void;
      } | null;

      if (inModal && keyboardHeight > 0) {
        setAndroidKeyboardInset(keyboardHeight * 0.45);
      }

      if (node && typeof node.measureInWindow === 'function' && keyboardTopY > 0) {
        node.measureInWindow((_x, y, _w, height) => {
          if (height > 0) {
            const containerBottomY = y + height + androidKeyboardInset;
            const overlap = Math.max(0, containerBottomY - keyboardTopY);
            const nextInset =
              overlap > 0
                ? overlap + extraPaddingWhenOpen
                : inModal && keyboardHeight > 0
                  ? keyboardHeight * 0.45
                  : 0;
            setAndroidKeyboardInset(nextInset);
          }
        });
      }
    };

    const handleHide = () => {
      setAndroidKeyboardInset(0);
    };

    const showSub = Keyboard.addListener('keyboardDidShow', handleShow);
    const hideSub = Keyboard.addListener('keyboardDidHide', handleHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [androidKeyboardInset, extraPaddingWhenOpen, inModal, onKeyboardShow]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !onKeyboardShow) {
      return;
    }
    const sub = Keyboard.addListener('keyboardWillShow', () => {
      onKeyboardShow();
    });
    return () => sub.remove();
  }, [onKeyboardShow]);

  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView
        style={[styles.flexOne, style]}
        behavior="padding"
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {children}
      </KeyboardAvoidingView>
    );
  }

  return (
    <View
      ref={containerRef}
      style={[
        styles.flexOne,
        style,
        androidKeyboardInset > 0 ? { paddingBottom: androidKeyboardInset } : null,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
});
