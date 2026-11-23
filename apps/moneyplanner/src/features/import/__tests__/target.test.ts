import { card } from '@/engine/test-fixtures';
import type { Account, DebtPayment, Transaction } from '@/types';
import type { ReviewRow } from '../review';
import { paysCard, summarise, toCardPayments, toTransactions } from '../review';
import { applyTarget, defaultTarget, MAIN_TARGET, pairedUpdates, pairTransfers, unpair } from '../target';

const row = (over: Partial<ReviewRow>): ReviewRow => ({
  index: 0, date: '2026-10-05', description: 'CARREFOUR', amount: 10000, kind: 'cost', categoryId: 'groceries', selected: true,
  confidence: 1, warnings: [], raw: '', fixed: false, key: 'carrefour', manual: false, ...over,
});
const acc = (over: Partial<Account>): Account => ({ id: 'sav', name: 'ADCB savings', type: 'bank', startingBalance: 0, startingBalanceDate: '2026-01-01', archived: false, sort: 1, createdAt: '2026-01-01', ...over });
const saved = (over: Partial<Transaction>): Transaction => ({ id: 's1', kind: 'income', date: '2026-10-06', description: 'From ENBD', categoryId: null, amount: 300000, note: '', source: 'import', importId: 'old', planned: false, ...over });
const visa = card({ id: 'visa', name: 'Visa 4417' });
const amex = card({ id: 'amex', name: 'Amex 9012' });
const ids = (i: number) => `n${i}`;

describe('defaultTarget', () => {
  const base = { debts: [visa, amex], accounts: [acc({})], settings: { defaultAccountId: null }, sourceName: 'stmt.pdf', cardLike: false };
  it('uses what this source used last time', () => {
    expect(defaultTarget({ ...base, template: { cardId: 'amex' } })).toEqual({ kind: 'card', id: 'amex' });
    expect(defaultTarget({ ...base, template: { accountId: 'sav' } })).toEqual({ kind: 'account', id: 'sav' });
  });
  it('for a card statement, the card that matches it; then the default account; then the main account', () => {
    expect(defaultTarget({ ...base, cardLike: true, account: '9012' })).toEqual({ kind: 'card', id: 'amex' });
    expect(defaultTarget({ ...base, settings: { defaultAccountId: 'sav' } })).toEqual({ kind: 'account', id: 'sav' });
    expect(defaultTarget(base)).toEqual(MAIN_TARGET);
  });
  it('ignores a remembered account or card that is gone', () => {
    expect(defaultTarget({ ...base, template: { cardId: 'deleted' } })).toEqual(MAIN_TARGET);
    expect(defaultTarget({ ...base, accounts: [acc({ archived: true })], template: { accountId: 'sav' } })).toEqual(MAIN_TARGET);
  });
});

