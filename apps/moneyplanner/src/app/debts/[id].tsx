// Create or edit a loan, credit card or instalment plan; for an existing debt also its next payments and payment log.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, DateField, EmptyState, MoneyField, Screen, SectionHeader, Segmented, SelectField, T, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useRepoMutation } from '@/data/DataProvider';
import { debtStats } from '@/engine';
import { PaymentLog } from '@/features/debts/PaymentLog';
import { Schedule } from '@/features/debts/Schedule';
import { emptyDebtForm, formFromDebt, minimumPayment, TYPE_LABEL, validateDebt, type DebtErrors, type DebtForm } from '@/features/debts/form';
import { decimalNumber } from '@/features/debts/form';
import { pctText, progressOf, whenLabel } from '@/features/debts/helpers';
import { Bar, type DebtStat } from '@/features/debts/Parts';
import { useDebtData, type DebtData } from '@/features/debts/useDebtData';
import { useToday } from '@/features/dashboard/useToday';
import { useDiscardGuard } from '@/features/items/useDiscardGuard';
import { formatDate } from '@/lib/dates';
import { newId } from '@/lib/id';
import { formatMoney } from '@/lib/money';
import type { Debt, DebtType } from '@/types';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const asType = (v: string | undefined): DebtType => (v === 'card' || v === 'plan' ? v : 'loan');

export default function DebtScreen() {
  const params = useLocalSearchParams<{ id: string; type?: string }>();
  const id = first(params.id) ?? 'new';
  const isNew = id === 'new';
  const { data, error, reload } = useDebtData();
  const [cached, setCached] = useState<Debt | null>(null);
  const existing = data?.all.find((d) => d.id === id) ?? null;
  // Keep showing the debt while it is being deleted (the data refreshes before we leave).
  if (existing && existing !== cached) setCached(existing);
  const debt = existing ?? cached;

  if (!data) {
    return (
      <Screen testID="debt-screen">
        {error ? (
          <EmptyState title="Couldn't load this debt" message="Nothing has been lost. Try again." action={<Button label="Try again" onPress={reload} testID="debt-retry" />} />
        ) : (
          <T tone="secondary">Loading…</T>
        )}
      </Screen>
    );
  }
  if (!isNew && !debt) {
    return (
      <Screen testID="debt-screen">
        <Stack.Screen options={{ title: 'Debt' }} />
        <EmptyState title="Debt not found" message="It may have been deleted." action={<Button label="Go back" onPress={() => router.back()} testID="debt-back" />} />
      </Screen>
    );
  }
  return <DebtEditor key={id} data={data} debt={isNew ? null : debt} initialType={asType(first(params.type))} />;
}

