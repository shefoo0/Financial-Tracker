// /import/columns: choose which column of a CSV / Excel file holds what, when the guess found nothing or looked wrong.
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Screen, ScreenHeader, Segmented, SelectField, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parseTable, type CsvMapping, type DateOrder } from '@/import/parse';
import { usePro } from '@/lib/pro';

import { usable } from './mapping';
import { ImportProLocked } from './ProLocked';
import { setResult, useSession } from './session';

const NONE = 'none';
const PREVIEW_ROWS = 6;

function columnLabel(rows: string[][], headerRow: number, col: number): string {
  const head = headerRow >= 0 ? rows[headerRow]?.[col] : '';
  const sample = rows.find((r, i) => i !== headerRow && r[col])?.[col] ?? '';
  const name = head || sample;
  return `Column ${col + 1}${name ? `: ${name.length > 22 ? `${name.slice(0, 21)}…` : name}` : ''}`;
}

export default function ColumnsScreen() {
  const { isPro } = usePro();
  const session = useSession();
  if (!isPro) return <ImportProLocked />;
  if (!session.table || !session.mapping) {
    return (
      <Screen testID="columns-screen">
        <EmptyState title="No file open" message="Choose a spreadsheet or CSV file first." action={<Button label="Start an import" onPress={() => router.replace('/import')} testID="columns-start" />} />
      </Screen>
    );
  }
  return <ColumnsForm key={session.token} />;
}

function ColumnsForm() {
  const c = useTheme();
  const session = useSession();
  const table = session.table!;
  const rows = table.rows;
  const [map, setMap] = useState<CsvMapping>(session.mapping!);
  const [split, setSplit] = useState<'one' | 'two'>(session.mapping!.amount === null && (session.mapping!.debit !== null || session.mapping!.credit !== null) ? 'two' : 'one');
  const [error, setError] = useState<string | null>(null);

  const width = Math.max(1, ...rows.slice(0, 40).map((r) => r.length));
  const options = [{ value: NONE, label: 'Not in this file' }, ...Array.from({ length: width }, (_, i) => ({ value: String(i), label: columnLabel(rows, map.headerRow, i) }))];
  const val = (n: number | null) => (n === null ? NONE : String(n));
  const set = (key: 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'balance') => (v: string) => {
    setError(null);
    setMap((m) => ({ ...m, [key]: v === NONE ? null : Number(v) }));
  };

  const apply = () => {
    const use: CsvMapping = split === 'one' ? { ...map, debit: null, credit: null } : { ...map, amount: null };
    if (!usable(use)) {
      setError(split === 'one' ? 'Choose the date and amount columns.' : 'Choose the date column and the debit or credit column.');
      return;
    }
    const result = parseTable(rows, use, ', ');
    if (result.rows.length === 0) {
      setError(result.problems[0] ?? 'No rows could be read with these columns. Check the date and amount columns.');
      return;
    }
    setResult({ result, mapping: { ...use, sheet: table.sheet }, message: null });
    router.replace('/import/review');
  };

  return (
    <Screen testID="columns-screen">
      <ScreenHeader title="Match the columns" subtitle={session.sourceName} />
      {session.message ? (
        <Card>
          <T tone="warning" testID="columns-message">
            {session.message}
          </T>
        </Card>
      ) : null}
      <T tone="secondary">Choose which column holds the date, the description and the amount. Your choice is remembered for files with this name.</T>
      <Card testID="columns-preview">
        <T variant="label">First rows of the file</T>
        <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Preview of the file, scrolls sideways">
          <View>
            {rows.slice(0, PREVIEW_ROWS).map((r, ri) => (
              <View key={ri} style={[styles.previewRow, { borderBottomColor: c.border }]}>
                {Array.from({ length: width }, (_, ci) => (
                  <T key={ci} variant="caption" numberOfLines={1} style={styles.cell} tone={ri === map.headerRow ? 'accent' : 'default'}>
                    {r[ci] ?? ''}
                  </T>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </Card>
      <Segmented
        label="The first row has headings"
        value={map.headerRow >= 0 ? 'yes' : 'no'}
        options={[{ value: 'yes', label: 'Has headings' }, { value: 'no', label: 'No headings' }]}
        onChange={(v) => setMap((m) => ({ ...m, headerRow: v === 'yes' ? 0 : -1 }))}
        testID="columns-header"
      />
      <SelectField label="Date" value={val(map.date)} options={options} onChange={set('date')} testID="columns-date" />
      <Segmented
        label="Date order"
        value={map.dateOrder}
        options={[{ value: 'dmy', label: 'Day first (31/12)' }, { value: 'mdy', label: 'Month first (12/31)' }]}
        onChange={(v) => setMap((m) => ({ ...m, dateOrder: v as DateOrder }))}
        testID="columns-date-order"
      />
      <SelectField label="Description" value={val(map.description)} options={options} onChange={set('description')} testID="columns-description" />
      <Segmented
        label="Amounts"
        value={split}
        options={[{ value: 'one', label: 'One amount column' }, { value: 'two', label: 'Debit and credit' }]}
        onChange={setSplit}
        testID="columns-amount-mode"
      />
      {split === 'one' ? (
        <SelectField label="Amount" value={val(map.amount)} options={options} onChange={set('amount')} testID="columns-amount" />
      ) : (
        <>
          <SelectField label="Debit (money out)" value={val(map.debit)} options={options} onChange={set('debit')} testID="columns-debit" />
          <SelectField label="Credit (money in)" value={val(map.credit)} options={options} onChange={set('credit')} testID="columns-credit" />
        </>
      )}
      <SelectField label="Balance (optional)" value={val(map.balance)} options={options} onChange={set('balance')} testID="columns-balance" />
      {error ? (
        <T tone="negative" accessibilityRole="alert" testID="columns-error">
          {error}
        </T>
      ) : null}
      <Button label="Show the rows" onPress={apply} testID="columns-apply" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  previewRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.one },
  cell: { width: 110, paddingHorizontal: Spacing.one, borderRadius: Radius.sm },
});
