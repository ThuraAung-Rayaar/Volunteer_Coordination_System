/**
 * @format
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useCurrentUser } from '../../../app/UserContext';
import { getDataMode } from '../../../app/configuration/dataMode';
import type { RequestOtpResult, VerifyOtpResult } from '../../../app/UserContext';
import type { OtpDeliveryDto, TokenizedOtpDeliveryDto } from '../../../data/dto/authDto';
import {
  AppButton,
  AppCard,
  AppInput,
  AppText,
  ScreenContainer,
  StatusBadge,
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
): string {
  if (!delivery) return '';
  if (status === 'template_simulated') {
    return 'Template Mode: local demo code generated — no SMS or network request.';
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
  const {
    challenge,
    clearChallenge,
    requestTokenizedOtp,
    verifyTokenizedOtp,
    requestOtp,
    verifyOtp,
  } = useCurrentUser();

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('+959');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Clear ephemeral challenge and code state on navigation exit / unmount
  useEffect(() => {
    return () => {
      clearChallenge?.();
    };
  }, [clearChallenge]);

  // Server-supplied code_length (default locked 6 digits)
  const codeLength = challenge?.codeLength ?? 6;

  // Development build check: show dev banner ONLY in dev builds when dev_code is returned
  // AND an external network provider is NOT configured (Section 4.2)
  const isDevBuild =
    (typeof __DEV__ !== 'undefined' && Boolean(__DEV__)) ||
    process.env.NODE_ENV !== 'production';
  const isRealProvider = Boolean(
    challenge?.delivery &&
    'configured' in challenge.delivery &&
    challenge.delivery.configured === true &&
    challenge.delivery.provider !== 'console'
  );
  const effectiveDevCode =
    challenge?.status === 'template_simulated'
      ? challenge.devCode ?? '123456'
      : isDevBuild && !isRealProvider
        ? challenge?.devCode ?? devCode
        : null;

  const executeSendOtp = async (explicitRequestId?: string) => {
    if (isLoading) return; // Prevent double-submit while in flight
    setErrorMessage(null);
    setFieldError(null);

    const trimmedPhone = phone.trim();
    if (!trimmedPhone || trimmedPhone === '+959') {
      setFieldError('Please enter your mobile phone number.');
      return;
    }

    clearChallenge?.();
    setIsLoading(true);
    const requestId =
      explicitRequestId ||
      `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

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
        });
      } else {
        throw new Error('Authentication service unavailable.');
      }

      if (result.success) {
        // Truthful handling of provider delivery states (Section 4.3 B4):
        // If provider is unconfigured, do NOT advance as if sent
        if (result.status === 'provider_not_configured') {
          setErrorMessage(
            'SMS provider is not configured. Real network delivery is currently unavailable in this environment.',
          );
          return;
        }

        // If provider rejected delivery, do NOT advance as if sent
        if (result.status === 'delivery_rejected') {
          setErrorMessage(
            'SMS delivery was rejected by telecom provider. Please verify your phone number and try again.',
          );
          return;
        }

        // If provider timed out with unknown outcome, do NOT advance as if sent
        if (result.status === 'delivery_timeout') {
          setErrorMessage(
            'Provider network timeout. The delivery outcome is uncertain. Please check your handset or tap Resend.',
          );
          return;
        }

        if (result.devCode && !isRealProvider) {
          setDevCode(result.devCode);
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
            result.error || 'Failed to send verification code. Please try again.',
          );
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Network connection error.';
      if (msg.toLowerCase().includes('timeout')) {
        setErrorMessage(
          'Network request timed out. The delivery outcome is uncertain. You may request a new code.',
        );
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtp = async () => {
    await executeSendOtp();
  };

  const handleResendOtp = async () => {
    // Generate a fresh request_id for user-requested resend (Section 4.2)
    const newRequestId = `req-resend-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setCode('');
    setDevCode(null);
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
      // Phase 6A: Submit verification with auth_session_token + code only (never resending phone)
      if (challenge?.authSessionToken && verifyTokenizedOtp) {
        result = await verifyTokenizedOtp({
          code: trimmedCode,
          displayName: displayName.trim() || undefined,
        });
      } else if (verifyOtp) {
        // Fallback for legacy mocks or providers where tokenized method is absent
        result = await verifyOtp(
          phone.trim(),
          trimmedCode,
          displayName.trim() || undefined,
        );
      } else {
        throw new Error('Authentication service unavailable.');
      }

      if (result.success) {
        clearChallenge?.();
        onLoginSuccess?.();
      } else {
        // Display expired/invalid/locked errors without needlessly wiping the user's phone input
        setErrorMessage(
          result.error || 'Invalid verification code. Please try again.',
        );
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Network connection error.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToPhone = () => {
    clearChallenge?.();
    setStep('phone');
    setCode('');
    setDevCode(null);
    setErrorMessage(null);
    setFieldError(null);
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title={step === 'phone' ? 'Workshift Sign In' : 'Verify Code'}
        subtitle={
          step === 'phone'
            ? 'Access your volunteer shifts & coordinator workspace'
            : challenge?.status === 'template_simulated'
              ? `Local template demo for ${phone}`
              : `Code sent to ${phone}`
        }
        showNotificationBell={false}
        onBackPress={step === 'otp' ? handleBackToPhone : undefined}
      />

      <ScreenContainer scroll style={styles.scroll}>
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
                {getDataMode() === 'mock'
                  ? 'Template Mode: enter any demo mobile number. No SMS or network request will be made.'
                  : 'Enter your mobile phone number to receive a secure SMS one-time passcode.'}
              </AppText>
            </View>

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
              helperText={getDataMode() === 'mock'
                ? 'Template Mode: any demo number is accepted locally.'
                : 'E.g. +959 followed by your 8-9 digit phone number'}
            />

            <View style={styles.fieldSpacer} />

            <AppInput
              label="Display Name (Optional)"
              placeholder="e.g. Daw Khin, Ko Aung"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              helperText="Used if creating a new volunteer profile"
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
                label="Send Verification Code"
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
                {challenge?.status === 'template_simulated'
                  ? 'A local demo code is ready for '
                  : 'An authentication code was requested for '}
                <AppText weight="bold" color={theme.colors.textPrimary}>
                  {phone}
                </AppText>
                {challenge?.status === 'template_simulated'
                  ? '. No SMS was sent.'
                  : '.'}
              </AppText>

              {/* Truthful delivery status metadata */}
              {challenge?.delivery ? (
                <View style={styles.deliveryBlock}>
                  <AppText variant="caption" color={theme.colors.textSecondary}>
                    {getDeliveryStatusDescription(challenge.delivery, challenge.status)}
                  </AppText>
                </View>
              ) : null}
            </View>

            {effectiveDevCode ? (
              <View
                style={[
                  styles.devBanner,
                  {
                    backgroundColor: hexToRgba(theme.colors.primary, 0.1),
                    borderColor: theme.colors.primary,
                  },
                ]}
              >
                <View style={styles.devBadgeRow}>
                  <StatusBadge status="info" label="DEV TEST OTP" />
                </View>
                <AppText variant="caption" color={theme.colors.primary}>
                  {challenge?.status === 'template_simulated' ? 'Template Demo Code: ' : 'Development Code: '}
                  <AppText weight="bold">{effectiveDevCode}</AppText>
                </AppText>
              </View>
            ) : null}

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
              helperText={challenge?.status === 'template_simulated'
                ? `Enter the local ${codeLength}-digit demo code`
                : `Enter the ${codeLength}-digit code received via SMS`}
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
    paddingVertical: 20,
    paddingHorizontal: 16,
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
  fieldSpacer: {
    height: 16,
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
  devBanner: {
    marginBottom: 16,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  devBadgeRow: {
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
});
