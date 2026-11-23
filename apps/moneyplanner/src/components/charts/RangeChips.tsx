import { Pressable, View } from 'react-native';

import { T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import type { CardTone } from '@/hooks/use-card-tone';
import { useTheme } from '@/hooks/use-theme';

export interface RangeOption<K extends string = string> {
  key: K;
  label: string;
  /** What the screen reader says: "Show the next 2 months". */
  spoken: string;
}

/** A row of 1M / 2M / 6M / 1Y style chips (a radio group) in the card's colours. */
export function RangeChips<K extends string>({
  ranges,
  value,
  onChange,
  tone,
  testID,
}: {
  ranges: readonly RangeOption<K>[];
  value: K;
  onChange: (key: K) => void;
  tone: Pick<CardTone, 'plain'>;
  /** Chips get `${testID}-range-${key}`. */
  testID?: string;
}) {
  const c = useTheme();
  const { plain } = tone;
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', alignSelf: 'center', gap: Spacing.one, padding: 3, borderRadius: Radius.pill, backgroundColor: plain ? c.backgroundSelected : c.onHero.pill }}>
      {ranges.map((r) => {
        const on = r.key === value;
        return (
          <Pressable
            key={r.key}
            onPress={() => onChange(r.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={`Show the ${r.spoken}`}
            testID={testID ? `${testID}-range-${r.key}` : undefined}
            hitSlop={4}
            style={{ minWidth: 52, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill, backgroundColor: on ? (plain ? c.accent : c.onHero.pillOn) : 'transparent' }}>
            <T variant="label" maxFontSizeMultiplier={1.3} style={{ color: on ? (plain ? c.onAccent : c.onHero.pillOnText) : plain ? c.text : c.onHero.ink, fontWeight: '700' }}>
              {r.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}
