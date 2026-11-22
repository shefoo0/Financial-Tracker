// Plan tab: recurring income and costs, with monthly totals.
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, IconBadge, Screen, ScreenHeader, SectionHeader, T } from '@/components/ui';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { usePlanInput } from '@/data/DataProvider';
import { expandRecurring, monthlyEquivalent } from '@/engine';
import { ModuleCards } from '@/features/plan/ModuleCards';
import { QuickAddButton, QuickAddSpacer } from '@/features/quickadd/QuickAddButton';
import { describeEnd, describeSchedule } from '@/features/items/schedule';
import { useTheme } from '@/hooks/use-theme';
import { today } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { Kind, RecurringItem } from '@/types';

const openNew = (kind: Kind) => router.push({ pathname: '/recurring/[id]', params: { id: 'new', kind } });

export default function PlanScreen() {
  const { data, error, reload } = usePlanInput();

  if (!data) {
    return (
      <Screen>
        <ScreenHeader title="Plan" />
        {error ? (
          <EmptyState title="Couldn't load your plan" message="Nothing has been lost. Try again." action={<Button label="Try again" onPress={reload} testID="plan-retry" />} />
        ) : (
          <T tone="secondary">Loading…</T>
        )}
      </Screen>
    );
  }

  const { settings, categories, recurring } = data;
  const currency = settings.currency;
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? null;

  if (recurring.length === 0) {
    return (
      <Screen>
        <ScreenHeader title="Plan" />
        <ModuleCards input={data} />
        <EmptyState
          title="Plan your regular money"
          message="Recurring items are income and costs that repeat, like your salary, rent, subscriptions or insurance. Add them once and they appear in every month, the dashboard and the forecast."
          action={
            <View style={styles.emptyButtons}>
              <Button label="Add income" onPress={() => openNew('income')} testID="plan-add-income" />
              <Button label="Add cost" variant="secondary" onPress={() => openNew('cost')} testID="plan-add-cost" />
            </View>
          }
        />
      </Screen>
    );
  }

  const sections: {
    kind: Kind;
    title: string;
    empty: string;
    testID: string;
  }[] = [
    {
      kind: 'income',
      title: 'Income',
      empty: 'No recurring income yet.',
      testID: 'plan-add-income',
    },
    {
      kind: 'cost',
      title: 'Costs',
      empty: 'No recurring costs yet.',
      testID: 'plan-add-cost',
    },
  ];

  return (
    <View style={styles.flex}>
    <Screen testID="plan-screen">
      <ScreenHeader title="Plan" subtitle="Income and costs that repeat" />
      <ModuleCards input={data} />
      {sections.map((s) => {
        const items = recurring
          .filter((r) => r.kind === s.kind)
          .map((r) => ({ r, monthly: monthlyEquivalent(r) }))
          .sort((a, b) => b.monthly - a.monthly || a.r.name.localeCompare(b.r.name));
        const total = items.reduce((sum, i) => sum + i.monthly, 0);
        return (
          <View key={s.kind} style={styles.section}>
            <SectionHeader title={s.title} />
            <T variant="caption" tone="secondary" testID={`plan-total-${s.kind}`}>
              {items.length ? `Total ≈ ${formatMoney(total, currency)} / month` : s.empty}
            </T>
            {items.length > 0 && (
              <Card style={styles.list}>
                {items.map(({ r, monthly }, i) => (
                  <PlanRow
                    key={r.id}
                    item={r}
                    monthly={monthly}
                    currency={currency}
                    category={categoryName(r.categoryId)}
                    color={
                      Palette[
                        Math.max(
                          0,
                          categories.findIndex((cat) => cat.id === r.categoryId),
                        ) % Palette.length
                      ]
                    }
                    last={i === items.length - 1}
                  />
                ))}
              </Card>
            )}
            <Button
              label={s.kind === 'income' ? 'Add income' : 'Add cost'}
              variant={s.kind === 'income' ? 'primary' : 'secondary'}
              onPress={() => openNew(s.kind)}
              testID={s.testID}
            />
          </View>
        );
      })}
      <QuickAddSpacer />
    </Screen>
    <QuickAddButton testID="quick-add" />
    </View>
  );
}

function PlanRow({
  item,
  monthly,
  currency,
  category,
  color,
  last,
}: {
  item: RecurringItem;
  monthly: number;
  currency: string;
  category: string | null;
  color: string;
  last: boolean;
}) {
  const c = useTheme();
  const schedule = describeSchedule(item.schedule, item.startDate);
  const end = describeEnd(item);
  const amount = formatMoney(item.amount, currency);
  const perMonth = `≈ ${formatMoney(monthly, currency)} / month`;
  const lines = [category, schedule, end].filter(Boolean).join(' · ');
  // Instalment progress: payments that have come due so far, out of the total count.
  const done = item.count == null ? null : Math.min(item.count, expandRecurring(item, [], item.startDate, today()).length);
  const progress = item.count != null && done != null ? done / item.count : null;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/recurring/[id]', params: { id: item.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${amount}, ${schedule}${end ? `, ${end}` : ''}, ${perMonth}`}
      accessibilityHint="Opens the item to edit"
      testID={`plan-item-${item.id}`}
      style={({ pressed }) => [
        styles.row,
        !last && {
          borderBottomColor: c.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        pressed && { backgroundColor: c.backgroundSelected },
      ]}
    >
      <IconBadge glyph={item.kind === 'income' ? '↓' : '↑'} color={color} />
      <View style={styles.rowText}>
        <T numberOfLines={2}>{item.name}</T>
        <T variant="caption" tone="secondary">
          {lines}
        </T>
        {progress != null && (
          <View style={styles.progressRow} accessible accessibilityLabel={`${done} of ${item.count} payments made`}>
            <View style={[styles.track, { backgroundColor: c.border }]}>
              <View
                style={[
                  styles.fill,
                  {
                    backgroundColor: c.accent,
                    width: `${Math.round(progress * 100)}%`,
                  },
                ]}
              />
            </View>
            <T variant="caption" tone="secondary">
              {done} of {item.count}
            </T>
          </View>
        )}
      </View>
      <View style={styles.rowAmount}>
        <T variant="number" tone={item.kind === 'income' ? 'positive' : 'negative'}>
          {amount}
        </T>
        <T variant="caption" tone="secondary">
          {perMonth}
        </T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: Spacing.two },
  emptyButtons: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  list: { paddingVertical: Spacing.one },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  track: { flex: 1, height: 6, borderRadius: Radius.pill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: Radius.pill },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    minHeight: 56,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  rowAmount: { alignItems: 'flex-end', flexShrink: 1, maxWidth: '50%' },
});
