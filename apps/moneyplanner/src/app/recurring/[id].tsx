// Create or edit a recurring item, with its upcoming occurrences.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, DateField, EmptyState, MoneyField, Screen, SectionHeader, SelectField, Segmented, T, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { usePlanInput, useRepoMutation } from '@/data/DataProvider';
import { expandRecurring } from '@/engine';
import { categoryOptions, emptyRecurringForm, formFromRecurring, validateRecurring, type FormErrors, type RecurringField, type RecurringForm } from '@/features/items/form';
import { applyOverridePatch, scheduleChanged, type OverridePatch } from '@/features/items/overrides';
import { useDiscardGuard } from '@/features/items/useDiscardGuard';
import { describeSchedule, MONTH_NAMES, WEEKDAY_NAMES } from '@/features/items/schedule';
import { useTheme } from '@/hooks/use-theme';
import { addMonths, compareDates, formatDate, today, weekday } from '@/lib/dates';
import { newId } from '@/lib/id';
import { formatMoney } from '@/lib/money';
import type { Fils, Kind, OccurrenceOverride, PlanInput, RecurringItem } from '@/types';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function RecurringScreen() {
  const params = useLocalSearchParams<{ id: string; kind?: string }>();
  const id = first(params.id) ?? 'new';
  const isNew = id === 'new';
  const { data, error, reload } = usePlanInput();
  const [cached, setCached] = useState<RecurringItem | null>(null);
  const existing = data?.recurring.find((r) => r.id === id) ?? null;
  // Keep showing the item while it is being deleted (the list refreshes before we leave).
  if (existing && existing !== cached) setCached(existing);
  const item = existing ?? cached;

  if (!data) {
    return (
      <Screen>
        {error ? (
          <EmptyState title="Couldn't load this item" message="Nothing has been lost. Try again." action={<Button label="Try again" onPress={reload} testID="recurring-retry" />} />
        ) : (
          <T tone="secondary">Loading…</T>
        )}
      </Screen>
    );
  }
  if (!isNew && !item) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Recurring item' }} />
        <EmptyState title="Item not found" message="It may have been deleted." action={<Button label="Go back" onPress={() => router.back()} testID="recurring-back" />} />
      </Screen>
    );
  }
  const kind: Kind = first(params.kind) === 'income' ? 'income' : 'cost';
  return <RecurringEditor key={id} input={data} item={isNew ? null : item} initialKind={kind} />;
}

