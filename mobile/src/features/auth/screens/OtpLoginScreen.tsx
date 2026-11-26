/**
 * @format
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useCurrentUser } from '../../../app/UserContext';
import type { RequestOtpResult, VerifyOtpResult } from '../../../app/UserContext';
import {
  sanitizeConsumerMessage,
  useConsumerMode,
} from '../../../app/configuration/consumerMode';
import {
  addBffConnectionListener,
  BffConnectionState,
  discoverAndConnectBff,
  getBffConnectionState,
} from '../../../core/api/bffDiscovery';
import { queryCache } from '../../../data/cache';
import type { OtpDeliveryDto, TokenizedOtpDeliveryDto } from '../../../data/dto/authDto';
import {
  AppButton,
  AppCard,
  AppInput,
  AppText,
  ScreenContainer,
  StatusBadge,
  VcsLogo,
} from '../../../shared';
import { AppHeader } from '../../../shared/layout/AppHeader';
import { hexToRgba, useAppTheme } from '../../../theme';

export interface OtpLoginScreenProps {
  onLoginSuccess?: () => void;
}

/**
 * Maps truthful provider delivery status into user-facing copy (Section 4.2, 4.3 B4).
 * Strictly distinguishes "accepted by provider" from genuine handset "delivered".
 */
export function getDeliveryStatusDescription(
  delivery?: TokenizedOtpDeliveryDto | OtpDeliveryDto,
  status?: string,
  consumerOnly: boolean = false,
): string {
  if (!delivery) return '';
  if (consumerOnly) {
    return 'Verification code sent via SMS.';
  }
  const channel = delivery.channel || 'SMS';
  if (delivery.delivered) {
    return `Delivery channel: ${channel} (delivered)`;
  }
  if ('accepted' in delivery && delivery.accepted) {
    return `Delivery channel: ${channel} (accepted by provider / queued)`;
  }
  if (status === 'accepted') {
    return `Delivery channel: ${channel} (accepted by provider / queued)`;
  }
  if ('configured' in delivery && delivery.configured === false) {
    return `Delivery channel: ${channel} (simulation mode / provider unconfigured)`;
  }
  if (status === 'console_simulated') {
    return `Delivery channel: ${channel} (simulation mode / provider unconfigured)`;
  }
  return `Delivery channel: ${channel} (queued)`;
}

