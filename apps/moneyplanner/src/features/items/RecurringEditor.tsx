// The recurring item form (create and edit): amount, name, category, schedule, note, save, delete and the
// upcoming payments of a saved item.
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet } from 'react-native';

import { Button, Card, Screen, SelectField, Segmented, T, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useRepoMutation } from '@/data/DataProvider';
import { AmountField } from '@/features/items/AmountField';
import { defaultWhere } from '@/features/accounts/where';
import { WhereField } from '@/features/accounts/WhereField';
import { usePro } from '@/lib/pro';
import { categoryOptions, emptyRecurringForm, formFromRecurring, validateRecurring, type FormErrors, type RecurringField, type RecurringForm } from '@/features/items/form';
import { scheduleChanged } from '@/features/items/overrides';
import { RecentChips } from '@/features/items/RecentChips';
import { ScheduleSection } from '@/features/items/ScheduleSection';
import { lastRecurringCategory, lastTransactionCategory, recentRecurringSuggestions, usableCategory, type Suggestion } from '@/features/items/suggestions';
import { UpcomingOccurrences } from '@/features/items/UpcomingOccurrences';
import { useDiscardGuard } from '@/features/items/useDiscardGuard';
import { today } from '@/lib/dates';
import { newId } from '@/lib/id';
import type { Fils, Kind, OccurrenceOverride, PlanInput, RecurringItem } from '@/types';

export interface Prefill {
  name: string;
  amount: Fils | null;
  categoryId: string | null;
  day: number | null;
}

