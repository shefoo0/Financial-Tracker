import { Platform, StyleSheet } from 'react-native';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import { defaultSettings } from '@/data/defaults';
import type { ParsedRow } from '@/import/parse';
import type { Transaction } from '@/types';

import { resetRouterMock, router } from '../../../../test-support/expo-router-mock';
import { renderWithRepo } from '../../../../test-support/render';
import { groupByDate, summarise, buildReviewRows } from '../review';
import ReviewScreen from '../ReviewScreen';
import { resetSession, setResult } from '../session';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));
jest.mock('@/lib/pro', () => ({ usePro: () => ({ isPro: true, loading: false }), isProPreviewBuild: () => true }));

const settings = { ...defaultSettings(), onboarded: true };
const row = (o: Partial<ParsedRow>): ParsedRow => ({ date: '2026-11-20', description: 'X', amount: 1000, kind: 'cost', raw: '', confidence: 1, warnings: [], ...o });
const saved = (o: Partial<Transaction>): Transaction => ({
  id: 'old', kind: 'cost', date: '2026-11-19', description: 'Lulu Hypermarket', categoryId: null, amount: 12000, note: '', source: 'manual', importId: null, planned: false, ...o,
});
const ROWS: ParsedRow[] = [
  row({ date: '2026-11-20', description: 'CAREEM RIDE 1', amount: 4500 }),
  row({ date: '2026-11-21', description: 'CAREEM RIDE 2', amount: 3000 }),
  row({ date: '2026-11-21', description: 'SALARY ACME TRADING', amount: 1800000, kind: 'income' }),
  row({ date: '2026-11-22', description: 'Mystery 99', amount: 1000, confidence: 0.4, warnings: ['The file does not say whether this is money in or out; assumed spending.'] }),
  row({ date: '2026-11-19', description: 'LULU HYPERMARKET', amount: 12000 }),
];

const open = (rows = ROWS, extra: Parameters<typeof setResult>[0] = {}) =>
  setResult({ result: { rows, source: 'csv', problems: [] }, sourceName: 'ENBD.csv', fileKind: 'csv', ...extra });
const summary = () => screen.getByTestId('review-summary').props.children;
const label = (id: string) => screen.getByTestId(id).props.accessibilityLabel as string;
const checked = (i: number) => screen.getByTestId(`review-toggle-${i}`).props.accessibilityState.checked as boolean;

beforeEach(() => {
  resetRouterMock();
  resetSession();
});

describe('review logic', () => {
  it('groups by day, newest first, and totals only the ticked rows', () => {
    const rows = buildReviewRows(ROWS, [saved({})], [], []);
    expect(groupByDate(rows).map((g) => [g.date, g.rows.length])).toEqual([['2026-11-22', 1], ['2026-11-21', 2], ['2026-11-20', 1], ['2026-11-19', 1]]);
    expect(summarise(rows)).toEqual({ count: 4, spending: 8500, income: 1800000 });
  });
});

