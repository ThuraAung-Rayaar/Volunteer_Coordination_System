/**
 * @format
 */

import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme';
import { AppIcon } from '../components/AppIcon';
import { AppText } from '../components/AppText';

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onMenuPress?: () => void;
  onBackPress?: () => void;
  rightAction?: React.ReactNode;
  showNotificationBell?: boolean;
  onNotificationPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * CommonGround Mobile Top Bar (.bar)
 * Direct implementation of mobile-ui-style.html:
 * Squircle 40x40 icon buttons (radius 13), 17px bold title (-0.02em letter spacing),
 * 11px muted subtitle, notification bell with rose indicator dot.
 */
export function AppHeader({
  title,
  subtitle,
  onMenuPress,
  onBackPress,
  rightAction,
  showNotificationBell = true,
  onNotificationPress,
  style,
}: AppHeaderProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const insets = React.useContext(SafeAreaInsetsContext);
  const topInset = insets?.top ?? 0;

  return (
    <View
      accessibilityRole="header"
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.border,
          paddingHorizontal: 16,
          paddingTop: topInset > 0 ? topInset + 6 : 12,
          paddingBottom: 12,
        },
        style,
      ]}
    >
      <View style={styles.leftContainer}>
        {onBackPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBackPress}
            hitSlop={8}
            style={[
              styles.iconButton,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.squircle ?? 13,
                marginRight: 10,
              },
            ]}
          >
            <AppIcon
              name="chevron-left"
              size={20}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        ) : onMenuPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open navigation menu"
            onPress={onMenuPress}
            hitSlop={8}
            style={[
              styles.iconButton,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.squircle ?? 13,
                marginRight: 10,
              },
            ]}
          >
            <AppIcon
              name="menu"
              size={18}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        ) : null}

        <View style={styles.titleColumn}>
          <AppText
            variant="heading"
            weight="extrabold"
            color={theme.colors.textPrimary}
            numberOfLines={1}
            style={styles.headerTitle}
          >
            {title}
          </AppText>
          {subtitle ? (
            <AppText
              variant="caption"
              color={theme.colors.muted}
              numberOfLines={1}
              style={styles.headerSubtitle}
            >
              {subtitle}
            </AppText>
          ) : null}
        </View>
      </View>

      {rightAction ? (
        <View style={styles.rightContainer}>{rightAction}</View>
      ) : showNotificationBell ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={onNotificationPress}
          hitSlop={8}
          style={[
            styles.iconButton,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.squircle ?? 13,
            },
          ]}
        >
          <AppIcon
            name="bell"
            size={18}
            color={theme.colors.textSecondary}
          />
          <View
            style={[
              styles.notificationDot,
              {
                backgroundColor: theme.colors.rose ?? theme.colors.danger,
                borderColor: theme.colors.surface,
              },
            ]}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    width: '100%',
  },
  leftContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  titleColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
});
