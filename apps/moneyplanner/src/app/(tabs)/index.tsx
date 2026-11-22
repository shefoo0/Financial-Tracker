import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { BalanceChart, BarList } from '@/components/charts';
import {
  Button,
  Card,
  EmptyState,
  HeroCard,
  IconBadge,
  Screen,
  ScreenHeader,
  SectionHeader,
  Segmented,
  Stat,
  StatTile,
  T,
} from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useData, usePlanInput } from '@/data/DataProvider';
import { useProfiles } from '@/data/profiles/ProfileProvider';
import { forecast as runForecast, monthSummary, yearSummary } from '@/engine';
import { QuickAddButton, QuickAddSpacer } from '@/features/quickadd/QuickAddButton';
import { ProfileButton } from '@/features/profiles/ProfileButton';
import { balanceLabel, categoryBars, describeBalanceTrend, monthShort, shortDate } from '@/features/dashboard/helpers';
import { ErrorScreen, LoadingScreen, Stepper, TableText } from '@/features/dashboard/Parts';
import { buildUpcoming, categoryColor, categoryEmoji } from '@/features/dashboard/upcoming';
import { useToday } from '@/features/dashboard/useToday';
import { AlertsCard } from '@/features/alerts/AlertsCard';
import { markPaid } from '@/features/payday/markPaid';
import { PaydayCard } from '@/features/payday/PaydayCard';
import { UndoBar } from '@/features/payday/UndoBar';
import type { UpcomingItem } from '@/features/dashboard/upcoming';
import { useTheme } from '@/hooks/use-theme';
import { addMonthKey, formatMonth, monthKey } from '@/lib/dates';
import { formatCompact, formatMoney, formatMoneyTrim } from '@/lib/money';
import type { PlanInput } from '@/types';

export default function Dashboard() {
  const { data, loading, error, reload } = usePlanInput();
  if (error && !data) return <ErrorScreen onRetry={reload} />;
  if (!data) return loading ? <LoadingScreen /> : <ErrorScreen onRetry={reload} />;
  return <DashboardBody input={data} />;
}

