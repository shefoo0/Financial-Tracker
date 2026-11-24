// Milestone 3b engine rules: several bank/cash accounts, purchases on a card, payments to cards and transfers.
import { card, input, settings } from '@/engine/test-fixtures';
import type { Account, Transaction } from '@/types';
import { accountOf, cardOf, totalStartingBalance } from '../accounts';
import { debtSchedule, remainingOf } from '../debts/schedule';
import { forecast, monthSummary } from '../forecast';
import { balanceHistory } from '../history';
import { buildReport, periodForKey } from '../reports';
import { accountBalances, cardsOwed } from '../balances';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: over.id ?? 't', kind: 'cost', date: '2026-09-10', description: 'x', categoryId: null, amount: 10000, note: '', source: 'manual', importId: null, planned: false, ...over,
});
const savings = (over: Partial<Account> = {}): Account => ({
  id: 'sav', name: 'ADCB savings', type: 'bank', startingBalance: 500000, startingBalanceDate: '2026-09-05', archived: false, sort: 1, createdAt: '2026-09-05', ...over,
});
const base = settings({ startingBalance: 1000000, startingBalanceDate: '2026-09-01' });
const today = '2026-09-30';
const balanceOn = (inp: ReturnType<typeof input>, date: string) => forecast(inp, { today, days: 120 }).days.find((d) => d.date === date)?.balance;

describe('accounts in the balance and the forecast', () => {
  it('with no accounts the forecast is exactly as before (only the main balance)', () => {
    const inp = input({ settings: base, transactions: [tx({ date: '2026-09-10' })] });
    expect(totalStartingBalance(inp)).toBe(1000000);
    expect(forecast(inp, { today }).balanceAsOf).toBe(1000000 - 10000);
  });

  it('adds every account; an item counts only after its own account\'s starting balance date', () => {
    const inp = input({
      settings: base,
      accounts: [savings()],
      transactions: [
        tx({ id: 'a', date: '2026-09-03', accountId: 'sav', amount: 7000 }), // before savings' start: already in its balance
        tx({ id: 'b', date: '2026-09-10', accountId: 'sav', kind: 'income', amount: 20000 }),
        tx({ id: 'c', date: '2026-09-03', amount: 5000 }), // main account, after its start
      ],
    });
    expect(forecast(inp, { today }).balanceAsOf).toBe(1000000 + 500000 + 20000 - 5000);
  });

  it('an unknown account id falls back to the main account; an archived card makes the item cash', () => {
    const inp = input({ accounts: [savings()], debts: [card({ id: 'old', archived: true })] });
    expect(accountOf({ accountId: 'gone' }, inp)).toBe('main');
    expect(accountOf({ accountId: 'sav' }, inp)).toBe('sav');
    expect(cardOf({ cardId: 'old' }, inp)).toBeNull();
  });

  it('a transfer between own accounts leaves the total alone and is neither income nor spending', () => {
    const inp = input({
      settings: base,
      accounts: [savings()],
      transactions: [
        tx({ id: 'out', date: '2026-09-12', amount: 300000, transferId: 'T1' }),
        tx({ id: 'in', date: '2026-09-12', kind: 'income', amount: 300000, accountId: 'sav', transferId: 'T1' }),
      ],
    });
    expect(forecast(inp, { today }).balanceAsOf).toBe(1500000);
    const m = monthSummary('2026-09', inp);
    expect([m.totalIncome, m.totalSpend]).toEqual([0, 0]);
  });
});

describe('moving money on the day the balances were set (developer, 2026-11-24)', () => {
  it('counts in both accounts, in the forecast, the per-account balances and the history', () => {
    const inp = input({
      settings: settings({ startingBalance: 1000000, startingBalanceDate: today }),
      accounts: [savings({ startingBalanceDate: today })],
      transactions: [
        tx({ id: 'out', date: today, amount: 300000, transferId: 'T1' }),
        tx({ id: 'in', date: today, kind: 'income', amount: 300000, accountId: 'sav', transferId: 'T1' }),
        tx({ id: 'x', date: today, amount: 7000 }), // an ordinary item that day is already in the balance
      ],
    });
    expect(accountBalances(inp, today).map((a) => [a.id, a.balance])).toEqual([['main', 700000], ['sav', 800000]]);
    expect(forecast(inp, { today }).balanceAsOf).toBe(1500000);
    const hist = balanceHistory(inp, today, 3);
    expect(hist[hist.length - 1].balance).toBe(1500000);
  });

  it('a move before an account started is already in its balance', () => {
    const inp = input({
      settings: settings({ startingBalance: 1000000, startingBalanceDate: today }),
      accounts: [savings({ startingBalanceDate: today })],
      transactions: [tx({ id: 'out', date: '2026-09-29', amount: 300000, transferId: 'T1' }), tx({ id: 'in', date: '2026-09-29', kind: 'income', amount: 300000, accountId: 'sav', transferId: 'T1' })],
    });
    expect(accountBalances(inp, today).map((a) => a.balance)).toEqual([1000000, 500000]);
  });
});

