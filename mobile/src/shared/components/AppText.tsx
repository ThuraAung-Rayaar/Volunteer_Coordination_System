/**
 * @format
 */

import React from 'react';
import { StyleSheet, Text, TextProps, TextStyle } from 'react-native';
import { useAppTheme } from '../../theme';

export type TextVariant =
  | 'hero'
  | 'heading'
  | 'title'
  | 'body'
  | 'caption'
  | 'label'
  | 'eyebrow'
  | 'metric';

export type TextWeight =
  | 'regular'
  | 'medium'
  | 'semibold'
  | 'bold'
  | 'extrabold';

const WEIGHT_MAP: Record<TextWeight, TextStyle['fontWeight']> = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
};

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  weight?: TextWeight;
  children: React.ReactNode;
}

export function AppText({
  variant = 'body',
  color,
  weight,
  style,
  children,
  ...restProps
}: AppTextProps): React.JSX.Element {
  const { theme } = useAppTheme();

  const variantStyle = theme.typography[variant] ?? theme.typography.body;
  const defaultTextColor =
    variant === 'caption' || variant === 'eyebrow'
      ? theme.colors.textSecondary
      : theme.colors.textPrimary;

  const colorStyle: TextStyle = {
    color: color ?? defaultTextColor,
  };

  const weightStyle: TextStyle | undefined = weight
    ? { fontWeight: WEIGHT_MAP[weight] }
    : undefined;

  return (
    <Text
      style={[styles.base, variantStyle, colorStyle, weightStyle, style]}
      {...restProps}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});
