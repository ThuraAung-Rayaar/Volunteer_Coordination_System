/**
 * @format
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useCurrentUser } from '../../../app/UserContext';
import { useConsumerMode } from '../../../app/configuration/consumerMode';
import {
  addDataModeListener,
  DataMode,
  getDataMode,
  isOfflineMode,
  setDataMode,
} from '../../../app/configuration/dataMode';
import {
  addApiConfigListener,
  API_HOST_PRESETS,
  getApiConfig,
  normalizeBaseUrlInput,
  setApiHostPreset,
} from '../../../core/api/apiConfig';
import {
  addBffConnectionListener,
  BffConnectionState,
  discoverAndConnectBff,
  getBffConnectionState,
  testCurrentBffConnection,
} from '../../../core/api/bffDiscovery';
import {
  clearOfflineCacheAll,
  queryCache,
} from '../../../data/cache';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppInput,
  AppText,
  ScreenContainer,
  SectionHeader,
  StatusBadge,
} from '../../../shared';
import { ThemeMode, useAppTheme } from '../../../theme';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';

export interface SettingsScreenProps
  extends Partial<MainDrawerScreenProps<'Settings'>> {}

export function SettingsScreen({
  navigation,
}: SettingsScreenProps): React.JSX.Element {
  const { theme, themeMode, setThemeMode, isDark } = useAppTheme();
  const { logout } = useCurrentUser();
  const { consumerOnly } = useConsumerMode();

  const [currentMode, setCurrentMode] = useState<DataMode>(() => getDataMode());
  const [apiConfig, setApiConfigState] = useState(() => getApiConfig());
  const [bffState, setBffState] = useState<BffConnectionState>(() =>
    getBffConnectionState(),
  );
  const [customHostInput, setCustomHostInput] = useState<string>(
    () => getApiConfig().baseUrl,
  );
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [pingResult, setPingResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [cacheCount, setCacheCount] = useState<number>(() => queryCache.size);
  const [cacheFeedback, setCacheFeedback] = useState<string | null>(null);

  useEffect(() => {
    const unsubData = addDataModeListener(mode => {
      setCurrentMode(mode);
    });
    const unsubConfig = addApiConfigListener(cfg => {
      setApiConfigState(cfg);
      setCustomHostInput(cfg.baseUrl);
    });
    const unsubBff = addBffConnectionListener(state => {
      setBffState(state);
    });
    const unsubCache = queryCache.subscribe(() => {
      setCacheCount(queryCache.size);
    });
    return () => {
      unsubData();
      unsubConfig();
      unsubBff();
      unsubCache();
    };
  }, []);

  const handleAutoDetectBff = async () => {
    setIsPinging(true);
    setPingResult(null);
    try {
      const normalized = customHostInput.trim()
        ? normalizeBaseUrlInput(customHostInput)
        : undefined;
      const result = await discoverAndConnectBff({
        customBaseUrl: normalized,
      });
      if (result.status === 'online') {
        setPingResult({
          success: true,
          message: `BFF Connected: ${result.activeBaseUrl} (${result.latencyMs ?? 0}ms)`,
        });
      } else {
        setPingResult({
          success: false,
          message:
            result.errorMessage ||
            `BFF Unreachable on ${result.activeBaseUrl}`,
        });
      }
    } finally {
      setIsPinging(false);
    }
  };

  const handleTestCurrentConnection = async () => {
    setIsPinging(true);
    setPingResult(null);
    try {
      const result = await testCurrentBffConnection();
      if (result.status === 'online') {
        setPingResult({
          success: true,
          message: `BFF Reachable: ${result.activeBaseUrl} (${result.latencyMs ?? 0}ms)`,
        });
      } else {
        setPingResult({
          success: false,
          message:
            result.errorMessage ||
            `BFF Unreachable (${result.activeBaseUrl})`,
        });
      }
    } finally {
      setIsPinging(false);
    }
  };

  const handleEnterOfflineMode = () => {
    setDataMode('offline');
    setPingResult({
      success: true,
      message: `Switched to Offline Mode (${cacheCount} cached item${cacheCount === 1 ? '' : 's'} available).`,
    });
  };

  const handleClearCache = async () => {
    await clearOfflineCacheAll();
    setCacheCount(0);
    setCacheFeedback('Local cached data cleared.');
  };

  const themeOptions: { mode: ThemeMode; label: string }[] = [
    { mode: 'system', label: 'System' },
    { mode: 'light', label: 'Light' },
    { mode: 'dark', label: 'Dark' },
  ];

  const handleLogout = async () => {
    await logout();
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title="Settings"
        subtitle={
          consumerOnly
            ? 'Appearance, notifications & account'
            : 'Theme, BFF connection & offline cache'
        }
        onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
      />

      <ScreenContainer
        scroll
        style={styles.scroll}
        contentContainerStyle={styles.scrollContentContainer}
      >
        {/* Appearance Settings */}
        <SectionHeader title="Appearance & Theme" />
        <AppCard style={styles.cardSpacing}>
          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            style={styles.subtextSpacing}
          >
            Select your preferred display appearance:
          </AppText>

          <View style={styles.rowGap}>
            {themeOptions.map(option => (
              <AppButton
                key={option.mode}
                label={option.label}
                variant={themeMode === option.mode ? 'primary' : 'secondary'}
                onPress={() => setThemeMode(option.mode)}
                style={styles.flexOne}
              />
            ))}
          </View>

          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            style={styles.marginTop}
          >
            {`Active: ${themeMode.toUpperCase()} (${isDark ? 'Dark Theme' : 'Light Theme'})`}
          </AppText>
        </AppCard>

        {/* BFF Connection & Offline Cache (Developer Options Only) */}
        {!consumerOnly ? (
          <>
            <SectionHeader title="BFF Connection & Offline Mode" />
            <AppCard style={styles.cardSpacing}>
          <View style={styles.statusHeaderRow}>
            <StatusBadge
              status={
                isOfflineMode()
                  ? 'amber'
                  : bffState.status === 'online'
                    ? 'emerald'
                    : 'sky'
              }
              label={
                isOfflineMode()
                  ? 'Offline Mode'
                  : bffState.status === 'online'
                    ? 'Live BFF Online'
                    : 'Live BFF Mode'
              }
            />
            <AppText variant="caption" color={theme.colors.textSecondary}>
              {`Cached items: ${cacheCount}`}
            </AppText>
          </View>

          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            style={styles.marginTop}
          >
            {`Active Endpoint: ${apiConfig.baseUrl}${apiConfig.apiPrefix}`}
          </AppText>

          <View style={styles.marginTop}>
            <AppInput
              label="BFF Host / Port"
              placeholder="http://localhost:8000"
              value={customHostInput}
              onChangeText={setCustomHostInput}
              autoCapitalize="none"
              autoCorrect={false}
              helperText="Enter localhost, IP:port, or port (e.g. 8000)"
            />
          </View>

          <View style={[styles.rowGap, styles.marginTop]}>
            <AppButton
              label="USB (localhost:8000)"
              variant={
                apiConfig.baseUrl === API_HOST_PRESETS.USB_DEVICE
                  ? 'primary'
                  : 'secondary'
              }
              onPress={() => {
                setApiHostPreset('usb');
                setCustomHostInput(API_HOST_PRESETS.USB_DEVICE);
              }}
              style={styles.flexOne}
              accessibilityLabel="Switch to USB Host"
            />
            <AppButton
              label="Emulator (10.0.2.2)"
              variant={
                apiConfig.baseUrl === API_HOST_PRESETS.ANDROID_EMULATOR
                  ? 'primary'
                  : 'secondary'
              }
              onPress={() => {
                setApiHostPreset('emulator');
                setCustomHostInput(API_HOST_PRESETS.ANDROID_EMULATOR);
              }}
              style={styles.flexOne}
              accessibilityLabel="Switch to Emulator Host"
            />
          </View>

          <View style={[styles.rowGap, styles.marginTop]}>
            <AppButton
              label={isPinging ? 'Testing...' : 'Auto-Detect & Connect'}
              variant="primary"
              onPress={handleAutoDetectBff}
              disabled={isPinging}
              style={styles.flexOne}
              accessibilityLabel="Auto-Detect and Connect BFF"
            />
            <AppButton
              label={isPinging ? 'Pinging...' : 'Test BFF'}
              variant="outline"
              onPress={handleTestCurrentConnection}
              disabled={isPinging}
              style={styles.flexOne}
              accessibilityLabel="Test BFF Connection"
            />
          </View>

          <View style={[styles.rowGap, styles.marginTop]}>
            <AppButton
              label={
                currentMode === 'offline'
                  ? 'Offline Mode Active'
                  : 'Use Offline Cache Mode'
              }
              variant={currentMode === 'offline' ? 'primary' : 'secondary'}
              onPress={handleEnterOfflineMode}
              style={styles.flexOne}
              accessibilityLabel="Switch to Offline Mode"
            />
            <AppButton
              label="Clear Cache"
              variant="outline"
              onPress={handleClearCache}
              style={styles.flexOne}
              accessibilityLabel="Clear Cached Data"
            />
          </View>

          {pingResult ? (
            <View
              style={[
                styles.feedbackBox,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: pingResult.success
                    ? theme.colors.success
                    : theme.colors.danger,
                },
              ]}
            >
              <AppText
                variant="caption"
                weight="medium"
                color={
                  pingResult.success
                    ? theme.colors.success
                    : theme.colors.danger
                }
              >
                {pingResult.message}
              </AppText>
            </View>
          ) : null}

          {cacheFeedback ? (
            <View
              style={[
                styles.feedbackBox,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <AppText variant="caption" color={theme.colors.textSecondary}>
                {cacheFeedback}
              </AppText>
            </View>
          ) : null}
        </AppCard>
          </>
        ) : null}

        {/* Notifications & Activity Alerts */}
        <SectionHeader title="Notifications" />
        <AppCard style={styles.cardSpacing}>
          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            style={styles.subtextSpacing}
          >
            Review activity alerts, schedule updates, and system announcements:
          </AppText>

          <AppButton
            label="Open Notifications"
            variant="secondary"
            accessibilityLabel="Open Notifications"
            leftIcon="bell"
            onPress={() => navigation?.navigate?.('Notifications')}
          />
        </AppCard>

        {/* Account & Session */}
        <SectionHeader title="Account & Session" />
        <AppCard style={styles.cardSpacing}>
          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            style={styles.subtextSpacing}
          >
            Sign out of your active VCS session and return to the login screen:
          </AppText>

          <AppButton
            label="Log Out"
            variant="outline"
            accessibilityLabel="Log Out"
            onPress={handleLogout}
          />
        </AppCard>

        {/* Application Info */}
        <SectionHeader title="About Application" />
        <AppCard style={styles.cardSpacing}>
          <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
            Volunteer Coordination System
          </AppText>
          <AppText variant="caption" color={theme.colors.textSecondary}>
            Version: 1.0.0
          </AppText>
          <AppText variant="caption" color={theme.colors.textSecondary}>
            {consumerOnly
              ? 'Status: Volunteer Coordination Workspace'
              : isOfflineMode()
                ? 'Mode: Offline Mode (Serving Local Cached Data)'
                : 'Mode: Live BFF (Connected to VCS Service)'}
          </AppText>
        </AppCard>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    paddingVertical: 16,
  },
  scrollContentContainer: {
    paddingBottom: 64,
  },
  cardSpacing: {
    marginBottom: 16,
  },
  subtextSpacing: {
    marginBottom: 12,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowGap: {
    flexDirection: 'row',
    gap: 8,
  },
  flexOne: {
    flex: 1,
  },
  marginTop: {
    marginTop: 8,
  },
  feedbackBox: {
    marginTop: 10,
    padding: 10,
    borderWidth: 1,
    borderRadius: 6,
  },
});
