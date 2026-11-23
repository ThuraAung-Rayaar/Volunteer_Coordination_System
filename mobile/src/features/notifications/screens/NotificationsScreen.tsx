/**
 * @format
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppIcon,
  AppText,
  EmptyState,
  FilterChip,
  IconName,
  StatusBadge,
} from '../../../shared';
import { hexToRgba, useAppTheme } from '../../../theme';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  category: 'shifts' | 'system' | 'applications';
  timestamp: string;
  read: boolean;
  actionRoute?: 'MyAssignments' | 'MyApplications' | 'Events' | 'Profile';
  actionLabel?: string;
  icon: IconName;
}

const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-1',
    title: 'Shift Confirmed',
    message: 'Your shift for "Emergency Food Bank Packaging & Logistics" on Nov 28 is confirmed.',
    category: 'shifts',
    timestamp: '25m ago',
    read: false,
    actionRoute: 'MyAssignments',
    actionLabel: 'View Shift',
    icon: 'calendar',
  },
  {
    id: 'notif-2',
    title: 'Application Received',
    message: 'Your volunteer application for "Riverbank Environmental Cleanup" is pending review.',
    category: 'applications',
    timestamp: '2h ago',
    read: false,
    actionRoute: 'MyApplications',
    actionLabel: 'View Application',
    icon: 'check',
  },
  {
    id: 'notif-3',
    title: 'Identity Verification Approved',
    message: 'Your national ID verification has been reviewed and verified by administrators.',
    category: 'system',
    timestamp: '1d ago',
    read: true,
    actionRoute: 'Profile',
    actionLabel: 'View Profile',
    icon: 'info',
  },
  {
    id: 'notif-4',
    title: 'New Nearby Event Published',
    message: 'A new environmental relief mission has been published near Kamayut Township.',
    category: 'system',
    timestamp: '2d ago',
    read: true,
    actionRoute: 'Events',
    actionLabel: 'Explore Events',
    icon: 'compass',
  },
];

type FilterTab = 'all' | 'unread' | 'shifts' | 'system';

export interface NotificationsScreenProps
  extends Partial<MainDrawerScreenProps<'Notifications'>> {}

export function NotificationsScreen({
  navigation,
}: NotificationsScreenProps): React.JSX.Element {
  const { theme, isDark } = useAppTheme();
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const unreadCount = useMemo(
    () => notifications.filter(n => !n.read).length,
    [notifications],
  );

  const filteredNotifications = useMemo(() => {
    switch (activeTab) {
      case 'unread':
        return notifications.filter(n => !n.read);
      case 'shifts':
        return notifications.filter(n => n.category === 'shifts' || n.category === 'applications');
      case 'system':
        return notifications.filter(n => n.category === 'system');
      case 'all':
      default:
        return notifications;
    }
  }, [activeTab, notifications]);

  const handleMarkAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const handleMarkAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const handleClearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const handleNotificationPress = useCallback(
    (notification: AppNotification) => {
      handleMarkAsRead(notification.id);
      if (notification.actionRoute && navigation?.navigate) {
        navigation.navigate(notification.actionRoute);
      }
    },
    [handleMarkAsRead, navigation],
  );

  const renderNotificationItem = ({ item }: { item: AppNotification }) => {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Notification: ${item.title}, ${item.read ? 'Read' : 'Unread'}`}
        onPress={() => handleNotificationPress(item)}
        style={({ pressed }) => [
          styles.itemWrapper,
          pressed && { opacity: 0.92 },
        ]}
      >
        <AppCard
          style={[
            styles.card,
            !item.read && {
              borderColor: hexToRgba(theme.colors.primary, 0.35),
              backgroundColor: hexToRgba(theme.colors.primary, isDark ? 0.08 : 0.03),
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={styles.iconAndTitle}>
              <View
                style={[
                  styles.iconSquircle,
                  {
                    backgroundColor: item.read
                      ? theme.colors.surfaceRaised
                      : hexToRgba(theme.colors.primary, isDark ? 0.25 : 0.12),
                    borderColor: item.read
                      ? theme.colors.border
                      : hexToRgba(theme.colors.primary, 0.3),
                  },
                ]}
              >
                <AppIcon
                  name={item.icon}
                  size={16}
                  color={item.read ? theme.colors.textSecondary : theme.colors.primary}
                />
              </View>
              <View style={styles.titleColumn}>
                <AppText
                  variant="body"
                  weight={item.read ? 'semibold' : 'extrabold'}
                  color={theme.colors.textPrimary}
                  numberOfLines={1}
                >
                  {item.title}
                </AppText>
                <AppText variant="caption" color={theme.colors.muted}>
                  {item.timestamp}
                </AppText>
              </View>
            </View>

            {!item.read ? (
              <View
                style={[
                  styles.unreadDot,
                  { backgroundColor: theme.colors.primary },
                ]}
              />
            ) : null}
          </View>

          <AppText
            variant="body"
            color={theme.colors.textSecondary}
            style={styles.messageText}
          >
            {item.message}
          </AppText>

          <View style={styles.footerRow}>
            {item.actionLabel ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.actionLabel}
                onPress={() => handleNotificationPress(item)}
                hitSlop={6}
                style={[
                  styles.actionPill,
                  {
                    backgroundColor: hexToRgba(theme.colors.primary, isDark ? 0.2 : 0.1),
                    borderColor: hexToRgba(theme.colors.primary, 0.25),
                  },
                ]}
              >
                <AppText
                  variant="caption"
                  weight="bold"
                  color={theme.colors.primary}
                >
                  {item.actionLabel} →
                </AppText>
              </Pressable>
            ) : <View />}

            {!item.read ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mark as read"
                onPress={() => handleMarkAsRead(item.id)}
                hitSlop={8}
              >
                <AppText variant="caption" color={theme.colors.muted}>
                  Mark read
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </AppCard>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title="Notifications"
        subtitle={
          unreadCount > 0
            ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}`
            : 'All caught up'
        }
        showNotificationBell={false}
        onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
        onBackPress={
          navigation && !navigation.openDrawer ? () => navigation.goBack() : undefined
        }
      />

      {/* Filter Tabs & Bulk Actions */}
      <View
        style={[
          styles.filtersContainer,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.chipsRow}>
          <FilterChip
            label="All"
            selected={activeTab === 'all'}
            onPress={() => setActiveTab('all')}
          />
          <FilterChip
            label={`Unread (${unreadCount})`}
            selected={activeTab === 'unread'}
            onPress={() => setActiveTab('unread')}
          />
          <FilterChip
            label="Shifts"
            selected={activeTab === 'shifts'}
            onPress={() => setActiveTab('shifts')}
          />
          <FilterChip
            label="System"
            selected={activeTab === 'system'}
            onPress={() => setActiveTab('system')}
          />
        </View>

        {unreadCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
            onPress={handleMarkAllAsRead}
            hitSlop={8}
            style={styles.markAllButton}
          >
            <AppText variant="caption" weight="semibold" color={theme.colors.primary}>
              Mark all read
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={filteredNotifications}
        keyExtractor={item => item.id}
        renderItem={renderNotificationItem}
        contentContainerStyle={[
          styles.listContent,
          filteredNotifications.length === 0 && styles.emptyListContent,
        ]}
        ListEmptyComponent={
          <EmptyState
            title="No Notifications"
            description={
              activeTab === 'unread'
                ? 'You have read all your notifications!'
                : 'No updates or alerts at this time.'
            }
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  markAllButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  itemWrapper: {
    marginBottom: 4,
  },
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconAndTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconSquircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleColumn: {
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  messageText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
});
