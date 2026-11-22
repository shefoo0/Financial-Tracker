import type { Category, RecurringItem, Transaction } from '@/types';
import { buildReport, periodForKey, periodsWithData, sampleReport } from '../index';
import { card, cheque, input, loan, settings } from '../test-fixtures';

const cat = (id: string, name: string, kind: 'income' | 'cost' = 'cost'): Category => ({ id, name, kind, sort: 0, archived: false });
const tx = (id: string, date: string, amount: number, categoryId: string | null = null, kind: 'income' | 'cost' = 'cost'): Transaction => ({
  id,
  kind,
  date,
  description: id,
  categoryId,
  amount,
  note: '',
  source: 'manual',
  importId: null,
  planned: false,
});
const rec = (over: Partial<RecurringItem> & Pick<RecurringItem, 'id' | 'kind' | 'amount'>): RecurringItem => ({
  name: over.id,
  categoryId: null,
  schedule: { type: 'monthly', day: 25 },
  startDate: '2025-01-01',
  endDate: null,
  count: null,
  note: '',
  ...over,
});
const get = (key: string, today: string) => periodForKey(key, today)!;

describe('periods', () => {
  it('knows quarter and year boundaries, including leap years', () => {
    expect(get('2026-Q1', '2026-11-22')).toMatchObject({ kind: 'quarter', from: '2026-01-01', to: '2026-03-31', label: 'Q1 2026', isCurrent: false });
    expect(get('2026-Q2', '2026-11-22')).toMatchObject({ from: '2026-04-01', to: '2026-06-30' });
    expect(get('2026-Q3', '2026-11-22')).toMatchObject({ from: '2026-07-01', to: '2026-09-30' });
    expect(get('2026-Q4', '2026-11-22')).toMatchObject({ from: '2026-10-01', to: '2026-11-22', isCurrent: true });
    expect(get('2026', '2026-11-22')).toMatchObject({ kind: 'year', from: '2026-01-01', to: '2026-11-22', isCurrent: true });
    expect(get('2025', '2026-11-22')).toMatchObject({ to: '2025-12-31', isCurrent: false });
    expect(get('2028-Q1', '2030-01-01').to).toBe('2028-03-31');
    expect(get('2028-Q1', '2028-02-29')).toMatchObject({ to: '2028-02-29', isCurrent: true });
    expect(periodForKey('2026-Q5', '2026-01-01')).toBeNull();
    expect(periodForKey('abc', '2026-01-01')).toBeNull();
  });

  it('is empty without any data', () => {
    expect(periodsWithData(input(), '2026-11-22')).toEqual([]);
    expect(periodsWithData(input({ recurring: [rec({ id: 'f', kind: 'income', amount: 100, startDate: '2027-01-01' })] }), '2026-11-22')).toEqual([]);
  });

  it('lists current quarter and year first, then past quarters, then past years', () => {
    const i = input({ recurring: [rec({ id: 's', kind: 'income', amount: 1000000, startDate: '2025-08-01' })] });
    const keys = periodsWithData(i, '2026-02-10').map((p) => p.key);
    expect(keys).toEqual(['2026-Q1', '2026', '2025-Q4', '2025-Q3', '2025']);
    expect(periodsWithData(i, '2026-02-10')[0].isCurrent).toBe(true);
  });

  it('skips quarters without entries', () => {
    const i = input({ transactions: [tx('a', '2025-02-10', 500), tx('b', '2025-11-10', 500)] });
    const keys = periodsWithData(i, '2026-05-01').map((p) => p.key);
    expect(keys).toEqual(['2026-Q2', '2026', '2025-Q4', '2025-Q1', '2025']);
  });
});