describe('purchases on a card (the card model follows the actual purchases)', () => {
  // Statement on the 28th, due on the 14th of the next month (like the developer's card); nothing owed on 1 Sep.
  const visa = card({ id: 'visa', name: 'Visa', balance: 0, balanceDate: '2026-09-01', statementDay: 28, dueDay: 14, plan: 'full' });

  it('a purchase on the card lowers the balance the day it is made; paying the card on its due date moves nothing (developer, 2026-11-24)', () => {
    const inp = input({ settings: base, debts: [visa], transactions: [tx({ id: 'p1', date: '2026-09-20', amount: 25000, cardId: 'visa' })] });
    expect(forecast(inp, { today }).balanceAsOf).toBe(1000000 - 25000);
    // The card is still paid on the due date after its statement (the bank pays it), but the balance stays.
    expect(debtSchedule(visa, inp, '2026-09-01', '2026-12-31').map((p) => [p.date, p.amount])).toEqual([['2026-10-14', 25000]]);
    expect(balanceOn(inp, '2026-10-13')).toBe(1000000 - 25000);
    expect(balanceOn(inp, '2026-10-14')).toBe(1000000 - 25000);
  });

  it('a future purchase on the card lowers the forecast on its date, labelled with the item', () => {
    const inp = input({ settings: base, debts: [visa], transactions: [tx({ id: 'p2', date: '2026-10-05', amount: 8000, cardId: 'visa', description: 'Dinner', planned: true })] });
    expect(forecast(inp, { today }).balanceAsOf).toBe(1000000);
    expect(balanceOn(inp, '2026-10-05')).toBe(1000000 - 8000);
    const day = forecast(inp, { today, days: 30 }).days.find((d) => d.date === '2026-10-05');
    expect(day?.events.map((e) => [e.label, e.amount])).toEqual([['Dinner', 8000]]);
  });

  it('a purchase after the statement date rolls to the next statement', () => {
    const inp = input({ settings: base, debts: [visa], transactions: [tx({ date: '2026-09-29', amount: 25000, cardId: 'visa' })] });
    expect(debtSchedule(visa, inp, '2026-09-01', '2026-12-31').map((p) => [p.date, p.amount])).toEqual([['2026-11-14', 25000]]);
  });

  it('a refund on the card lowers what is paid; recurring items on the card are purchases too', () => {
    const netflix = { id: 'r', kind: 'cost' as const, name: 'Netflix', categoryId: null, amount: 5500, schedule: { type: 'monthly' as const, day: 15 }, startDate: '2026-09-15', endDate: null, count: null, note: '', cardId: 'visa' };
    const inp = input({ settings: base, debts: [visa], recurring: [netflix], transactions: [tx({ date: '2026-09-20', amount: 25000, cardId: 'visa' }), tx({ id: 'ref', date: '2026-09-22', kind: 'income', amount: 5000, cardId: 'visa' })] });
    expect(debtSchedule(visa, inp, '2026-09-01', '2026-11-30').map((p) => [p.date, p.amount])).toEqual([['2026-10-14', 25000 - 5000 + 5500], ['2026-11-14', 5500]]);
  });

  it('a minimum plan pays the minimum of the billed purchases', () => {
    const min = { ...visa, plan: 'minimum' as const, minPct: 5, minFloor: 10000 };
    const inp = input({ settings: base, debts: [min], transactions: [tx({ date: '2026-09-20', amount: 400000, cardId: 'visa' })] });
    expect(debtSchedule(min, inp, '2026-10-01', '2026-10-31').map((p) => p.amount)).toEqual([20000]);
  });

  it('what is left to pay counts actual purchases on the card, not planned ones', () => {
    const inp = input({ settings: base, debts: [visa], transactions: [tx({ date: '2026-09-20', amount: 25000, cardId: 'visa' }), tx({ id: 'plan', date: '2026-10-20', amount: 9000, cardId: 'visa', planned: true })] });
    expect(remainingOf(visa, inp)).toBe(25000);
  });

  it('Month: card purchases are spending; the payment is "paid to cards", not spent again', () => {
    const inp = input({ settings: base, debts: [visa], transactions: [tx({ date: '2026-09-20', amount: 25000, cardId: 'visa', categoryId: 'dining' })] });
    const sep = monthSummary('2026-09', inp);
    expect([sep.totalSpend, sep.costsByCategory.dining]).toEqual([25000, 25000]);
    const oct = monthSummary('2026-10', inp);
    expect([oct.totalSpend, oct.paidToCards, oct.debtPayments]).toEqual([0, 25000, 0]);
  });

  it('a card with no purchases recorded keeps counting its payment as spending (as before accounts)', () => {
    const owed = { ...visa, balance: 30000 };
    // Owed on 1 Sep, due on the 14th: paid on 14 Sep, and counted as spending like before.
    expect(monthSummary('2026-09', input({ settings: base, debts: [owed] }))).toMatchObject({ debtPayments: 30000, paidToCards: 0, totalSpend: 30000 });
  });
});

