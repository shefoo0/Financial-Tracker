import { useId, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Palette, PlainCard, Radius, Spacing, type ChartStyleName } from '@/constants/theme';
import { useCardTone } from '@/hooks/use-card-tone';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { Glass, GradientFill, hiddenFromA11y, withAlpha } from './internal';
import { T, type Tone } from './text';

/** Three big soft radial blobs over the background (top-left, right-middle, bottom-left). Decorative. */
export function AuroraBackground() {
  const c = useTheme();
  // Unique ids: on the web every mounted screen's SVG shares one document.
  const uid = 'au' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const blobs = [
    { id: uid + '0', cx: '15%', cy: '8%', r: '55%', color: c.aurora[0] },
    { id: uid + '1', cx: '95%', cy: '45%', r: '48%', color: c.aurora[1] },
    { id: uid + '2', cx: '5%', cy: '95%', r: '52%', color: c.aurora[2] },
  ];
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.background }]} pointerEvents="none" {...hiddenFromA11y}>
      <Svg width="100%" height="100%">
        <Defs>
          {blobs.map((b) => (
            <RadialGradient key={b.id} id={b.id} cx={b.cx} cy={b.cy} r={b.r} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={b.color} stopOpacity={1} />
              <Stop offset="1" stopColor={b.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {blobs.map((b) => (
          <Rect key={b.id} x="0" y="0" width="100%" height="100%" fill={`url(#${b.id})`} />
        ))}
      </Svg>
    </View>
  );
}

export function Card({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <Glass style={[styles.card, style]} testID={testID}>
      {children}
    </Glass>
  );
}

/** The gradient balance card. Put text in it with tone="onHero". */
export function HeroCard({
  children,
  testID,
  accessibilityLabel,
  style,
  chartStyle = 'ocean',
}: {
  children: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** 'plain' is a solid white / near-black card (use normal text colours); the rest are gradients (white text). */
  chartStyle?: ChartStyleName;
}) {
  const c = useTheme();
  const dark = useColorScheme() === 'dark';
  const { gradient } = useCardTone(chartStyle);
  const plain = PlainCard[dark ? 'dark' : 'light'];
  const shadow = gradient ? withAlpha(gradient[0], 0.35) : c.shadow;
  return (
    <View
      style={[{ borderRadius: Radius.xl, boxShadow: `0 14px 30px ${shadow}` }, style]}
      testID={testID}
      accessible={accessibilityLabel ? true : undefined}
      accessibilityLabel={accessibilityLabel}>
      <View style={[styles.hero, gradient ? null : { backgroundColor: plain.bg, borderWidth: 1, borderColor: plain.border }]}>
        {gradient && <GradientFill colors={gradient} />}
        {gradient && <View style={[styles.sheen, { backgroundColor: c.onHero.sheen }]} {...hiddenFromA11y} pointerEvents="none" />}
        <View style={styles.heroContent}>{children}</View>
      </View>
    </View>
  );
}

/** Rounded-square tile with `color` at about 20% opacity behind the glyph or emoji. */
export function IconBadge({ glyph, color, size = 38 }: { glyph: string; color: string; size?: number }) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: withAlpha(color, 0.2), alignItems: 'center', justifyContent: 'center' }}
      {...hiddenFromA11y}>
      <Text style={{ fontSize: size * 0.48, lineHeight: size * 0.62, color }} maxFontSizeMultiplier={1.2}>
        {glyph}
      </Text>
    </View>
  );
}

/** Circle with a gradient from the profile colour and the white initial of the name. */
export function Avatar({ name, color, size = 32 }: { name: string; color: number; size?: number }) {
  const c = useTheme();
  const i = ((color % Palette.length) + Palette.length) % Palette.length;
  const initial = (name.trim().charAt(0) || '?').toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }} {...hiddenFromA11y}>
      <GradientFill colors={[Palette[i], Palette[(i + 3) % Palette.length]]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: c.onHero.shade }]} />
      <Text style={{ color: c.onHero.ink, fontWeight: '800', fontSize: size * 0.44, lineHeight: size * 0.6 }} maxFontSizeMultiplier={1.2}>
        {initial}
      </Text>
    </View>
  );
}

/** Small glass tile: tinted icon on top, a secondary label and a bold value in the tone colour. */
export function StatTile({
  label,
  value,
  tone = 'default',
  icon,
  testID,
  accessibilityLabel,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'accent' | 'warning' | 'default';
  icon?: string;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const c = useTheme();
  const color = { positive: c.positive, negative: c.negative, accent: c.accent, warning: c.warning, default: c.text }[tone];
  return (
    <Glass
      style={styles.tile}
      radius={Radius.md}
      testID={testID}
      accessible
      accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}>
      {icon ? <IconBadge glyph={icon} color={color} /> : null}
      <T variant="caption" tone="secondary" numberOfLines={1}>
        {label}
      </T>
      <T variant="number" tone={tone === 'default' ? 'default' : tone} style={styles.tileValue} numberOfLines={1}>
        {value}
      </T>
    </Glass>
  );
}

/** Small rounded label, tinted by tone. */
export function Pill({ label, tone = 'default' }: { label: string; tone?: Tone }) {
  const c = useTheme();
  const color = { default: c.text, secondary: c.textSecondary, accent: c.accent, positive: c.positive, negative: c.negative, warning: c.warning, onHero: c.onHero.ink }[tone];
  const bg = tone === 'onHero' ? c.onHero.badge : withAlpha(tone === 'default' || tone === 'secondary' ? c.textSecondary : color, 0.16);
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <T variant="caption" tone={tone} style={{ fontWeight: '700' }}>
        {label}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, gap: Spacing.two },
  hero: { borderRadius: Radius.xl, overflow: 'hidden' },
  heroContent: { padding: 20, gap: Spacing.two },
  sheen: { position: 'absolute', top: -70, right: -50, width: 200, height: 200, borderRadius: 100 },
  // minWidth 0: three tiles share a 320-point phone without running off the edge.
  tile: { flex: 1, minWidth: 0, padding: 12, gap: 4 },
  tileValue: { fontSize: 18, lineHeight: 24, fontWeight: '800' },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.pill },
});
