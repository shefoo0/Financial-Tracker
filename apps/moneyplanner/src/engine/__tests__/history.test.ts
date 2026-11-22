import { balanceHistory } from '../history';
import { card, input, settings } from '../test-fixtures';
import type { Cheque, RecurringItem, Transaction } from '@/types';

const tx = (o: Partial<Transaction>): Transaction => ({ id: 't', kind: 'cost', date: '2026-11-20', description: 'Lunch', categoryId: null, amount: 1000, note: '', source: 'manual', importId: null, planned: false, ...o });
const rent: RecurringItem = { id: 'r1', kind: 'cost', name: 'Rent', categoryId: null, amount: 50000, schedule: { type: 'monthly', day: 20 }, startDate: '2026-01-20', endDate: null, count: null, note: '' };
const TODAY = '2026-11-22';

describe('balanceHistory', () => {
  it('is empty without days', () => {
    expect(balanceHistory(input(), TODAY, 0)).toEqual([]);
  });

  it('shows only the anchor day when nothing else is recorded (no invented history)', () => {
    const inp = input({ settings: settings({ startingBalance: 100000, startingBalanceDate: TODAY }) });
    expect(balanceHistory(inp, TODAY, 30).map((d) => [d.date, d.balance])).toEqual([[TODAY, 100000]]);
  });

  it('works backwards from the starting balance through recorded items', () => {
    const inp = input({
      settings: settings({ startingBalance: 100000, startingBalanceDate: TODAY }),
      transactions: [tx({ id: 'a', date: '2026-11-20', amount: 4000 }), tx({ id: 'b', kind: 'income', date: '2026-11-21', amount: 25000 })],
    });
    const h = balanceHistory(inp, TODAY, 10);
    expect(h.map((d) => [d.date, d.balance])).toEqual([
      ['2026-11-20', 75000], // 100000 minus the 25000 earned on the 21st
      ['2026-11-21', 100000],
      [TODAY, 100000],
    ]);
    expect(h[0].events.map((e) => e.label)).toEqual(['Lunch']);
  });

  it('ignores planned items and unpaid recurring occurrences; applies paid ones and logged debt payments and cleared cheques', () => {
    const cheque: Cheque = { id: 'c', payee: 'Landlord', amount: 7000, date: '2026-11-21', purpose: '', status: 'cleared', seriesId: null, note: '' };
    const upcoming: Cheque = { ...cheque, id: 'c2', status: 'upcoming', date: '2026-11-21' };
    const inp = input({
      settings: settings({ startingBalance: 200000, startingBalanceDate: '2026-11-19' }),
      recurring: [rent],
      overrides: [{ id: 'o', recurringId: 'r1', originalDate: '2026-11-20', skip: false, newDate: null, newAmount: null, paid: true }],
      transactions: [tx({ id: 'p', date: '2026-11-21', amount: 99999, planned: true })],
      debts: [card()],
      debtPayments: [{ id: 'dp', debtId: 'C1', date: '2026-11-22', amount: 3000, kind: 'regular', note: '' }],
      cheques: [cheque, upcoming],
    });
    const h = balanceHistory(inp, TODAY, 4);
    expect(h.map((d) => [d.date, d.balance])).toEqual([
      ['2026-11-19', 200000],
      ['2026-11-20', 150000],
      ['2026-11-21', 143000],
      ['2026-11-22', 140000],
    ]);
  });

  it('lets a snapshot override the starting balance chain from its date on', () => {
    const inp = input({
      settings: settings({ startingBalance: 100000, startingBalanceDate: '2026-11-01' }),
      transactions: [tx({ date: '2026-11-10', amount: 5000 })],
      balanceSnapshots: [{ date: '2026-11-15', balance: 300000 }],
    });
    const h = balanceHistory(inp, TODAY, 30);
    const at = (d: string) => h.find((x) => x.date === d)?.balance;
    expect(at('2026-11-09')).toBe(100000); // forward from the starting balance
    expect(at('2026-11-10')).toBe(95000);
    expect(at('2026-11-14')).toBe(95000);
    expect(at('2026-11-15')).toBe(300000); // the snapshot wins
    expect(at(TODAY)).toBe(300000);
    expect(h[0].date).toBe('2026-11-01');
  });

  it('reconstructs days before the earliest anchor from the later one, back to the earliest record', () => {
    const inp = input({
      settings: settings({ startingBalance: 90000, startingBalanceDate: '2026-11-20' }),
      transactions: [tx({ date: '2026-11-18', amount: 10000 })],
      balanceSnapshots: [{ date: '2026-11-22', balance: 90000 }],
    });
    const h = balanceHistory(inp, TODAY, 30);
    expect(h[0]).toMatchObject({ date: '2026-11-18', balance: 90000 });
    expect(h.find((d) => d.date === '2026-11-17')).toBeUndefined();
    expect(balanceHistory(inp, TODAY, 3).map((d) => d.date)).toEqual(['2026-11-20', '2026-11-21', '2026-11-22']);
  });
});