describe('Review screen', () => {
  it('lists rows by day, unticks a duplicate, flags the doubtful row with its reason and totals the rest', async () => {
    open();
    await renderWithRepo(<ReviewScreen />, { settings, transactions: [saved({})] });
    expect(await screen.findByTestId('review-row-0')).toBeTruthy();
    expect(checked(4)).toBe(false);
    for (const i of [0, 1, 2, 3]) expect(checked(i)).toBe(true);
    expect(within(screen.getByTestId('review-row-4')).getByText('Duplicate?')).toBeTruthy();
    expect(within(screen.getByTestId('review-row-3')).getByText('Check this')).toBeTruthy();
    expect(screen.getByTestId('review-reason-3').props.children).toMatch(/does not say whether/);
    expect(summary()).toBe('Import 4 items · AED 85 spending · AED 18,000 income');
    // The category suggestion is on the row (built-in words), and the rows are tickable.
    expect(label('review-category-2')).toContain('Salary');
    await fireEvent.press(screen.getByTestId('review-toggle-4'));
    expect(checked(4)).toBe(true);
    expect(summary()).toBe('Import 5 items · AED 205 spending · AED 18,000 income');
    // Everything is ticked now, so "Untick all" clears it and "Select all" brings it back.
    await fireEvent.press(screen.getByTestId('review-select-all'));
    expect(summary()).toBe('Import 0 items · AED 0 spending · AED 0 income');
    expect(screen.getByTestId('review-import').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('review-select-all'));
    expect(summary()).toBe('Import 5 items · AED 205 spending · AED 18,000 income');
  });

  it('flips a doubtful row from spending to income with one tap, and the warning goes away', async () => {
    open();
    await renderWithRepo(<ReviewScreen />, { settings });
    expect(await screen.findByTestId('review-flip-3')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('review-flip-3'));
    expect(screen.getByTestId('review-amount-3').props.children).toBe('+AED 10.00');
    expect(summary()).toBe('Import 5 items · AED 195 spending · AED 18,010 income');
    expect(screen.queryByTestId('review-reason-3')).toBeNull();
  });

  it('changes the date of a row (typed date field, as on the web)', async () => {
    const os = Platform.OS;
    Platform.OS = 'web';
    try {
      open();
      await renderWithRepo(<ReviewScreen />, { settings });
      await fireEvent.press(await screen.findByTestId('review-date-3'));
      await fireEvent.changeText(screen.getByTestId('review-date-field-3'), '2026-11-18');
      expect(label('review-open-3')).toContain('18 Nov');
      expect(screen.queryByTestId('review-reason-3')).toBeNull();
    } finally {
      Platform.OS = os;
    }
  });

  it('applies a category to all similar rows (same merchant, not the others)', async () => {
    open();
    await renderWithRepo(<ReviewScreen />, { settings });
    await fireEvent.press(await screen.findByTestId('review-category-0'));
    await fireEvent.press(screen.getByTestId('review-category-option-dining'));
    await fireEvent.press(screen.getByTestId('rule-confirm-no'));
    expect(label('review-category-0')).toContain('Dining');
    expect(label('review-category-1')).not.toContain('Dining');
    await fireEvent.press(screen.getByTestId('review-open-0'));
    await fireEvent.press(screen.getByTestId('review-similar-0'));
    expect(label('review-category-1')).toContain('Dining');
    expect(label('review-category-2')).toContain('Salary');
  });

  it('learns a rule after "Always put CAREEM RIDE in ...?", applies it to similar rows, and uses it on the next import', async () => {
    open();
    const first = await renderWithRepo(<ReviewScreen />, { settings });
    await fireEvent.press(await screen.findByTestId('review-category-0'));
    await fireEvent.press(screen.getByTestId('review-category-option-entertainment'));
    expect(screen.getByTestId('rule-confirm-text').props.children).toBe('Always put CAREEM RIDE in Entertainment & Travel?');
    await fireEvent.press(screen.getByTestId('rule-confirm-yes'));
    expect(label('review-category-1')).toContain('Entertainment');
    await waitFor(async () => expect(await first.repo.listCategoryRules()).toMatchObject([{ pattern: 'CAREEM RIDE', categoryId: 'entertainment' }]));
    // Asking again for the same merchant replaces the rule instead of adding another.
    await fireEvent.press(screen.getByTestId('review-category-1'));
    await fireEvent.press(screen.getByTestId('review-category-option-shopping'));
    await fireEvent.press(screen.getByTestId('rule-confirm-yes'));
    await waitFor(async () => expect(await first.repo.listCategoryRules()).toMatchObject([{ pattern: 'CAREEM RIDE', categoryId: 'shopping' }]));
    const rules = await first.repo.listCategoryRules();
    await first.unmount();

    // The next statement: the learned rule is read from storage and used for the suggestion.
    open([row({ description: 'CAREEM RIDE 77 DUBAI', amount: 2500 })]);
    await renderWithRepo(<ReviewScreen />, { settings, categoryRules: rules });
    expect(await screen.findByTestId('review-row-0')).toBeTruthy();
    expect(label('review-category-0')).toContain('Shopping');
  });

  it('imports the ticked rows as real items marked as imported, records the import and the template, then goes to Month', async () => {
    const mapping = { delimiter: ',', headerRow: 0, date: 0, description: 1, debit: null, credit: null, amount: 2, balance: null, direction: null, dateOrder: 'dmy' as const };
    open(ROWS, { mapping, table: { rows: [['d']], delimiter: ',' } });
    const { repo } = await renderWithRepo(<ReviewScreen />, { settings, transactions: [saved({})] });
    expect(await screen.findByTestId('review-fix-columns')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('review-import'));
    expect(await screen.findByTestId('import-done')).toBeTruthy();
    const all = await repo.listTransactions();
    const imported = all.filter((t) => t.source === 'import');
    expect(imported).toHaveLength(4);
    expect(all).toHaveLength(5);
    const [record] = await repo.listImports();
    expect(record).toMatchObject({ sourceName: 'ENBD.csv', fileKind: 'csv', rowCount: 4 });
    for (const t of imported) expect(t).toMatchObject({ importId: record.id, planned: false, note: '' });
    expect(imported.find((t) => t.description === 'SALARY ACME TRADING')).toMatchObject({ kind: 'income', amount: 1800000, categoryId: 'salary' });
    expect(imported.some((t) => t.description === 'LULU HYPERMARKET')).toBe(false);
    expect((await repo.getImportTemplate('ENBD.csv'))?.mapping).toMatchObject({ amount: 2, dateOrder: 'dmy' });
    await fireEvent.press(screen.getByTestId('review-done'));
    expect(router.navigate).toHaveBeenCalledWith('/month');
  });

  it('shows what to do when there is nothing to review', async () => {
    await renderWithRepo(<ReviewScreen />, { settings });
    await fireEvent.press(await screen.findByTestId('review-start'));
    expect(router.replace).toHaveBeenCalledWith('/import');
  });

  it('keeps the review and shows a message when saving fails', async () => {
    open();
    const { repo } = await renderWithRepo(<ReviewScreen />, { settings });
    await screen.findByTestId('review-row-0');
    jest.spyOn(repo, 'saveImportBatch').mockRejectedValueOnce(new Error('disk full'));
    await fireEvent.press(screen.getByTestId('review-import'));
    expect(await screen.findByTestId('review-error')).toBeTruthy();
    expect(await repo.listImports()).toEqual([]);
    await act(async () => {});
    expect(screen.getByTestId('review-import').props.accessibilityState.disabled).toBe(false);
  });

  it('retrying after a failed save writes the same ids, so nothing is added twice', async () => {
    open();
    const { repo } = await renderWithRepo(<ReviewScreen />, { settings });
    await screen.findByTestId('review-row-0');
    const real = repo.saveImportBatch.bind(repo);
    const calls: any[] = [];
    jest.spyOn(repo, 'saveImportBatch').mockImplementation(async (b) => {
      calls.push(b);
      if (calls.length === 1) throw new Error('disk full');
      return real(b);
    });
    await fireEvent.press(screen.getByTestId('review-import'));
    expect(await screen.findByTestId('review-error')).toBeTruthy();
    expect(await repo.listTransactions()).toEqual([]);
    await fireEvent.press(screen.getByTestId('review-import'));
    expect(await screen.findByTestId('import-done')).toBeTruthy();
    expect(calls[1].importRecord.id).toBe(calls[0].importRecord.id);
    expect(calls[1].transactions.map((t: Transaction) => t.id)).toEqual(calls[0].transactions.map((t: Transaction) => t.id));
    expect(await repo.listTransactions()).toHaveLength(5);
    expect(await repo.listImports()).toHaveLength(1);
  });

  it('shows 500 rows without timing out', async () => {
    const many = Array.from({ length: 500 }, (_, i) => row({ date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, description: `SHOP ${i % 40} BRANCH ${i}`, amount: 100 + i }));
    open(many);
    const t0 = Date.now();
    await renderWithRepo(<ReviewScreen />, { settings });
    // Newest day first: 28 Oct holds row 27.
    expect(await screen.findByTestId('review-row-27')).toBeTruthy();
    expect(Date.now() - t0).toBeLessThan(5000);
    // Only a window of the list is mounted, but the total covers every row.
    expect(screen.queryByTestId('review-row-499')).toBeNull();
    expect(summary()).toMatch(/^Import 500 items/);
  });

  it('"apply to similar" leaves rows the user set by hand', async () => {
    open();
    await renderWithRepo(<ReviewScreen />, { settings });
    await fireEvent.press(await screen.findByTestId('review-category-1'));
    await fireEvent.press(screen.getByTestId('review-category-option-groceries'));
    await fireEvent.press(screen.getByTestId('rule-confirm-no'));
    await fireEvent.press(screen.getByTestId('review-category-0'));
    await fireEvent.press(screen.getByTestId('review-category-option-dining'));
    await fireEvent.press(screen.getByTestId('rule-confirm-yes'));
    expect(label('review-category-0')).toContain('Dining');
    expect(label('review-category-1')).toContain('Groceries');
  });

  it('flips all signs, with a hint for card exports', async () => {
    const card = [row({ description: 'A SHOP', amount: 100 }), row({ description: 'B SHOP', amount: 200 }), row({ description: 'C SHOP', amount: 300, kind: 'income' })];
    open(card, { sourceName: 'Visa card march.csv' });
    await renderWithRepo(<ReviewScreen />, { settings });
    expect(await screen.findByTestId('review-card-hint')).toBeTruthy();
    expect(summary()).toBe('Import 3 items · AED 3 spending · AED 3 income');
    await fireEvent.press(screen.getByTestId('review-flip-all'));
    expect(summary()).toBe('Import 3 items · AED 3 spending · AED 3 income');
    expect(screen.getByTestId('review-amount-0').props.children).toBe('+AED 1.00');
    expect(screen.getByTestId('review-amount-2').props.children).toBe('-AED 3.00');
  });

  it('has no card hint for an ordinary account file, and tick boxes are at least 44pt', async () => {
    open();
    await renderWithRepo(<ReviewScreen />, { settings });
    await screen.findByTestId('review-row-0');
    expect(screen.queryByTestId('review-card-hint')).toBeNull();
    const style = StyleSheet.flatten(screen.getByTestId('review-toggle-0').props.style);
    expect(style.width).toBeGreaterThanOrEqual(44);
    expect(style.height).toBeGreaterThanOrEqual(44);
  });
});