function greeting(hour: number): string {
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

function DashboardBody({ input }: { input: PlanInput }) {
  const router = useRouter();
  const c = useTheme();
  const { active } = useProfiles();
  const todayStr = useToday();
  const currentMonth = monthKey(todayStr);
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(Number(currentMonth.slice(0, 4)));
  const [catScope, setCatScope] = useState<'month' | 'year'>('month');
  const { repo, bump } = useData();
  const [undo, setUndo] = useState<{ message: string; run: () => Promise<void> } | null>(null);
  const dismissUndo = useCallback(() => setUndo(null), []);
  const { currency, buffer } = input.settings;
  const money = (v: number) => formatMoney(v, currency);

  const empty = input.recurring.length === 0 && input.transactions.length === 0 && input.debts.length === 0 && input.cheques.length === 0;

  const fc = useMemo(() => runForecast(input, { today: todayStr, days: 60, months: 12 }), [input, todayStr]);
  const ms = useMemo(() => monthSummary(month, input), [month, input]);
  const ys = useMemo(() => yearSummary(year, input), [year, input]);
  const upcoming = useMemo(() => buildUpcoming(input, todayStr), [input, todayStr]);

  const onPaid = async (u: UpcomingItem) => {
    try {
      const run = await markPaid(repo, input, u.markPaid, todayStr);
      if (run) setUndo({ message: `${u.title} marked as paid`, run });
    } catch {
      Alert.alert("Couldn't save", 'The payment was not recorded. Please try again.');
    } finally {
      bump();
    }
  };
  const onUndo = async () => {
    const u = undo;
    setUndo(null);
    if (!u) return;
    try {
      await u.run();
    } catch {
      Alert.alert("Couldn't undo", 'The change was not reversed. Please try again.');
    } finally {
      bump();
    }
  };

  const header = (
    <ScreenHeader title={active.name} subtitle={greeting(new Date().getHours())} right={<ProfileButton />} testID="dashboard-header" />
  );

  if (empty) {
    return (
      <Screen testID="dashboard-screen">
        {header}
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
    <View style={{ flex: 1 }}>
      <Screen testID="dashboard-screen">
      {header}

      <HeroCard testID="dashboard-forecast">
        <T variant="caption" tone="onHero" style={{ letterSpacing: 1, fontWeight: '700' }}>
          {balanceLabel(fc.asOf, todayStr).toUpperCase()}
        </T>
        <T
          variant="title"
          tone="onHero"
          maxFontSizeMultiplier={1.4}
          style={{ fontSize: 36, lineHeight: 44, fontVariant: ['tabular-nums'] }}
          accessibilityLabel={`${balanceLabel(fc.asOf, todayStr)}: ${money(fc.balanceAsOf)}`}>
          {formatMoneyTrim(fc.balanceAsOf, currency)}
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
          <View style={{ backgroundColor: Colors.dark.glass, borderRadius: Radius.pill, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one }}>
            <T variant="caption" tone="onHero">
              Lowest {money(fc.lowest.balance)} · {shortDate(fc.lowest.date)}
            </T>
          </View>
          <View style={{ backgroundColor: Colors.dark.glass, borderRadius: Radius.pill, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one }}>
            <T variant="caption" tone="onHero">
              next 60 days
            </T>
          </View>
        </View>
        <BalanceChart
          variant="onHero"
          days={fc.days}
          buffer={buffer}
          lowestDate={fc.lowest.date}
          accessibilityLabel={describeBalanceTrend(fc.days, fc.lowest, currency, buffer)}
          testID="dashboard-balance-chart"
        />
        <T variant="caption" tone="onHero">
          Dashed line: your {money(buffer)} buffer
        </T>
      </HeroCard>

      <PaydayCard input={input} today={todayStr} />

      <View style={{ flexDirection: 'row', gap: Spacing.two }} testID="dashboard-month-tiles">
        <StatTile label="Income" value={formatCompact(ms.totalIncome)} accessibilityLabel={`Income: ${money(ms.totalIncome)}`} tone="positive" icon="↓" testID="dashboard-tile-income" />
        <StatTile label="Spent" value={formatCompact(ms.totalSpend)} accessibilityLabel={`Spent: ${money(ms.totalSpend)}`} tone="negative" icon="↑" testID="dashboard-tile-spent" />
        <StatTile label="Free" value={formatCompact(ms.freeMoney)} accessibilityLabel={`Free: ${money(ms.freeMoney)}`} tone={ms.freeMoney < 0 ? 'negative' : 'accent'} icon="✦" testID="dashboard-tile-free" />
      </View>

      {/* With the Alerts module on, its list covers the shortfall too (and more); otherwise the simple warning. */}
      {input.settings.enabledModules.alerts ? <AlertsCard limit={4} /> : null}
      {showWarning && !input.settings.enabledModules.alerts && (
        <Card>
          <View
            accessible
            accessibilityRole="alert"
            accessibilityLabel={`Warning. ${warnText}${firstNegative && fc.firstBelowBuffer ? `. Below zero on ${shortDate(firstNegative.date)}` : ''}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}
            testID="dashboard-forecast-warning">
            <IconBadge glyph="⚠" color={c.warning} />
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="label" tone="warning">
                ⚠ {warnText}
              </T>
              {firstNegative && fc.firstBelowBuffer && (
                <T variant="caption" tone="negative">
                  Below zero on {shortDate(firstNegative.date)}
                </T>
              )}
            </View>
          </View>
        </Card>
      )}

      <Card testID="dashboard-upcoming">
        <SectionHeader
          title="Coming up"
          action={
            <Pressable
              onPress={() => router.push('/month')}
              accessibilityRole="link"
              accessibilityLabel="See all items this month"
              testID="dashboard-see-all"
              style={{ minHeight: 44, justifyContent: 'center' }}>
              <T variant="label" tone="accent">
                See all
              </T>
            </Pressable>
          }
        />
        {upcoming.length === 0 ? (
          <T tone="secondary">Nothing planned in the next 90 days.</T>
        ) : (
          upcoming.map((u, i) => (
            <View key={u.key} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
              <Pressable
                onPress={() => router.push(u.href as never)}
                accessibilityRole="button"
                accessibilityLabel={`${u.title}, ${u.when}${u.progress ? `, ${u.progress}` : ''}, ${u.kind === 'income' ? 'income' : 'cost'} ${money(u.amount)}`}
                testID={`dashboard-upcoming-${i}`}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 52, paddingVertical: Spacing.one }}>
                <IconBadge glyph={categoryEmoji(u.categoryId, u.kind)} color={categoryColor(u.categoryId, input.categories)} />
                <View style={{ flex: 1 }}>
                  <T variant="label" numberOfLines={1}>
                    {u.title}
                  </T>
                  <T variant="caption" tone="secondary">
                    {u.when}
                    {u.progress ? ` · ${u.progress}` : ''}
                  </T>
                </View>
                <T variant="number" tone={u.kind === 'income' ? 'positive' : 'negative'}>
                  {u.kind === 'income' ? '+' : '-'}
                  {money(u.amount)}
                </T>
              </Pressable>
              <Pressable
                onPress={() => onPaid(u)}
                accessibilityRole="button"
                accessibilityLabel={`Mark ${u.title} as ${u.kind === 'income' ? 'received' : 'paid'}`}
                testID={`upcoming-paid-${i}`}
                style={{ minHeight: 44, minWidth: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two, borderRadius: Radius.pill, borderWidth: 1, borderColor: c.border }}>
                <T variant="label" tone="accent" maxFontSizeMultiplier={1.3}>
                  {u.kind === 'income' ? 'Got it' : 'Paid'}
                </T>
              </Pressable>
            </View>
          ))
        )}
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

      <Card testID="dashboard-end-of-month">
        <SectionHeader title="End-of-month balance, next 12 months" />
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
        <QuickAddSpacer />
      </Screen>
      {undo ? <UndoBar message={undo.message} onUndo={onUndo} onDismiss={dismissUndo} /> : null}
      <QuickAddButton testID="quick-add" />
    </View>
  );
}
