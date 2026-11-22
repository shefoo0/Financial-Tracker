import { paydayView } from '@/engine';
import { cheque, income, input, loan, settings } from '@/engine/test-fixtures';
import type { RecurringItem, Transaction } from '@/types';

const rent: RecurringItem = { ...income(0), id: 'rent', kind: 'cost', name: 'Rent', amount: 300000, schedule: { type: 'monthly', day: 24 } };
const tx = (p: Partial<Transaction>): Transaction => ({
  id: 't1', kind: 'cost', date: '2026-11-23', description: 'Gift', categoryId: null, amount: 10000, note: '', source: 'manual', importId: null, planned: true, ...p,
});
const base = { startingBalance: 1000000, startingBalanceDate: '2026-11-01' };

describe('paydayView', () => {
  it('subtracts bills before payday and the buffer', () => {
    const v = paydayView(
      input({
        settings: settings({ ...base, buffer: 100000 }),
        recurring: [income(1500000), rent],
        transactions: [tx({}), tx({ id: 't2', planned: false, date: '2026-11-23', amount: 5000 })],
        cheques: [cheque({ date: '2026-11-24', amount: 20000 })],
      }),
      '2026-11-22',
    );
    expect(v.nextPayday).toBe('2026-11-25');
    expect(v.daysLeft).toBe(3);
    expect(v.balanceNow).toBe(1000000);
    expect(v.billsBeforePayday).toBe(300000 + 10000 + 5000 + 20000);
    expect(v.plannedBeforePayday).toBe(10000);
    expect(v.safeToSpend).toBe(1000000 - 335000 - 100000);
    expect(v.perDay).toBe(Math.floor(565000 / 3));
    expect(v.items.map((i) => i.date)).toEqual(['2026-11-23', '2026-11-23', '2026-11-24', '2026-11-24']);
  });

  it('includes debt payments and leaves out bills on payday itself', () => {
    const v = paydayView(
      input({ settings: settings(base), recurring: [income(1500000), { ...rent, schedule: { type: 'monthly', day: 25 } }], debts: [loan({ paymentDay: 23, balance: 100000000, balanceDate: "2026-11-01" })] }),
      '2026-11-22',
    );
    expect(v.billsBeforePayday).toBe(30000);
  });

  it('uses the largest income, not a small side income', () => {
    const side: RecurringItem = { ...income(50000), id: 'side', schedule: { type: 'monthly', day: 28 } };
    expect(paydayView(input({ settings: settings(base), recurring: [side, income(1500000)] }), '2026-11-22').nextPayday).toBe('2026-11-25');
  });

  it('without income falls back to the payday setting, then to the end of the month', () => {
    const a = paydayView(input({ settings: settings({ ...base, payday: 1 }) }), '2026-11-22');
    expect(a.nextPayday).toBe('2026-12-01');
    expect(a.daysLeft).toBe(9);
    const b = paydayView(input({ settings: settings(base), recurring: [{ ...rent, schedule: { type: 'monthly', day: 30 } }] }), '2026-11-22');
    expect(b.nextPayday).toBeNull();
    expect(b.daysLeft).toBe(9);
    expect(b.billsBeforePayday).toBe(300000);
  });

  it('on payday itself looks to the next one', () => {
    const v = paydayView(input({ settings: settings(base), recurring: [income(1500000)] }), '2026-11-25');
    expect(v.nextPayday).toBe('2026-12-25');
    expect(v.daysLeft).toBe(30);
  });

  it('handles the last day of the month with no payday', () => {
    const v = paydayView(input({ settings: settings(base) }), '2026-11-30');
    expect(v.nextPayday).toBeNull();
    expect(v.daysLeft).toBe(1);
    expect(v.safeToSpend).toBe(1000000);
  });

  it('can be negative, with 0 per day', () => {
    const v = paydayView(input({ settings: settings({ ...base, startingBalance: 100000, buffer: 50000 }), recurring: [income(1500000), rent] }), '2026-11-22');
    expect(v.safeToSpend).toBe(100000 - 300000 - 50000);
    expect(v.perDay).toBe(0);
  });
});
