import { isLiquidGlassAvailable, GlassView } from 'expo-glass-effect';
import { useId, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** '#RRGGBB' plus an opacity (0 to 1) as an 8-digit hex colour. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

/** A diagonal (top-left to bottom-right) gradient filling its parent. Decorative. */
export function GradientFill({ colors }: { colors: readonly string[] }) {
  const id = 'g' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          {colors.map((col, i) => (
            <Stop key={i} offset={colors.length === 1 ? 0 : i / (colors.length - 1)} stopColor={col} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** Frosted glass surface: glass fill + hairline border (+ soft shadow in light mode). */
export function Glass({
  children,
  style,
  radius = Radius.lg,
  testID,
  accessible,
  accessibilityLabel,
  accessibilityRole,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  testID?: string;
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'radiogroup' | 'summary' | 'text';
}) {
  const c = useTheme();
  const scheme = useColorScheme();
  const base: ViewStyle = {
    borderRadius: radius,
    borderWidth: 1,
    borderColor: c.glassBorder,
    boxShadow: scheme === 'light' ? `0 6px 20px ${c.shadow}` : undefined,
  };
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={scheme}
        style={[base, style]}
        testID={testID}
        accessible={accessible}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole}>
        {children}
      </GlassView>
    );
  }
  return (
    <View
      style={[base, { backgroundColor: c.glass }, style]}
      testID={testID}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}>
      {children}
    </View>
  );
}

export const hiddenFromA11y = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

