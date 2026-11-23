/**
 * @format
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useCurrentUser } from '../../../app/UserContext';
import {
  addDataModeListener,
  DataMode,
  getDataMode,
  isHttpMode,
  setDataMode,
} from '../../../app/configuration/dataMode';
import {
  addApiConfigListener,
  API_HOST_PRESETS,
  getApiConfig,
  setApiHostPreset,
} from '../../../core/api/apiConfig';
import { eventApi } from '../../../data/endpoints/eventApi';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppText,
  ScreenContainer,
  SectionHeader,
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
  const [logoutFeedback, setLogoutFeedback] = useState<string | null>(null);

  const [currentMode, setCurrentMode] = useState<DataMode>(() => getDataMode());
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [pingResult, setPingResult] = useState<{
    status?: number;
    durationMs?: number;
    success: boolean;
    message: string;
  } | null>(null);

  const [apiConfig, setApiConfigState] = useState(() => getApiConfig());

  useEffect(() => {
    const unsubData = addDataModeListener(mode => {
      setCurrentMode(mode);
    });
    const unsubConfig = addApiConfigListener(cfg => {
      setApiConfigState(cfg);
    });
    return () => {
      unsubData();
      unsubConfig();
    };
  }, []);

  const handleSetDataMode = (mode: DataMode) => {
    setDataMode(mode);
    setCurrentMode(mode);
  };

  const handleTestConnection = async () => {
    setIsPinging(true);
    setPingResult(null);
    const start = Date.now();
    try {
      const res = await eventApi.getCharityFields();
      const durationMs = Date.now() - start;
      if (res.ok) {
        setPingResult({
          status: res.status,
          durationMs,
          success: true,
          message: `BFF Reachable: HTTP ${res.status} (${durationMs}ms)`,
        });
      } else {
        setPingResult({
          status: res.status,
          durationMs,
          success: false,
          message: `BFF Responded with Error (HTTP ${res.status} - ${durationMs}ms): ${res.error.message}`,
        });
      }
    } catch (err: any) {
      const durationMs = Date.now() - start;
      setPingResult({
        durationMs,
        success: false,
        message: `BFF Unreachable (${durationMs}ms): ${err?.message || 'Network error'}`,
      });
    } finally {
      setIsPinging(false);
    }
  };

  const themeOptions: { mode: ThemeMode; label: string }[] = [
    { mode: 'system', label: 'System' },
    { mode: 'light', label: 'Light' },
    { mode: 'dark', label: 'Dark' },
  ];

  const handleLogout = async () => {
    if (isHttpMode()) {
      await logout();
    } else {
      setLogoutFeedback(
        'Demo only — session logout will be handled by authentication provider in production.',
      );
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title="Settings"
        subtitle="App preferences & system info"
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

        {/* Account & Session Placeholder */}
        <SectionHeader title="Account & Session" />
        <AppCard style={styles.cardSpacing}>
          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            style={styles.subtextSpacing}
          >
            Manage active user session:
          </AppText>

          <AppButton
            label={isHttpMode() ? 'Log Out' : 'Log Out (Demo)'}
            variant="outline"
            accessibilityLabel={isHttpMode() ? 'Log Out' : 'Log Out (Demo)'}
            onPress={handleLogout}
          />

          {logoutFeedback ? (
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
                {logoutFeedback}
              </AppText>
            </View>
          ) : null}
        </AppCard>

        {/* Application Info */}
        <SectionHeader title="About Application" />
        <AppCard style={styles.cardSpacing}>
          <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
            Volunteer Coordination System
          </AppText>
          <AppText variant="caption" color={theme.colors.textSecondary}>
            Version: 0.8.1 (React Native 0.88.1 | React 19.3.0)
          </AppText>
          <AppText variant="caption" color={theme.colors.textSecondary}>
            Build Target: Android First (Fabric / New Architecture)
          </AppText>
          <AppText variant="caption" color={theme.colors.textSecondary}>
            {isHttpMode()
              ? 'Mode: HTTP Live BFF (Connected to Django Service)'
              : 'Mode: Template Mode (Local Demo Fixtures Only — No Live API Calls)'}
          </AppText>
        </AppCard>

        {/* Development Connection & Mode Diagnostics */}
        {typeof __DEV__ !== 'undefined' && __DEV__ ? (
          <>
            <SectionHeader title="Template & API Diagnostics" />
            <AppCard style={styles.cardSpacing}>
              <AppText
                variant="caption"
                color={theme.colors.textSecondary}
                style={styles.subtextSpacing}
              >
                Development connection & runtime mode controls:
              </AppText>

              <AppText
                variant="body"
                weight="bold"
                color={theme.colors.textPrimary}
              >
                {`Active Data Mode: ${currentMode === 'mock' ? 'TEMPLATE' : 'HTTP'}`}
              </AppText>

              <AppText
                variant="caption"
                color={theme.colors.textSecondary}
                style={styles.marginTop}
              >
                {`API Base URL: ${apiConfig.baseUrl}`}
              </AppText>
              <AppText
                variant="caption"
                color={theme.colors.textSecondary}
              >
                {`Endpoint Prefix: ${apiConfig.apiPrefix}`}
              </AppText>

              <AppText
                variant="caption"
                color={theme.colors.textSecondary}
                style={styles.marginTop}
              >
                Target Host Preset (USB adb reverse vs Emulator):
              </AppText>

              <View style={[styles.rowGap, styles.marginTop]}>
                <AppButton
                  label="USB (localhost:8000)"
                  variant={
                    apiConfig.baseUrl === API_HOST_PRESETS.USB_DEVICE
                      ? 'primary'
                      : 'secondary'
                  }
                  onPress={() => setApiHostPreset('usb')}
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
                  onPress={() => setApiHostPreset('emulator')}
                  style={styles.flexOne}
                  accessibilityLabel="Switch to Emulator Host"
                />
              </View>

              <View style={[styles.rowGap, styles.marginTop]}>
                <AppButton
                  label="Template Mode"
                  variant={currentMode === 'mock' ? 'primary' : 'secondary'}
                  onPress={() => handleSetDataMode('mock')}
                  style={styles.flexOne}
                  accessibilityLabel="Switch to Template Mode"
                />
                <AppButton
                  label="HTTP Mode"
                  variant={currentMode === 'http' ? 'primary' : 'secondary'}
                  onPress={() => handleSetDataMode('http')}
                  style={styles.flexOne}
                  accessibilityLabel="Switch to HTTP"
                />
              </View>

              <View style={styles.marginTop}>
                <AppButton
                  label={isPinging ? 'Pinging BFF...' : 'Test BFF Connection'}
                  variant="outline"
                  onPress={handleTestConnection}
                  disabled={isPinging}
                  accessibilityLabel="Test BFF Connection"
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
            </AppCard>
          </>
        ) : null}
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