function RecurringEditor({ input, item, initialKind }: { input: PlanInput; item: RecurringItem | null; initialKind: Kind }) {
  const [form, setForm] = useState<RecurringForm>(() => (item ? formFromRecurring(item) : emptyRecurringForm(initialKind)));
  const [initialForm] = useState(() => JSON.stringify(item ? formFromRecurring(item) : emptyRecurringForm(initialKind)));
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

  const weekdayName = WEEKDAY_NAMES[weekday(form.startDate)];
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
        <Card style={styles.group}>
          <Segmented
            label="Type"
            value={form.kind}
            onChange={(k) => setForm((f) => ({ ...f, kind: k, categoryId: null }))}
            options={[
              { value: 'income', label: 'Income' },
              { value: 'cost', label: 'Cost' },
            ]}
            testID="recurring-kind"
          />
          <MoneyField
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
        </Card>

        <SectionHeader title="Schedule" />
        <Card style={styles.group}>
          <Segmented
            label="Repeats"
            value={form.scheduleType}
            onChange={(v) => set('scheduleType', v)}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'yearly', label: 'Yearly' },
            ]}
            testID="recurring-schedule"
          />
          {form.scheduleType === 'monthly' && (
            <>
              <Segmented
                label="Day of the month"
                value={form.monthlyMode}
                onChange={(v) => set('monthlyMode', v)}
                options={[
                  { value: 'day', label: 'On a day' },
                  { value: 'last', label: 'Last day' },
                ]}
                testID="recurring-monthly-mode"
              />
              {form.monthlyMode === 'day' && (
                <TextField
                  label="Day of the month (1-31)"
                  value={form.day}
                  onChangeText={(t) => set('day', t)}
                  keyboardType="number-pad"
                  error={errors.day}
                  hint="In shorter months it happens on the last day."
                  testID="recurring-day"
                />
              )}
              <TextField
                label="Every how many months (1-12)"
                value={form.everyMonths}
                onChangeText={(t) => set('everyMonths', t)}
                keyboardType="number-pad"
                error={errors.everyMonths}
                hint="1 = every month, 3 = every three months."
                testID="recurring-every-months"
              />
            </>
          )}
          {form.scheduleType === 'weekly' && (
            <>
              <Segmented
                label="Every how many weeks"
                value={String(form.everyWeeks) as '1' | '2'}
                onChange={(v) => set('everyWeeks', v === '2' ? 2 : 1)}
                options={[
                  { value: '1', label: 'Every week' },
                  { value: '2', label: 'Every 2 weeks' },
                ]}
                testID="recurring-every-weeks"
              />
              <T variant="caption" tone="secondary">
                Weekly items happen on the same weekday as the start date, which is a {weekdayName}. Change the start date to change the weekday.
              </T>
            </>
          )}
          {form.scheduleType === 'yearly' && (
            <>
              <SelectField
                label="Month"
                value={String(form.month)}
                options={MONTH_NAMES.map((m, i) => ({
                  value: String(i + 1),
                  label: m,
                }))}
                onChange={(v) => set('month', Number(v))}
                testID="recurring-month"
              />
              <TextField label="Day of the month" value={form.day} onChangeText={(t) => set('day', t)} keyboardType="number-pad" error={errors.day} testID="recurring-day" />
            </>
          )}

          <DateField
            label="Start date"
            value={form.startDate}
            onChange={(d) => set('startDate', d)}
            error={errors.startDate}
            hint="The first date it can happen on."
            testID="recurring-start-date"
          />
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <T variant="label">Ends</T>
          </View>
          <Segmented
            label="Ends"
            value={form.endMode}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                endMode: v,
                // An end date only stays with a count when the saved item had both.
                endDate: v === 'none' ? null : v === 'count' && item?.count == null ? null : f.endDate,
              }))
            }
            options={[
              { value: 'none', label: 'No end' },
              { value: 'date', label: 'End date' },
              { value: 'count', label: 'Payments' },
            ]}
            testID="recurring-end-mode"
          />
          {form.endMode === 'date' && (
            <DateField
              label="End date"
              value={form.endDate}
              onChange={(d) => set('endDate', d)}
              error={errors.endDate}
              hint="The last date it can happen on."
              testID="recurring-end-date"
            />
          )}
          {form.endMode === 'count' && (
            <TextField
              label="Number of payments"
              value={form.count}
              onChangeText={(t) => set('count', t)}
              keyboardType="number-pad"
              error={errors.count}
              testID="recurring-count"
            />
          )}
        </Card>

        <Card style={styles.group}>
          <TextField label="Note (optional)" value={form.note} onChangeText={(t) => set('note', t)} multiline testID="recurring-note" />
        </Card>

        <Button label={item ? 'Save changes' : `Add ${noun}`} onPress={onSave} disabled={saving} testID="recurring-save-bottom" />
        {item && <Button label="Delete" variant="destructive" onPress={onDelete} testID="recurring-delete" />}

        {item && <Upcoming item={item} overrides={input.overrides.filter((o) => o.recurringId === item.id)} currency={currency} />}
      </Screen>
    </KeyboardAvoidingView>
  );
}

interface Row {
  originalDate: string;
  date: string;
  amount: Fils;
  paid: boolean;
  skipped: boolean;
  override?: OccurrenceOverride;
}