function DebtEditor({ data, debt, initialType }: { data: DebtData; debt: Debt | null; initialType: DebtType }) {
  const { input } = data;
  const now = useToday();
  const [form, setForm] = useState<DebtForm>(() => (debt ? formFromDebt(debt) : emptyDebtForm(initialType)));
  const [initialForm] = useState(() => JSON.stringify(debt ? formFromDebt(debt) : emptyDebtForm(initialType)));
  const dirty = JSON.stringify(form) !== initialForm;
  const guard = useDiscardGuard(dirty);
  const [errors, setErrors] = useState<DebtErrors>({});
  const [saving, setSaving] = useState(false);
  const save = useRepoMutation((r, d: Debt) => r.upsertDebt(d));
  const remove = useRepoMutation((r, id: string) => r.deleteDebt(id));
  const currency = input.settings.currency;
  const money = (n: number) => formatMoney(n, currency);
  const set = <K extends keyof DebtForm>(key: K, value: DebtForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const type = form.type;

  const stat: DebtStat | undefined = useMemo(() => (debt && !debt.archived ? debtStats(input, now).perDebt.find((p) => p.debtId === debt.id) : undefined), [debt, input, now]);
  const cards = data.all.filter((d) => d.type === 'card' && (!d.archived || d.id === form.cardId));

  const persist = async (next: Debt) => {
    setSaving(true);
    guard.begin();
    try {
      await save(next);
      await guard.leave();
    } catch {
      setSaving(false);
      guard.cancel();
      Alert.alert("Couldn't save", 'Your changes were not saved. Please try again.');
    }
  };

  const onSave = async () => {
    if (saving) return;
    const result = validateDebt(form, debt?.id ?? newId(), debt, now);
    setErrors(result.errors);
    if (result.debt) await persist(result.debt);
  };

  const onArchive = async () => {
    if (!debt || saving) return;
    await persist({ ...debt, archived: !debt.archived });
  };

  const onDelete = () => {
    if (!debt) return;
    Alert.alert('Delete this debt?', `"${debt.name}", its payment log and changes to its payments will be removed. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          guard.begin();
          try {
            await remove(debt.id);
            await guard.leave();
          } catch {
            guard.cancel();
            Alert.alert("Couldn't delete", 'Please try again.');
          }
        },
      },
    ]);
  };

  const title = debt ? `Edit ${TYPE_LABEL[type].toLowerCase()}` : `New ${TYPE_LABEL[type].toLowerCase()}`;
  const payments = input.debtPayments.filter((p) => p.debtId === debt?.id);

  // Facts for the card form.
  const cardBalance = form.balance ?? 0;
  const minNow = minimumPayment(cardBalance, decimalNumber(form.minPct) ?? 0, form.minFloor ?? 0);
  const localInterest = Math.round((cardBalance * (decimalNumber(form.monthlyRate) ?? 0)) / 100);
  const interest = !dirty && stat?.minimumInterestEstimate != null ? stat.minimumInterestEstimate : localInterest;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <Pressable onPress={onSave} accessibilityRole="button" accessibilityLabel="Save" testID="debt-save" hitSlop={8} style={styles.headerButton}>
              <T tone="accent" variant="label">
                Save
              </T>
            </Pressable>
          ),
        }}
      />
      <Screen testID="debt-screen">
        {debt?.archived ? (
          <Card>
            <T tone="secondary" testID="debt-archived-note">
              This debt is marked as paid off. It is hidden from the forecast and totals.
            </T>
          </Card>
        ) : null}

        {debt && stat ? <Summary debt={debt} stat={stat} money={money} now={now} progress={progressOf(debt, input, stat.nextPayment?.date, now)} /> : null}

        <Card style={styles.group}>
          <TextField
            label="Name"
            value={form.name}
            onChangeText={(t) => set('name', t)}
            placeholder={type === 'loan' ? 'e.g. Car loan' : type === 'card' ? 'e.g. Visa card' : 'e.g. Phone instalments'}
            error={errors.name}
            testID="debt-name"
          />
          {type === 'loan' && (
            <>
              <MoneyField label="Remaining balance" value={form.balance} onChange={(v) => set('balance', v)} currency={currency} error={errors.balance} hint="What you still owe on the date below." testID="debt-balance" />
              <DateField label="Balance as of" value={form.balanceDate} onChange={(d) => set('balanceDate', d)} error={errors.balanceDate} hint="Payments after this date reduce the balance." testID="debt-balance-date" />
              <MoneyField label="Monthly payment" value={form.monthly} onChange={(v) => set('monthly', v)} currency={currency} error={errors.monthly} testID="debt-monthly" />
              <TextField label="Payment day (1-31)" value={form.day} onChangeText={(t) => set('day', t)} keyboardType="number-pad" error={errors.day} hint="In shorter months it is taken on the last day." testID="debt-day" />
              <TextField label="Yearly interest rate % (optional)" value={form.rate} onChangeText={(t) => set('rate', t)} keyboardType="decimal-pad" error={errors.rate} hint="Used to estimate interest and the last payment date." testID="debt-rate" />
              <Segmented
                label="End date"
                value={form.endDate ? 'date' : 'none'}
                onChange={(v) => set('endDate', v === 'none' ? null : (debt?.type === 'loan' && debt.endDate) || form.balanceDate)}
                options={[
                  { value: 'none', label: 'Until paid off' },
                  { value: 'date', label: 'Set last payment date' },
                ]}
                testID="debt-end-mode"
              />
              {form.endDate ? <DateField label="Last payment date" value={form.endDate} onChange={(d) => set('endDate', d)} error={errors.endDate} testID="debt-end-date" /> : null}
            </>
          )}
          {type === 'card' && (
            <>
              <MoneyField label="Credit limit" value={form.limit} onChange={(v) => set('limit', v)} currency={currency} error={errors.limit} testID="debt-limit" />
              <MoneyField label="Balance owed" value={form.balance} onChange={(v) => set('balance', v)} currency={currency} error={errors.balance} hint="Available credit is the limit minus the balance." testID="debt-balance" />
              <DateField label="Balance as of" value={form.balanceDate} onChange={(d) => set('balanceDate', d)} error={errors.balanceDate} testID="debt-balance-date" />
              <TextField label="Statement day (1-31)" value={form.statementDay} onChangeText={(t) => set('statementDay', t)} keyboardType="number-pad" error={errors.statementDay} testID="debt-statement-day" />
              <TextField label="Payment due day (1-31)" value={form.dueDay} onChangeText={(t) => set('dueDay', t)} keyboardType="number-pad" error={errors.dueDay} testID="debt-day" />
            </>
          )}
          {type === 'plan' && (
            <>
              <MoneyField label="Total" value={form.total} onChange={(v) => set('total', v)} currency={currency} error={errors.total} testID="debt-total" />
              <MoneyField label="Monthly amount" value={form.monthly} onChange={(v) => set('monthly', v)} currency={currency} error={errors.monthly} testID="debt-monthly" />
              <TextField label="Number of payments" value={form.payments} onChangeText={(t) => set('payments', t)} keyboardType="number-pad" error={errors.payments} hint="Equal monthly payments, starting on the date below." testID="debt-payments" />
              <DateField label="First payment date" value={form.firstPaymentDate} onChange={(d) => set('firstPaymentDate', d)} error={errors.firstPaymentDate} testID="debt-first-date" />
              <SelectField
                label="Card (optional)"
                value={form.cardId ?? 'none'}
                options={[{ value: 'none', label: 'Not linked to a card' }, ...cards.map((c) => ({ value: c.id, label: c.name }))]}
                onChange={(v) => set('cardId', v === 'none' ? null : v)}
                testID="debt-card"
              />
              <T variant="caption" tone="secondary">
                {cards.length === 0 ? 'Add a credit card to link a plan to it.' : 'A linked plan’s payments are part of that card’s due amount.'}
              </T>
            </>
          )}
        </Card>

        {type === 'card' && (
          <>
            <SectionHeader title="Minimum payment and repayment" />
            <Card style={styles.group}>
              <TextField label="Minimum payment % of balance" value={form.minPct} onChangeText={(t) => set('minPct', t)} keyboardType="decimal-pad" error={errors.minPct} hint="Rule: max(balance × %, floor), never more than the balance." testID="debt-min-pct" />
              <MoneyField label="Minimum payment floor" value={form.minFloor} onChange={(v) => set('minFloor', v)} currency={currency} error={errors.minFloor} testID="debt-min-floor" />
              <TextField label="Monthly interest rate % (optional)" value={form.monthlyRate} onChangeText={(t) => set('monthlyRate', t)} keyboardType="decimal-pad" error={errors.monthlyRate} hint="As printed by the bank, e.g. 3.25. Used for estimates only." testID="debt-monthly-rate" />
              <Segmented
                label="Repayment plan"
                value={form.plan}
                onChange={(v) => set('plan', v)}
                options={[
                  { value: 'full', label: 'Full' },
                  { value: 'minimum', label: 'Minimum' },
                  { value: 'fixed', label: 'Fixed' },
                ]}
                testID="debt-plan"
              />
              <T variant="caption" tone="secondary">
                {form.plan === 'full'
                  ? 'The statement balance is paid on each due date.'
                  : form.plan === 'minimum'
                    ? `The minimum is paid on each due date: about ${money(minNow)} on the balance above.`
                    : 'The fixed amount below is paid on each due date, up to the balance.'}
              </T>
              {form.plan === 'fixed' ? <MoneyField label="Fixed monthly payment" value={form.fixedAmount} onChange={(v) => set('fixedAmount', v)} currency={currency} error={errors.fixedAmount} testID="debt-fixed" /> : null}
              {form.plan === 'minimum' ? (
                <T variant="caption" tone="warning" testID="debt-interest-estimate">
                  {form.monthlyRate.trim() && cardBalance > 0
                    ? `Paying only the minimum, estimated interest this month is about ${money(interest)} (balance × ${form.monthlyRate.trim()}%).`
                    : 'Enter a monthly interest rate and a balance to see the estimated interest when paying only the minimum.'}
                </T>
              ) : null}
            </Card>
          </>
        )}

        <Card style={styles.group}>
          <TextField label="Note (optional)" value={form.note} onChangeText={(t) => set('note', t)} multiline testID="debt-note" />
        </Card>

        <Button label={debt ? 'Save changes' : `Add ${TYPE_LABEL[type].toLowerCase()}`} onPress={onSave} disabled={saving} testID="debt-save-bottom" />

        {debt ? (
          <>
            {!debt.archived ? <Schedule debt={debt} input={input} now={now} currency={currency} cardName={debt.type === 'plan' ? data.all.find((d) => d.id === debt.cardId)?.name : null} /> : null}
            <PaymentLog debtId={debt.id} payments={payments} currency={currency} />
            <Button
              label={debt.archived ? 'Move back to active debts' : 'Mark as paid off'}
              variant="secondary"
              onPress={onArchive}
              disabled={saving}
              accessibilityHint={debt.archived ? undefined : 'Hides it from the forecast and totals; the history is kept'}
              testID="debt-archive"
            />
            <Button label="Delete" variant="destructive" onPress={onDelete} testID="debt-delete" />
          </>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Summary({ debt, stat, money, now, progress }: { debt: Debt; stat: DebtStat; money: (n: number) => string; now: string; progress: { paid: number; total: number } | null }) {
  const lines: [string, string][] = [[debt.type === 'card' ? 'Balance' : 'Remaining', money(stat.remaining)]];
  if (debt.type === 'card') {
    lines.push(['Available credit', money(stat.availableCredit ?? 0)]);
    if (stat.usagePct != null) lines.push(['Used', pctText(stat.usagePct)]);
  }
  lines.push(['Next payment', stat.nextPayment ? `${money(stat.nextPayment.amount)} ${whenLabel(stat.nextPayment.date, now)}` : 'None scheduled']);
  if (debt.type !== 'card') lines.push(['Last payment', stat.endDate ? `${formatDate(stat.endDate)}${(stat as { interestEstimated?: boolean }).interestEstimated ? ' (estimated)' : ''}` : 'Not known yet']);
  return (
    <Card testID="debt-summary">
      {lines.map(([k, v]) => (
        <View key={k} style={styles.sumRow} accessible accessibilityLabel={`${k}: ${v}`}>
          <T tone="secondary">{k}</T>
          <T variant="number">{v}</T>
        </View>
      ))}
      {debt.type !== 'card' && progress ? (
        <>
          <T variant="caption" tone="secondary">
            {progress.paid} of {progress.total} paid
          </T>
          <Bar value={progress.total ? Math.min(1, progress.paid / progress.total) : 0} label={`${progress.paid} of ${progress.total} paid`} />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: Spacing.three },
  headerButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
});
