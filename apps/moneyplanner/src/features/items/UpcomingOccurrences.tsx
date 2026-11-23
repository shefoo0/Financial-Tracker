// "Upcoming" on the recurring item screen: the next payments, each with Skip, Paid, Change amount and Move date.
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, DateField, MoneyField, SectionHeader, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useRepoMutation } from '@/data/DataProvider';
import { expandRecurring } from '@/engine';
import { applyOverridePatch, type OverridePatch } from '@/features/items/overrides';
import { describeSchedule } from '@/features/items/schedule';
import { useTheme } from '@/hooks/use-theme';
import { addMonths, compareDates, formatDate, today } from '@/lib/dates';
import { newId } from '@/lib/id';
import { formatMoney } from '@/lib/money';
import type { Fils, OccurrenceOverride, RecurringItem } from '@/types';

interface Row {
  originalDate: string;
  date: string;
  amount: Fils;
  paid: boolean;
  skipped: boolean;
  override?: OccurrenceOverride;
}

export function UpcomingOccurrences({ item, overrides, currency }: { item: RecurringItem; overrides: OccurrenceOverride[]; currency: string }) {
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
