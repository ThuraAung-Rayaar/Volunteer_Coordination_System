/**
 * @format
 */

import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { useCurrentUser } from '../app/UserContext';
import { isMockMode } from '../app/configuration/dataMode';
import { AppIcon, AppText, IconName, StatusBadge } from '../shared';
import { hexToRgba, useAppTheme } from '../theme';
import type { RouteName } from './routeNames';

interface DrawerItemConfig {
  name: RouteName;
  label: string;
  icon: IconName;
}

const MAIN_ITEMS: DrawerItemConfig[] = [
  { name: 'Dashboard', label: 'Dashboard', icon: 'home' },
  { name: 'Events', label: 'Events', icon: 'compass' },
  { name: 'Friends', label: 'Friends', icon: 'user' },
];

const ACCOUNT_ITEMS: DrawerItemConfig[] = [
  {
    name: 'VolunteerWorkspace',
    label: 'Volunteer Workspace',
    icon: 'brief',
  },
  { name: 'Profile', label: 'Profile', icon: 'user' },
  { name: 'Availability', label: 'Availability', icon: 'clock' },
  {
    name: 'VerificationCoordinatorStatus',
    label: 'Verification & Status',
    icon: 'info',
  },
];

const PREFERENCE_ITEMS: DrawerItemConfig[] = [
  { name: 'Notifications', label: 'Notifications', icon: 'bell' },
  { name: 'Settings', label: 'Settings', icon: 'refresh' },
];

