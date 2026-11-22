// "Add a series": N cheques, every M months, saved together with a shared seriesId.
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, DateField, MoneyField, SectionHeader, T, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useRepoMutation } from '@/data/DataProvider';
import { useDiscardGuard } from '@/features/items/useDiscardGuard';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { Cheque } from '@/types';

import { MAX_SERIES_COUNT, MAX_SERIES_EVERY, parseWhole, seriesDates, validateSeries, type SeriesField, type SeriesForm } from './logic';

export function SeriesEditor({ currency, today }: { currency: string; today: string }) {
  const [initial] = useState<SeriesForm>(() => ({ payee: '', amount: null, purpose: '', count: '12', every: '1', firstDate: today }));
  const [form, setForm] = useState<SeriesForm>(initial);
  const [errors, setErrors] = useState<Partial<Record<SeriesField, string>>>({});
  const [saving, setSaving] = useState(false);
  const guard = useDiscardGuard(JSON.stringify(form) !== JSON.stringify(initial));
  const save = useRepoMutation((r, list: Cheque[]) => r.upsertCheques(list));
  const set = <K extends keyof SeriesForm>(k: K, v: SeriesForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const count = parseWhole(form.count, 1, MAX_SERIES_COUNT);
  const every = parseWhole(form.every, 1, MAX_SERIES_EVERY);
  const preview = count != null && every != null ? seriesDates(form.firstDate, count, every) : [];

  const onSave = async () => {
    if (saving) return;
    const result = validateSeries(form);
    setErrors(result.errors);
    if (!result.cheques) return;
    setSaving(true);
    guard.begin();
    try {
      await save(result.cheques);
      await guard.leave();
    } catch {
      setSaving(false);
      guard.cancel();
      Alert.alert("Couldn't save", 'Your cheques were not saved. Please try again.');
    }
  };

  return (
    <>
      <Card style={{ gap: Spacing.three }}>
        <TextField label="Payee" value={form.payee} onChangeText={(t) => set('payee', t)} placeholder="e.g. Landlord" error={errors.payee} testID="series-payee" />
        <MoneyField label="Amount of each cheque" value={form.amount} onChange={(v) => set('amount', v)} currency={currency} error={errors.amount} testID="series-amount" />
        <TextField label="Purpose (optional)" value={form.purpose} onChangeText={(t) => set('purpose', t)} placeholder="e.g. Rent" testID="series-purpose" />
      </Card>
      <Card style={{ gap: Spacing.three }}>
        <TextField
          label="Number of cheques"
          value={form.count}
          onChangeText={(t) => set('count', t)}
          keyboardType="number-pad"
          hint={`1 to ${MAX_SERIES_COUNT}`}
          error={errors.count}
          testID="series-count"
        />
        <TextField
          label="Every how many months"
          value={form.every}
          onChangeText={(t) => set('every', t)}
          keyboardType="number-pad"
          hint={`1 to ${MAX_SERIES_EVERY}. Dates on the 29th to 31st move to the end of shorter months.`}
          error={errors.every}
          testID="series-every"
        />
        <DateField label="Date of the first cheque" value={form.firstDate} onChange={(d) => set('firstDate', d)} error={errors.firstDate} testID="series-date" />
      </Card>
      <SectionHeader title="Preview" />
      {preview.length === 0 ? (
        <T tone="secondary">Enter the number of cheques and the months between them to see the dates.</T>
      ) : (
        <Card testID="series-preview">
          {preview.map((d, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two }} accessible accessibilityLabel={`Cheque ${i + 1}: ${formatDate(d)}${form.amount ? `, ${formatMoney(form.amount, currency)}` : ''}`}>
              <T tone="secondary">{i + 1}</T>
              <T style={{ flex: 1 }} testID={`series-preview-${i}`}>
                {formatDate(d)}
              </T>
              {form.amount ? <T variant="number">{formatMoney(form.amount, currency)}</T> : null}
            </View>
          ))}
        </Card>
      )}
      <Button label={count ? `Save ${count} cheque${count === 1 ? '' : 's'}` : 'Save cheques'} onPress={onSave} disabled={saving} testID="series-save" />
    </>
  );
}
