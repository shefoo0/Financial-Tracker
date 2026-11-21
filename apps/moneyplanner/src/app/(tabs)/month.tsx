import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, PanResponder, View } from 'react-native';

import { Button, Card, EmptyState, ListRow, Screen, SectionHeader, Stat, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { usePlanInput } from '@/data/DataProvider';
import { monthSummary, occurrencesInRange } from '@/engine';
import { buildMonthItems } from '@/features/dashboard/month-items';
import { ErrorScreen, LoadingScreen, Stepper } from '@/features/dashboard/Parts';
import { useToday } from '@/features/dashboard/useToday';
import { addMonthKey, formatDate, formatMonth, monthEnd, monthKey, monthStart } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { PlanInput } from '@/types';

export default function MonthScreen() {
  const { data, loading, error, reload } = usePlanInput();
  if (error && !data) return <ErrorScreen onRetry={reload} />;
  if (!data) return loading ? <LoadingScreen /> : <ErrorScreen onRetry={reload} />;
  return <MonthBody input={data} />;
}

function MonthBody({ input }: { input: PlanInput }) {
  const router = useRouter();
  const todayStr = useToday();
  const currentMonth = monthKey(todayStr);
  const [month, setMonth] = useState(currentMonth);
  const { currency } = input.settings;
  const money = (v: number) => formatMoney(v, currency);

  const ms = useMemo(() => monthSummary(month, input), [month, input]);
  const items = useMemo(
    () =>
      buildMonthItems(
        occurrencesInRange(input.recurring, input.overrides, monthStart(month), monthEnd(month)),
        input.transactions,
        monthStart(month),
        monthEnd(month),
      ),
    [month, input],
  );

  // Swipe left for the next month, right for the previous one (the stepper buttons stay).
  const [swipe] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) < 60) return;
        setMonth((m) => addMonthKey(m, g.dx < 0 ? 1 : -1));
      },
    }),
  );

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    AccessibilityInfo.announceForAccessibility(formatMonth(month));
  }, [month]);

  const newDate = month === currentMonth ? todayStr : monthStart(month);

  return (
    <Screen testID="month-screen">
      <View {...swipe.panHandlers} style={{ gap: Spacing.three }} testID="month-swipe-area">
      <T variant="title">Month</T>
      <Stepper
        label={formatMonth(month)}
        onPrev={() => setMonth(addMonthKey(month, -1))}
        onNext={() => setMonth(addMonthKey(month, 1))}
        prevTestID="month-prev"
        nextTestID="month-next"
        prevLabel="Previous month"
        nextLabel="Next month"
        extra={
          <Button label="Today" variant="secondary" onPress={() => setMonth(currentMonth)} disabled={month === currentMonth} testID="month-today" accessibilityHint="Jump to the current month" />
        }
      />
      <Card testID="month-summary">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three }}>
          <Stat label="Total income" value={money(ms.totalIncome)} />
          <Stat label="Recurring costs" value={money(ms.recurringCosts)} />
          <Stat label="One-time costs" value={money(ms.oneTimeCosts)} />
          <Stat label="Total spend" value={money(ms.totalSpend)} />
          <Stat label="Free money" value={money(ms.freeMoney)} tone={ms.freeMoney < 0 ? 'negative' : 'positive'} />
          <Stat label="Spent % of income" value={ms.spentPct == null ? 'No income' : `${ms.spentPct.toFixed(1)}%`} />
        </View>
      </Card>

      <SectionHeader title={`Everything in ${formatMonth(month)}`} />
      <Button label="Add one-time item" onPress={() => router.push(`/transaction/new?date=${newDate}`)} testID="month-add-item" />
      {items.length === 0 ? (
        <EmptyState title="Nothing in this month" message="No recurring items or one-time items fall in this month. Add a one-time item, or set up recurring income and costs." />
      ) : (
        <View>
          {items.map((it, i) => {
            const signed = it.kind === 'cost' ? -it.amount : it.amount;
            const sub = [formatDate(it.date), ...it.badges].join(' · ');
            return (
              <ListRow
                key={it.key}
                title={it.title}
                subtitle={sub}
                value={money(signed)}
                valueTone={it.kind === 'cost' ? 'negative' : 'positive'}
                onPress={() => router.push(it.href as never)}
                testID={`month-item-${i}`}
                accessibilityLabel={`${it.title}, ${it.kind === 'cost' ? 'cost' : 'income'} ${money(it.amount)}, ${sub}`}
              />
            );
          })}
        </View>
      )}
      </View>
    </Screen>
  );
}
