/**
 * @format
 */

export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemeColors {
  // Core theme color tokens (standard contract)
  background: string;
  surface: string;
  surfaceRaised: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  primary: string;
  onPrimary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  muted: string;

  // Extended design style tokens (CommonGround Mobile UI specification)
  primaryGradientStart: string;
  primaryGradientEnd: string;
  indigo: string;
  sky: string;
  amber: string;
  emerald: string;
  rose: string;
  heroGradientStart: string;
  heroGradientEnd: string;
  shadowColor: string;
  glowOpacity: number;
  overlay: string;
  borderSubtle: string;
}

export interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  '2xl': number;
  xxxl: number;
  '3xl': number;
}

export interface ThemeRadius {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  card: number;
  button: number;
  input: number;
  squircle: number;
  sheet: number;
  pill: number;
  round: number;
}

export interface TypographyToken {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700' | '800';
  letterSpacing?: number;
}

export interface ThemeTypography {
  hero: TypographyToken;
  heading: TypographyToken;
  title: TypographyToken;
  body: TypographyToken;
  caption: TypographyToken;
  label: TypographyToken;
  eyebrow: TypographyToken;
  metric: TypographyToken;
}

export interface AppTheme {
  mode: 'light' | 'dark';
  colors: ThemeColors;
  spacing: ThemeSpacing;
  radius: ThemeRadius;
  typography: ThemeTypography;
}

export const spacing: ThemeSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  '2xl': 24,
  xxxl: 32,
  '3xl': 32,
};

export const radius: ThemeRadius = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 24,
  card: 20,
  button: 14,
  input: 12,
  squircle: 13,
  sheet: 28,
  pill: 9999,
  round: 9999,
};

export const typography: ThemeTypography = {
  hero: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  heading: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  },
  label: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  eyebrow: {
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  metric: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
};

/**
 * Utility function to convert a hex color string to rgba with opacity.
 * Used for delicate tinted pill backgrounds, borders, and ambient glows.
 */
export function hexToRgba(hex: string, alpha: number = 1): string {
  if (!hex || typeof hex !== 'string') {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
    return hex;
  }
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map(c => c + c)
      .join('');
  }
  if (clean.length !== 6) {
    return hex;
  }
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
