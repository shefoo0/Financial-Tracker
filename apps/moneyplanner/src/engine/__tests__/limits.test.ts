import { categoryLimits, monthBalances } from '@/engine';
import type { Category, RecurringItem, Transaction } from '@/types';

import { input, settings } from '../test-fixtures';

const cat = (over: Partial<Category>): Category => ({ id: 'groceries', name: 'Groceries', kind: 'cost', sort: 1, archived: false, monthlyLimit: null, ...over });
const rec = (over: Partial<RecurringItem> = {}): RecurringItem => ({
  id: 'r1', kind: 'cost', name: 'Box', categoryId: 'groceries', amount: 20000, schedule: { type: 'monthly', day: 5 },
  startDate: '2026-01-01', endDate: null, count: null, note: '', ...over,
});
const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1', kind: 'cost', date: '2026-03-10', description: 'Shop', categoryId: 'groceries', amount: 30000, note: '',
  source: 'manual', importId: null, planned: false, ...over,
});

describe('categoryLimits', () => {
  it('is empty when no category has a limit', () => {
    expect(categoryLimits('2026-03', input({ categories: [cat({}), cat({ id: 'x', monthlyLimit: 0 })] }))).toEqual([]);
  });

  it('adds recurring and one-time costs, in category order, and reports left', () => {
    const rows = categoryLimits(
      '2026-03',
      input({
        categories: [cat({ id: 'dining', name: 'Dining', sort: 2, monthlyLimit: 10000 }), cat({ monthlyLimit: 100000 })],
        recurring: [rec()],
        transactions: [tx(), tx({ id: 't2', date: '2026-04-01', amount: 99999 })],
      }),
    );
    expect(rows).toEqual([
      { categoryId: 'groceries', name: 'Groceries', limit: 100000, spent: 50000, left: 50000, pct: 50, over: false },
      { categoryId: 'dining', name: 'Dining', limit: 10000, spent: 0, left: 10000, pct: 0, over: false },
    ]);
  });

  it('flags over the limit with a negative left, and ignores income and archived categories', () => {
    const rows = categoryLimits(
      '2026-03',
      input({
        categories: [cat({ monthlyLimit: 40000 }), cat({ id: 'old', archived: true, monthlyLimit: 5 }), cat({ id: 'pay', kind: 'income', monthlyLimit: 5 })],
        recurring: [rec()],
        transactions: [tx()],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ spent: 50000, left: -10000, pct: 125, over: true });
  });
});

describe('monthBalances', () => {
  const base = input({
    settings: settings({ startingBalance: 100000, startingBalanceDate: '2026-01-31' }),
    recurring: [rec({ id: 'pay', kind: 'income', categoryId: null, amount: 50000, schedule: { type: 'monthly', day: 1 } }), rec({ amount: 20000 })],
  });

  it('opening is the previous month end, closing adds the month flows', () => {
    // Feb: +500 income on the 1st, -200 on the 5th => 100000 + 30000
    const feb = monthBalances('2026-02', base, '2026-01-31');
    expect(feb.opening).toBe(100000);
    expect(feb.closing).toBe(130000);
    const mar = monthBalances('2026-03', base, '2026-01-31');
    expect(mar.opening).toBe(130000);
    expect(mar.closing).toBe(160000);
  });

  it('marks closing as projected until the month is over', () => {
    expect(monthBalances('2026-02', base, '2026-02-10').projected).toBe(true);
    expect(monthBalances('2026-02', base, '2026-02-28').projected).toBe(true);
    expect(monthBalances('2026-02', base, '2026-03-01').projected).toBe(false);
  });

  it('uses the starting balance for months before it', () => {
    const jan = monthBalances('2025-12', base, '2026-02-01');
    expect(jan.opening).toBe(100000);
    expect(jan.closing).toBe(100000);
  });
});
