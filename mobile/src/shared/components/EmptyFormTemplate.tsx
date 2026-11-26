/**
 * @format
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { hexToRgba, useAppTheme } from '../../theme';
import { AppButton } from './AppButton';
import { AppIcon, IconName } from './AppIcon';
import { AppText } from './AppText';

export interface EmptyFormFieldSpec {
  label: string;
  placeholder?: string;
  multiline?: boolean;
}

export interface EmptyFormTemplateProps {
  title: string;
  description?: string;
  icon?: IconName;
  fields?: ReadonlyArray<EmptyFormFieldSpec>;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_TEMPLATE_FIELDS: ReadonlyArray<EmptyFormFieldSpec> = [
  { label: 'Title', placeholder: 'No title yet' },
  { label: 'Schedule', placeholder: 'Not scheduled yet' },
  { label: 'Details', placeholder: 'Information will appear here once added.', multiline: true },
];

/**
 * Clean placeholder form card displayed whenever data is missing or unavailable
 * in consumer mode, keeping screens calm and structured without exposing errors.
 */
export function EmptyFormTemplate({
  title,
  description = 'This form will fill automatically once records are available.',
  icon = 'info',
  fields = DEFAULT_TEMPLATE_FIELDS,
  actionLabel,
  onActionPress,
  style,
}: EmptyFormTemplateProps): React.JSX.Element {
  const { theme, isDark } = useAppTheme();

  return (
    <View
      testID="empty-form-template"
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: 20,
        },
        style,
      ]}
    >
      <View style={styles.headerRow}>
        <View
          style={[
            styles.iconSquircle,
            {
              backgroundColor: hexToRgba(theme.colors.primary, isDark ? 0.18 : 0.08),
              borderColor: hexToRgba(theme.colors.primary, isDark ? 0.35 : 0.16),
              borderRadius: 14,
            },
          ]}
        >
          <AppIcon name={icon} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.headerText}>
          <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
            {title}
          </AppText>
          <AppText
            variant="caption"
            color={theme.colors.textSecondary}
            style={styles.description}
          >
            {description}
          </AppText>
        </View>
      </View>

      <View style={styles.fieldsWrap}>
        {fields.map(field => (
          <View key={field.label} style={styles.fieldGroup}>
            <AppText
              variant="eyebrow"
              weight="semibold"
              color={theme.colors.textSecondary}
              style={styles.fieldLabel}
            >
              {field.label}
            </AppText>
            <View
              style={[
                styles.fieldBox,
                field.multiline && styles.fieldBoxMultiline,
                {
                  backgroundColor: theme.colors.surfaceRaised,
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
    width: '100%',
    borderWidth: 1,
    padding: 20,
    marginVertical: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  iconSquircle: {
    width: 44,
    height: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  description: {
    marginTop: 3,
    lineHeight: 17,
  },
  fieldsWrap: {
    gap: 12,
  },
  fieldGroup: {
    gap: 5,
  },
  fieldLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fieldBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  fieldBoxMultiline: {
    minHeight: 62,
  },
  actionButton: {
    marginTop: 16,
  },
});