describe('summary and comparisons', () => {
  const base = input({
    categories: [cat('food', 'Dining'), cat('rent', 'Rent')],
    recurring: [rec({ id: 'sal', name: 'Salary', kind: 'income', amount: 1000000 }), rec({ id: 'r', kind: 'cost', amount: 300000, categoryId: 'rent', schedule: { type: 'monthly', day: 1 } })],
    transactions: [
      tx('d1', '2026-04-10', 20000, 'food'),
      tx('d2', '2026-07-10', 52000, 'food'),
      tx('d3', '2025-07-10', 10000, 'food'),
    ],
  });

  it('adds up income, spending, saved and savings rate for a full quarter', () => {
    const r = buildReport(base, get('2026-Q3', '2026-11-22'), '2026-11-22');
    expect(r.summary.income).toBe(3000000);
    expect(r.summary.spending).toBe(900000 + 52000);
    expect(r.summary.saved).toBe(3000000 - 952000);
    expect(r.summary.savingsRate).toBe(68.3);
    expect(r.hasData).toBe(true);
  });

  it('compares with the previous quarter and the same quarter last year', () => {
    const r = buildReport(base, get('2026-Q3', '2026-11-22'), '2026-11-22');
    expect(r.summary.vsPrevious?.label).toBe('Q2');
    expect(r.summary.vsPrevious?.spending).toEqual({ previous: 920000, change: 32000, pct: 3.5 });
    expect(r.summary.vsLastYear?.label).toBe('Q3 2025');
    expect(r.summary.vsLastYear?.spending.previous).toBe(910000);
    const dining = r.spending.find((x) => x.id === 'food')!;
    expect(dining).toMatchObject({ amount: 52000, previous: 20000, change: 32000, pct: 160 });
  });

  it('gives null comparisons when there is no earlier data', () => {
    const r = buildReport(base, get('2025-Q1', '2026-11-22'), '2026-11-22');
    expect(r.summary.vsPrevious).toBeNull();
    expect(r.summary.vsLastYear).toBeNull();
    expect(r.spending[0].previous).toBeNull();
    expect(r.spending[0].change).toBeNull();
    expect(r.highlights.join(' ')).not.toMatch(/vs /);
  });

  it('handles an empty period', () => {
    const r = buildReport(input(), get('2026-Q1', '2026-11-22'), '2026-11-22');
    expect(r.hasData).toBe(false);
    expect(r.summary).toMatchObject({ income: 0, spending: 0, saved: 0, savingsRate: null, vsPrevious: null });
    expect(r.keyFigures.monthsOfBuffer).toBeNull();
    expect(r.keyFigures.biggestCategory).toBeNull();
    expect(r.debts).toBeNull();
    expect(r.highlights).toEqual([]);
  });

  it('compares the current period only with the same elapsed part of the earlier one', () => {
    const i = input({ transactions: [tx('a', '2026-07-05', 1000), tx('b', '2026-08-20', 9000), tx('c', '2026-10-05', 3000)] });
    const r = buildReport(i, get('2026-Q4', '2026-10-31'), '2026-10-31');
    expect(r.period.isCurrent).toBe(true);
    expect(r.rangeText).toContain('(so far)');
    expect(r.summary.spending).toBe(3000);
    // Q3 up to 31 Jul only: just the 5 Jul item.
    expect(r.summary.vsPrevious?.spending.previous).toBe(1000);
  });

  it('a year compares with the previous year and has no same-quarter comparison', () => {
    const r = buildReport(base, get('2026', '2026-11-22'), '2026-11-22');
    expect(r.summary.vsPrevious?.label).toBe('2025');
    expect(r.summary.vsLastYear).toBeNull();
  });

  it('shows a source that vanished as 0 with its previous amount', () => {
    const i = input({ recurring: [rec({ id: 'old', name: 'Old job', kind: 'income', amount: 500000, endDate: '2026-05-30' }), rec({ id: 'new', name: 'New job', kind: 'income', amount: 600000, startDate: '2026-07-01' })] });
    const r = buildReport(i, get('2026-Q3', '2026-11-22'), '2026-11-22');
    expect(r.income.find((x) => x.name === 'Old job')).toMatchObject({ amount: 0, previous: 500000 * 2 });
    expect(r.income.find((x) => x.name === 'New job')).toMatchObject({ amount: 1800000, previous: 0, pct: null });
  });
});