export function OtpLoginScreen({
  onLoginSuccess,
}: OtpLoginScreenProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const { consumerOnly } = useConsumerMode();
  const {
    currentUser,
    isAuthenticated,
    offlineCachedUser,
    enterOfflineMode,
    challenge,
    clearChallenge,
    requestTokenizedOtp,
    verifyTokenizedOtp,
    requestOtp,
    verifyOtp,
  } = useCurrentUser();

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [userType, setUserType] = useState<'old' | 'new'>('old');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('+959');
  const [code, setCode] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingBff, setIsCheckingBff] = useState(false);
  const [bffState, setBffState] = useState<BffConnectionState>(() =>
    getBffConnectionState(),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    return addBffConnectionListener(state => {
      setBffState(state);
    });
  }, []);

  // Clear ephemeral challenge and code state on navigation exit / unmount
  useEffect(() => {
    return () => {
      clearChallenge?.();
    };
  }, [clearChallenge]);

  // Server-supplied code_length (default locked 6 digits)
  const codeLength = challenge?.codeLength ?? 6;

  const isRealProvider = Boolean(
    challenge?.delivery &&
    'configured' in challenge.delivery &&
    challenge.delivery.configured === true &&
    challenge.delivery.provider !== 'console'
  );

  const handleRetryBff = async () => {
    setIsCheckingBff(true);
    setErrorMessage(null);
    try {
      await discoverAndConnectBff();
    } finally {
      setIsCheckingBff(false);
    }
  };

  const handleContinueOffline = async () => {
    await enterOfflineMode?.();
    onLoginSuccess?.();
  };

  const executeSendOtp = async (explicitRequestId?: string) => {
    if (isLoading) return; // Prevent double-submit while in flight
    setErrorMessage(null);
    setFieldError(null);
    setNameError(null);

    if (userType === 'new') {
      const trimmedName = displayName.trim();
      if (!trimmedName) {
        setNameError('Please enter your name.');
        return;
      }
    }

    const trimmedPhone = phone.trim();
    if (!trimmedPhone || trimmedPhone === '+959') {
      setFieldError('Please enter your mobile phone number.');
      return;
    }

    clearChallenge?.();
    setIsLoading(true);

    try {
      let result: RequestOtpResult;
      if (requestOtp) {
        result = explicitRequestId
          ? await requestOtp(trimmedPhone, 'login', explicitRequestId)
          : await requestOtp(trimmedPhone, 'login');
      } else if (requestTokenizedOtp) {
        result = await requestTokenizedOtp({
          phone: trimmedPhone,
          purpose: 'login',
          requestId: explicitRequestId,
          isNewUser: userType === 'new',
        });
      } else {
        throw new Error('Authentication service unavailable.');
      }

      if (result.success) {
        if (result.status === 'provider_not_configured') {
          setErrorMessage(
            'SMS provider is not configured. Real network delivery is currently unavailable in this environment.',
          );
          return;
        }

        if (result.status === 'delivery_rejected') {
          setErrorMessage(
            'SMS delivery was rejected by telecom provider. Please verify your phone number and try again.',
          );
          return;
        }

        if (result.status === 'delivery_timeout') {
          setErrorMessage(
            'Provider network timeout. The delivery outcome is uncertain. Please check your handset or tap Resend.',
          );
          return;
        }

        if (result.devCode && !isRealProvider && !consumerOnly) {
          setCode(result.devCode);
        }
        setStep('otp');
      } else {
        if (result.errorCode === 'request_id_exhausted') {
          setErrorMessage('This request has already been used or expired. Please tap Resend to request a new code.');
        } else if (result.errorCode === 'request_id_conflict') {
          setErrorMessage('Request parameter mismatch. Please tap Resend to request a new code.');
        } else {
          setErrorMessage(
            sanitizeConsumerMessage(
              result.error,
              'Unable to send verification code. Please check your number and try again.',
            ),
          );
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Unable to connect right now.';
      if (msg.toLowerCase().includes('timeout')) {
        setErrorMessage(
          'Request timed out. Please try again or tap Resend.',
        );
      } else {
        setErrorMessage(
          sanitizeConsumerMessage(msg, 'Unable to connect right now. Please try again.'),
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtp = async () => {
    await executeSendOtp();
  };

  const handleResendOtp = async () => {
    const newRequestId = `req-resend-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setCode('');
    setErrorMessage(null);
    setFieldError(null);
    await executeSendOtp(newRequestId);
  };

  const handleVerifyOtp = async () => {
    if (isLoading) return; // Prevent double-submit while in flight
    setErrorMessage(null);
    setFieldError(null);

    const trimmedCode = code.trim();
    if (!trimmedCode || trimmedCode.length !== codeLength) {
      setFieldError(`Please enter the ${codeLength}-digit verification code.`);
      return;
    }

    setIsLoading(true);
    try {
      let result: VerifyOtpResult;
      if (challenge?.authSessionToken && verifyTokenizedOtp) {
        result = await verifyTokenizedOtp({
          code: trimmedCode,
          ...(userType === 'new' && displayName.trim()
            ? { displayName: displayName.trim() }
            : {}),
        });
      } else if (verifyOtp) {
        result =
          userType === 'new' && displayName.trim()
            ? await verifyOtp(phone.trim(), trimmedCode, displayName.trim())
            : await verifyOtp(phone.trim(), trimmedCode);
      } else {
        throw new Error('Authentication service unavailable.');
      }

      if (result.success) {
        clearChallenge?.();
        onLoginSuccess?.();
      } else {
        setErrorMessage(
          sanitizeConsumerMessage(
            result.error,
            'Invalid verification code. Please try again.',
          ),
        );
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Unable to connect right now.';
      setErrorMessage(
        sanitizeConsumerMessage(msg, 'Unable to verify right now. Please try again.'),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToPhone = () => {
    clearChallenge?.();
    setStep('phone');
    setCode('');
    setErrorMessage(null);
    setFieldError(null);
    setNameError(null);
  };

  const hasCachedOfflineData = queryCache.size > 0 || Boolean(offlineCachedUser);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title={step === 'phone' ? 'VCS Sign In' : 'Verify Code'}
        subtitle={
          step === 'phone'
            ? 'Access your volunteer shifts & coordinator workspace'
            : `Code sent to ${phone}`
        }
        showNotificationBell={false}
        showOfflineBanner={false}
        onBackPress={step === 'otp' ? handleBackToPhone : undefined}
        rightAction={<VcsLogo size={36} showRing={false} />}
      />

      <ScreenContainer scroll style={styles.scroll}>
        {/* BFF Connection Status Strip (Developer Options Only) */}
        {!consumerOnly ? (
          <AppCard style={styles.connectionCard}>
            <View style={styles.connectionRow}>
              <StatusBadge
                status={
                  bffState.status === 'online'
                    ? 'emerald'
                    : bffState.status === 'checking'
                      ? 'sky'
                      : 'amber'
                }
                label={
                  bffState.status === 'online'
                    ? 'BFF Connected'
                    : bffState.status === 'checking'
                      ? 'Checking BFF...'
                      : 'BFF Offline'
                }
              />
              <AppText
                variant="caption"
                color={theme.colors.textSecondary}
                numberOfLines={1}
                style={styles.endpointText}
              >
                {bffState.activeBaseUrl}
                {bffState.status === 'online' && bffState.latencyMs !== null
                  ? ` (${bffState.latencyMs}ms)`
                  : ''}
              </AppText>
            </View>

            {bffState.status === 'offline' ? (
              <View style={styles.offlineActions}>
                <AppText variant="caption" color={theme.colors.textSecondary}>
                  {bffState.errorMessage ||
                    'Local BFF could not be reached. Retry connection or continue with cached data.'}
                </AppText>
                <View style={styles.offlineButtonsRow}>
                  <View style={styles.flexOne}>
                    <AppButton
                      label={isCheckingBff ? 'Testing...' : 'Retry BFF'}
                      variant="outline"
                      onPress={handleRetryBff}
                      disabled={isCheckingBff}
                    />
                  </View>
                  <View style={styles.flexOne}>
                    <AppButton
                      label={
                        hasCachedOfflineData ? 'Use Offline Cache' : 'Offline Mode'
                      }
                      variant="secondary"
                      onPress={handleContinueOffline}
                    />
                  </View>
                </View>
              </View>
            ) : null}
          </AppCard>
        ) : null}

        {/* Quick-resume card when a valid session was restored on startup */}
        {step === 'phone' && isAuthenticated && onLoginSuccess ? (
          <AppCard variant="raised" style={styles.resumeCard}>
            <AppText variant="eyebrow" weight="bold" color={theme.colors.primary}>
              ACTIVE SESSION DETECTED
            </AppText>
            <AppText
              variant="title"
              weight="bold"
              color={theme.colors.textPrimary}
              style={styles.resumeName}
            >
              {currentUser.displayName}
            </AppText>
            <AppText
              variant="caption"
              color={theme.colors.textSecondary}
              style={styles.resumeSub}
            >
              {currentUser.phone ?? 'Verified VCS Account'}
            </AppText>
            <AppButton
              label={`Continue as ${currentUser.displayName}`}
              variant="primary"
              onPress={onLoginSuccess}
            />
          </AppCard>
        ) : null}

        {step === 'phone' ? (
          <AppCard style={styles.card}>
            <View style={styles.headerBlock}>
              <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
                Mobile Verification
              </AppText>
              <AppText
                variant="body"
                color={theme.colors.textSecondary}
                style={styles.subtext}
              >
                {userType === 'new'
                  ? 'Enter your name and mobile number to register as a new volunteer.'
                  : 'Enter your registered mobile phone number to receive an SMS one-time passcode.'}
              </AppText>
            </View>

            {/* Old vs New user selector */}
            <View
              style={[
                styles.userTypeTrack,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel="Returning User tab"
                accessibilityState={{ selected: userType === 'old' }}
                onPress={() => {
                  setUserType('old');
                  setErrorMessage(null);
                  setFieldError(null);
                  setNameError(null);
                }}
                style={[
                  styles.userTypePill,
                  userType === 'old' && {
                    backgroundColor: theme.colors.primary,
                  },
                ]}
              >
                <AppText
                  variant="label"
                  weight="bold"
                  color={userType === 'old' ? '#FFFFFF' : theme.colors.textSecondary}
                >
                  Returning User
                </AppText>
              </Pressable>

              <Pressable
                accessibilityRole="tab"
                accessibilityLabel="New User tab"
                accessibilityState={{ selected: userType === 'new' }}
                onPress={() => {
                  setUserType('new');
                  setErrorMessage(null);
                  setFieldError(null);
                  setNameError(null);
                }}
                style={[
                  styles.userTypePill,
                  userType === 'new' && {
                    backgroundColor: theme.colors.primary,
                  },
                ]}
              >
                <AppText
                  variant="label"
                  weight="bold"
                  color={userType === 'new' ? '#FFFFFF' : theme.colors.textSecondary}
                >
                  New User
                </AppText>
              </Pressable>
            </View>

            {/* Display Name Input (Only for new user) */}
            {userType === 'new' ? (
              <AppInput
                label="Full Name / Display Name *"
                placeholder="e.g. Alex Morgan"
                value={displayName}
                onChangeText={text => {
                  setDisplayName(text);
                  if (nameError) setNameError(null);
                }}
                error={nameError ?? undefined}
                autoCapitalize="words"
                style={styles.nameInputSpacing}
              />
            ) : null}

            <AppInput
              label="Phone Number"
              placeholder="+95912345678"
              value={phone}
              onChangeText={text => {
                setPhone(text);
                if (fieldError) setFieldError(null);
              }}
              keyboardType="phone-pad"
              autoComplete="tel"
              error={fieldError ?? undefined}
              helperText="E.g. +959 followed by your 8-9 digit phone number"
            />

            {errorMessage ? (
              <View
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: hexToRgba(theme.colors.danger, 0.1),
                    borderColor: theme.colors.danger,
                  },
                ]}
              >
                <AppText variant="caption" color={theme.colors.danger}>
                  {errorMessage}
                </AppText>
              </View>
            ) : null}

            <View style={styles.buttonBlock}>
              <AppButton
                label={
                  userType === 'new'
                    ? 'Register & Send Code'
                    : 'Send Verification Code'
                }
                variant="primary"
                onPress={handleSendOtp}
                loading={isLoading}
              />
            </View>
          </AppCard>
        ) : (
          <AppCard style={styles.card}>
            <View style={styles.headerBlock}>
              <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
                {`Enter ${codeLength}-Digit Code`}
              </AppText>
              <AppText
                variant="body"
                color={theme.colors.textSecondary}
                style={styles.subtext}
              >
                {'An authentication code was requested for '}
                <AppText weight="bold" color={theme.colors.textPrimary}>
                  {phone}
                </AppText>
                {'.'}
              </AppText>

              {challenge?.delivery ? (
                <View style={styles.deliveryBlock}>
                  <AppText variant="caption" color={theme.colors.textSecondary}>
                    {getDeliveryStatusDescription(
                      challenge.delivery,
                      challenge.status,
                      consumerOnly,
                    )}
                  </AppText>
                </View>
              ) : null}
            </View>

            <AppInput
              label="Verification Code"
              placeholder={'123456'.slice(0, codeLength)}
              value={code}
              onChangeText={text => {
                setCode(text);
                if (fieldError) setFieldError(null);
              }}
              keyboardType="number-pad"
              maxLength={codeLength}
              error={fieldError ?? undefined}
              helperText={`Enter the ${codeLength}-digit code received via SMS`}
            />

            {errorMessage ? (
              <View
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: hexToRgba(theme.colors.danger, 0.1),
                    borderColor: theme.colors.danger,
                  },
                ]}
              >
                <AppText variant="caption" color={theme.colors.danger}>
                  {errorMessage}
                </AppText>
              </View>
            ) : null}

            <View style={styles.buttonBlock}>
              <AppButton
                label="Verify & Continue"
                variant="primary"
                onPress={handleVerifyOtp}
                loading={isLoading}
              />

              <View style={styles.secondaryButtonSpacer}>
                <AppButton
                  label="Resend Code"
                  variant="outline"
                  onPress={handleResendOtp}
                  disabled={isLoading}
                />
              </View>

              <View style={styles.secondaryButtonSpacer}>
                <AppButton
                  label="Change Phone Number"
                  variant="outline"
                  onPress={handleBackToPhone}
                  disabled={isLoading}
                />
              </View>
            </View>
          </AppCard>
        )}
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
    paddingHorizontal: 16,
  },
  connectionCard: {
    padding: 12,
    marginBottom: 14,
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  endpointText: {
    flex: 1,
    textAlign: 'right',
  },
  offlineActions: {
    marginTop: 10,
    gap: 10,
  },
  offlineButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  flexOne: {
    flex: 1,
  },
  resumeCard: {
    padding: 16,
    marginBottom: 14,
  },
  resumeName: {
    marginTop: 4,
  },
  resumeSub: {
    marginTop: 2,
    marginBottom: 12,
  },
  card: {
    padding: 20,
    marginBottom: 20,
  },
  headerBlock: {
    marginBottom: 20,
  },
  subtext: {
    marginTop: 6,
  },
  deliveryBlock: {
    marginTop: 8,
  },
  buttonBlock: {
    marginTop: 24,
  },
  secondaryButtonSpacer: {
    marginTop: 12,
  },
  errorBanner: {
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  userTypeTrack: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    marginBottom: 16,
  },
  userTypePill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
  },
  nameInputSpacing: {
    marginBottom: 12,
  },
});