export function RecurringEditor({ input, item, initialKind, prefill }: { input: PlanInput; item: RecurringItem | null; initialKind: Kind; prefill?: Prefill }) {
  const { isPro } = usePro();
  const lastCategory = (kind: Kind) => lastRecurringCategory(input.recurring, kind, input.categories) ?? lastTransactionCategory(input.transactions, kind, input.categories);
  const startForm = (): RecurringForm => {
    if (item) return formFromRecurring(item);
    const f = { ...emptyRecurringForm(initialKind), where: defaultWhere(input.settings, input.accounts ?? [], isPro) };
    if (prefill) {
      return {
        ...f,
        name: prefill.name,
        amount: prefill.amount,
        categoryId: usableCategory(prefill.categoryId, initialKind, input.categories),
        day: prefill.day != null ? String(prefill.day) : f.day,
      };
    }
    return { ...f, categoryId: lastCategory(initialKind) };
  };
  const [form, setForm] = useState<RecurringForm>(startForm);
  const [initialForm] = useState(() => JSON.stringify(startForm()));
  const [focusToken, setFocusToken] = useState(0);
  const suggestions = useMemo(() => (item ? [] : recentRecurringSuggestions(input.recurring, input.transactions, form.kind, today())), [item, input.recurring, input.transactions, form.kind]);
  const guard = useDiscardGuard(JSON.stringify(form) !== initialForm);
  const [errors, setErrors] = useState<FormErrors<RecurringField>>({});
  const [saving, setSaving] = useState(false);
  const save = useRepoMutation((r, i: RecurringItem) => r.upsertRecurring(i));
  const remove = useRepoMutation((r, id: string) => r.deleteRecurring(id));
  const removeOverride = useRepoMutation((r, id: string) => r.deleteOverride(id));
  const currency = input.settings.currency;
  const set = <K extends keyof RecurringForm>(key: K, value: RecurringForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const categories = useMemo(() => categoryOptions(input.categories, form.kind, form.categoryId), [input.categories, form.kind, form.categoryId]);

  const persist = async (next: RecurringItem, resetOverrides: OccurrenceOverride[]) => {
    setSaving(true);
    guard.begin();
    try {
      await save(next);
      // The item is saved first; payments changed one by one no longer match its dates, so they go.
      for (const o of resetOverrides) await removeOverride(o.id);
      await guard.leave();
    } catch {
      setSaving(false);
      guard.cancel();
      Alert.alert("Couldn't save", 'Your changes were not saved. Please try again.');
    }
  };

  const pickSuggestion = (s: Suggestion) => {
    setForm((f) => ({ ...f, name: s.text, amount: s.amount, categoryId: usableCategory(s.categoryId, f.kind, input.categories) }));
    setFocusToken((n) => n + 1);
  };

  const onSave = async () => {
    if (saving) return;
    const result = validateRecurring(form, item?.id ?? newId());
    setErrors(result.errors);
    if (!result.item) return;
    const next = result.item;
    const mine = item ? input.overrides.filter((o) => o.recurringId === item.id) : [];
    if (item && mine.length > 0 && scheduleChanged(item, next)) {
      Alert.alert('Reset changes to individual payments?', 'Changing the schedule resets changes you made to individual payments (skipped, moved, paid or changed amounts).', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save and reset',
          style: 'destructive',
          onPress: () => persist(next, mine),
        },
      ]);
      return;
    }
    await persist(next, []);
  };

  const onDelete = () => {
    if (!item) return;
    Alert.alert('Delete this item?', `"${item.name}" and all changes to its individual payments will be removed. This can't be undone.`, [
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

  const noun = form.kind === 'income' ? 'income' : 'cost';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: item ? 'Edit recurring item' : form.kind === 'income' ? 'New recurring income' : 'New recurring cost',
          headerRight: () => (
            <Pressable onPress={onSave} accessibilityRole="button" accessibilityLabel="Save" testID="recurring-save" hitSlop={8} style={styles.headerButton}>
              <T tone="accent" variant="label">
                Save
              </T>
            </Pressable>
          ),
        }}
      />
      <Screen testID="recurring-screen">
        {!item && <RecentChips suggestions={suggestions} currency={currency} onPick={pickSuggestion} />}
        <Card style={styles.group}>
          <Segmented
            label="Type"
            value={form.kind}
            onChange={(k) => setForm((f) => ({ ...f, kind: k, categoryId: item ? null : lastCategory(k) }))}
            options={[
              { value: 'income', label: 'Income' },
              { value: 'cost', label: 'Cost' },
            ]}
            testID="recurring-kind"
          />
          <AmountField
            focusToken={focusToken}
            label="Amount"
            value={form.amount}
            onChange={(v) => set('amount', v)}
            currency={currency}
            error={errors.amount}
            hint={`Enter a positive number. The type above says whether it is income or a cost.`}
            testID="recurring-amount"
          />
        </Card>

        <Card style={styles.group}>
          <TextField
            label="Name"
            value={form.name}
            onChangeText={(t) => set('name', t)}
            placeholder={form.kind === 'income' ? 'e.g. Salary' : 'e.g. Rent'}
            error={errors.name}
            testID="recurring-name"
          />
          <SelectField
            label="Category"
            value={form.categoryId ?? 'none'}
            options={[{ value: 'none', label: 'No category' }, ...categories]}
            onChange={(v) => set('categoryId', v === 'none' ? null : v)}
            testID="recurring-category"
          />
          <WhereField input={input} kind={form.kind} value={form.where} onChange={(w) => set('where', w)} testID="recurring-where" />
        </Card>

        <ScheduleSection form={form} set={set} setForm={setForm} errors={errors} item={item} />

        <Card style={styles.group}>
          <TextField label="Note (optional)" value={form.note} onChangeText={(t) => set('note', t)} multiline testID="recurring-note" />
        </Card>

        <Button label={item ? 'Save changes' : `Add ${noun}`} onPress={onSave} disabled={saving} testID="recurring-save-bottom" />
        {item && <Button label="Delete" variant="destructive" onPress={onDelete} testID="recurring-delete" />}

        {item && <UpcomingOccurrences item={item} overrides={input.overrides.filter((o) => o.recurringId === item.id)} currency={currency} />}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: Spacing.three },
  headerButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
