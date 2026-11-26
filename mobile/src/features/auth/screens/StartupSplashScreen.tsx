/**
 * @format
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  sanitizeConsumerMessage,
  useConsumerMode,
} from '../../../app/configuration/consumerMode';
import type {
  PermissionResolution,
  StartupPermissionSnapshot,
} from '../../../core/permissions/startupPermissions';
import { AppButton, AppCard, AppIcon, AppText, StatusBadge, VcsLogo } from '../../../shared';
import {
  getProverbForIndex,
  VCS_PROVERBS,
} from '../../../shared/constants/vcsProverbs';
import { hexToRgba, useAppTheme } from '../../../theme';

export type BootStageKey = 'cache' | 'permissions' | 'network' | 'ready';

export interface InstallHighlightSlide {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: 'map' | 'check' | 'spark';
}

const INSTALL_HIGHLIGHTS: readonly InstallHighlightSlide[] = [
  {
    id: 'explore',
    eyebrow: 'DISCOVER & EXPLORE',
    title: 'Interactive Event Map',
    description:
      'Browse published volunteer opportunities on a live map, inspect nearby venues, and apply to open roles.',
    icon: 'map',
  },
  {
    id: 'checkin',
    eyebrow: 'ON-SITE ATTENDANCE',
    title: 'GPS & QR Shift Check-In',
    description:
      'Verify your arrival inside the event geofence or scan coordinator QR codes directly from your phone.',
    icon: 'check',
  },
  {
    id: 'assistant',
    eyebrow: 'GUIDED SUPPORT',
    title: 'Role-Aware VCS Assistant',
    description:
      'Review your applications, shift next steps, and event policies with instant offline cache support.',
    icon: 'spark',
  },
];

const BOOT_STAGES: ReadonlyArray<{ key: BootStageKey; label: string }> = [
  { key: 'cache', label: 'Workspace' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'network', label: 'Connection' },
  { key: 'ready', label: 'Ready' },
];

function getPermissionBadge(status: PermissionResolution): {
  badgeStatus: 'emerald' | 'amber' | 'rose' | 'sky';
  label: string;
} {
  switch (status) {
    case 'permanent_granted':
      return { badgeStatus: 'emerald', label: 'Permanent' };
    case 'session_granted':
      return { badgeStatus: 'sky', label: 'This Time Only' };
    case 'never_ask_again':
      return { badgeStatus: 'rose', label: 'Blocked' };
    case 'unavailable':
      return { badgeStatus: 'amber', label: 'Unavailable' };
    default:
      return { badgeStatus: 'amber', label: 'Action Needed' };
  }
}

export interface StartupSplashScreenProps {
  statusText?: string;
  targetEndpoint?: string;
  progressPercent?: number;
  activeStage?: BootStageKey;
  isFirstInstall?: boolean;
  isBootReady?: boolean;
  isOfflineReachable?: boolean;
  permissionSnapshot?: StartupPermissionSnapshot | null;
  onRequestPermissions?: () => void | Promise<void>;
  onOpenPermissionSettings?: () => void | Promise<void>;
  onRetryConnection?: () => void | Promise<void>;
  onUseOfflineMode?: () => void | Promise<void>;
  onContinue?: () => void;
}

export function StartupSplashScreen({
  statusText = 'Preparing your workspace...',
  targetEndpoint,
  progressPercent = 35,
  activeStage = 'network',
  isFirstInstall = false,
  isBootReady = false,
  isOfflineReachable = false,
  permissionSnapshot = null,
  onRequestPermissions,
  onOpenPermissionSettings,
  onRetryConnection,
  onUseOfflineMode,
  onContinue,
}: StartupSplashScreenProps): React.JSX.Element {
  const { theme, isDark } = useAppTheme();
  const { consumerOnly } = useConsumerMode();
  const insets = useSafeAreaInsets();
  const [proverbIndex, setProverbIndex] = useState<number>(() =>
    Math.floor(Math.random() * VCS_PROVERBS.length),
  );
  const [highlightIndex, setHighlightIndex] = useState<number>(0);
  const [selectedStageInfo, setSelectedStageInfo] = useState<BootStageKey | null>(null);
  const [isRequestingPerms, setIsRequestingPerms] = useState<boolean>(false);
  const [isRetryingBff, setIsRetryingBff] = useState<boolean>(false);
  const progressAnim = useRef(new Animated.Value(progressPercent)).current;

  useEffect(() => {
    const target = Math.max(5, Math.min(100, progressPercent));
    if (typeof process !== 'undefined' && process.env?.JEST_WORKER_ID) {
      progressAnim.setValue(target);
      return;
    }
    const anim = Animated.timing(progressAnim, {
      toValue: target,
      duration: 280,
      useNativeDriver: false,
    });
    anim.start();
    return () => {
      anim.stop();
    };
  }, [progressAnim, progressPercent]);

  useEffect(() => {
    const timer = setInterval(() => {
      setProverbIndex(prev => (prev + 1) % VCS_PROVERBS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const proverb = getProverbForIndex(proverbIndex);
  const activeHighlight = INSTALL_HIGHLIGHTS[highlightIndex];
  const stageOrder = BOOT_STAGES.map(s => s.key);
  const activeStageIdx = Math.max(0, stageOrder.indexOf(activeStage));

  const handleCycleProverb = () => {
    setProverbIndex(prev => (prev + 1) % VCS_PROVERBS.length);
  };

  const handleGrantPermissionsPress = async () => {
    if (!onRequestPermissions || isRequestingPerms) return;
    setIsRequestingPerms(true);
    try {
      await onRequestPermissions();
    } finally {
      setIsRequestingPerms(false);
    }
  };

  const handleRetryPress = async () => {
    if (!onRetryConnection || isRetryingBff) return;
    setIsRetryingBff(true);
    try {
      await onRetryConnection();
    } finally {
      setIsRetryingBff(false);
    }
  };

  const showPermissionsCard =
    Boolean(permissionSnapshot) &&
    (isFirstInstall || !permissionSnapshot?.allPermanentlyGranted);

  const hasBlockedPermission = Boolean(
    permissionSnapshot &&
      (permissionSnapshot.location === 'never_ask_again' ||
        permissionSnapshot.camera === 'never_ask_again'),
  );

  const hasMissingPermission = Boolean(
    permissionSnapshot &&
      (permissionSnapshot.location === 'denied' ||
        permissionSnapshot.camera === 'denied'),
  );

  const stageDetailText = (() => {
    switch (selectedStageInfo) {
      case 'cache':
        return 'Hydrating offline cache and local session preferences.';
      case 'permissions':
        return permissionSnapshot?.allPermanentlyGranted
          ? 'Location & Camera permissions are permanently granted.'
          : 'Location & Camera are checked on boot for event maps and QR check-in.';
      case 'network':
        return !consumerOnly && targetEndpoint
          ? `Server target: ${targetEndpoint}`
          : 'Connecting to Volunteer Coordination System.';
      case 'ready':
        return isBootReady
          ? 'VCS workspace initialized and ready.'
          : 'Completing startup checks...';
      default:
        return null;
    }
  })();

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.background,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
        },
      ]}
    >
      {/* Decorative soft VCS theme orbs */}
      <View
        pointerEvents="none"
        style={[
          styles.orbTop,
          {
            backgroundColor: hexToRgba(
              theme.colors.primary,
              isDark ? 0.16 : 0.1,
            ),
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.orbBottom,
          {
            backgroundColor: hexToRgba(
              theme.colors.indigo ?? theme.colors.accent,
              isDark ? 0.12 : 0.08,
            ),
          },
        ]}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Center VCS Brand */}
        <View style={styles.brandSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="VCS Brand Emblem"
            onPress={handleCycleProverb}
            style={styles.logoWrap}
          >
            <VcsLogo size={78} />
          </Pressable>

          <AppText
            variant="eyebrow"
            weight="extrabold"
            color={theme.colors.primary}
            style={styles.eyebrow}
          >
            VOLUNTEER COORDINATION SYSTEM
          </AppText>

          <AppText
            variant="hero"
            weight="extrabold"
            color={theme.colors.textPrimary}
            style={styles.heroTitle}
          >
            CommonGround
          </AppText>

          <AppText
            variant="body"
            color={theme.colors.textSecondary}
            style={styles.tagline}
          >
            Coordinating hands, hearts, and verified impact
          </AppText>
        </View>

        {/* Interactive Boot Progress & Stage Strip */}
        <AppCard variant="raised" style={styles.bootCard}>
          <View style={styles.bootHeaderRow}>
            <AppText variant="eyebrow" weight="bold" color={theme.colors.primary}>
              {isFirstInstall ? 'INITIAL SETUP & BOOT' : 'BOOTING WORKSPACE'}
            </AppText>
            <AppText variant="caption" weight="bold" color={theme.colors.textPrimary}>
              {`${Math.round(progressPercent)}%`}
            </AppText>
          </View>

          <View
            style={[
              styles.progressTrack,
              { backgroundColor: theme.colors.border },
            ]}
          >
            <Animated.View
              style={[
                styles.progressFill,
                {
                  backgroundColor: theme.colors.primary,
                  width: progressWidth,
                },
              ]}
            />
          </View>

          <View style={styles.stagesRow}>
            {BOOT_STAGES.map((stage, idx) => {
              const isDone = idx < activeStageIdx || (isBootReady && stage.key === 'ready');
              const isCurrent = stage.key === activeStage && !isBootReady;
              const isSelected = selectedStageInfo === stage.key;
              return (
                <Pressable
                  key={stage.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Boot stage ${stage.label}`}
                  onPress={() =>
                    setSelectedStageInfo(prev => (prev === stage.key ? null : stage.key))
                  }
                  style={[
                    styles.stagePill,
                    {
                      backgroundColor: isSelected
                        ? hexToRgba(theme.colors.primary, 0.16)
                        : isDone
                          ? hexToRgba(theme.colors.success, 0.12)
                          : isCurrent
                            ? hexToRgba(theme.colors.primary, 0.1)
                            : theme.colors.surface,
                      borderColor: isSelected || isCurrent
                        ? theme.colors.primary
                        : isDone
                          ? theme.colors.success
                          : theme.colors.border,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    weight="bold"
                    color={
                      isDone
                        ? theme.colors.success
                        : isCurrent || isSelected
                          ? theme.colors.primary
                          : theme.colors.muted
                    }
                    style={styles.stageLabelText}
                  >
                    {isDone ? `✓ ${stage.label}` : stage.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {stageDetailText ? (
            <AppText
              variant="caption"
              color={theme.colors.textSecondary}
              style={styles.stageDetail}
            >
              {stageDetailText}
            </AppText>
          ) : null}
        </AppCard>

        {/* Interactive First-Install Feature Tour */}
        {isFirstInstall ? (
          <AppCard style={styles.tourCard}>
            <View style={styles.tourHeaderRow}>
              <View
                style={[
                  styles.tourIconBox,
                  { backgroundColor: hexToRgba(theme.colors.primary, 0.12) },
                ]}
              >
                <AppIcon
                  name={activeHighlight.icon}
                  size={20}
                  color={theme.colors.primary}
                />
              </View>
              <View style={styles.tourTitleCol}>
                <AppText variant="eyebrow" weight="bold" color={theme.colors.primary}>
                  {activeHighlight.eyebrow}
                </AppText>
                <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
                  {activeHighlight.title}
                </AppText>
              </View>
            </View>

            <AppText
              variant="body"
              color={theme.colors.textSecondary}
              style={styles.tourBody}
            >
              {activeHighlight.description}
            </AppText>

            <View style={styles.tourControlsRow}>
              <View style={styles.tourDotsRow}>
                {INSTALL_HIGHLIGHTS.map((slide, idx) => (
                  <Pressable
                    key={slide.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Select feature highlight ${slide.title}`}
                    onPress={() => setHighlightIndex(idx)}
                    style={[
                      styles.tourDot,
                      idx === highlightIndex
                        ? styles.tourDotActive
                        : styles.tourDotInactive,
                      {
                        backgroundColor:
                          idx === highlightIndex
                            ? theme.colors.primary
                            : theme.colors.border,
                      },
                    ]}
                  />
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next feature highlight"
                onPress={() =>
                  setHighlightIndex(prev => (prev + 1) % INSTALL_HIGHLIGHTS.length)
                }
                style={[
                  styles.tourNextChip,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <AppText variant="caption" weight="bold" color={theme.colors.primary}>
                  Next Tip →
                </AppText>
              </Pressable>
            </View>
          </AppCard>
        ) : null}

        {/* Startup Permissions Interactive Card */}
        {showPermissionsCard && permissionSnapshot ? (
          <AppCard style={styles.permCard}>
            <AppText variant="eyebrow" weight="bold" color={theme.colors.primary}>
              APP PERMISSIONS
            </AppText>
            <AppText
              variant="caption"
              color={theme.colors.textSecondary}
              style={styles.permSubtitle}
            >
              VCS checks Location & Camera at startup. Permanent grants are remembered; one-time grants re-prompt each launch.
            </AppText>

            <View style={styles.permRow}>
              <AppText variant="caption" weight="semibold" color={theme.colors.textPrimary}>
                Location (Event Map & Check-In)
              </AppText>
              <StatusBadge
                status={getPermissionBadge(permissionSnapshot.location).badgeStatus}
                label={getPermissionBadge(permissionSnapshot.location).label}
              />
            </View>

            <View style={styles.permRow}>
              <AppText variant="caption" weight="semibold" color={theme.colors.textPrimary}>
                Camera (QR Scan & Verification)
              </AppText>
              <StatusBadge
                status={getPermissionBadge(permissionSnapshot.camera).badgeStatus}
                label={getPermissionBadge(permissionSnapshot.camera).label}
              />
            </View>

            <View style={styles.permActionsRow}>
              {hasMissingPermission && onRequestPermissions ? (
                <AppButton
                  label={isRequestingPerms ? 'Requesting...' : 'Grant Permissions'}
                  variant="secondary"
                  loading={isRequestingPerms}
                  onPress={handleGrantPermissionsPress}
                  style={styles.flexOne}
                />
              ) : null}
              {hasBlockedPermission && onOpenPermissionSettings ? (
                <AppButton
                  label="Open App Settings"
                  variant="outline"
                  onPress={() => {
                    onOpenPermissionSettings();
                  }}
                  style={styles.flexOne}
                />
              ) : null}
            </View>
          </AppCard>
        ) : null}

        {/* Interactive Proverb Card */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next Spirit of Service quote"
          onPress={handleCycleProverb}
        >
          <AppCard variant="raised" style={styles.proverbCard}>
            <View style={styles.proverbHeaderRow}>
              <AppText
                variant="eyebrow"
                weight="bold"
                color={theme.colors.primary}
                style={styles.proverbLabel}
              >
                SPIRIT OF SERVICE
              </AppText>
              <AppText variant="caption" weight="semibold" color={theme.colors.primary}>
                Tap for next ↻
              </AppText>
            </View>
            <AppText
              variant="title"
              weight="semibold"
              color={theme.colors.textPrimary}
              style={styles.proverbText}
            >
              {`“${proverb.text}”`}
            </AppText>
            <AppText
              variant="caption"
              color={theme.colors.textSecondary}
              style={styles.proverbAuthor}
            >
              {`— ${proverb.author}`}
            </AppText>
          </AppCard>
        </Pressable>

        {/* Connection Progress & Interactive Actions Footer */}
        <View style={styles.footer}>
          {!isBootReady ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <AppIcon name="check" size={18} color={theme.colors.success} />
          )}
          <AppText
            variant="body"
            weight="medium"
            color={theme.colors.textPrimary}
            style={styles.statusText}
          >
            {sanitizeConsumerMessage(statusText, 'Preparing your workspace...')}
          </AppText>
          {!consumerOnly && targetEndpoint ? (
            <AppText variant="caption" color={theme.colors.muted}>
              {targetEndpoint}
            </AppText>
          ) : null}

          {isOfflineReachable && onRetryConnection ? (
            <View style={styles.footerButtonsRow}>
              <AppButton
                label={isRetryingBff ? 'Connecting...' : 'Retry Server'}
                variant="outline"
                loading={isRetryingBff}
                onPress={handleRetryPress}
                style={styles.flexOne}
              />
              {onUseOfflineMode ? (
                <AppButton
                  label="Offline Mode"
                  variant="secondary"
                  onPress={() => {
                    onUseOfflineMode();
                  }}
                  style={styles.flexOne}
                />
              ) : null}
            </View>
          ) : null}

          {isBootReady && onContinue ? (
            <View style={styles.continueWrap}>
              <AppButton
                label={isFirstInstall ? 'Get Started with VCS' : 'Continue to Sign In'}
                variant="primary"
                onPress={onContinue}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    gap: 14,
  },
  orbTop: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  orbBottom: {
    position: 'absolute',
    bottom: -90,
    left: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  brandSection: {
    alignItems: 'center',
    marginTop: 8,
  },
  logoWrap: {
    marginBottom: 12,
  },
  eyebrow: {
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  heroTitle: {
    textAlign: 'center',
  },
  tagline: {
    textAlign: 'center',
    marginTop: 4,
  },
  bootCard: {
    padding: 14,
    borderRadius: 16,
    gap: 10,
  },
  bootHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTrack: {
    height: 7,
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
  },
  stagesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  stagePill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  stageLabelText: {
    fontSize: 11,
  },
  stageDetail: {
    lineHeight: 16,
  },
  tourCard: {
    padding: 16,
    borderRadius: 18,
    gap: 10,
  },
  tourHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tourIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tourTitleCol: {
    flex: 1,
    gap: 2,
  },
  tourBody: {
    lineHeight: 19,
  },
  tourControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  tourDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tourDot: {
    height: 8,
    borderRadius: 4,
  },
  tourDotActive: {
    width: 18,
  },
  tourDotInactive: {
    width: 8,
  },
  tourNextChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  permCard: {
    padding: 14,
    borderRadius: 16,
    gap: 8,
  },
  permSubtitle: {
    lineHeight: 16,
    marginBottom: 2,
  },
  permRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  permActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  proverbCard: {
    padding: 16,
    borderRadius: 18,
  },
  proverbHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  proverbLabel: {
    letterSpacing: 1.1,
  },
  proverbText: {
    lineHeight: 22,
  },
  proverbAuthor: {
    marginTop: 8,
    textAlign: 'right',
  },
  footer: {
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  statusText: {
    textAlign: 'center',
  },
  footerButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    marginTop: 4,
  },
  continueWrap: {
    width: '100%',
    marginTop: 4,
  },
  flexOne: {
    flex: 1,
  },
});