describe('applyTarget', () => {
  it('a card statement: purchases and refunds are charged to the card; the payment is logged on it', () => {
    const rows = applyTarget(
      [row({}), row({ index: 1, kind: 'income', description: 'REFUND NOON', amount: 2000 }), row({ index: 2, kind: 'income', description: 'PAYMENT RECEIVED - THANK YOU', amount: 50000 })],
      { kind: 'card', id: 'visa' },
      [visa],
      [],
    );
    expect(rows.map((r) => [r.cardId, !!r.cardPayment, r.selected])).toEqual([['visa', false, true], ['visa', false, true], ['visa', true, true]]);
    expect(toTransactions(rows, 'imp', ids).map((t) => [t.description, t.cardId, t.accountId])).toEqual([['CARREFOUR', 'visa', undefined], ['REFUND NOON', 'visa', undefined]]);
    expect(toCardPayments(rows, ids)).toMatchObject([{ debtId: 'visa', amount: 50000 }]);
  });

  it('a bank statement: rows go into the account; a card payment out pays the card named by its digits', () => {
    const rows = applyTarget([row({}), row({ index: 1, description: 'CREDIT CARD PAYMENT 4417', amount: 80000 })], { kind: 'account', id: 'sav' }, [visa, amex], []);
    expect(rows[0]).toMatchObject({ accountId: 'sav', cardId: null, cardPayment: false });
    expect(rows[1]).toMatchObject({ cardPayment: true, cardId: 'visa', selected: true });
    expect(paysCard(rows[1])).toBe(true);
    expect(toTransactions(rows, 'imp', ids).map((t) => [t.description, t.accountId])).toEqual([['CARREFOUR', 'sav']]);
    expect(summarise(rows)).toMatchObject({ spending: 10000, cardPayments: 80000 });
  });

  it('a card payment the card statement already logged is the same money: unticked, not counted twice', () => {
    const logged: DebtPayment = { id: 'p1', debtId: 'visa', date: '2026-10-03', amount: 80000, kind: 'regular', note: '' };
    const rows = applyTarget([row({ description: 'CC PAYMENT 4417', amount: 80000 })], MAIN_TARGET, [visa], [logged]);
    expect(rows[0]).toMatchObject({ cardPayment: true, cardId: 'visa', selected: false, duplicateOf: 'payment:p1' });
    expect(toCardPayments(rows, ids)).toEqual([]);
  });

  it('money in that pays a card is never income, even into an account with no card to log it on', () => {
    const rows = applyTarget([row({ kind: 'income', description: 'PAYMENT RECEIVED THANK YOU' })], MAIN_TARGET, [visa, amex], []);
    expect(rows[0]).toMatchObject({ cardPayment: true, cardId: null, selected: false });
    expect(summarise(rows).income).toBe(0);
  });

  it('keeps duplicates of saved items unticked whatever the target', () => {
    expect(applyTarget([row({ duplicateOf: 't9', selected: false })], { kind: 'card', id: 'visa' }, [visa], [])[0].selected).toBe(false);
  });
});

describe('pairTransfers', () => {
  const accounts = [acc({})];
  it('pairs money out of this account with the same money into another of the user\'s accounts within 5 days', () => {
    const rows = pairTransfers([row({ description: 'TRANSFER TO ADCB', amount: 300000 })], MAIN_TARGET, [saved({ accountId: 'sav' })], accounts);
    expect(rows[0]).toMatchObject({ pairWith: 's1', pairAccount: 'sav', categoryId: null });
    expect(summarise(rows)).toMatchObject({ spending: 0, transfers: 300000 });
    const tx = toTransactions(rows, 'imp', ids, (i) => `tr${i}`);
    expect(tx[0].transferId).toBe('tr0');
    expect(pairedUpdates(rows, [saved({ accountId: 'sav' })], (i) => `tr${i}`)).toMatchObject([{ id: 's1', transferId: 'tr0', accountId: 'sav' }]);
  });

  it('does not pair within the same account, the same direction, other amounts, more than 5 days, or a card item', () => {
    const try1 = (t: Partial<Transaction>) => pairTransfers([row({ amount: 300000 })], MAIN_TARGET, [saved({ accountId: 'sav', ...t })], accounts)[0].pairWith;
    expect(try1({ accountId: undefined })).toBeUndefined(); // same (main) account
    expect(try1({ kind: 'cost' })).toBeUndefined();
    expect(try1({ amount: 299999 })).toBeUndefined();
    expect(try1({ date: '2026-10-12' })).toBeUndefined();
    expect(try1({ cardId: 'visa' })).toBeUndefined();
    expect(try1({ transferId: 'already' })).toBeUndefined();
  });

  it('pairs one saved item with one row only, never on a card statement, and unpair sticks', () => {
    const two = pairTransfers([row({ amount: 300000 }), row({ index: 1, amount: 300000 })], MAIN_TARGET, [saved({ accountId: 'sav' })], accounts);
    expect(two.map((r) => r.pairWith)).toEqual(['s1', undefined]);
    expect(pairTransfers([row({ amount: 300000 })], { kind: 'card', id: 'visa' }, [saved({ accountId: 'sav' })], accounts)[0].pairWith).toBeUndefined();
    const undone = unpair(two, 0);
    expect(undone[0].pairWith).toBeUndefined();
    expect(pairTransfers(undone, MAIN_TARGET, [saved({ accountId: 'sav' })], accounts)[0].pairWith).toBeUndefined();
  });
});
