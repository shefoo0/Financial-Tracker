import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { BalanceChart, BarList, ChartLegend } from '@/components/charts';
import { Button, Card, EmptyState, Screen, SectionHeader, Segmented, Stat, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { usePlanInput } from '@/data/DataProvider';
import { forecast as runForecast, monthSummary, yearSummary } from '@/engine';
import { balanceLabel, categoryBars, describeBalanceTrend, monthShort, moneyTone, shortDate } from '@/features/dashboard/helpers';
import { ErrorScreen, LoadingScreen, Stepper, TableText } from '@/features/dashboard/Parts';
import { useToday } from '@/features/dashboard/useToday';
import { useTheme } from '@/hooks/use-theme';
import { addMonthKey, formatMonth, monthKey } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { PlanInput } from '@/types';

export default function Dashboard() {
  const { data, loading, error, reload } = usePlanInput();
  if (error && !data) return <ErrorScreen onRetry={reload} />;
  if (!data) return loading ? <LoadingScreen /> : <ErrorScreen onRetry={reload} />;
  return <DashboardBody input={data} />;
}

function DashboardBody({ input }: { input: PlanInput }) {
  const router = useRouter();
  const c = useTheme();
  const todayStr = useToday();
  const currentMonth = monthKey(todayStr);
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(Number(currentMonth.slice(0, 4)));
  const [catScope, setCatScope] = useState<'month' | 'year'>('month');
  const { currency, buffer } = input.settings;
  const money = (v: number) => formatMoney(v, currency);

  const empty = input.recurring.length === 0 && input.transactions.length === 0;

  const fc = useMemo(() => runForecast(input, { today: todayStr, days: 60, months: 12 }), [input, todayStr]);
  const ms = useMemo(() => monthSummary(month, input), [month, input]);
  const ys = useMemo(() => yearSummary(year, input), [year, input]);

  if (empty) {
    return (
      <Screen testID="dashboard-screen">
        <EmptyState
          title="Welcome to Money Planner"
          message="Add your salary and your regular costs, and this screen shows how much is free each month and whether your balance will hold up."
          action={
            <View style={{ gap: Spacing.two, alignSelf: 'stretch' }}>
              <Button label="Add your salary" onPress={() => router.push('/recurring/new?kind=income')} testID="dashboard-add-salary" />
              <Button label="Add a cost" variant="secondary" onPress={() => router.push('/recurring/new?kind=cost')} testID="dashboard-add-cost" />
            </View>
          }
        />
      </Screen>
    );
  }

  const bars = categoryBars(catScope === 'month' ? ms.costsByCategory : ys.costsByCategory, input.categories);
  const belowZero = fc.days.some((d) => d.balance < 0);
  const showWarning = !!fc.firstBelowBuffer || belowZero;
  const warnText = fc.firstBelowBuffer
    ? `Projected below your ${money(buffer)} buffer on ${shortDate(fc.firstBelowBuffer.date)}`
    : `Projected below zero on ${shortDate(fc.lowest.date)}`;
  const firstNegative = fc.days.find((d) => d.balance < 0);

  const rows: { label: string; get: (i: number) => number | null; kind?: 'pct' | 'money'; bold?: boolean }[] = [
    { label: 'Recurring income', get: (i) => ys.months[i].recurringIncome },
    { label: 'One-time income', get: (i) => ys.months[i].oneTimeIncome },
    { label: 'Total income', get: (i) => ys.months[i].totalIncome, bold: true },
    { label: 'Recurring costs', get: (i) => ys.months[i].recurringCosts },
    { label: 'One-time costs', get: (i) => ys.months[i].oneTimeCosts },
    { label: 'Total spend', get: (i) => ys.months[i].totalSpend, bold: true },
    { label: 'Free money', get: (i) => ys.months[i].freeMoney, bold: true },
    { label: 'Cumulative free money', get: (i) => ys.cumulativeFreeMoney[i] },
    { label: 'Spent %', get: (i) => ys.months[i].spentPct, kind: 'pct' },
  ];
  const labelW = 150;
    const colMin = 104;

  return (
    <Screen testID="dashboard-screen">
      <T variant="title" accessibilityLabel="Dashboard">
        Dashboard
      </T>

      <Card testID="dashboard-forecast">
        <SectionHeader title="Forecast: next 60 days" />
        <T variant="caption" tone="secondary">
          {balanceLabel(fc.asOf, todayStr)}: {money(fc.balanceAsOf)}
        </T>
        <BalanceChart
          days={fc.days}
          buffer={buffer}
          lowestDate={fc.lowest.date}
          accessibilityLabel={describeBalanceTrend(fc.days, fc.lowest, currency, buffer)}
          testID="dashboard-balance-chart"
        />
        <ChartLegend bufferLabel={`buffer ${money(buffer)}`} />
        <T variant="label" tone={moneyTone(fc.lowest.balance)}>
          Lowest: {money(fc.lowest.balance)} on {shortDate(fc.lowest.date)}
        </T>
        {showWarning && (
          <View
            accessible
            accessibilityRole="alert"
            accessibilityLabel={`Warning. ${warnText}${firstNegative && fc.firstBelowBuffer ? `. Below zero on ${shortDate(firstNegative.date)}` : ''}`}
            style={{ borderWidth: 1, borderColor: c.warning, borderRadius: 10, padding: Spacing.two, gap: 2 }}
            testID="dashboard-forecast-warning">
            <T variant="label" tone="warning">
              ⚠ {warnText}
            </T>
            {firstNegative && fc.firstBelowBuffer && (
              <T variant="caption" tone="negative">
                Below zero on {shortDate(firstNegative.date)}
              </T>
            )}
          </View>
        )}
        <T variant="label" style={{ marginTop: Spacing.two }}>
          End-of-month balance, next 12 months
        </T>
        {fc.months.map((m) => (
          <View
            key={m.month}
            accessible
            accessibilityLabel={`${formatMonth(m.month)}: ${money(m.endBalance)}`}
            style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two, minHeight: 28 }}>
            <T variant="caption">{formatMonth(m.month)}</T>
            <T variant="caption" tone={m.endBalance < 0 ? 'negative' : m.endBalance < buffer ? 'warning' : 'default'} style={{ fontVariant: ['tabular-nums'] }}>
              {money(m.endBalance)}
            </T>
          </View>
        ))}
      </Card>

      <Card testID="dashboard-month-card">
        <SectionHeader title="This month" />
        <Stepper
          label={formatMonth(month)}
          onPrev={() => setMonth(addMonthKey(month, -1))}
          onNext={() => setMonth(addMonthKey(month, 1))}
          prevTestID="dashboard-month-prev"
          nextTestID="dashboard-month-next"
          prevLabel="Previous month"
          nextLabel="Next month"
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three }}>
          <Stat label="Total income" value={money(ms.totalIncome)} />
          <Stat label="Recurring costs" value={money(ms.recurringCosts)} />
          <Stat label="One-time costs" value={money(ms.oneTimeCosts)} />
          <Stat label="Total spend" value={money(ms.totalSpend)} />
          <Stat label="Free money" value={money(ms.freeMoney)} tone={ms.freeMoney < 0 ? 'negative' : 'positive'} testID="dashboard-free-money" />
          <Stat label="Spent % of income" value={ms.spentPct == null ? 'No income' : `${ms.spentPct.toFixed(1)}%`} />
        </View>
      </Card>

      <Card testID="dashboard-year-card">
        <SectionHeader title="Year" />
        <Stepper
          label={String(year)}
          onPrev={() => setYear(year - 1)}
          onNext={() => setYear(year + 1)}
          prevTestID="dashboard-year-prev"
          nextTestID="dashboard-year-next"
          prevLabel="Previous year"
          nextLabel="Next year"
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three }}>
          <Stat label="Total income" value={money(ys.totalIncome)} />
          <Stat label="Total spend" value={money(ys.totalSpend)} />
          <Stat label="Free money" value={money(ys.freeMoney)} tone={ys.freeMoney < 0 ? 'negative' : 'positive'} />
          <Stat label="Average monthly spend" value={money(ys.averageMonthlySpend)} />
          <Stat label="Highest-spend month" value={ys.highestSpendMonth ? formatMonth(ys.highestSpendMonth) : 'None'} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel={`Month-by-month table for ${year}`} testID="dashboard-year-table">
          <View>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ width: labelW, padding: Spacing.one }} />
              {ys.months.map((m) => (
                <View
                  key={m.month}
                  style={{ minWidth: colMin, padding: Spacing.one, backgroundColor: m.month === currentMonth ? c.backgroundSelected : undefined }}>
                  <TableText bold right>
                    {monthShort(m.month)}
                  </TableText>
                </View>
              ))}
            </View>
            {rows.map((r) => (
              <View key={r.label} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.border }}>
                <View style={{ width: labelW, padding: Spacing.one, justifyContent: 'center' }}>
                  <TableText bold={r.bold}>{r.label}</TableText>
                </View>
                {ys.months.map((m, i) => {
                  const v = r.get(i);
                  const text = v == null ? '-' : r.kind === 'pct' ? `${v.toFixed(1)}%` : money(v).replace(`${currency} `, '');
                  const neg = v != null && v < 0;
                  return (
                    <View
                      key={m.month}
                      accessible
                      accessibilityLabel={`${r.label}, ${formatMonth(m.month)}: ${v == null ? 'no income' : r.kind === 'pct' ? text : money(v)}`}
                      style={{ minWidth: colMin, padding: Spacing.one, backgroundColor: m.month === currentMonth ? c.backgroundSelected : undefined }}>
                      <TableText bold={r.bold} negative={neg} right>
                        {text}
                      </TableText>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
        <T variant="caption" tone="secondary">
          Amounts in {currency}. The current month is highlighted.
        </T>
      </Card>

      <Card testID="dashboard-categories">
        <SectionHeader title="Spending by category" />
        <Segmented
          label="Category period"
          value={catScope}
          onChange={setCatScope}
          options={[
            { value: 'month', label: formatMonth(month) },
            { value: 'year', label: `Year ${year}` },
          ]}
          testID="dashboard-category-scope"
        />
        {bars.length === 0 ? (
          <T tone="secondary">No spending recorded for this period.</T>
        ) : (
          <BarList items={bars} format={money} testID="dashboard-category-bars" />
        )}
      </Card>
    </Screen>
  );
}
