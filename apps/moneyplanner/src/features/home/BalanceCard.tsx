// The Home hero: balance today, lowest point and the scrubbable chart. Its range follows the saved chart range
// (the range chips still work and save it); tapping the big number opens the balance sheet.
import { useState } from 'react';

import { ForecastHero } from '@/components/charts';
import type { Range } from '@/components/charts/chartMath';
import { HeroCard } from '@/components/ui';
import { chartStyleOf } from '@/constants/theme';
import { useSettingSetter } from '@/data/useSettingSetter';
import type { HomeCtx } from './ctx';

const RANGE_KEYS: readonly Range[] = ['1M', '2M', '6M', '1Y'];
const rangeOf = (v: unknown): Range => (RANGE_KEYS.includes(v as Range) ? (v as Range) : '2M');

export function BalanceCard({ ctx }: { ctx: HomeCtx }) {
  const { input, model } = ctx;
  const { currency, buffer } = input.settings;
  const { set } = useSettingSetter();
  const stored = rangeOf(input.settings.chartRange);
  const [range, setRange] = useState<Range>(stored);
  const [seen, setSeen] = useState<Range>(stored);
  if (stored !== seen) {
    // The setting changed elsewhere (the balance sheet): follow it.
    setSeen(stored);
    setRange(stored);
  }
  const style = chartStyleOf(input.settings.chartStyle);
  return (
    <HeroCard testID="dashboard-forecast" chartStyle={style}>
      <ForecastHero
        fc={model.fc}
        todayStr={model.todayStr}
        currency={currency}
        buffer={buffer}
        history={model.history}
        chartStyle={style}
        range={range}
        onRangeChange={(r) => {
          setRange(r);
          void set({ chartRange: r });
        }}
        onBalancePress={() => ctx.openSheet('balance')}
        breakdownLabel={(ctx.input.accounts ?? []).some((a) => !a.archived) || ctx.input.debts.some((d) => d.type === 'card' && !d.archived) ? 'By account ›' : null}
      />
    </HeroCard>
  );
}
