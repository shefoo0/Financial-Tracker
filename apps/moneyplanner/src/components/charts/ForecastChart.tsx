import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/constants/theme';
import type { Fils, ForecastDay, ForecastMonth } from '@/types';
import { BalanceChart } from './BalanceChart';
import { buildSeries, describeSeries, RANGES, type Range, type SeriesPoint } from './chartMath';

/** The hero balance chart with its 1M / 2M / 6M / 1Y range chips underneath. */
export function ForecastChart({
  days,
  months,
  buffer,
  currency,
  range,
  onRangeChange,
  onScrub,
  plain = false,
  testID,
}: {
  days: ForecastDay[];
  months: ForecastMonth[];
  buffer: Fils;
  currency: string;
  range: Range;
  onRangeChange: (r: Range) => void;
  onScrub?: (p: SeriesPoint | null) => void;
  /** Solid white / near-black card: draw with the normal theme colours instead of white. */
  plain?: boolean;
  testID?: string;
}) {
  const c = useTheme();
  const points = useMemo(() => buildSeries(range, days, months), [range, days, months]);
  const spoken = RANGES.find((r) => r.key === range)?.spoken ?? '';
  return (
    <View style={{ gap: Spacing.two }}>
      <BalanceChart
        key={range}
        variant={plain ? 'default' : 'onHero'}
        points={points}
        buffer={buffer}
        currency={currency}
        accessibilityLabel={describeSeries(points, spoken, currency, buffer)}
        onScrub={onScrub}
        testID={testID}
      />
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', alignSelf: 'center', gap: Spacing.one, padding: 3, borderRadius: Radius.pill, backgroundColor: plain ? c.backgroundSelected : 'rgba(255,255,255,0.16)' }}>
        {RANGES.map((r) => {
          const on = r.key === range;
          return (
            <Pressable
              key={r.key}
              onPress={() => {
                onScrub?.(null);
                onRangeChange(r.key);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              accessibilityLabel={`Show the ${r.spoken}`}
              testID={testID ? `${testID}-range-${r.key}` : undefined}
              hitSlop={4}
              style={{ minWidth: 52, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill, backgroundColor: on ? (plain ? c.accent : '#FFFFFF') : 'transparent' }}>
              <T variant="label" maxFontSizeMultiplier={1.3} style={{ color: on ? (plain ? c.onAccent : '#4A2FD0') : plain ? c.text : '#FFFFFF', fontWeight: '700' }}>
                {r.label}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
