// The log of payments that really happened: add regular, extra or partial payments, delete them.
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, DateField, MoneyField, SectionHeader, Segmented, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useRepoMutation } from '@/data/DataProvider';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, today } from '@/lib/dates';
import { newId } from '@/lib/id';
import { formatMoney } from '@/lib/money';
import type { DebtPayment } from '@/types';
import { PAYMENT_KIND_LABEL } from './helpers';

export function PaymentLog({ debtId, payments, currency }: { debtId: string; payments: DebtPayment[]; currency: string }) {
  const c = useTheme();
  const add = useRepoMutation((r, p: DebtPayment) => r.upsertDebtPayment(p));
  const remove = useRepoMutation((r, id: string) => r.deleteDebtPayment(id));
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DebtPayment['kind']>('regular');
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(() => today());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // MoneyField keeps its own text, so a new key clears it after saving.
  const [fieldKey, setFieldKey] = useState(0);
  const list = [...payments].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const save = async () => {
    if (saving) return;
    if (amount == null || amount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await add({ id: newId(), debtId, date, amount, kind, note: '' });
      setOpen(false);
      setAmount(null);
      setKind('regular');
      setFieldKey((k) => k + 1);
    } catch {
      Alert.alert("Couldn't save", 'The payment was not saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (p: DebtPayment) => {
    Alert.alert('Delete this payment?', `The ${formatMoney(p.amount, currency)} payment on ${formatDate(p.date)} will be removed from the log.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove(p.id);
          } catch {
            Alert.alert("Couldn't delete", 'Please try again.');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <SectionHeader title="Payment log" />
      <Card testID="debt-log">
        <T variant="caption" tone="secondary">
          Record payments that really happened. A regular payment replaces that month’s scheduled one; extra and partial payments reduce what is left.
        </T>
        {list.length === 0 ? (
          <T tone="secondary" testID="debt-log-empty">
            No payments logged yet.
          </T>
        ) : (
          list.map((p, i) => (
            <View key={p.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]} testID={`debt-log-item-${i}`}>
              <View style={{ flex: 1 }} accessible accessibilityLabel={`${PAYMENT_KIND_LABEL[p.kind]} payment, ${formatMoney(p.amount, currency)}, ${formatDate(p.date)}`}>
                <T variant="number">{formatMoney(p.amount, currency)}</T>
                <T variant="caption" tone="secondary">
                  {PAYMENT_KIND_LABEL[p.kind]} · {formatDate(p.date)}
                </T>
              </View>
              <Pressable onPress={() => confirmDelete(p)} accessibilityRole="button" accessibilityLabel={`Delete payment of ${formatMoney(p.amount, currency)} on ${formatDate(p.date)}`} testID={`debt-log-delete-${i}`} style={styles.del}>
                <T variant="label" tone="negative">
                  Delete
                </T>
              </Pressable>
            </View>
          ))
        )}
        {open ? (
          <View style={styles.form}>
            <Segmented
              label="Payment type"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'regular', label: 'Regular' },
                { value: 'extra', label: 'Extra' },
                { value: 'partial', label: 'Partial' },
              ]}
              testID="debt-payment-kind"
            />
            <MoneyField key={fieldKey} label="Amount paid" value={amount} onChange={setAmount} currency={currency} error={error} testID="debt-payment-amount" />
            <DateField label="Date paid" value={date} onChange={setDate} testID="debt-payment-date" />
            <Button label="Save payment" onPress={save} disabled={saving} testID="debt-payment-save" />
            <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} testID="debt-payment-cancel" />
          </View>
        ) : (
          <Button label="Log a payment" variant="secondary" onPress={() => setOpen(true)} testID="debt-log-payment" />
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, minHeight: 52 },
  del: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two },
  form: { gap: Spacing.three },
});
