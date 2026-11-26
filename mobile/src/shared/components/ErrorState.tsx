/**
 * @format
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import {
  sanitizeConsumerMessage,
  useConsumerMode,
} from '../../app/configuration/consumerMode';
import { hexToRgba, useAppTheme } from '../../theme';
import { AppButton } from './AppButton';
import { AppIcon } from './AppIcon';
import { AppText } from './AppText';
import { EmptyFormFieldSpec, EmptyFormTemplate } from './EmptyFormTemplate';

export interface ErrorStateProps {
  title?: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  templateFields?: ReadonlyArray<EmptyFormFieldSpec>;
  style?: StyleProp<ViewStyle>;
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  retryLabel = 'Try again',
  templateFields,
  style,
}: ErrorStateProps): React.JSX.Element {
  const { theme, isDark } = useAppTheme();
  const { consumerOnly } = useConsumerMode();

  if (consumerOnly) {
    const safeTitle = /failed|error|something went wrong|unavailable/i.test(title)
      ? 'Empty Form Template'
      : title;
    const safeDescription = sanitizeConsumerMessage(
      description,
      'Information will appear here once available.',
    );
    return (
      <EmptyFormTemplate
        title={safeTitle}
        description={safeDescription}
        fields={templateFields}
        actionLabel={onRetry ? 'Refresh' : undefined}
        onActionPress={onRetry}
        style={style}
      />
    );
  }

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.container,
        {
          padding: 24,
          backgroundColor: hexToRgba(theme.colors.danger, isDark ? 0.16 : 0.08),
          borderRadius: 20,
          borderColor: hexToRgba(theme.colors.danger, isDark ? 0.40 : 0.25),
        },
        style,
      ]}
    >
      <View
        style={[
          styles.iconSquircle,
          {
            backgroundColor: hexToRgba(theme.colors.danger, isDark ? 0.25 : 0.14),
            borderRadius: 16,
          },
        ]}
      >
        <AppIcon
          name="alert"
          size={22}
          color={theme.colors.danger}
        />
      </View>

      <AppText
        variant="title"
        weight="extrabold"
        color={theme.colors.danger}
        style={styles.title}
      >
        {title}
      </AppText>

      <AppText
        variant="body"
        color={theme.colors.textSecondary}
        style={styles.description}
      >
        {description}
      </AppText>

      {onRetry ? (
        <AppButton
          label={retryLabel}
          onPress={onRetry}
          variant="outline"
          leftIcon="refresh"
          style={styles.actionButton}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    borderWidth: 1,
    marginVertical: 12,
  },
  iconSquircle: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    textAlign: 'center',
    marginBottom: 6,
    fontSize: 16,
  },
  description: {
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 18,
  },
  actionButton: {
    minWidth: 140,
  },
});
