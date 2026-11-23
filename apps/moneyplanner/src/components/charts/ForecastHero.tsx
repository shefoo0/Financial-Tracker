import { useState } from 'react';
import { Pressable } from 'react-native';

import { T } from '@/components/ui';
import { useCardTone } from '@/hooks/use-card-tone';
import type { HistoryDay } from '@/engine/history';
import { type ChartStyleName } from '@/constants/theme';
import { balanceLabel, shortDate } from '@/features/dashboard/helpers';
import { formatMoney, formatMoneyTrim } from '@/lib/money';
import type { Fils, Forecast, ISODate } from '@/types';
import { type Range, type SeriesPoint } from './chartMath';
import { ForecastChart } from './ForecastChart';

/**
 * Contents of the dashboard hero card: the balance, a "lowest" pill, and the scrubbable chart. The big number shows
 * the balance under the finger while scrubbing and goes back to today on release. The scrub state lives here, so only
 * this card re-renders while dragging.
 */
export function ForecastHero({
  fc,
  todayStr,
  currency,
  buffer,
  history,
  chartStyle = 'plain',
  range: rangeProp,
  onRangeChange,
  onBalancePress,
}: {
  fc: Forecast;
  todayStr: ISODate;
  currency: string;
  buffer: Fils;
  history?: HistoryDay[];
  chartStyle?: ChartStyleName;
  /** The chart's range (Home passes the saved setting); without it the card keeps its own. */
  range?: Range;
  /** Called when a range chip is tapped (Home saves it as the setting). */
  onRangeChange?: (r: Range) => void;
  /** Tapping the big number (Home opens the balance sheet). */
  onBalancePress?: () => void;
}) {
  const { ink, sub } = useCardTone(chartStyle);
  const [ownRange, setOwnRange] = useState<Range>('2M');
  const range = rangeProp ?? ownRange;
  const [scrub, setScrub] = useState<SeriesPoint | null>(null);
  const label = scrub ? scrub.title : balanceLabel(fc.asOf, todayStr);
  const balance = scrub ? scrub.balance : fc.balanceAsOf;
  return (
    <>
      <T variant="caption" style={{ color: sub, letterSpacing: 1, fontWeight: '700' }} testID="dashboard-balance-caption">
        {label.toUpperCase()}
      </T>
      <Pressable
        onPress={onBalancePress}
        disabled={!onBalancePress}
        accessibilityRole={onBalancePress ? 'button' : 'text'}
        accessibilityLabel={`${label}: ${formatMoney(balance, currency)}`}
        accessibilityHint={onBalancePress ? 'Opens the balance settings' : undefined}
        testID="dashboard-balance-value"
        style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
        <T variant="title" maxFontSizeMultiplier={1.4} style={{ color: ink, fontSize: 36, lineHeight: 44, fontVariant: ['tabular-nums'] }}>
          {formatMoneyTrim(balance, currency)}
        </T>
      </Pressable>
      <ForecastChart
        days={fc.days}
        months={fc.months}
        history={history}
        buffer={buffer}
        currency={currency}
        range={range}
        onRangeChange={(r) => {
          setOwnRange(r);
          onRangeChange?.(r);
        }}
        onScrub={setScrub}
        chartStyle={chartStyle}
        testID="dashboard-balance-chart"
      />
    </>
  );
}
