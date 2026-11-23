import { useMemo } from 'react';
import { View } from 'react-native';

import { Spacing, type ChartStyleName } from '@/constants/theme';
import { useCardTone } from '@/hooks/use-card-tone';
import type { HistoryDay } from '@/engine/history';
import type { Fils, ForecastDay, ForecastMonth } from '@/types';
import { BalanceChart, ChartLegend } from './BalanceChart';
import { RangeChips } from './RangeChips';
import { balanceSeries } from './registry';
import { describeSeries, RANGES, todayIndexOf, type Range, type SeriesPoint } from './chartMath';

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
  const tone = useCardTone(chartStyle);
  const { plain, lines: lineColors } = tone;
  const points = useMemo(() => balanceSeries(range, days, months, history)[0].points, [range, days, months, history]);
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
      <RangeChips
        ranges={RANGES}
        value={range}
        onChange={(r) => {
          onScrub?.(null);
          onRangeChange(r);
        }}
        tone={tone}
        testID={testID}
      />
    </View>
  );
}
