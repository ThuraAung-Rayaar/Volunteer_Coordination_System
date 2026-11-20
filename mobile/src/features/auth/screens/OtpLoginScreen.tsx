/**
 * @format
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useCurrentUser } from '../../../app/UserContext';
import type { RequestOtpResult, VerifyOtpResult } from '../../../app/UserContext';
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
  const isDevBuild =
    (typeof __DEV__ !== 'undefined' && Boolean(__DEV__)) ||
    process.env.NODE_ENV !== 'production';
  const effectiveDevCode = isDevBuild ? (challenge?.devCode ?? devCode) : null;

  const handleSendOtp = async () => {
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
    try {
      let result: RequestOtpResult;
      if (requestOtp) {
        result = await requestOtp(trimmedPhone, 'login');
      } else if (requestTokenizedOtp) {
        result = await requestTokenizedOtp({
          phone: trimmedPhone,
          purpose: 'login',
        });
      } else {
        throw new Error('Authentication service unavailable.');
      }

      if (result.success) {
        if (result.devCode) {
          setDevCode(result.devCode);
          setCode(result.devCode);
        }
        setStep('otp');
      } else {
        setErrorMessage(
          result.error || 'Failed to send verification code. Please try again.',
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
                Enter your mobile phone number to receive a secure SMS one-time
                passcode.
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
              helperText="E.g. +959 followed by your 8-9 digit phone number"
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
                We have sent an authentication code to{' '}
                <AppText weight="bold" color={theme.colors.textPrimary}>
                  {phone}
                </AppText>
                .
              </AppText>

              {/* Truthful delivery status metadata */}
              {challenge?.delivery ? (
                <View style={styles.deliveryBlock}>
                  <AppText variant="caption" color={theme.colors.textSecondary}>
                    Delivery channel: {challenge.delivery.channel || 'SMS'}
                    {challenge.delivery.delivered
                      ? ' (delivered)'
                      : 'configured' in challenge.delivery &&
                        challenge.delivery.configured === false
                      ? ' (simulation mode / provider unconfigured)'
                      : ' (queued)'}
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
                  Development Code: <AppText weight="bold">{effectiveDevCode}</AppText>
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
                  onPress={handleSendOtp}
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
