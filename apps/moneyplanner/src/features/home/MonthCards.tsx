// The Home cards that read the month and year summaries: the three tiles, This month, Spending by category,
// End-of-month balances and the Year table.
import { ScrollView, View } from 'react-native';

import { BarList } from '@/components/charts';
import { Card, SectionHeader, Stat, StatTile, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { monthShort } from '@/features/dashboard/helpers';
import { Stepper, TableText } from '@/features/dashboard/Parts';
import { useTheme } from '@/hooks/use-theme';
import { addMonthKey, formatMonth } from '@/lib/dates';
import { formatCompact } from '@/lib/money';
import type { HomeCtx } from './ctx';

const LABEL_W = 150;
const COL_MIN = 104;

export function TilesCard({ ctx }: { ctx: HomeCtx }) {
  const { ms } = ctx.model;
  const { money } = ctx;
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.two }} testID="dashboard-month-tiles">
      <StatTile label="Income" value={formatCompact(ms.totalIncome)} accessibilityLabel={`Income: ${money(ms.totalIncome)}`} tone="positive" icon="↓" testID="dashboard-tile-income" />
      <StatTile label="Spent" value={formatCompact(ms.totalSpend)} accessibilityLabel={`Spent: ${money(ms.totalSpend)}`} tone="negative" icon="↑" testID="dashboard-tile-spent" />
      <StatTile label="Free" value={formatCompact(ms.freeMoney)} accessibilityLabel={`Free: ${money(ms.freeMoney)}`} tone={ms.freeMoney < 0 ? 'negative' : 'accent'} icon="✦" testID="dashboard-tile-free" />
    </View>
  );
}

export function MonthCard({ ctx }: { ctx: HomeCtx }) {
  const { month, setMonth, ms } = ctx.model;
  const { money } = ctx;
  return (
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
        {ms.paidToCards > 0 ? <Stat label="Paid to cards" value={money(ms.paidToCards)} testID="dashboard-paid-to-cards" /> : null}
        <Stat label="Free money" value={money(ms.freeMoney)} tone={ms.freeMoney < 0 ? 'negative' : 'positive'} testID="dashboard-free-money" />
        <Stat label="Spent % of income" value={ms.spentPct == null ? 'No income' : `${ms.spentPct.toFixed(1)}%`} />
      </View>
    </Card>
  );
}

export function CategoriesCard({ ctx }: { ctx: HomeCtx }) {
  const { month, year, catScope, bars } = ctx.model;
  return (
    <Card testID="dashboard-categories">
      <View style={{ paddingRight: 52 }}>
        <SectionHeader title="Spending by category" />
      </View>
      <T variant="caption" tone="secondary" testID="dashboard-category-period">
        {catScope === 'month' ? formatMonth(month) : `Year ${year}`}
      </T>
      {bars.length === 0 ? <T tone="secondary">No spending recorded for this period.</T> : <BarList items={bars} format={ctx.money} testID="dashboard-category-bars" />}
    </Card>
  );
}

export function EndOfMonthCard({ ctx }: { ctx: HomeCtx }) {
  const { fc } = ctx.model;
  const { buffer } = ctx.input.settings;
  return (
    <Card testID="dashboard-end-of-month">
      <SectionHeader title="End-of-month balance, next 12 months" />
      {fc.months.map((m) => (
        <View
          key={m.month}
          accessible
          accessibilityLabel={`${formatMonth(m.month)}: ${ctx.money(m.endBalance)}`}
          style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two, minHeight: 28 }}>
          <T variant="caption">{formatMonth(m.month)}</T>
          <T variant="caption" tone={m.endBalance < 0 ? 'negative' : m.endBalance < buffer ? 'warning' : 'default'} style={{ fontVariant: ['tabular-nums'] }}>
            {ctx.money(m.endBalance)}
          </T>
        </View>
      ))}
    </Card>
  );
}

export function YearCard({ ctx }: { ctx: HomeCtx }) {
  const c = useTheme();
  const { year, setYear, ys, rows, currentMonth } = ctx.model;
  const { currency } = ctx.input.settings;
  const { money } = ctx;
  return (
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
            <View style={{ width: LABEL_W, padding: Spacing.one }} />
            {ys.months.map((m) => (
              <View key={m.month} style={{ minWidth: COL_MIN, padding: Spacing.one, backgroundColor: m.month === currentMonth ? c.backgroundSelected : undefined }}>
                <TableText bold right>
                  {monthShort(m.month)}
                </TableText>
              </View>
            ))}
          </View>
          {rows.map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.border }}>
              <View style={{ width: LABEL_W, padding: Spacing.one, justifyContent: 'center' }}>
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
                    style={{ minWidth: COL_MIN, padding: Spacing.one, backgroundColor: m.month === currentMonth ? c.backgroundSelected : undefined }}>
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
  );
}
