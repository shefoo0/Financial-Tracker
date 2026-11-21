import { DEFAULT_CATEGORIES } from '@/data/defaults';
import { buildUpcoming, categoryColor, categoryEmoji, whenLabel } from '@/features/dashboard/upcoming';
import type { PlanInput, RecurringItem } from '@/types';

const item = (p: Partial<RecurringItem>): RecurringItem => ({
  id: 'a',
  kind: 'cost',
  name: 'Car loan',
  categoryId: 'loans-cards',
  amount: 100000,
  schedule: { type: 'monthly', day: 10, everyMonths: 1 },
  startDate: '2026-01-01',
  endDate: null,
  count: null,
  note: '',
  ...p,
});

const input = (recurring: RecurringItem[], transactions: PlanInput['transactions'] = []): PlanInput =>
  ({ settings: {}, categories: DEFAULT_CATEGORIES, recurring, overrides: [], transactions }) as unknown as PlanInput;

describe('upcoming', () => {
  it('labels days', () => {
    expect(whenLabel('2026-11-21', '2026-11-21')).toBe('today');
    expect(whenLabel('2026-11-22', '2026-11-21')).toBe('tomorrow');
    expect(whenLabel('2026-11-26', '2026-11-21')).toBe('in 5 days');
  });

  it('shows instalment progress and sorts with planned items', () => {
    const list = buildUpcoming(
      input(
        [item({ count: 12 })],
        [{ id: 't', kind: 'income', date: '2026-11-23', description: 'Bonus', categoryId: null, amount: 5, note: '', source: 'manual', importId: null, planned: true }],
      ),
      '2026-11-21',
    );
    expect(list[0].title).toBe('Bonus');
    expect(list[1].title).toBe('Car loan');
    expect(list[1].when).toBe('in 19 days');
    expect(list[1].progress).toBe('11 of 12 paid');
  });

  it('picks emoji and colour', () => {
    expect(categoryEmoji('housing', 'cost')).toBe('🏠');
    expect(categoryEmoji(null, 'income')).toBe('💰');
    expect(categoryColor('nope', DEFAULT_CATEGORIES)).toBe(categoryColor(null, DEFAULT_CATEGORIES));
  });
});
