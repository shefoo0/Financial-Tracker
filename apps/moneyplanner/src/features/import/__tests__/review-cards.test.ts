import { card, loan } from '@/engine/test-fixtures';
import type { ReviewRow } from '../review';
import { assignCard, isCardPayment, matchCard, summarise, toCardPayments, toTransactions } from '../review';

const row = (over: Partial<ReviewRow> = {}): ReviewRow => ({
  index: 0, date: '2026-12-02', description: 'PAYMENT RECEIVED - THANK YOU', amount: 200000, kind: 'income', categoryId: null, selected: false,
  confidence: 1, warnings: [], raw: '', fixed: false, key: 'payment received', manual: false, cardPayment: true, ...over,
});

describe('matchCard', () => {
  it('takes the only active card', () => {
    expect(matchCard([card({ id: 'v' }), loan(), card({ id: 'old', archived: true })], 'statement.pdf')).toBe('v');
  });
  it('matches the last 4 digits in the card name or note, then a word of the file name', () => {
    const cards = [card({ id: 'a', name: 'ENBD Visa 4417' }), card({ id: 'b', name: 'ADCB Mastercard', note: 'ends 9012' })];
    expect(matchCard(cards, 'x.pdf', '9012')).toBe('b');
    expect(matchCard(cards, 'x.pdf', '4417')).toBe('a');
    expect(matchCard(cards, 'adcb-dec-2026.pdf')).toBe('b');
  });
  it('is unsure (null) with several cards and nothing to go on', () => {
    expect(matchCard([card({ id: 'a', name: 'Visa' }), card({ id: 'b', name: 'Amex' })], 'statement.pdf')).toBeNull();
    expect(matchCard([], 'visa.pdf')).toBeNull();
  });
});

describe('card payments in the review', () => {
  it('with a card: ticked, saved as a payment on the card, not as a transaction or income', () => {
    const rows = assignCard([row(), row({ index: 1, description: 'TALABAT', kind: 'cost', amount: 8990, cardPayment: false, selected: true })], 'visa');
    expect(rows[0]).toMatchObject({ selected: true, cardId: 'visa' });
    expect(summarise(rows)).toEqual({ count: 2, spending: 8990, income: 0, cardPayments: 200000 });
    expect(toTransactions(rows, 'imp', (i) => `t${i}`).map((t) => t.description)).toEqual(['TALABAT']);
    expect(toCardPayments(rows, (i) => `t${i}`)).toEqual([{ id: 't0', debtId: 'visa', date: '2026-12-02', amount: 200000, kind: 'regular', note: 'Imported: PAYMENT RECEIVED - THANK YOU' }]);
  });
  it('without a card: unticked and left out', () => {
    const rows = assignCard([row({ selected: true })], null);
    expect(rows[0].selected).toBe(false);
    expect(toCardPayments(rows, (i) => `t${i}`)).toEqual([]);
  });
  it('never moves a duplicate', () => {
    expect(assignCard([row({ duplicateOf: 'x' })], 'visa')[0].selected).toBe(false);
  });
  it('only money in counts as a card payment', () => {
    expect(isCardPayment('CREDIT CARD PAYMENT', 'income')).toBe(true);
    expect(isCardPayment('CREDIT CARD PAYMENT', 'cost')).toBe(false);
  });
});
