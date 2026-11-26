/**
 * @format
 */

import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

export interface VcsLogoProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
  showRing?: boolean;
}

/**
 * Brand emblem for Volunteer Coordination System (VCS).
 * Renders a crisp vector squircle shield with gradient fill, subtle compass arc,
 * and bold centered "VCS" monogram.
 */
export function VcsLogo({
  size = 76,
  style,
  showRing = true,
}: VcsLogoProps): React.JSX.Element {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="VCS logo"
      style={[{ width: size, height: size }, style]}
    >
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Defs>
          <LinearGradient id="vcsBgGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#2563EB" />
            <Stop offset="55%" stopColor="#3B5BDB" />
            <Stop offset="100%" stopColor="#4F46E5" />
          </LinearGradient>
          <LinearGradient id="vcsAccentGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor="#38BDF8" stopOpacity="0.95" />
            <Stop offset="100%" stopColor="#34D399" stopOpacity="0.95" />
          </LinearGradient>
        </Defs>

        {/* Squircle base */}
        <Rect
          x="4"
          y="4"
          width="112"
          height="112"
          rx="28"
          ry="28"
          fill="url(#vcsBgGrad)"
        />

        {/* Subtle inner border */}
        <Rect
          x="8"
          y="8"
          width="104"
          height="104"
          rx="24"
          ry="24"
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.22"
          strokeWidth="2"
        />

        {showRing ? (
          <>
            {/* Top coordination arc */}
            <Path
              d="M 28 36 A 40 40 0 0 1 92 36"
              fill="none"
              stroke="url(#vcsAccentGrad)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* Bottom unity arc */}
            <Path
              d="M 32 88 A 38 38 0 0 0 88 88"
              fill="none"
              stroke="#FFFFFF"
              strokeOpacity="0.35"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <Circle cx="60" cy="21" r="4" fill="#34D399" />
          </>
        ) : null}

        {/* Bold VCS Monogram */}
        <SvgText
          x="60"
          y="72"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="36"
          fontWeight="800"
          letterSpacing="1.5"
        >
          VCS
        </SvgText>
      </Svg>
    </View>
  );
}