describe('cash flow', () => {
  it('start + movements = end, in a period before and after the starting balance date', () => {
    const l = loan({ balance: 600000, monthlyPayment: 30000 });
    const i = input({
      settings: settings({ startingBalance: 1000000, startingBalanceDate: '2026-02-15' }),
      recurring: [rec({ id: 's', kind: 'income', amount: 800000, startDate: '2026-01-01' }), rec({ id: 'c', kind: 'cost', amount: 100000, schedule: { type: 'monthly', day: 3 }, startDate: '2026-01-01' })],
      transactions: [tx('x', '2026-04-10', 50000), tx('y', '2026-05-02', 20000, null, 'income')],
      debts: [l],
      cheques: [cheque({ date: '2026-05-01', amount: 40000 })],
    });
    for (const key of ['2026-Q1', '2026-Q2', '2025-Q4']) {
      const r = buildReport(i, get(key, '2026-11-22'), '2026-11-22');
      const f = r.cashFlow;
      const net = f.recurringIncome - f.recurringCosts + f.oneTimeNet - f.debtPayments - f.cheques;
      expect(f.startBalance + net).toBe(f.endBalance);
    }
    const q2 = buildReport(i, get('2026-Q2', '2026-11-22'), '2026-11-22');
    expect(q2.cashFlow).toMatchObject({ recurringIncome: 2400000, recurringCosts: 300000, oneTimeNet: -30000, debtPayments: 90000, cheques: 40000 });
    // Balance at the end of Q1 equals the start of Q2.
    const q1 = buildReport(i, get('2026-Q1', '2026-11-22'), '2026-11-22');
    expect(q1.cashFlow.endBalance).toBe(q2.cashFlow.startBalance);
  });
});

describe('debts', () => {
  const l = loan({ balance: 450000, monthlyPayment: 30000, balanceDate: '2026-01-01', endDate: '2027-03-15', annualRatePct: 6 });
  const i = input({
    recurring: [rec({ id: 's', kind: 'income', amount: 1000000, startDate: '2026-01-01' })],
    debts: [l, card({ plan: 'minimum' })],
  });

  it('reports owed, paid, interest and the debt-to-income ratio', () => {
    const r = buildReport(i, get('2026-Q2', '2026-11-22'), '2026-11-22');
    const d = r.debts!;
    expect(d.owedStart).toBeGreaterThan(d.owedEnd);
    expect(d.paid).toBeGreaterThan(0);
    expect(d.interestEstimate).toBeGreaterThan(0);
    expect(d.dtiPct).toBeCloseTo((d.paid / 3000000) * 100, 0);
    expect(d.debtFreeThen).toBe(d.debtFreeNow);
  });

  it('has no interest estimate when no rate is set and no debts means no section', () => {
    const noRate = input({ debts: [loan({ annualRatePct: null })] });
    expect(buildReport(noRate, get('2026-Q1', '2026-11-22'), '2026-11-22').debts?.interestEstimate).toBeNull();
    expect(buildReport(input(), get('2026-Q1', '2026-11-22'), '2026-11-22').debts).toBeNull();
  });

  it('highlights debts with few payments left', () => {
    const r = buildReport(i, get('2026-Q3', '2026-09-30'), '2026-09-30');
    expect(r.highlights.some((h) => /^Car loan: \d+ payments? left$/.test(h))).toBe(true);
  });
});