describe('balance history with accounts and cards', () => {
  it('meets the forecast at today: same total of accounts, card purchases left out, transfers net to zero', () => {
    const visa = card({ id: 'visa', balance: 0, balanceDate: '2026-09-01', statementDay: 28, dueDay: 14 });
    const inp = input({
      settings: base,
      accounts: [savings()],
      debts: [visa],
      transactions: [
        tx({ id: 'a', date: '2026-09-10', amount: 12000 }),
        tx({ id: 'b', date: '2026-09-11', accountId: 'sav', kind: 'income', amount: 40000 }),
        tx({ id: 'c', date: '2026-09-12', amount: 99000, cardId: 'visa' }),
        tx({ id: 'out', date: '2026-09-13', amount: 300000, transferId: 'T1' }),
        tx({ id: 'in', date: '2026-09-13', kind: 'income', amount: 300000, accountId: 'sav', transferId: 'T1' }),
      ],
    });
    const hist = balanceHistory(inp, today, 30);
    expect(hist[hist.length - 1].balance).toBe(forecast(inp, { today }).balanceAsOf);
    // What the card owes (the AED 990 purchase) is off the balance (developer, 2026-11-24).
    expect(hist[hist.length - 1].balance).toBe(1000000 - 12000 + 500000 + 40000 - 99000);
    // Savings is counted from its own start (5 Sep) at its starting balance.
    expect(hist.find((h) => h.date === '2026-09-06')?.balance).toBe(1000000 + 500000);
  });
});

describe('reports with accounts and cards', () => {
  it('the quarter: card purchases are spending, the payment to the card is not; balances are the total of accounts', () => {
    const visa = card({ id: 'visa', balance: 0, balanceDate: '2026-07-01', statementDay: 28, dueDay: 14, plan: 'full' });
    const inp = input({
      settings: settings({ startingBalance: 1000000, startingBalanceDate: '2026-06-30' }),
      accounts: [savings({ startingBalance: 500000, startingBalanceDate: '2026-06-30' })],
      debts: [visa],
      transactions: [tx({ date: '2026-07-10', amount: 40000, cardId: 'visa', categoryId: 'dining' })],
    });
    const r = buildReport(inp, periodForKey('2026-Q3', '2026-11-01')!, '2026-11-01');
    expect(r.summary.spending).toBe(40000);
    // The card was paid from the bank on 14 Aug: the bank total ends 400 lower, the 400 spent only once.
    expect(r.cashFlow.startBalance).toBe(1500000);
    expect(r.cashFlow.endBalance).toBe(1500000 - 40000);
  });
});

describe('per-account balances', () => {
  it('add up to the forecast balance today; each account moves only with its own items', () => {
    const visa = card({ id: 'visa', balance: 0, balanceDate: '2026-09-01', statementDay: 28, dueDay: 14 });
    const inp = input({
      settings: base,
      accounts: [savings()],
      debts: [visa],
      transactions: [
        tx({ id: 'a', date: '2026-09-10', amount: 12000 }),
        tx({ id: 'b', date: '2026-09-11', accountId: 'sav', kind: 'income', amount: 40000 }),
        tx({ id: 'c', date: '2026-09-12', amount: 99000, cardId: 'visa' }),
      ],
    });
    const list = accountBalances(inp, today);
    expect(list.map((a) => [a.id, a.balance])).toEqual([['main', 1000000 - 12000], ['sav', 500000 + 40000]]);
    // The accounts minus what each card owes add up to the forecast's balance today.
    expect(cardsOwed(inp, today)).toEqual([{ id: 'visa', name: 'Visa', owed: 99000 }]);
    expect(list.reduce((s, a) => s + a.balance, 0) - 99000).toBe(forecast(inp, { today }).balanceAsOf);
  });
});
