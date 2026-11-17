/**
 * @format
 */

import { AppTheme, radius, spacing, ThemeColors, typography } from './tokens';

/**
 * CommonGround Dark Theme (Night · Figma Slate)
 * Direct implementation of mobile-ui-style.html design specification.
 */
export const darkColors: ThemeColors = {
  background: '#070B14',
  surface: '#0F172A',
  surfaceRaised: '#151F33',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  border: '#1E293B',
  primary: '#3B82F6',
  onPrimary: '#FFFFFF',
  accent: '#38BDF8',
  success: '#34D399',
  warning: '#FBBF24',
  danger: '#FB7185',
  muted: '#64748B',

  // Extended tokens from source
  primaryGradientStart: '#3B82F6',
  primaryGradientEnd: '#818CF8',
  indigo: '#818CF8',
  sky: '#38BDF8',
  amber: '#FBBF24',
  emerald: '#34D399',
  rose: '#FB7185',
  heroGradientStart: 'rgba(37, 99, 235, 0.22)',
  heroGradientEnd: 'rgba(99, 102, 241, 0.06)',
  shadowColor: 'rgba(0, 0, 0, 0.40)',
  glowOpacity: 0.35,
  overlay: 'rgba(2, 4, 9, 0.75)',
  borderSubtle: '#192233',
};

export const darkTheme: AppTheme = {
  mode: 'dark',
  colors: darkColors,
  spacing,
  radius,
  typography,
};
