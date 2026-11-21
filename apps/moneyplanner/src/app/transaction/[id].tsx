// Create or edit a one-time income or spend.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet } from 'react-native';

import { Button, DateField, EmptyState, MoneyField, Screen, SelectField, Segmented, T, TextField, ToggleRow } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { usePlanInput, useRepoMutation } from '@/data/DataProvider';
import {
  categoryOptions,
  defaultPlanned,
  emptyTransactionForm,
  formFromTransaction,
  validateTransaction,
  type FormErrors,
  type TransactionField,
  type TransactionForm,
} from '@/features/items/form';
import { useDiscardGuard } from '@/features/items/useDiscardGuard';
import { isValidISODate } from '@/lib/dates';
import { newId } from '@/lib/id';
import type { Kind, PlanInput, Transaction } from '@/types';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function TransactionScreen() {
  const params = useLocalSearchParams<{ id: string; kind?: string; date?: string }>();
  const id = first(params.id) ?? 'new';
  const isNew = id === 'new';
  const { data, error, reload } = usePlanInput();
  const [cached, setCached] = useState<Transaction | null>(null);
  const existing = data?.transactions.find((t) => t.id === id) ?? null;
  // Keep showing the item while it is being deleted (the list refreshes before we leave).
  if (existing && existing !== cached) setCached(existing);
  const item = existing ?? cached;

  if (!data) {
    return (
      <Screen>
        {error ? (
          <EmptyState title="Couldn't load this item" message="Nothing has been lost. Try again." action={<Button label="Try again" onPress={reload} testID="transaction-retry" />} />
        ) : (
          <T tone="secondary">Loading…</T>
        )}
      </Screen>
    );
  }
  if (!isNew && !item) {
    return (
      <Screen>
        <EmptyState title="Item not found" message="It may have been deleted." action={<Button label="Go back" onPress={() => router.back()} testID="transaction-back" />} />
      </Screen>
    );
  }
  const kind: Kind = first(params.kind) === 'income' ? 'income' : 'cost';
  const dateParam = first(params.date);
  return <TransactionEditor key={id} input={data} item={isNew ? null : item} initialKind={kind} initialDate={dateParam && isValidISODate(dateParam) ? dateParam : undefined} />;
}

function TransactionEditor({ input, item, initialKind, initialDate }: { input: PlanInput; item: Transaction | null; initialKind: Kind; initialDate?: string }) {
  const [form, setForm] = useState<TransactionForm>(() => (item ? formFromTransaction(item) : emptyTransactionForm(initialKind, initialDate)));
  const [initialForm] = useState(() => JSON.stringify(item ? formFromTransaction(item) : emptyTransactionForm(initialKind, initialDate)));
  const allowLeave = useDiscardGuard(JSON.stringify(form) !== initialForm);
  // Until the user flips the switch, "planned" follows the date (future = planned).
  const [plannedTouched, setPlannedTouched] = useState(!!item);
  const [errors, setErrors] = useState<FormErrors<TransactionField>>({});
  const [saving, setSaving] = useState(false);
  const save = useRepoMutation((r, t: Transaction) => r.upsertTransaction(t));
  const remove = useRepoMutation((r, id: string) => r.deleteTransaction(id));
  const currency = input.settings.currency;
  const set = <K extends keyof TransactionForm>(key: K, value: TransactionForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const categories = useMemo(() => categoryOptions(input.categories, form.kind, form.categoryId), [input.categories, form.kind, form.categoryId]);

  const onSave = async () => {
    if (saving) return;
    const result = validateTransaction(form, item ?? { id: newId() });
    setErrors(result.errors);
    if (!result.item) return;
    setSaving(true);
    try {
      await save(result.item);
      allowLeave();
      router.back();
    } catch {
      setSaving(false);
      Alert.alert("Couldn't save", 'Your changes were not saved. Please try again.');
    }
  };

  const onDelete = () => {
    if (!item) return;
    Alert.alert('Delete this item?', `"${item.description}" will be removed. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove(item.id);
            allowLeave();
      router.back();
          } catch {
            Alert.alert("Couldn't delete", 'Please try again.');
          }
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: item ? 'Edit one-time item' : 'New one-time item',
          headerRight: () => (
            <Pressable onPress={onSave} accessibilityRole="button" accessibilityLabel="Save" testID="transaction-save" hitSlop={8} style={styles.headerButton}>
              <T tone="accent" variant="label">
                Save
              </T>
            </Pressable>
          ),
        }}
      />
      <Screen testID="transaction-screen">
        <Segmented
          label="Type"
          value={form.kind}
          onChange={(k) => setForm((f) => ({ ...f, kind: k, categoryId: null }))}
          options={[
            { value: 'income', label: 'Income' },
            { value: 'cost', label: 'Spend' },
          ]}
          testID="transaction-kind"
        />
        <TextField label="Description" value={form.description} onChangeText={(t) => set('description', t)} placeholder={form.kind === 'income' ? 'e.g. Bonus' : 'e.g. Groceries'} error={errors.description} testID="transaction-description" />
        <MoneyField label="Amount" value={form.amount} onChange={(v) => set('amount', v)} currency={currency} error={errors.amount} hint="Enter a positive number. The type above says whether it is income or spend." testID="transaction-amount" />
        <DateField
          label="Date"
          value={form.date}
          onChange={(d) => setForm((f) => ({ ...f, date: d, planned: plannedTouched ? f.planned : defaultPlanned(d) }))}
          error={errors.date}
          testID="transaction-date"
        />
        <SelectField
          label="Category"
          value={form.categoryId ?? 'none'}
          options={[{ value: 'none', label: 'No category' }, ...categories]}
          onChange={(v) => set('categoryId', v === 'none' ? null : v)}
          testID="transaction-category"
        />
        <ToggleRow
          label="Planned (hasn't happened yet)"
          description="Planned items count in the forecast. Turn off once it has happened."
          value={form.planned}
          onChange={(v) => {
            setPlannedTouched(true);
            set('planned', v);
          }}
          testID="transaction-planned"
        />
        <TextField label="Note (optional)" value={form.note} onChangeText={(t) => set('note', t)} multiline testID="transaction-note" />
        <Button label={item ? 'Save changes' : form.kind === 'income' ? 'Add income' : 'Add spend'} onPress={onSave} disabled={saving} testID="transaction-save-bottom" />
        {item && <Button label="Delete" variant="destructive" onPress={onDelete} testID="transaction-delete" />}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.one },
});
