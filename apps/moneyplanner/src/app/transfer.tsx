// Move money between the user's own accounts (milestone 3b, Pro): not spending or income.
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button, Card, DateField, EmptyState, MoneyField, Screen, SelectField, T, TextField } from '@/components/ui';
import { usePlanInput, useRepoMutation } from '@/data/DataProvider';
import { pickableAccounts } from '@/features/accounts/helpers';
import { buildTransfer, type TransferErrors, type TransferForm } from '@/features/accounts/transfer';
import { today } from '@/lib/dates';
import { newId } from '@/lib/id';
import { usePro } from '@/lib/pro';
import type { Transaction } from '@/types';

export default function TransferScreen() {
  const { isPro } = usePro();
  const { data: input } = usePlanInput();
  if (!input) return <Screen testID="transfer-screen">{null}</Screen>;
  const accounts = pickableAccounts(input.settings.mainAccountName ?? 'Main account', input.accounts ?? []);
  if (!isPro || accounts.length < 2) {
    return (
      <Screen testID="transfer-screen">
        <Stack.Screen options={{ title: 'Move money' }} />
        <EmptyState
          title="Moving money needs two accounts"
          message="Add a second bank or cash account in Settings → Accounts (Pro). To pay a card, log the payment on the card in Debts."
          action={<Button label="Go to Accounts" onPress={() => router.replace('/accounts')} testID="transfer-to-accounts" />}
        />
      </Screen>
    );
  }
  // The form starts once the accounts are known, so "From" and "To" begin as two different accounts.
  return <TransferEditor accounts={accounts} currency={input.settings.currency} />;
}

function TransferEditor({ accounts, currency }: { accounts: { id: string; name: string }[]; currency: string }) {
  const save = useRepoMutation(async (r, items: Transaction[]) => {
    for (const t of items) await r.upsertTransaction(t);
  });
  const [form, setForm] = useState<TransferForm>(() => ({ from: accounts[0].id, to: accounts[1].id, amount: null, date: today(), note: '' }));
  const [errors, setErrors] = useState<TransferErrors>({});
  const [saving, setSaving] = useState(false);
  const nameOf = (id: string) => accounts.find((a) => a.id === id)?.name ?? '';
  const options = accounts.map((a) => ({ value: a.id, label: a.name }));
  const set = <K extends keyof TransferForm>(k: K, v: TransferForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const onSave = async () => {
    if (saving) return;
    const r = buildTransfer(form, { from: nameOf(form.from), to: nameOf(form.to) }, { out: newId(), in: newId(), transfer: newId() });
    setErrors(r.errors);
    if (!r.items) return;
    setSaving(true);
    try {
      await save(r.items);
      router.back();
    } catch {
      setSaving(false);
      Alert.alert("Couldn't save", 'Nothing was moved. Please try again.');
    }
  };

  return (
    <Screen testID="transfer-screen">
      <Stack.Screen options={{ title: 'Move money' }} />
      <T tone="secondary">Money moved between your own accounts changes their balances, but it is not spending or income.</T>
      <Card>
        <SelectField label="From" value={form.from} options={options} onChange={(v) => set('from', v)} testID="transfer-from" />
        <SelectField label="To" value={form.to} options={options} onChange={(v) => set('to', v)} error={errors.to} testID="transfer-to" />
        <MoneyField label="Amount" value={form.amount} onChange={(v) => set('amount', v)} currency={currency} error={errors.amount} testID="transfer-amount" />
        <DateField label="Date" value={form.date} onChange={(d) => set('date', d)} error={errors.date} testID="transfer-date" />
        <TextField label="Note (optional)" value={form.note} onChangeText={(t) => set('note', t)} testID="transfer-note" />
      </Card>
      <Button label="Move money" onPress={onSave} disabled={saving} testID="transfer-save" />
    </Screen>
  );
}
