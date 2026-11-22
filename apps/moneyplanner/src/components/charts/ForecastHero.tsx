import { useState } from 'react';
import { View } from 'react-native';

import { T } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { balanceLabel, shortDate } from '@/features/dashboard/helpers';
import { formatMoney, formatMoneyTrim } from '@/lib/money';
import type { Fils, Forecast, ISODate } from '@/types';
import { RANGES, type Range, type SeriesPoint } from './chartMath';
import { ForecastChart } from './ForecastChart';

/**
 * Contents of the dashboard hero card: the balance, a "lowest" pill, and the scrubbable chart. The big number shows
 * the balance under the finger while scrubbing and goes back to today on release. The scrub state lives here, so only
 * this card re-renders while dragging.
 */
export function ForecastHero({ fc, todayStr, currency, buffer }: { fc: Forecast; todayStr: ISODate; currency: string; buffer: Fils }) {
  const [range, setRange] = useState<Range>('2M');
  const [scrub, setScrub] = useState<SeriesPoint | null>(null);
  const label = scrub ? scrub.title : balanceLabel(fc.asOf, todayStr);
  const balance = scrub ? scrub.balance : fc.balanceAsOf;
  return (
    <>
      <T variant="caption" tone="onHero" style={{ letterSpacing: 1, fontWeight: '700' }} testID="dashboard-balance-caption">
        {label.toUpperCase()}
      </T>
      <T
        variant="title"
        tone="onHero"
        maxFontSizeMultiplier={1.4}
        style={{ fontSize: 36, lineHeight: 44, fontVariant: ['tabular-nums'] }}
        accessibilityLabel={`${label}: ${formatMoney(balance, currency)}`}>
        {formatMoneyTrim(balance, currency)}
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        <View style={{ backgroundColor: Colors.dark.glass, borderRadius: Radius.pill, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one }}>
          <T variant="caption" tone="onHero">
            Lowest {formatMoney(fc.lowest.balance, currency)} · {shortDate(fc.lowest.date)}
          </T>
        </View>
        <View style={{ backgroundColor: Colors.dark.glass, borderRadius: Radius.pill, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one }}>
          <T variant="caption" tone="onHero">
            {RANGES.find((r) => r.key === range)?.spoken}
          </T>
        </View>
      </View>
      <ForecastChart
        days={fc.days}
        months={fc.months}
        buffer={buffer}
        currency={currency}
        range={range}
        onRangeChange={setRange}
        onScrub={setScrub}
        testID="dashboard-balance-chart"
      />
    </>
  );
}
