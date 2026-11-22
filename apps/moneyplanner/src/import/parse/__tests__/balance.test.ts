import { checkBalances } from '../balance';
import { parseCsv } from '../csv';
import { parseStatementText } from '../text';
import type { ParsedRow } from '../types';

const row = (amount: number, kind: 'income' | 'cost', balance: number | undefined, extra: Partial<ParsedRow> = {}): ParsedRow => ({
  date: '2026-11-01',
  description: 'X',
  amount,
  kind,
  ...(balance !== undefined ? { balance } : {}),
  raw: '',
  confidence: 1,
  warnings: [],
  ...extra,
});

describe('checkBalances', () => {
  it('raises confidence when oldest-first deltas agree', () => {
    const rows = [row(1000, 'cost', 9000, { confidence: 0.8 }), row(500, 'income', 9500), row(200, 'cost', 9300)];
    const c = checkBalances(rows);
    expect(c.order).toBe('oldest-first');
    expect(rows[1].confidence).toBeGreaterThanOrEqual(0.9);
    expect(rows[2].confidence).toBeGreaterThanOrEqual(0.9);
    expect(c.disagreed).toBe(0);
  });
  it('detects newest-first order and flags a disagreeing row', () => {
    // newest first: balances 9300 <- 9500 <- 9000 <- opening 10000
    const rows = [row(200, 'cost', 9300), row(500, 'income', 9500), row(1000, 'cost', 9000), row(333, 'cost', 7500)];
    const c = checkBalances(rows, undefined);
    expect(c.order).toBe('newest-first');
    expect(rows[0].confidence).toBeGreaterThanOrEqual(0.9);
    expect(rows[2].warnings.join(' ')).toMatch(/does not match/);
    expect(rows[2].confidence).toBeLessThanOrEqual(0.6);
  });
  it('uses the opening balance for the first row', () => {
    const rows = [row(1000, 'cost', 9000)];
    checkBalances(rows, 10000);
    expect(rows[0].confidence).toBe(1);
    const bad = [row(1000, 'cost', 9000), row(1, 'cost', 8999)];
    checkBalances(bad, 5000);
    expect(bad[0].warnings.join(' ')).toMatch(/does not match/);
  });
  it('flips a direction that was only assumed', () => {
    const rows = [
      row(1000, 'cost', 9000),
      row(500, 'cost', 9500, { confidence: 0.5, warnings: ['The file does not say whether this is money in or out; assumed spending.'] }),
    ];
    checkBalances(rows);
    expect(rows[1]).toMatchObject({ kind: 'income', warnings: [] });
    expect(rows[1].confidence).toBeGreaterThanOrEqual(0.9);
  });
  it('flags a stated direction the balance contradicts', () => {
    const rows = [row(1000, 'cost', 9000), row(500, 'cost', 9500), row(100, 'cost', 9400)];
    checkBalances(rows);
    expect(rows[1].warnings.join(' ')).toMatch(/opposite/);
  });
  it('does nothing without balances', () => {
    const rows = [row(1, 'cost', undefined), row(2, 'cost', undefined)];
    expect(checkBalances(rows).order).toBeNull();
    expect(rows[0].confidence).toBe(1);
  });
});

describe('parsers use the balance', () => {
  it('CSV with unsigned amounts: income found from the balance', () => {
    const r = parseCsv('Date,Description,Amount,Balance\n01/11/2026,SHOP,100.00,900.00\n02/11/2026,SALARY,500.00,1400.00\n03/11/2026,CAFE,50.00,1350.00\n');
    expect(r.rows.map((x) => x.kind)).toEqual(['cost', 'income', 'cost']);
    // The first row has nothing before it to compare with, so it stays a guess.
    expect(r.rows.slice(1).every((x) => x.confidence >= 0.9)).toBe(true);
    expect(r.rows[0].confidence).toBe(0.5);
  });
  it('CSV flags a row that disagrees and says so in problems', () => {
    const r = parseCsv('Date,Description,Debit,Credit,Balance\n01/11/2026,A,100.00,,900.00\n02/11/2026,B,10.00,,890.00\n03/11/2026,C,20.00,,700.00\n04/11/2026,D,5.00,,695.00\n');
    expect(r.rows[2].warnings.join(' ')).toMatch(/does not match/);
    expect(r.problems.join(' ')).toMatch(/running balance/);
  });
  it('statement text raises confidence when balances agree', () => {
    const r = parseStatementText('Opening balance 1,000.00\n01/11/2026 SHOP 100.00 900.00\n02/11/2026 SALARY 500.00 1,400.00\n03/11/2026 CAFE 50.00 1,350.00', { today: '2026-11-30' });
    expect(r.rows.map((x) => x.kind)).toEqual(['cost', 'income', 'cost']);
    expect(r.rows.every((x) => x.confidence >= 0.9)).toBe(true);
  });
});
