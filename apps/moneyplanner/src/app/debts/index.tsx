// Debts: total remaining, debt-to-income, loans, cards and instalment plans.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, HeroCard, Pill, Screen, ScreenHeader, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { debtStats } from '@/engine';
import { TYPE_GLYPH } from '@/features/debts/form';
import { pctText, ratioLevel, sortDebts } from '@/features/debts/helpers';
import { DebtGroup, DebtRow, type DebtStat } from '@/features/debts/Parts';
import { useDebtData } from '@/features/debts/useDebtData';
import { useToday } from '@/features/dashboard/useToday';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { Debt, DebtType } from '@/types';

const SECTIONS: { type: DebtType; title: string }[] = [
  { type: 'loan', title: 'Loans' },
  { type: 'card', title: 'Cards' },
  { type: 'plan', title: 'Instalment plans' },
];

const openNew = (type: DebtType) => router.push({ pathname: '/debts/[id]', params: { id: 'new', type } });
const openDebt = (id: string) => router.push({ pathname: '/debts/[id]', params: { id } });

export default function DebtsScreen() {
  const { data, error, reload } = useDebtData();
  const now = useToday();
  const [showPaidOff, setShowPaidOff] = useState(false);
  const stats = useMemo(() => (data ? debtStats(data.input, now) : null), [data, now]);

  if (!data || !stats) {
    return (
      <Screen testID="debts-screen">
        <ScreenHeader title="Debts" />
        {error ? (
          <EmptyState title="Couldn't load your debts" message="Nothing has been lost. Try again." action={<Button label="Try again" onPress={reload} testID="debts-retry" />} />
        ) : (
          <T tone="secondary">Loading…</T>
        )}
      </Screen>
    );
  }

  const { settings } = data.input;
  const currency = settings.currency;
  const money = (n: number) => formatMoney(n, currency);
  const active = sortDebts(data.all.filter((d) => !d.archived));
  const paidOff = sortDebts(data.all.filter((d) => d.archived));
  const byId = new Map<string, DebtStat>(stats.perDebt.map((p) => [p.debtId, p]));
  const level = ratioLevel(stats.debtToIncomePct, settings.alertThresholds);
  const { debtCautionPct, debtHighPct } = settings.alertThresholds;

  const addButtons = (
    <View style={styles.addRow}>
      <Button label="Add loan" onPress={() => openNew('loan')} variant={active.length ? 'secondary' : 'primary'} testID="debts-add-loan" />
      <Button label="Add card" onPress={() => openNew('card')} variant="secondary" testID="debts-add-card" />
      <Button label="Add plan" onPress={() => openNew('plan')} variant="secondary" testID="debts-add-plan" accessibilityHint="Add an instalment plan" />
    </View>
  );

  if (active.length === 0 && paidOff.length === 0) {
    return (
      <Screen testID="debts-screen">
        <ScreenHeader title="Debts" />
        <EmptyState
          title="Track what you owe"
          message="Add loans, credit cards and instalment plans (such as 0% card plans or buy-now-pay-later). Their payments go into your forecast, and this screen shows the total remaining, how much of your income goes to debt payments, and the date everything is paid off."
          action={addButtons}
        />
      </Screen>
    );
  }

  let index = 0;
  return (
    <Screen testID="debts-screen">
      <ScreenHeader title="Debts" />
      <HeroCard testID="debts-hero" accessibilityLabel={`Total remaining ${money(stats.totalRemaining)}. Monthly debt payments ${money(stats.monthlyDebtPayments)}.`}>
        <T variant="label" tone="onHero">
          Total remaining
        </T>
        <T variant="title" tone="onHero" testID="debts-total" numberOfLines={1}>
          {money(stats.totalRemaining)}
        </T>
        <View style={styles.heroStats}>
          <View style={{ flex: 1 }}>
            <T variant="caption" tone="onHero">
              Monthly payments
            </T>
            <T variant="number" tone="onHero" testID="debts-monthly">
              {money(stats.monthlyDebtPayments)}
            </T>
          </View>
          <View style={{ flex: 1 }}>
            <T variant="caption" tone="onHero">
              Debt-free date
            </T>
            <T variant="number" tone="onHero" testID="debts-free-date">
              {stats.debtFreeDate ? `${formatDate(stats.debtFreeDate)}${stats.perDebt.some((p) => (p as { interestEstimated?: boolean }).interestEstimated) ? ' (estimated)' : ''}` : 'Not known yet'}
            </T>
          </View>
        </View>
      </HeroCard>

      <Card testID="debts-ratio">
        {stats.debtToIncomePct != null ? (
          <>
            <Pill
              label={`Debt payments are ${pctText(stats.debtToIncomePct)} of income`}
              tone={level === 'high' ? 'negative' : level === 'caution' ? 'warning' : 'positive'}
            />
            <T variant="caption" tone="secondary">
              {level === 'high'
                ? `At or above your high level of ${debtHighPct}%.`
                : level === 'caution'
                  ? `At or above your caution level of ${debtCautionPct}%.`
                  : `Below your caution level of ${debtCautionPct}%.`}{' '}
              Monthly income in your plan: {money(stats.monthlyIncome)}.
            </T>
          </>
        ) : (
          <T tone="secondary">No monthly income is planned yet, so there is no debt-to-income percentage.</T>
        )}
      </Card>

      {active.length > 0 ? (
        SECTIONS.map(({ type, title }) => {
          const list = active.filter((d) => d.type === type);
          if (list.length === 0) return null;
          return (
            <DebtGroup key={type} title={title}>
              {list.map((d) => (
                <DebtRow key={d.id} debt={d} stat={byId.get(d.id)} currency={currency} now={now} cardUsagePct={settings.alertThresholds.cardUsagePct} onPress={() => openDebt(d.id)} testID={`debt-item-${index++}`} />
              ))}
            </DebtGroup>
          );
        })
      ) : (
        <Card>
          <T tone="secondary">All your debts are marked as paid off.</T>
        </Card>
      )}

      {addButtons}

      {paidOff.length > 0 ? (
        <View style={{ gap: Spacing.two }}>
          <Pressable
            onPress={() => setShowPaidOff((s) => !s)}
            accessibilityRole="button"
            accessibilityLabel={`Paid off, ${paidOff.length}`}
            accessibilityState={{ expanded: showPaidOff }}
            testID="debts-paid-off-toggle"
            style={styles.toggle}>
            <T variant="heading">Paid off ({paidOff.length})</T>
            <T tone="secondary">{showPaidOff ? '▴' : '▾'}</T>
          </Pressable>
          {showPaidOff ? (
            <Card testID="debts-paid-off">
              {paidOff.map((d) => (
                <Pressable key={d.id} onPress={() => openDebt(d.id)} accessibilityRole="button" accessibilityLabel={`${d.name}, paid off`} testID={`debt-paid-${d.id}`} style={styles.paidRow}>
                  <T>{TYPE_GLYPH[d.type]}</T>
                  <T style={{ flex: 1 }}>{d.name}</T>
                  <T tone="secondary" variant="caption">
                    {labelOf(d)}
                  </T>
                </Pressable>
              ))}
            </Card>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const labelOf = (d: Debt) => (d.type === 'loan' ? 'Loan' : d.type === 'card' ? 'Card' : 'Plan');

const styles = StyleSheet.create({
  addRow: { gap: Spacing.two, alignSelf: 'stretch' },
  heroStats: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.one },
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  paidRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
});
