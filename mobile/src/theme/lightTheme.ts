/**
 * @format
 */

import { AppTheme, radius, spacing, ThemeColors, typography } from './tokens';

/**
 * CommonGround Light Theme (Day · Blue + Cream)
 * Direct implementation of mobile-ui-style.html design specification.
 */
export const lightColors: ThemeColors = {
  background: '#FAF4E8',
  surface: '#FFFDF8',
  surfaceRaised: '#F3EAD8',
  textPrimary: '#0E1A33',
  textSecondary: '#56607A',
  border: '#E7DCC4',
  primary: '#2563EB',
  onPrimary: '#FFFFFF',
  accent: '#0369A1',
  success: '#059669',
  warning: '#C2410C',
  danger: '#E11D48',
  muted: '#8E92A0',

  // Extended tokens from source
  primaryGradientStart: '#2563EB',
  primaryGradientEnd: '#4F46E5',
  indigo: '#4F46E5',
  sky: '#0369A1',
  amber: '#C2410C',
  emerald: '#059669',
  rose: '#E11D48',
  heroGradientStart: '#E3ECFF',
  heroGradientEnd: '#FFF6E2',
  shadowColor: 'rgba(37, 99, 235, 0.12)',
  glowOpacity: 0.18,
  overlay: 'rgba(10, 15, 30, 0.50)',
  borderSubtle: '#EDE5D2',
};

export const lightTheme: AppTheme = {
  mode: 'light',
  colors: lightColors,
  spacing,
  radius,
  typography,
};
