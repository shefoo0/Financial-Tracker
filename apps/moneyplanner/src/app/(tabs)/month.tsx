import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, IconBadge, Pill, Screen, ScreenHeader, SectionHeader, Stat, StatTile, T } from '@/components/ui';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { usePlanInput } from '@/data/DataProvider';
import { categoryLimits, monthBalances, monthSummary, occurrencesInRange } from '@/engine';
import { buildMonthItems } from '@/features/dashboard/month-items';
import { ErrorScreen, LoadingScreen } from '@/features/dashboard/Parts';
import { QuickAddButton, QuickAddSpacer } from '@/features/quickadd/QuickAddButton';
import { useToday } from '@/features/dashboard/useToday';
import { useTheme } from '@/hooks/use-theme';
import { addMonthKey, formatDate, formatMonth, monthEnd, monthKey, monthStart } from '@/lib/dates';
import { formatCompact, formatMoney } from '@/lib/money';
import type { ISODate, PlanInput } from '@/types';

export default function MonthScreen() {
  const { data, loading, error, reload } = usePlanInput();
  if (error && !data) return <ErrorScreen onRetry={reload} />;
  if (!data) return loading ? <LoadingScreen /> : <ErrorScreen onRetry={reload} />;
  return <MonthBody input={data} />;
}

