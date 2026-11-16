/**
 * @format
 */

import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle } from 'react-native';
import { useAppTheme } from '../../theme';

export type IconName =
  | 'menu'
  | 'search'
  | 'close'
  | 'star'
  | 'check'
  | 'alert'
  | 'info'
  | 'calendar'
  | 'cal'
  | 'user'
  | 'chevron-right'
  | 'chevron-left'
  | 'arrow-left'
  | 'location'
  | 'pin'
  | 'map'
  | 'refresh'
  | 'filter'
  | 'edit'
  | 'home'
  | 'compass'
  | 'bell'
  | 'plus'
  | 'arrow'
  | 'back'
  | 'clock'
  | 'x'
  | 'brief'
  | 'spark'
  | 'trash'
  | 'globe';

/**
 * Standardized cross-platform typographic symbol mapping matching CommonGround Mobile UI.
 * Consistent monochrome glyphs that respect the theme tokens without color distortion.
 */
const GLYPH_MAP: Record<IconName, string> = {
  menu: '☰',
  search: '⌕',
  close: '✕',
  star: '★',
  check: '✓',
  alert: '⚠',
  info: 'ℹ',
  calendar: '◫',
  cal: '◫',
  user: '●',
  'chevron-right': '›',
  'chevron-left': '‹',
  'arrow-left': '←',
  location: '⌖',
  pin: '⌖',
  map: '⛶',
  refresh: '↻',
  filter: '▼',
  edit: '✎',
  home: '⌂',
  compass: '🧭',
  bell: '🔔',
  plus: '+',
  arrow: '→',
  back: '←',
  clock: '⏱',
  x: '✕',
  brief: '▤',
  spark: '✦',
  trash: '🗑',
  globe: '🌐',
};

export interface AppIconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

/**
 * Centralized AppIcon adapter component.
 * Replaces colorful OS emojis with consistent, theme-aware monochrome typographic glyphs.
 * Correctly hides decorative icons from screen readers while exposing meaningful labels.
 */
export function AppIcon({
  name,
  size = 18,
  color,
  style,
  accessibilityLabel,
}: AppIconProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const iconColor = color ?? theme.colors.textPrimary;
  const glyph = GLYPH_MAP[name] ?? '•';
  const isDecorative = !accessibilityLabel;

  return (
    <Text
      accessible={!isDecorative}
      accessibilityRole={isDecorative ? undefined : 'image'}
      accessibilityLabel={accessibilityLabel}
      aria-hidden={isDecorative}
      importantForAccessibility={isDecorative ? 'no' : 'yes'}
      style={[
        styles.glyph,
        {
          fontSize: size,
          lineHeight: size + 2,
          color: iconColor,
        },
        style,
      ]}
    >
      {glyph}
    </Text>
  );
}

const styles = StyleSheet.create({
  glyph: {
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
});
