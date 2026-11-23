/**
 * @format
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, IconName } from '../../../shared/components/AppIcon';
import { AppText } from '../../../shared/components/AppText';
import { hexToRgba, useAppTheme } from '../../../theme';

export type CoordinatorIslandTab =
  | 'dashboard'
  | 'applications'
  | 'assignments'
  | 'attendance';

export interface CoordinatorDynamicIslandProps {
  activeTab: CoordinatorIslandTab;
  navigation?: any;
  pendingApplicationsCount?: number;
  acceptedApplicantsCount?: number;
  checkedInTodayCount?: number;
}

interface IslandTabConfig {
  key: CoordinatorIslandTab;
  label: string;
  icon: IconName;
  routeName: string;
  countKey?: 'pending' | 'accepted' | 'checkedIn';
}

const TABS: IslandTabConfig[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: 'home',
    routeName: 'CoordinatorWorkspace',
  },
  {
    key: 'applications',
    label: 'Applications',
    icon: 'user',
    routeName: 'CoordinatorApplications',
    countKey: 'pending',
  },
  {
    key: 'assignments',
    label: 'Assignments',
    icon: 'brief',
    routeName: 'CoordinatorAssignments',
    countKey: 'accepted',
  },
  {
    key: 'attendance',
    label: 'Attendance',
    icon: 'clock',
    routeName: 'CoordinatorAttendance',
    countKey: 'checkedIn',
  },
];

export function CoordinatorDynamicIsland({
  activeTab,
  navigation,
  pendingApplicationsCount = 0,
  acceptedApplicantsCount = 0,
  checkedInTodayCount = 0,
}: CoordinatorDynamicIslandProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();

  const getBadgeCount = (countKey?: 'pending' | 'accepted' | 'checkedIn'): number => {
    if (countKey === 'pending') return pendingApplicationsCount;
    if (countKey === 'accepted') return acceptedApplicantsCount;
    if (countKey === 'checkedIn') return checkedInTodayCount;
    return 0;
  };

  const handleTabPress = (tab: IslandTabConfig) => {
    if (activeTab === tab.key) return;
    navigation?.navigate?.(tab.routeName);
  };

  return (
    <View
      style={[
        styles.islandWrapper,
        {
          bottom: Math.max(insets.bottom, 12),
        },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.islandContainer,
          {
            backgroundColor: '#0F172A',
            borderColor: 'rgba(255, 255, 255, 0.15)',
          },
        ]}
        accessibilityRole="tablist"
      >
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          const badgeCount = getBadgeCount(tab.countKey);

          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityLabel={`${tab.label} tab`}
              accessibilityState={{ selected: isActive }}
              onPress={() => handleTabPress(tab)}
              style={[
                styles.tabPill,
                isActive && [
                  styles.activeTabPill,
                  {
                    backgroundColor: theme.colors.primary,
                  },
                ],
              ]}
              hitSlop={6}
            >
              <View style={styles.iconWrap}>
                <AppIcon
                  name={tab.icon}
                  size={16}
                  color={isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.65)'}
                />
                {!isActive && badgeCount > 0 ? (
                  <View style={styles.badgeDot}>
                    <AppText style={styles.badgeText}>
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </AppText>
                  </View>
                ) : null}
              </View>

              {isActive ? (
                <AppText
                  variant="caption"
                  weight="extrabold"
                  color="#FFFFFF"
                  style={styles.activeLabel}
                >
                  {tab.label}
                </AppText>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  islandWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99,
  },
  islandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 32,
    borderWidth: 1.2,
    paddingVertical: 5,
    paddingHorizontal: 6,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.50,
    shadowRadius: 18,
    elevation: 12,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 24,
    gap: 6,
  },
  activeTabPill: {
    paddingHorizontal: 14,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.40,
    shadowRadius: 8,
    elevation: 4,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDot: {
    position: 'absolute',
    top: -5,
    right: -8,
    backgroundColor: '#EF4444',
    borderRadius: 7,
    minWidth: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 10,
  },
  activeLabel: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
