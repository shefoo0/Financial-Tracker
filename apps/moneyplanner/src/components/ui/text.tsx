import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type Tone = 'default' | 'secondary' | 'accent' | 'positive' | 'negative' | 'warning' | 'onHero';

export function T({
  children,
  variant = 'body',
  tone = 'default',
  style,
  ...rest
}: {
  children: ReactNode;
  variant?: 'title' | 'heading' | 'body' | 'label' | 'caption' | 'number';
  tone?: Tone;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  accessibilityLabel?: string;
  accessibilityRole?: 'header' | 'text' | 'alert';
  maxFontSizeMultiplier?: number;
  testID?: string;
}) {
  const c = useTheme();
  const color = {
    default: c.text,
    secondary: c.textSecondary,
    accent: c.accent,
    positive: c.positive,
    negative: c.negative,
    warning: c.warning,
    onHero: c.onHero.ink,
  }[tone];
  return (
    <Text style={[textStyles[variant], { color }, style]} {...rest}>
      {children}
    </Text>
  );
}

export const textStyles = StyleSheet.create({
  title: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.5 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18 },
  number: { fontSize: 16, lineHeight: 22, fontVariant: ['tabular-nums'], fontWeight: '700' },
});
