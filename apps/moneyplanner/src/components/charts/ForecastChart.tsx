import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { T } from '@/components/ui';
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
  testID,
}: {
  days: ForecastDay[];
  months: ForecastMonth[];
  buffer: Fils;
  currency: string;
  range: Range;
  onRangeChange: (r: Range) => void;
  onScrub?: (p: SeriesPoint | null) => void;
  testID?: string;
}) {
  const points = useMemo(() => buildSeries(range, days, months), [range, days, months]);
  const spoken = RANGES.find((r) => r.key === range)?.spoken ?? '';
  return (
    <View style={{ gap: Spacing.two }}>
      <BalanceChart
        key={range}
        variant="onHero"
        points={points}
        buffer={buffer}
        currency={currency}
        accessibilityLabel={describeSeries(points, spoken, currency, buffer)}
        onScrub={onScrub}
        testID={testID}
      />
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', alignSelf: 'center', gap: Spacing.one, padding: 3, borderRadius: Radius.pill, backgroundColor: 'rgba(255,255,255,0.16)' }}>
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
              style={{ minWidth: 52, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill, backgroundColor: on ? '#FFFFFF' : 'transparent' }}>
              <T variant="label" maxFontSizeMultiplier={1.3} style={{ color: on ? '#4A2FD0' : '#FFFFFF', fontWeight: '700' }}>
                {r.label}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