describe('key figures and highlights', () => {
  const i = input({
    settings: settings({ startingBalance: 2000000, startingBalanceDate: '2026-01-01' }),
    categories: [cat('food', 'Dining'), cat('fuel', 'Fuel')],
    recurring: [rec({ id: 's', kind: 'income', amount: 1000000, startDate: '2026-01-01' }), rec({ id: 'rent', kind: 'cost', amount: 400000, schedule: { type: 'monthly', day: 1 }, startDate: '2026-01-01' })],
    transactions: [tx('a', '2026-04-04', 100000, 'food'), tx('b', '2026-07-04', 160000, 'food'), tx('c', '2026-04-05', 90000, 'fuel'), tx('d', '2026-07-05', 30000, 'fuel')],
  });
  const r = buildReport(i, get('2026-Q3', '2026-11-22'), '2026-11-22');

  it('computes the key figures', () => {
    expect(r.keyFigures.fixedCosts).toBe(1200000);
    expect(r.keyFigures.flexibleCosts).toBe(190000);
    expect(r.keyFigures.spendingPct).toBe(46.3);
    expect(r.keyFigures.biggestCategory?.amount).toBeGreaterThan(0);
    expect(r.keyFigures.monthsOfBuffer).toBeGreaterThan(0);
  });

  it('words highlights as facts, never advice', () => {
    expect(r.highlights).toContain('Dining rose 60% vs Q2 (+AED 600)');
    expect(r.highlights).toContain('Fuel fell 67% vs Q2 (-AED 600)');
    expect(r.highlights.length).toBeLessThanOrEqual(5);
    for (const h of [...r.highlights, ...sampleReport('2026-11-22').highlights, ...sampleReport('2026-11-22', 'year').highlights]) {
      expect(h).not.toMatch(/should|must|try to|consider|recommend|need to/i);
    }
  });
});

describe('year in review', () => {
  const i = input({
    recurring: [rec({ id: 's', kind: 'income', amount: 1000000, startDate: '2026-01-01' })],
    transactions: [tx('a', '2026-02-10', 900000), tx('b', '2026-05-10', 100000), tx('c', '2026-08-10', 200000)],
  });

  it('shows four quarters and the best and worst month', () => {
    const r = buildReport(i, get('2025', '2026-11-22'), '2026-11-22');
    expect(r.quarters).toHaveLength(4);
    const y = buildReport(i, get('2026', '2026-11-22'), '2026-11-22');
    expect(y.quarters!.map((q) => q.label)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(y.quarters![0]).toMatchObject({ income: 3000000, spending: 900000, saved: 2100000, hasData: true });
    expect(y.bestMonth?.saved).toBe(1000000);
    expect(y.worstMonth).toMatchObject({ month: '2026-02', saved: 100000 });
  });

  it('marks quarters that have not started and ignores future months', () => {
    const y = buildReport(i, get('2026', '2026-05-15'), '2026-05-15');
    expect(y.quarters![2].hasData).toBe(false);
    expect(y.quarters![3].hasData).toBe(false);
    expect(y.quarters![1].income).toBe(1000000);
    expect(y.summary.income).toBe(4000000);
  });

  it('quarter reports have no year section', () => {
    const r = buildReport(i, get('2026-Q1', '2026-11-22'), '2026-11-22');
    expect(r.quarters).toBeNull();
    expect(r.bestMonth).toBeNull();
  });
});

describe('sample report', () => {
  it('is a full report from demo data', () => {
    const r = sampleReport('2026-11-22');
    expect(r.isSample).toBe(true);
    expect(r.period.key).toBe('2026-Q3');
    expect(r.summary.income).toBeGreaterThan(5000000);
    expect(r.summary.vsPrevious).not.toBeNull();
    expect(r.summary.vsLastYear).not.toBeNull();
    expect(r.income.length).toBeGreaterThan(1);
    expect(r.spending.length).toBeGreaterThan(4);
    expect(r.debts).not.toBeNull();
    expect(r.highlights.length).toBeGreaterThan(1);
    const y = sampleReport('2026-11-22', 'year');
    expect(y.period.key).toBe('2025');
    expect(y.quarters).toHaveLength(4);
    expect(y.bestMonth).not.toBeNull();
  });

  it('works when today is early in a year', () => {
    const r = sampleReport('2027-01-10');
    expect(r.period.key).toBe('2026-Q4');
    expect(r.hasData).toBe(true);
  });
});
