import { useState } from 'react';

import { T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
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
export function ForecastHero({ fc, todayStr, currency, buffer, history, chartStyle = 'plain' }: { fc: Forecast; todayStr: ISODate; currency: string; buffer: Fils; history?: HistoryDay[]; chartStyle?: ChartStyleName }) {
  const c = useTheme();
  const plain = chartStyle === 'plain';
  const ink = plain ? c.text : '#FFFFFF';
  const [range, setRange] = useState<Range>('2M');
  const [scrub, setScrub] = useState<SeriesPoint | null>(null);
  const label = scrub ? scrub.title : balanceLabel(fc.asOf, todayStr);
  const balance = scrub ? scrub.balance : fc.balanceAsOf;
  return (
    <>
      <T variant="caption" style={{ color: plain ? c.textSecondary : '#FFFFFF', letterSpacing: 1, fontWeight: '700' }} testID="dashboard-balance-caption">
        {label.toUpperCase()}
      </T>
      <T
        variant="title"
        maxFontSizeMultiplier={1.4}
        style={{ color: ink, fontSize: 36, lineHeight: 44, fontVariant: ['tabular-nums'] }}
        accessibilityLabel={`${label}: ${formatMoney(balance, currency)}`}>
        {formatMoneyTrim(balance, currency)}
      </T>
      <ForecastChart
        days={fc.days}
        months={fc.months}
        history={history}
        buffer={buffer}
        currency={currency}
        range={range}
        onRangeChange={setRange}
        onScrub={setScrub}
        chartStyle={chartStyle}
        testID="dashboard-balance-chart"
      />
    </>
  );
}