function Upcoming({ item, overrides, currency }: { item: RecurringItem; overrides: OccurrenceOverride[]; currency: string }) {
  const c = useTheme();
  const upsert = useRepoMutation((r, o: OccurrenceOverride) => r.upsertOverride(o));
  const del = useRepoMutation((r, id: string) => r.deleteOverride(id));
  const [editing, setEditing] = useState<{
    key: string;
    mode: 'amount' | 'date';
  } | null>(null);
  const [draftAmount, setDraftAmount] = useState<Fils | null>(null);
  const [draftDate, setDraftDate] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    const now = today();
    const recent = addMonths(now, -1);
    // Expand with skips switched off so skipped occurrences can be shown with an Undo.
    const open = overrides.map((o) => ({ ...o, skip: false }));
    const all = expandRecurring(item, open, addMonths(now, -3), addMonths(now, 12 * 8));
    const out: Row[] = [];
    let live = 0;
    for (const o of all) {
      const ov = overrides.find((x) => x.originalDate === o.originalDate);
      const skipped = !!ov?.skip;
      const past = compareDates(o.date, now) < 0;
      // Past payments only show when changed, or when they are recent and still unpaid.
      if (past && !ov && (o.paid || compareDates(o.date, recent) < 0)) continue;
      if (!past) {
        if (live >= 6) break;
        if (!skipped) live++;
      }
      out.push({
        originalDate: o.originalDate,
        date: o.date,
        amount: o.amount,
        paid: o.paid,
        skipped,
        override: ov,
      });
    }
    return out;
  }, [item, overrides]);

  const apply = async (row: Row, patch: OverridePatch): Promise<boolean> => {
    const action = applyOverridePatch(
      row.override,
      {
        recurringId: item.id,
        originalDate: row.originalDate,
        baseAmount: item.amount,
      },
      patch,
      newId,
    );
    try {
      if (action.type === 'upsert') await upsert(action.override);
      else if (action.type === 'delete') await del(action.id);
      return true;
    } catch {
      Alert.alert("Couldn't save", 'The change was not saved. Please try again.');
      return false;
    }
  };

  return (
    <View style={styles.upcoming}>
      <SectionHeader title="Upcoming" />
      <T variant="caption" tone="secondary">
        Changes here affect one payment only. {describeSchedule(item.schedule, item.startDate)}.
      </T>
      {rows.length === 0 ? (
        <Card>
          <T tone="secondary" testID="upcoming-empty">
            No upcoming payments. This item has ended or starts later.
          </T>
        </Card>
      ) : (
        rows.map((row, i) => {
          const key = row.originalDate;
          const moved = row.date !== row.originalDate;
          const changedAmount = row.amount !== item.amount;
          return (
            <Card key={key} testID={`occurrence-${i}`}>
              <View style={styles.occHeader}>
                <View style={styles.flex}>
                  <T style={row.skipped && styles.struck}>{formatDate(row.date)}</T>
                  <T variant="caption" tone="secondary">
                    {row.skipped ? 'Skipped' : row.paid ? 'Paid' : compareDates(row.date, today()) < 0 ? 'Overdue' : 'Planned'}
                    {moved ? ` · moved from ${formatDate(row.originalDate)}` : ''}
                    {changedAmount && !row.skipped ? ' · amount changed' : ''}
                  </T>
                </View>
                <T variant="number" style={row.skipped && styles.struck} tone={row.skipped ? 'secondary' : 'default'}>
                  {formatMoney(row.amount, currency)}
                </T>
              </View>
              {row.skipped ? (
                <Button
                  label="Undo skip"
                  variant="secondary"
                  onPress={() => apply(row, { skip: false })}
                  testID={`occurrence-unskip-${i}`}
                  accessibilityHint={`Restores the payment on ${formatDate(row.date)}`}
                />
              ) : (
                <View style={styles.actions}>
                  <SmallAction label="Skip" onPress={() => apply(row, { skip: true })} testID={`occurrence-skip-${i}`} />
                  <SmallAction label={row.paid ? 'Mark unpaid' : 'Mark paid'} onPress={() => apply(row, { paid: !row.paid })} testID={`occurrence-paid-${i}`} />
                  <SmallAction
                    label="Change amount"
                    onPress={() => {
                      setDraftAmount(row.amount);
                      setEditing(editing?.key === key && editing.mode === 'amount' ? null : { key, mode: 'amount' });
                    }}
                    testID={`occurrence-amount-${i}`}
                  />
                  <SmallAction
                    label="Move date"
                    onPress={() => {
                      setDraftDate(row.date);
                      setEditing(editing?.key === key && editing.mode === 'date' ? null : { key, mode: 'date' });
                    }}
                    testID={`occurrence-move-${i}`}
                  />
                </View>
              )}
              {editing?.key === key && editing.mode === 'amount' && !row.skipped && (
                <View style={[styles.editBox, { borderTopColor: c.border }]}>
                  <MoneyField label="Amount for this payment" value={row.amount} onChange={setDraftAmount} currency={currency} testID={`occurrence-amount-input-${i}`} />
                  <View style={styles.actions}>
                    <Button
                      label="Apply"
                      disabled={draftAmount == null || draftAmount <= 0}
                      onPress={async () => {
                        if (await apply(row, { newAmount: draftAmount })) setEditing(null);
                      }}
                      testID={`occurrence-amount-apply-${i}`}
                    />
                    <Button label="Cancel" variant="plain" onPress={() => setEditing(null)} testID={`occurrence-amount-cancel-${i}`} />
                  </View>
                </View>
              )}
              {editing?.key === key && editing.mode === 'date' && !row.skipped && (
                <View style={[styles.editBox, { borderTopColor: c.border }]}>
                  <DateField label="Date for this payment" value={draftDate ?? row.date} onChange={setDraftDate} testID={`occurrence-date-input-${i}`} />
                  <View style={styles.actions}>
                    <Button
                      label="Apply"
                      onPress={async () => {
                        if (await apply(row, { newDate: draftDate ?? row.date })) setEditing(null);
                      }}
                      testID={`occurrence-date-apply-${i}`}
                    />
                    <Button label="Cancel" variant="plain" onPress={() => setEditing(null)} testID={`occurrence-date-cancel-${i}`} />
                  </View>
                </View>
              )}
            </Card>
          );
        })
      )}
    </View>
  );
}

function SmallAction({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        styles.small,
        {
          borderColor: c.border,
          backgroundColor: pressed ? c.backgroundSelected : 'transparent',
        },
      ]}
    >
      <T variant="label" tone="accent">
        {label}
      </T>
    </Pressable>
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
  upcoming: { gap: Spacing.two, marginTop: Spacing.three },
  occHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    alignItems: 'center',
  },
  small: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  struck: { textDecorationLine: 'line-through' },
});
