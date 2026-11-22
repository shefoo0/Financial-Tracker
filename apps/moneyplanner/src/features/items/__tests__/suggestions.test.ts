import type { Category, RecurringItem, Transaction } from '@/types';

import { lastRecurringCategory, lastTransactionCategory, recentRecurringSuggestions, recentTransactionSuggestions, usableCategory } from '../suggestions';

const NOW = '2026-11-22';
const tx = (id: string, description: string, date: string, amount = 1000, categoryId: string | null = null, kind: 'cost' | 'income' = 'cost'): Transaction => ({
  id, description, date, amount, categoryId, kind, note: '', source: 'manual', importId: null, planned: false,
});
const cat = (id: string, kind: 'cost' | 'income' = 'cost', archived = false): Category => ({ id, name: id, kind, sort: 0, archived });
const rec = (id: string, name: string, startDate: string, categoryId: string | null = null): RecurringItem => ({
  id, name, kind: 'cost', amount: 9500, categoryId, schedule: { type: 'monthly', day: 1, everyMonths: 1 }, startDate, endDate: null, count: null, note: '',
});

describe('recentTransactionSuggestions', () => {
  it('ranks by frequency, then recency, with the newest amount and category', () => {
    const list = [
      tx('1', 'Taxi', '2026-11-01', 4000, 'a'),
      tx('2', 'taxi ', '2026-11-10', 4500, 'b'),
      tx('3', 'Coffee', '2026-11-20', 15),
      tx('4', 'Lunch', '2026-11-21', 30),
    ];
    const s = recentTransactionSuggestions(list, 'cost', NOW);
    expect(s.map((x) => x.text)).toEqual(['taxi', 'Lunch', 'Coffee']);
    expect(s[0]).toMatchObject({ amount: 4500, categoryId: 'b' });
  });

  it('ignores other kinds, older than 90 days and future items, and caps at 6', () => {
    const list = [
      tx('1', 'Old', '2026-08-01'),
      tx('2', 'Bonus', '2026-11-01', 1, null, 'income'),
      tx('3', 'Future', '2026-12-01'),
      ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((n, i) => tx(`x${n}`, n, `2026-11-${10 + i}`)),
    ];
    const s = recentTransactionSuggestions(list, 'cost', NOW);
    expect(s).toHaveLength(6);
    expect(s.map((x) => x.text)).not.toContain('Old');
    expect(s.map((x) => x.text)).not.toContain('Future');
    expect(s.map((x) => x.text)).not.toContain('Bonus');
  });

  it('returns nothing without history', () => {
    expect(recentTransactionSuggestions([], 'cost', NOW)).toEqual([]);
  });
});

describe('recentRecurringSuggestions', () => {
  it('merges recurring names (any age) with recent one-time descriptions', () => {
    const s = recentRecurringSuggestions([rec('r', 'Rent', '2025-01-01', 'h')], [tx('1', 'Gym', '2026-11-05'), tx('2', 'rent', '2026-11-02', 100)], 'cost', NOW);
    expect(s.map((x) => x.text)).toEqual(['rent', 'Gym']);
  });
});

describe('last used category', () => {
  const cats = [cat('a'), cat('b'), cat('old', 'cost', true), cat('inc', 'income')];
  it('takes the most recent item with a live category of that kind', () => {
    const list = [tx('1', 'x', '2026-11-01', 1, 'a'), tx('2', 'y', '2026-11-10', 1, 'b'), tx('3', 'z', '2026-11-15', 1, 'old'), tx('4', 'f', '2027-01-01', 1, 'a')];
    expect(lastTransactionCategory(list, 'cost', cats, NOW)).toBe('b');
    expect(lastTransactionCategory(list, 'income', cats, NOW)).toBeNull();
  });
  it('works for recurring items', () => {
    expect(lastRecurringCategory([rec('1', 'Rent', '2026-01-01', 'a'), rec('2', 'Gym', '2026-03-01', 'b')], 'cost', cats, NOW)).toBe('b');
  });
  it('usableCategory drops archived, wrong-kind and unknown ids', () => {
    expect(usableCategory('a', 'cost', cats)).toBe('a');
    expect(usableCategory('old', 'cost', cats)).toBeNull();
    expect(usableCategory('inc', 'cost', cats)).toBeNull();
    expect(usableCategory('zzz', 'cost', cats)).toBeNull();
  });
});
