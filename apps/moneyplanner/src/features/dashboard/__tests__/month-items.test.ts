import { buildMonthItems } from '../month-items';
import { cheque, dov, input, loan, plan, card } from '@/engine/test-fixtures';

const occ = (over = {}) => ({
  recurringId: 'r1', name: 'Rent', kind: 'cost' as const, categoryId: null,
  date: '2026-03-05', originalDate: '2026-03-01', amount: 100, paid: true, overridden: true, ...over,
});
const tx = (over = {}) => ({
  id: 't1', kind: 'income' as const, date: '2026-03-02', description: '', categoryId: null, amount: 50,
  note: '', source: 'manual' as const, importId: null, planned: true, ...over,
});

describe('buildMonthItems', () => {
  it('merges, filters and sorts by date with badges and links', () => {
    const items = buildMonthItems([occ()], [tx(), tx({ id: 't2', date: '2026-04-01' })], '2026-03-01', '2026-03-31');
    expect(items.map((i) => i.href)).toEqual(['/transaction/t1', '/recurring/r1']);
    expect(items[0].badges).toEqual(['Planned']);
    expect(items[0].title).toBe('Income');
    expect(items[1].badges).toEqual(['Paid', 'Moved']);
  });

  it('includes debt payments and upcoming cheques when given the plan input', () => {
    const i = input({
      debts: [loan({ paymentDay: 15 })],
      cheques: [cheque({ date: '2026-02-01' }), cheque({ id: 'x', status: 'cleared', date: '2026-02-02' })],
      debtOverrides: [dov({ originalDate: '2026-02-15', newDate: '2026-02-17' })],
    });
    const items = buildMonthItems([], [], '2026-02-01', '2026-02-28', i);
    expect(items.map((x) => [x.date, x.title, x.href, x.kind, x.amount, x.badges])).toEqual([
      ['2026-02-01', 'Cheque to Landlord', '/cheques/Q1', 'cost', 500000, ['Rent']],
      ['2026-02-17', 'Car loan payment', '/debts/L1', 'cost', 30000, ['Moved']],
    ]);
  });

  it('shows a card-linked plan only through its card', () => {
    const i = input({ debts: [card({ balance: 0, dueDay: 20 }), plan({ cardId: 'C1' })] });
    const items = buildMonthItems([], [], '2026-02-01', '2026-02-28', i);
    expect(items.map((x) => x.title)).toEqual(['Visa payment']);
    expect(items[0].amount).toBe(40000);
  });

  it('without the plan input nothing changes', () => {
    expect(buildMonthItems([], [], '2026-02-01', '2026-02-28')).toEqual([]);
  });
});