export function MainDrawerContent({
  state,
  navigation,
}: DrawerContentComponentProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useAppTheme();
  const { currentUser, isCoordinator, switchUserPreset } = useCurrentUser();

  const currentRouteName = state.routes[state.index]?.name;

  const renderDrawerItem = (item: DrawerItemConfig) => {
    const isSelected = currentRouteName === item.name;

    const selectedThemeStyle = isSelected
      ? {
          backgroundColor: hexToRgba(theme.colors.primary, isDark ? 0.20 : 0.12),
        }
      : undefined;

    return (
      <Pressable
        key={item.name}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: isSelected }}
        onPress={() => navigation.navigate(item.name)}
        style={({ pressed }) => [
          styles.drawerItem,
          {
            borderRadius: 12,
            paddingVertical: 10,
            paddingHorizontal: 14,
            opacity: pressed ? 0.85 : 1,
          },
          selectedThemeStyle,
        ]}
      >
        <View
          style={[
            styles.itemIconContainer,
            {
              backgroundColor: isSelected
                ? theme.colors.primary
                : theme.colors.surfaceRaised,
              borderRadius: 10,
            },
          ]}
        >
          <AppIcon
            name={item.icon}
            size={16}
            color={isSelected ? '#FFFFFF' : theme.colors.textSecondary}
          />
        </View>
        <AppText
          variant="body"
          weight={isSelected ? 'bold' : 'medium'}
          color={isSelected ? theme.colors.primary : theme.colors.textPrimary}
          style={styles.itemLabel}
        >
          {item.label}
        </AppText>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.drawerContainer,
        {
          backgroundColor: theme.colors.surface,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {/* Header Profile Section */}
      <View
        style={[
          styles.headerSection,
          {
            borderBottomColor: theme.colors.border,
            padding: 16,
          },
        ]}
      >
        <View
          style={[
            styles.avatarSquircle,
            {
              backgroundColor: hexToRgba(theme.colors.primary, isDark ? 0.22 : 0.12),
              borderColor: hexToRgba(theme.colors.primary, 0.25),
              borderRadius: 16,
              marginBottom: 10,
            },
          ]}
        >
          <AppIcon name="user" size={24} color={theme.colors.primary} />
        </View>

        <AppText variant="title" weight="extrabold" color={theme.colors.textPrimary}>
          {currentUser.displayName}
        </AppText>

        <AppText
          variant="caption"
          color={theme.colors.textSecondary}
          style={styles.emailMargin}
        >
          {currentUser.phone ?? currentUser.email ?? 'No phone on file'}
        </AppText>

        <View style={styles.badgeRow}>
          <StatusBadge status="emerald" label="Active Volunteer" />
          {isCoordinator ? (
            <StatusBadge status="sky" label="Approved Coordinator" />
          ) : null}
        </View>
      </View>

      {/* Destination Sections */}
      <ScrollView
        contentContainerStyle={styles.scrollList}
        showsVerticalScrollIndicator={false}
      >
        {/* Main Group */}
        <AppText
          variant="eyebrow"
          color={theme.colors.muted}
          style={[styles.sectionHeading, { paddingHorizontal: 16 }]}
        >
          MAIN NAVIGATION
        </AppText>
        <View style={styles.itemGroup}>{MAIN_ITEMS.map(renderDrawerItem)}</View>

        {/* My Account Group */}
        <AppText
          variant="eyebrow"
          color={theme.colors.muted}
          style={[styles.sectionHeading, { paddingHorizontal: 16 }]}
        >
          MY ACCOUNT
        </AppText>
        <View style={styles.itemGroup}>
          {ACCOUNT_ITEMS.map(renderDrawerItem)}
        </View>

        {/* Coordinator Group */}
        {isCoordinator ? (
          <>
            <AppText
              variant="eyebrow"
              color={theme.colors.primary}
              style={[styles.sectionHeading, { paddingHorizontal: 16 }]}
            >
              COORDINATOR
            </AppText>
            <View style={styles.itemGroup}>
              {renderDrawerItem({
                name: 'CoordinatorWorkspace',
                label: 'Coordinator Workspace',
                icon: 'brief',
              })}
            </View>
          </>
        ) : null}

        {/* Preferences Group */}
        <AppText
          variant="eyebrow"
          color={theme.colors.muted}
          style={[styles.sectionHeading, { paddingHorizontal: 16 }]}
        >
          PREFERENCES
        </AppText>
        <View style={styles.itemGroup}>
          {PREFERENCE_ITEMS.map(renderDrawerItem)}
        </View>
      </ScrollView>

      {/* Bottom QA Profile Switcher — Mock mode only */}
      {typeof __DEV__ !== 'undefined' && __DEV__ && isMockMode() ? (
        <View
          style={[
            styles.footerSection,
            {
              borderTopColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceRaised,
              padding: 14,
            },
          ]}
        >
          <AppText
            variant="eyebrow"
            color={theme.colors.muted}
            style={styles.qaFooterLabel}
          >
            QA DEMO PROFILE SWITCHER
          </AppText>

          <View style={styles.qaButtonsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Switch to ordinary volunteer"
              onPress={() => switchUserPreset('volunteer')}
              style={[
                styles.qaButton,
                {
                  backgroundColor: !isCoordinator
                    ? theme.colors.primary
                    : theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: 10,
                },
              ]}
            >
              <AppText
                variant="label"
                weight="bold"
                color={
                  !isCoordinator
                    ? '#FFFFFF'
                    : theme.colors.textPrimary
                }
              >
                Volunteer
              </AppText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Switch to approved coordinator"
              onPress={() => switchUserPreset('coordinator')}
              style={[
                styles.qaButton,
                {
                  backgroundColor: isCoordinator
                    ? theme.colors.primary
                    : theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: 10,
                },
              ]}
            >
              <AppText
                variant="label"
                weight="bold"
                color={
                  isCoordinator
                    ? '#FFFFFF'
                    : theme.colors.textPrimary
                }
              >
                Coordinator
              </AppText>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  drawerContainer: {
    flex: 1,
  },
  headerSection: {
    borderBottomWidth: 1,
  },
  avatarSquircle: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  emailMargin: {
    marginTop: 2,
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  scrollList: {
    paddingVertical: 12,
  },
  sectionHeading: {
    marginTop: 12,
    marginBottom: 6,
  },
  itemGroup: {
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  itemIconContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  itemLabel: {
    fontSize: 13,
  },
  footerSection: {
    borderTopWidth: 1,
  },
  qaFooterLabel: {
    marginBottom: 8,
  },
  qaButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  qaButton: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
