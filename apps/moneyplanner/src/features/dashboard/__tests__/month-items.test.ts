import { buildMonthItems } from '../month-items';

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
});
