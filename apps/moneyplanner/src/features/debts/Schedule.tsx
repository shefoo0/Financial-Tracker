// The next payments of a debt, each of which can be moved, changed or skipped.
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, DateField, MoneyField, SectionHeader, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useRepoMutation } from '@/data/DataProvider';
import { debtSchedule, planInstalments } from '@/engine';
import { useTheme } from '@/hooks/use-theme';
import { addMonths, formatDate } from '@/lib/dates';
import { newId } from '@/lib/id';
import { formatMoney } from '@/lib/money';
import type { Debt, DebtOverride, Fils, ISODate, PlanInput } from '@/types';
import { applyDebtOverridePatch, type DebtOverridePatch } from './overrides';

interface Row {
  originalDate: ISODate;
  date: ISODate;
  amount: Fils;
  label: string;
  skipped: boolean;
  override?: DebtOverride;
}

export function Schedule({ debt, input, now, currency, cardName }: { debt: Debt; input: PlanInput; now: ISODate; currency: string; cardName?: string | null }) {
  const c = useTheme();
  const upsert = useRepoMutation((r, o: DebtOverride) => r.upsertDebtOverride(o));
  const del = useRepoMutation((r, id: string) => r.deleteDebtOverride(id));
  const [editing, setEditing] = useState<{ key: string; mode: 'amount' | 'date' } | null>(null);
  const [draftAmount, setDraftAmount] = useState<Fils | null>(null);
  const [draftDate, setDraftDate] = useState<ISODate | null>(null);
  // A plan on a card is paid as part of that card: its instalments are shown, not edited here.
  const onCard = debt.type === 'plan' && debt.cardId != null;
  const editable = debt.type === 'loan' || (debt.type === 'plan' && !onCard);
  const mine = useMemo(() => input.debtOverrides.filter((o) => o.debtId === debt.id), [input.debtOverrides, debt.id]);

  const rows = useMemo<Row[]>(() => {
    // Skips are switched off so a skipped payment can be shown with an Undo.
    const open: PlanInput = { ...input, debtOverrides: input.debtOverrides.map((o) => (o.debtId === debt.id ? { ...o, skip: false } : o)) };
    const all =
      debt.type === 'plan' && debt.cardId != null
        ? planInstalments(debt, open).payments.filter((p) => p.date >= now)
        : debtSchedule(debt, open, now, addMonths(now, 12 * 10));
    const out: Row[] = [];
    let live = 0;
    for (const p of all) {
      if (p.debtId !== debt.id) continue;
      const ov = mine.find((o) => o.originalDate === p.originalDate);
      const skipped = !!ov?.skip;
      if (live >= 6) break;
      if (!skipped) live++;
      out.push({ originalDate: p.originalDate, date: p.date, amount: p.amount, label: p.label, skipped, override: ov });
    }
    return out;
  }, [debt, input, mine, now]);

  const apply = async (row: Row, patch: DebtOverridePatch): Promise<boolean> => {
    const action = applyDebtOverridePatch(row.override, { debtId: debt.id, originalDate: row.originalDate }, patch, newId);
    try {
      if (action.type === 'upsert') await upsert(action.override);
      else if (action.type === 'delete') await del(action.id);
      return true;
    } catch {
      Alert.alert("Couldn't save", 'The change was not saved. Please try again.');
      return false;
    }
  };

  const startEdit = (row: Row, mode: 'amount' | 'date') => {
    setDraftAmount(row.amount);
    setDraftDate(row.date);
    setEditing({ key: row.originalDate, mode });
  };

  return (
    <View style={styles.wrap}>
      <SectionHeader title="Next payments" />
      <Card testID="debt-schedule">
        {rows.length === 0 ? (
          <T tone="secondary">No payments are scheduled.</T>
        ) : (
          rows.map((row, i) => {
            const isEditing = editing?.key === row.originalDate;
            const changed = !!row.override && (row.override.newDate != null || row.override.newAmount != null);
            const desc = `${formatDate(row.date)}, ${formatMoney(row.amount, currency)}${row.skipped ? ', skipped' : ''}${changed ? ', changed' : ''}`;
            return (
              <View key={row.originalDate} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]} testID={`debt-payment-${i}`}>
                <View style={styles.line} accessible accessibilityLabel={desc}>
                  <View style={{ flex: 1 }}>
                    <T style={row.skipped ? styles.struck : undefined}>{formatDate(row.date)}</T>
                    <T variant="caption" tone="secondary">
                      {row.skipped ? 'Skipped' : changed ? `Changed (was ${formatDate(row.originalDate)})` : row.label}
                    </T>
                  </View>
                  <T variant="number" style={row.skipped ? styles.struck : undefined}>
                    {formatMoney(row.amount, currency)}
                  </T>
                </View>
                {editable && !isEditing ? (
                  <View style={styles.actions}>
                    {row.skipped ? (
                      <SmallButton label="Undo skip" onPress={() => apply(row, { skip: false })} testID={`debt-payment-${i}-undo`} />
                    ) : (
                      <>
                        <SmallButton label="Change amount" onPress={() => startEdit(row, 'amount')} testID={`debt-payment-${i}-amount`} />
                        <SmallButton label="Move" onPress={() => startEdit(row, 'date')} testID={`debt-payment-${i}-move`} />
                        <SmallButton label="Skip" onPress={() => apply(row, { skip: true })} testID={`debt-payment-${i}-skip`} />
                      </>
                    )}
                    {changed && !row.skipped ? (
                      <SmallButton label="Reset" onPress={() => apply(row, { newDate: null, newAmount: null, skip: false })} testID={`debt-payment-${i}-reset`} />
                    ) : null}
                  </View>
                ) : null}
                {isEditing ? (
                  <View style={[styles.editBox, { borderTopColor: c.border }]}>
                    {editing?.mode === 'amount' ? (
                      <MoneyField label="Amount for this payment" value={draftAmount} onChange={setDraftAmount} currency={currency} testID="debt-override-amount" />
                    ) : (
                      <DateField label="Move this payment to" value={draftDate} onChange={setDraftDate} testID="debt-override-date" />
                    )}
                    <View style={styles.actions}>
                      <Button
                        label="Save"
                        testID="debt-override-save"
                        onPress={async () => {
                          let patch: DebtOverridePatch;
                          if (editing?.mode === 'amount') {
                            if (draftAmount == null || draftAmount <= 0) {
                              Alert.alert('Enter an amount', 'The amount must be greater than zero.');
                              return;
                            }
                            patch = { newAmount: draftAmount };
                          } else {
                            if (!draftDate) return;
                            patch = { newDate: draftDate };
                          }
                          if (await apply(row, patch)) setEditing(null);
                        }}
                      />
                      <Button label="Cancel" variant="secondary" onPress={() => setEditing(null)} testID="debt-override-cancel" />
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
        {onCard ? (
          <T variant="caption" tone="secondary" testID="debt-schedule-card-note">
            Paid as part of {cardName ?? 'its card'}. Change the payment on the card’s due date by logging what you paid.
          </T>
        ) : !editable ? (
          <T variant="caption" tone="secondary">
            Card payments follow the repayment plan above. To record what you really paid, add it to the payment log.
          </T>
        ) : null}
      </Card>
    </View>
  );
}

function SmallButton({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} style={[styles.small, { borderColor: c.border }]}>
      <T variant="label" tone="accent">
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  row: { paddingVertical: Spacing.two, gap: Spacing.two },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  small: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, alignItems: 'center', justifyContent: 'center' },
  editBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, gap: Spacing.two },
  struck: { textDecorationLine: 'line-through' },
});
