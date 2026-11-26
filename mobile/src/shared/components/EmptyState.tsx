/**
 * @format
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useConsumerMode } from '../../app/configuration/consumerMode';
import { hexToRgba, useAppTheme } from '../../theme';
import { AppButton } from './AppButton';
import { AppIcon, IconName } from './AppIcon';
import { AppText } from './AppText';
import type { EmptyFormFieldSpec } from './EmptyFormTemplate';

const DEFAULT_PLACEHOLDER_FIELDS: ReadonlyArray<EmptyFormFieldSpec> = [
  { label: 'Title', placeholder: 'No record yet' },
  { label: 'Schedule / Status', placeholder: '—' },
];

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: IconName;
  actionLabel?: string;
  onActionPress?: () => void;
  templateFields?: ReadonlyArray<EmptyFormFieldSpec>;
  showTemplateForm?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  title,
  description,
  icon = 'info',
  actionLabel,
  onActionPress,
  templateFields = DEFAULT_PLACEHOLDER_FIELDS,
  showTemplateForm,
  style,
}: EmptyStateProps): React.JSX.Element {
  const { theme, isDark } = useAppTheme();
  const { consumerOnly } = useConsumerMode();
  const renderFormSlots = showTemplateForm ?? consumerOnly;

  return (
    <View
      style={[
        styles.container,
        {
          padding: 24,
          backgroundColor: theme.colors.surface,
          borderRadius: 20,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.iconSquircle,
          {
            backgroundColor: theme.colors.surfaceRaised,
            borderColor: theme.colors.border,
            borderRadius: 16,
          },
        ]}
      >
        <AppIcon
          name={icon}
          size={22}
          color={theme.colors.muted}
        />
      </View>

      <AppText
        variant="title"
        weight="extrabold"
        color={theme.colors.textPrimary}
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

      {renderFormSlots && templateFields.length > 0 ? (
        <View
          testID="empty-state-form-template"
          style={[
            styles.placeholderForm,
            {
              backgroundColor: hexToRgba(
                theme.colors.surfaceRaised,
                isDark ? 0.55 : 0.75,
              ),
              borderColor: theme.colors.border,
            },
          ]}
        >
          {templateFields.map(field => (
            <View key={field.label} style={styles.placeholderField}>
              <AppText
                variant="eyebrow"
                weight="semibold"
                color={theme.colors.textSecondary}
              >
                {field.label}
              </AppText>
              <View
                style={[
                  styles.placeholderInput,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <AppText variant="caption" color={theme.colors.muted}>
                  {field.placeholder ?? '—'}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {actionLabel && onActionPress ? (
        <AppButton
          label={actionLabel}
          onPress={onActionPress}
          variant="secondary"
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
    borderWidth: 1,
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
  placeholderForm: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    gap: 10,
  },
  placeholderField: {
    gap: 4,
  },
  placeholderInput: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
