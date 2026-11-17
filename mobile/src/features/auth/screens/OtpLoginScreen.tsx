/**
 * @format
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useCurrentUser } from '../../../app/UserContext';
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
  const { requestOtp, verifyOtp } = useCurrentUser();

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('+959');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const handleSendOtp = async () => {
    setErrorMessage(null);
    setFieldError(null);

    const trimmedPhone = phone.trim();
    if (!trimmedPhone || trimmedPhone === '+959') {
      setFieldError('Please enter your mobile phone number.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await requestOtp(trimmedPhone, 'login');
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
    setErrorMessage(null);
    setFieldError(null);

    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setFieldError('Please enter the 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await verifyOtp(
        phone.trim(),
        trimmedCode,
        displayName.trim() || undefined,
      );

      if (result.success) {
        onLoginSuccess?.();
      } else {
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
    setStep('phone');
    setCode('');
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
                Enter 6-Digit Code
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
            </View>

            {devCode ? (
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
                  Development Code: <AppText weight="bold">{devCode}</AppText>
                </AppText>
              </View>
            ) : null}

            <AppInput
              label="Verification Code"
              placeholder="123456"
              value={code}
              onChangeText={text => {
                setCode(text);
                if (fieldError) setFieldError(null);
              }}
              keyboardType="number-pad"
              maxLength={6}
              error={fieldError ?? undefined}
              helperText="Enter the 6-digit code received via SMS"
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
