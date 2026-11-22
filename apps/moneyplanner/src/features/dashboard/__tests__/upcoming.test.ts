import { DEFAULT_CATEGORIES } from '@/data/defaults';
import { buildUpcoming, categoryColor, categoryEmoji, whenLabel } from '@/features/dashboard/upcoming';
import { card, cheque, input as fullInput, loan, plan } from '@/engine/test-fixtures';
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

  it('lists debt payments with progress and upcoming cheques, one row per debt', () => {
    const i = fullInput({
      debts: [loan({ balance: 120000, monthlyPayment: 30000, endDate: '2026-05-15', balanceDate: '2026-01-01' }), plan({ firstPaymentDate: '2026-11-25', payments: 3 })],
      cheques: [cheque({ date: '2026-11-23' }), cheque({ id: 'old', date: '2026-11-20' }), cheque({ id: 'done', date: '2026-11-24', status: 'cleared' })],
    });
    const list = buildUpcoming(i, '2026-11-22', 10);
    expect(list.map((x) => [x.title, x.href, x.progress])).toEqual([
      ['Cheque to Landlord', '/cheques/Q1', null],
      ['Phone plan instalment', '/debts/P1', '0 of 3 paid'],
    ]);
  });

  it('loan progress counts earlier payments; loans without an end date have none', () => {
    const l = loan({ balance: 120000, monthlyPayment: 30000, endDate: '2027-03-15', balanceDate: '2026-10-01' });
    const [first] = buildUpcoming(fullInput({ debts: [l] }), '2026-11-22', 5);
    expect(first).toMatchObject({ title: 'Car loan payment', date: '2026-12-15', progress: '2 of 4 paid', categoryId: 'loans-cards' });
    const [open] = buildUpcoming(fullInput({ debts: [loan({ id: 'L2' })] }), '2026-01-01', 5);
    expect(open.progress).toBeNull();
  });

  it('card payments appear; archived debts do not', () => {
    const i = fullInput({ debts: [card({ balance: 50000, balanceDate: '2026-11-01', dueDay: 25 }), loan({ archived: true })] });
    expect(buildUpcoming(i, '2026-11-22').map((x) => [x.title, x.amount])).toEqual([['Visa payment', 50000]]);
  });
});
