// Create or edit one cheque, or (new?series=1) create a series.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet } from 'react-native';

import { Button, Card, DateField, EmptyState, MoneyField, Screen, Segmented, T, TextField, ToggleRow } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useRepoMutation, usePlanInput } from '@/data/DataProvider';
import { SeriesEditor } from '@/features/cheques/SeriesEditor';
import {
  emptyChequeForm,
  formFromCheque,
  laterInSeries,
  STATUS_LABEL,
  validateCheque,
  type ChequeField,
  type ChequeForm,
} from '@/features/cheques/logic';
import { useToday } from '@/features/dashboard/useToday';
import { useDiscardGuard } from '@/features/items/useDiscardGuard';
import { newId } from '@/lib/id';
import type { Cheque, ChequeStatus } from '@/types';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function ChequeScreen() {
  const params = useLocalSearchParams<{ id: string; series?: string }>();
  const id = first(params.id) ?? 'new';
  const isNew = id === 'new';
  const today = useToday();
  const plan = usePlanInput();
  const [cached, setCached] = useState<Cheque | null>(null);
  const existing = plan.data?.cheques.find((c) => c.id === id) ?? null;
  // Keep showing the cheque while it is being deleted (the list refreshes before we leave).
  if (existing && existing !== cached) setCached(existing);
  const item = existing ?? cached;
  const currency = plan.data?.settings.currency;

  if (!plan.data || !currency) {
    const error = plan.error;
    return (
      <Screen>
        {error ? (
          <EmptyState
            title="Couldn't load this cheque"
            message="Nothing has been lost. Try again."
            action={
              <Button
                label="Try again"
                onPress={plan.reload}
                testID="cheque-retry"
              />
            }
          />
        ) : (
          <T tone="secondary">Loading…</T>
        )}
      </Screen>
    );
  }
  if (!isNew && !item) {
    return (
      <Screen>
        <EmptyState title="Cheque not found" message="It may have been deleted." action={<Button label="Go back" onPress={() => router.back()} testID="cheque-back" />} />
      </Screen>
    );
  }
  if (isNew && first(params.series) === '1') {
    return (
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Stack.Screen options={{ title: 'New cheque series' }} />
        <Screen testID="cheque-series-screen">
          <SeriesEditor currency={currency} today={today} />
        </Screen>
      </KeyboardAvoidingView>
    );
  }
  return <ChequeEditor key={id} item={isNew ? null : item} all={plan.data.cheques} currency={currency} today={today} />;
}

function ChequeEditor({ item, all, currency, today }: { item: Cheque | null; all: Cheque[]; currency: string; today: string }) {
  const [initial] = useState(() => JSON.stringify(item ? formFromCheque(item) : emptyChequeForm(today)));
  const [form, setForm] = useState<ChequeForm>(() => JSON.parse(initial));
  const [applyLater, setApplyLater] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<ChequeField, string>>>({});
  const [saving, setSaving] = useState(false);
  const guard = useDiscardGuard(JSON.stringify(form) !== initial);
  const save = useRepoMutation((r, list: Cheque[]) => r.upsertCheques(list));
  const remove = useRepoMutation((r, id: string) => r.deleteCheque(id));
  const set = <K extends keyof ChequeForm>(k: K, v: ChequeForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const later = item ? laterInSeries(all, item) : [];

  const onSave = async () => {
    if (saving) return;
    const result = validateCheque(form, item ?? { id: newId() });
    setErrors(result.errors);
    const cheque = result.cheque;
    if (!cheque) return;
    const toSave = [cheque];
    if (applyLater) for (const c of later) toSave.push({ ...c, payee: cheque.payee, amount: cheque.amount });
    setSaving(true);
    guard.begin();
    try {
      await save(toSave);
      await guard.leave();
    } catch {
      setSaving(false);
      guard.cancel();
      Alert.alert("Couldn't save", 'Your changes were not saved. Please try again.');
    }
  };

  const onDelete = () => {
    if (!item) return;
    Alert.alert('Delete this cheque?', `The cheque to "${item.payee}" will be removed. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          guard.begin();
          try {
            await remove(item.id);
            await guard.leave();
          } catch {
            guard.cancel();
            Alert.alert("Couldn't delete", 'Please try again.');
          }
        },
      },
    ]);
  };

  const statuses = (Object.keys(STATUS_LABEL) as ChequeStatus[]).map((value) => ({ value, label: STATUS_LABEL[value] }));

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: item ? 'Edit cheque' : 'New cheque',
          headerRight: () => (
            <Pressable onPress={onSave} accessibilityRole="button" accessibilityLabel="Save" testID="cheque-save" hitSlop={8} style={styles.headerButton}>
              <T tone="accent" variant="label">
                Save
              </T>
            </Pressable>
          ),
        }}
      />
      <Screen testID="cheque-screen">
        <Card style={styles.group}>
          <TextField label="Payee" value={form.payee} onChangeText={(t) => set('payee', t)} placeholder="e.g. Landlord" error={errors.payee} testID="cheque-payee" />
          <MoneyField label="Amount" value={form.amount} onChange={(v) => set('amount', v)} currency={currency} error={errors.amount} testID="cheque-amount" />
          <DateField label="Date on the cheque" value={form.date} onChange={(d) => set('date', d)} error={errors.date} testID="cheque-date" />
          <TextField label="Purpose (optional)" value={form.purpose} onChangeText={(t) => set('purpose', t)} placeholder="e.g. Rent" testID="cheque-purpose" />
        </Card>
        <Card style={styles.group}>
          <Segmented label="Status" value={form.status} onChange={(s) => set('status', s)} options={statuses} testID="cheque-status" />
          <TextField label="Note (optional)" value={form.note} onChangeText={(t) => set('note', t)} multiline testID="cheque-note" />
        </Card>
        {later.length > 0 && (
          <Card>
            <ToggleRow
              label="Apply amount and payee to the later cheques in this series"
              description={`${later.length} later upcoming cheque${later.length === 1 ? '' : 's'} will get this payee and amount. Their dates stay the same.`}
              value={applyLater}
              onChange={setApplyLater}
              testID="cheque-apply-later"
            />
          </Card>
        )}
        <Button label={item ? 'Save changes' : 'Add cheque'} onPress={onSave} disabled={saving} testID="cheque-save-bottom" />
        {item && <Button label="Delete" variant="destructive" onPress={onDelete} testID="cheque-delete" />}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: Spacing.three },
  headerButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.one },
});
