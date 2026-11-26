/**
 * @format
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useConsumerMode } from '../../app/configuration/consumerMode';
import { hexToRgba, useAppTheme } from '../../theme';
import { AppIcon } from './AppIcon';
import { AppText } from './AppText';

export interface OfflineBannerProps {
  visible?: boolean;
  onReconnect?: () => void;
  isReconnecting?: boolean;
  cachedCount?: number;
}

export function OfflineBanner({
  visible = true,
  onReconnect,
  isReconnecting = false,
  cachedCount,
}: OfflineBannerProps): React.JSX.Element | null {
  const { theme, isDark } = useAppTheme();
  const { consumerOnly } = useConsumerMode();

  if (!visible) {
    return null;
  }

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.banner,
        {
          backgroundColor: hexToRgba(theme.colors.warning, isDark ? 0.16 : 0.12),
          borderColor: hexToRgba(theme.colors.warning, isDark ? 0.45 : 0.32),
        },
      ]}
    >
      <View style={styles.leftRow}>
        <AppIcon name="info" size={16} color={theme.colors.warning} />
        <View style={styles.textWrap}>
          <AppText variant="label" weight="bold" color={theme.colors.warning}>
            {consumerOnly ? 'Viewing Saved Details' : 'Offline Mode · Cached Data'}
          </AppText>
          <AppText variant="caption" color={theme.colors.textSecondary}>
            {consumerOnly
              ? 'Reconnect to refresh live updates.'
              : cachedCount !== undefined && cachedCount > 0
                ? `Serving ${cachedCount} cached item${cachedCount === 1 ? '' : 's'}. Changes disabled until reconnected.`
                : 'Showing cached data where available. Reconnect to sync or submit changes.'}
          </AppText>
        </View>
      </View>

      {onReconnect ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={consumerOnly ? 'Reconnect' : 'Reconnect to BFF'}
          onPress={onReconnect}
          disabled={isReconnecting}
          style={[
            styles.retryBtn,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.warning,
              opacity: isReconnecting ? 0.6 : 1,
            },
          ]}
        >
          <AppText variant="label" weight="bold" color={theme.colors.warning}>
            {isReconnecting ? 'Checking...' : 'Reconnect'}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  leftRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  textWrap: {
    flex: 1,
  },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
});