function MonthBody({ input }: { input: PlanInput }) {
  const router = useRouter();
  const c = useTheme();
  const todayStr = useToday();
  const currentMonth = monthKey(todayStr);
  const [month, setMonth] = useState(currentMonth);
  const { currency } = input.settings;
  const money = (v: number) => formatMoney(v, currency);

  const ms = useMemo(() => monthSummary(month, input), [month, input]);
  const limits = useMemo(() => categoryLimits(month, input), [month, input]);
  const balances = useMemo(() => monthBalances(month, input, todayStr), [month, input, todayStr]);
  const items = useMemo(
    () => buildMonthItems(occurrencesInRange(input.recurring, input.overrides, monthStart(month), monthEnd(month)), input.transactions, monthStart(month), monthEnd(month), input),
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

  // Category colour: position of the category in the list picks a Palette colour.
  const colourOf = useMemo(() => {
    const catOf = new Map<string, string | null>();
    input.recurring.forEach((r) => catOf.set(`/recurring/${r.id}`, r.categoryId));
    input.transactions.forEach((t) => catOf.set(`/transaction/${t.id}`, t.categoryId));
    return (href: string) => {
      const idx = input.categories.findIndex((cat) => cat.id === catOf.get(href));
      return Palette[(idx < 0 ? 7 : idx) % Palette.length];
    };
  }, [input]);

  const days: {
    date: ISODate;
    rows: { it: (typeof items)[number]; i: number }[];
  }[] = [];
  items.forEach((it, i) => {
    const last = days[days.length - 1];
    if (last && last.date === it.date) last.rows.push({ it, i });
    else days.push({ date: it.date, rows: [{ it, i }] });
  });

  const stepBtn = [styles.stepBtn, { backgroundColor: c.glass, borderColor: c.glassBorder }];

  return (
    <View style={styles.flex}>
    <Screen testID="month-screen">
      <View {...swipe.panHandlers} style={styles.body} testID="month-swipe-area">
        <ScreenHeader title={formatMonth(month)} subtitle="Everything planned and spent" />
        <View style={styles.stepper}>
          <Pressable onPress={() => setMonth(addMonthKey(month, -1))} accessibilityRole="button" accessibilityLabel="Previous month" testID="month-prev" style={stepBtn}>
            <T variant="heading">‹</T>
          </Pressable>
          <View style={styles.flex}>
            <Button
              label="Today"
              variant="secondary"
              onPress={() => setMonth(currentMonth)}
              disabled={month === currentMonth}
              testID="month-today"
              accessibilityHint="Jump to the current month"
            />
          </View>
          <Pressable onPress={() => setMonth(addMonthKey(month, 1))} accessibilityRole="button" accessibilityLabel="Next month" testID="month-next" style={stepBtn}>
            <T variant="heading">›</T>
          </Pressable>
        </View>

        <View style={styles.balances} testID="month-balances">
          <T
            variant="caption"
            tone="secondary"
            testID="month-opening"
            accessibilityLabel={`Opening balance: ${money(balances.opening)}`}
          >{`Opening ${money(balances.opening)}`}</T>
          <T variant="caption" tone="secondary">
            {' · '}
          </T>
          <T
            variant="caption"
            tone="secondary"
            testID="month-closing"
            accessibilityLabel={`Closing balance${balances.projected ? ', projected' : ''}: ${money(balances.closing)}`}
          >{`Closing ${money(balances.closing)}${balances.projected ? ' (projected)' : ''}`}</T>
        </View>

        <View style={styles.body} testID="month-summary">
          <View style={styles.tiles}>
            <StatTile label="Income" value={formatCompact(ms.totalIncome)} tone="positive" icon="↓" testID="month-income" accessibilityLabel={`Total income: ${money(ms.totalIncome)}`} />
            <StatTile label="Spent" value={formatCompact(ms.totalSpend)} tone="negative" icon="↑" testID="month-spent" accessibilityLabel={`Total spend: ${money(ms.totalSpend)}`} />
            <StatTile
              label="Free"
              value={formatCompact(ms.freeMoney)}
              tone={ms.freeMoney < 0 ? 'negative' : 'accent'}
              icon="✦"
              testID="month-free"
              accessibilityLabel={`Free money: ${money(ms.freeMoney)}`}
            />
          </View>
          <Card>
            <View style={styles.stats}>
              <Stat label="Recurring costs" value={money(ms.recurringCosts)} />
              <Stat label="One-time costs" value={money(ms.oneTimeCosts)} />
              <Stat label="Spent % of income" value={ms.spentPct == null ? 'No income' : `${ms.spentPct.toFixed(1)}%`} />
            </View>
          </Card>
        </View>

        {limits.length > 0 && (
          <View style={styles.day} testID="month-limits">
            <SectionHeader title="Limits" />
            <Card style={styles.limitsCard}>
              {limits.map((l, i) => {
                const tone = l.pct >= 100 ? c.negative : l.pct >= 80 ? c.warning : c.positive;
                const status = l.over ? `${money(l.spent - l.limit)} over` : `${money(l.left)} left`;
                return (
                  <View
                    key={l.categoryId}
                    style={styles.limitRow}
                    testID={`month-limit-${i}`}
                    accessible
                    accessibilityLabel={`${l.name}: spent ${money(l.spent)} of ${money(l.limit)}, ${status}`}
                  >
                    <View style={styles.limitTop}>
                      <T numberOfLines={2} style={styles.flex}>
                        {l.name}
                      </T>
                      <T variant="number" style={{ color: tone }}>
                        {status}
                      </T>
                    </View>
                    <View style={[styles.track, { backgroundColor: c.backgroundSelected }]}>
                      <View style={{ width: `${Math.min(100, l.pct)}%`, height: '100%', backgroundColor: tone, borderRadius: Radius.sm }} />
                    </View>
                    <T variant="caption" tone="secondary">{`${money(l.spent)} of ${money(l.limit)} · ${l.pct}%`}</T>
                  </View>
                );
              })}
            </Card>
          </View>
        )}

        <SectionHeader title={`Everything in ${formatMonth(month)}`} />
        <Button label="Add one-time item" onPress={() => router.push(`/transaction/new?date=${newDate}`)} testID="month-add-item" />
        {items.length === 0 ? (
          <Card>
            <EmptyState
              title="Nothing in this month"
              message="No recurring items or one-time items fall in this month. Add a one-time item, or set up recurring income and costs."
            />
          </Card>
        ) : (
          days.map((day) => (
            <View key={day.date} style={styles.day}>
              <T variant="label" tone="secondary" accessibilityRole="header">
                {formatDate(day.date)}
              </T>
              <Card style={styles.list}>
                {day.rows.map(({ it, i }, n) => {
                  const signed = it.kind === 'cost' ? -it.amount : it.amount;
                  const sub = [formatDate(it.date), ...it.badges].join(' · ');
                  return (
                    <Pressable
                      key={it.key}
                      onPress={() => router.push(it.href as never)}
                      accessibilityRole="button"
                      accessibilityLabel={`${it.title}, ${it.kind === 'cost' ? 'cost' : 'income'} ${money(it.amount)}, ${sub}`}
                      testID={`month-item-${i}`}
                      style={({ pressed }) => [
                        styles.row,
                        n < day.rows.length - 1 && {
                          borderBottomColor: c.border,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                        },
                        pressed && { backgroundColor: c.backgroundSelected },
                      ]}
                    >
                      <IconBadge glyph={it.kind === 'cost' ? '↑' : '↓'} color={colourOf(it.href)} />
                      <View style={styles.flex}>
                        <T numberOfLines={2}>{it.title}</T>
                        {it.badges.length > 0 && (
                          <View style={styles.pills}>
                            {it.badges.map((b) => (
                              <Pill key={b} label={b} tone={b === 'Paid' ? 'positive' : b === 'Moved' ? 'accent' : 'warning'} />
                            ))}
                          </View>
                        )}
                      </View>
                      <T variant="number" tone={it.kind === 'cost' ? 'negative' : 'positive'}>
                        {money(signed)}
                      </T>
                    </Pressable>
                  );
                })}
              </Card>
            </View>
          ))
        )}
        <QuickAddSpacer />
      </View>
    </Screen>
    <QuickAddButton testID="quick-add" defaultDate={month === currentMonth ? undefined : newDate} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { gap: Spacing.three },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepBtn: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balances: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  limitsCard: { gap: Spacing.three },
  limitRow: { gap: Spacing.one },
  limitTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  track: { height: 8, borderRadius: Radius.sm, overflow: 'hidden' },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  day: { gap: Spacing.two },
  list: { paddingVertical: Spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 60,
    paddingVertical: Spacing.two,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
});
