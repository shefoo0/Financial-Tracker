import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { ChartStyles, Radius, Spacing, type ChartStyleName } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { HistoryDay } from '@/engine/history';
import type { Fils, ForecastDay, ForecastMonth } from '@/types';
import { BalanceChart, ChartLegend } from './BalanceChart';
import { buildSeries, describeSeries, RANGES, todayIndexOf, type Range, type SeriesPoint } from './chartMath';

/** The hero balance chart with its 1M / 2M / 6M / 1Y range chips underneath. */
export function ForecastChart({
  days,
  months,
  history = [],
  buffer,
  currency,
  range,
  onRangeChange,
  onScrub,
  chartStyle = 'plain',
  testID,
}: {
  days: ForecastDay[];
  months: ForecastMonth[];
  /** Recorded balances up to today; with fewer than two days there is no actual part. */
  history?: HistoryDay[];
  buffer: Fils;
  currency: string;
  range: Range;
  onRangeChange: (r: Range) => void;
  onScrub?: (p: SeriesPoint | null) => void;
  /** Card style: 'plain' (solid white / near-black, theme colours) or a gradient (white ink). */
  chartStyle?: ChartStyleName;
  testID?: string;
}) {
  const c = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const plain = chartStyle === 'plain';
  const lineColors = ChartStyles[chartStyle].lines[scheme];
  const points = useMemo(() => buildSeries(range, days, months, history), [range, days, months, history]);
  const r0 = RANGES.find((r) => r.key === range);
  const spoken = r0?.spoken ?? '';
  const hasActual = todayIndexOf(points) >= 0;
  return (
    <View style={{ gap: Spacing.two }}>
      <BalanceChart
        key={range}
        variant={plain ? 'default' : 'onHero'}
        lineColors={lineColors}
        points={points}
        buffer={buffer}
        currency={currency}
        accessibilityLabel={describeSeries(points, spoken, currency, buffer, r0?.pastSpoken)}
        onScrub={onScrub}
        testID={testID}
      />
      {hasActual && <ChartLegend colors={lineColors} onHero={!plain} testID={testID ? `${testID}-legend` : undefined} />}
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
              <T variant="label" maxFontSizeMultiplier={1.3} style={{ color: on ? (plain ? c.onAccent : '#12142B') : plain ? c.text : '#FFFFFF', fontWeight: '700' }}>
                {r.label}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
