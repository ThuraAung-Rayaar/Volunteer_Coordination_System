/**
 * @format
 */

import React, { useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { EventRepository } from '../../../data/contracts/eventRepository';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import { AppHeader, AppIcon, AppText } from '../../../shared';
import { hexToRgba, useAppTheme } from '../../../theme';
import { MyApplicationsScreen } from './MyApplicationsScreen';
import { MyAssignmentsScreen } from './MyAssignmentsScreen';

export type VolunteerWorkspaceTab = 'applications' | 'assignments';

export interface VolunteerWorkspaceScreenProps
  extends Partial<MainDrawerScreenProps<'VolunteerWorkspace'>> {
  repository?: EventRepository;
  initialTab?: VolunteerWorkspaceTab;
}

const SWIPE_THRESHOLD = 70;

export function VolunteerWorkspaceScreen({
  navigation,
  route,
  repository,
  initialTab = 'applications',
}: VolunteerWorkspaceScreenProps): React.JSX.Element {
  const { theme, isDark } = useAppTheme();
  const [activeTab, setActiveTab] = useState<VolunteerWorkspaceTab>(
    route?.params?.initialTab ?? initialTab,
  );

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return (
          Math.abs(gestureState.dx) > 30 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.8
        );
      },
      onPanResponderRelease: (_, gestureState) => {
        if (
          Math.abs(gestureState.dx) > SWIPE_THRESHOLD &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5
        ) {
          if (gestureState.dx < -SWIPE_THRESHOLD && activeTab === 'applications') {
            // Long swipe left -> Switch to Assignments
            setActiveTab('assignments');
          } else if (gestureState.dx > SWIPE_THRESHOLD && activeTab === 'assignments') {
            // Long swipe right -> Switch to Applications
            setActiveTab('applications');
          }
        }
      },
    }),
  ).current;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title="Volunteer Workspace"
        subtitle={
          activeTab === 'applications'
            ? 'My Applications & Requests'
            : 'My Confirmed Shifts & Assignments'
        }
        onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
      />

      {/* Segmented Tab Switcher */}
      <View
        style={[
          styles.tabContainer,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.segmentTrack,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Applications tab"
            accessibilityState={{ selected: activeTab === 'applications' }}
            onPress={() => setActiveTab('applications')}
            style={[
              styles.segmentButton,
              activeTab === 'applications' && [
                styles.segmentButtonActive,
                {
                  backgroundColor: theme.colors.primary,
                },
              ],
            ]}
          >
            <AppIcon
              name="check"
              size={15}
              color={activeTab === 'applications' ? '#FFFFFF' : theme.colors.textSecondary}
            />
            <AppText
              variant="label"
              weight="bold"
              color={
                activeTab === 'applications'
                  ? '#FFFFFF'
                  : theme.colors.textSecondary
              }
              style={styles.tabLabel}
            >
              My Applications
            </AppText>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Assignments tab"
            accessibilityState={{ selected: activeTab === 'assignments' }}
            onPress={() => setActiveTab('assignments')}
            style={[
              styles.segmentButton,
              activeTab === 'assignments' && [
                styles.segmentButtonActive,
                {
                  backgroundColor: theme.colors.primary,
                },
              ],
            ]}
          >
            <AppIcon
              name="calendar"
              size={15}
              color={activeTab === 'assignments' ? '#FFFFFF' : theme.colors.textSecondary}
            />
            <AppText
              variant="label"
              weight="bold"
              color={
                activeTab === 'assignments'
                  ? '#FFFFFF'
                  : theme.colors.textSecondary
              }
              style={styles.tabLabel}
            >
              My Assignments
            </AppText>
          </Pressable>
        </View>
      </View>

      {/* Main Content Area with Swipe Gesture Detection */}
      <View style={styles.contentArea} {...panResponder.panHandlers}>
        {activeTab === 'applications' ? (
          <MyApplicationsScreen
            navigation={navigation as any}
            repository={repository}
            hideHeader
          />
        ) : (
          <MyAssignmentsScreen
            navigation={navigation as any}
            repository={repository}
            hideHeader
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  segmentTrack: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
    gap: 6,
  },
  segmentButtonActive: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  tabLabel: {
    fontSize: 13,
  },
  contentArea: {
    flex: 1,
  },
});
