/**
 * @format
 */

import React, { useRef } from 'react';
import {
  PanResponder,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import type { CoordinatorIslandTab } from './CoordinatorDynamicIsland';

export interface CoordinatorSwipeWrapperProps {
  currentTab: CoordinatorIslandTab;
  navigation?: any;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const TAB_ORDER: CoordinatorIslandTab[] = [
  'dashboard',
  'applications',
  'assignments',
  'attendance',
];

const ROUTE_MAP: Record<CoordinatorIslandTab, string> = {
  dashboard: 'CoordinatorWorkspace',
  applications: 'CoordinatorApplications',
  assignments: 'CoordinatorAssignments',
  attendance: 'CoordinatorAttendance',
};

const SWIPE_THRESHOLD = 70; // Minimum horizontal distance for long swipe

export function CoordinatorSwipeWrapper({
  currentTab,
  navigation,
  children,
  style,
}: CoordinatorSwipeWrapperProps): React.JSX.Element {
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Activate on clear horizontal movement that dominates vertical scrolling
        return (
          Math.abs(gestureState.dx) > 25 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.8
        );
      },
      onPanResponderRelease: (_, gestureState) => {
        if (
          Math.abs(gestureState.dx) > SWIPE_THRESHOLD &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5
        ) {
          const currentIndex = TAB_ORDER.indexOf(currentTab);
          if (currentIndex === -1 || !navigation) return;

          if (gestureState.dx < -SWIPE_THRESHOLD) {
            // Long swipe left -> Next tab
            if (currentIndex < TAB_ORDER.length - 1) {
              const nextTab = TAB_ORDER[currentIndex + 1];
              navigation.navigate(ROUTE_MAP[nextTab]);
            }
          } else if (gestureState.dx > SWIPE_THRESHOLD) {
            // Long swipe right -> Previous tab
            if (currentIndex > 0) {
              const prevTab = TAB_ORDER[currentIndex - 1];
              navigation.navigate(ROUTE_MAP[prevTab]);
            }
          }
        }
      },
    }),
  ).current;

  return (
    <View style={[styles.container, style]} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
