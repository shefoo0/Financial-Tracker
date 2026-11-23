// Bank and cash balances per account (milestone 3b), by the same rules as the forecast: each account starts from its
// own starting balance; items on a card are not cash; debt payments and cheques leave the main account.
import { addDays, compareDates } from '@/lib/dates';
import { MAIN_ACCOUNT_ID, type Fils, type ISODate, type PlanInput } from '@/types';

import { accountOf, cardOf, cashAccounts, startOf } from './accounts';
import { chequesInRange } from './debts/cheques';
import { debtOutflows } from './debts/schedule';
import { occurrencesInRange } from './recurring';

/** Cash moved in one bank/cash account between two dates (inclusive). */
export function cashIn(input: PlanInput, accountId: string, from: ISODate, to: ISODate): Fils {
  if (compareDates(from, to) > 0) return 0;
  let net = 0;
  const take = (item: { kind: 'income' | 'cost'; amount: Fils; accountId?: string | null; cardId?: string | null }) => {
    if (cardOf(item, input) || accountOf(item, input) !== accountId) return;
    net += item.kind === 'income' ? item.amount : -item.amount;
  };
  for (const o of occurrencesInRange(input.recurring, input.overrides, from, to)) take(o);
  for (const t of input.transactions) if (compareDates(t.date, from) >= 0 && compareDates(t.date, to) <= 0) take(t);
  if (accountId === MAIN_ACCOUNT_ID) {
    net -= debtOutflows(input, from, to).reduce((s, p) => s + p.amount, 0);
    net -= chequesInRange(input, from, to).reduce((s, c) => s + c.amount, 0);
  }
  return net;
}

/** One account's balance at the end of a date. */
export function accountBalanceAt(input: PlanInput, accountId: string, date: ISODate): Fils {
  const start = startOf(accountId, input);
  if (compareDates(date, start.date) >= 0) return start.balance + cashIn(input, accountId, addDays(start.date, 1), date);
  return start.balance - cashIn(input, accountId, addDays(date, 1), start.date);
}

/** Every bank/cash account's balance at the end of a date, main first; they add up to the forecast's balance. */
export function accountBalances(input: PlanInput, date: ISODate): { id: string; name: string; archived: boolean; balance: Fils }[] {
  return cashAccounts(input).map((a) => ({ id: a.id, name: a.name, archived: a.account?.archived ?? false, balance: accountBalanceAt(input, a.id, date) }));
}

/** Total of every bank/cash account at the end of a date. */
export const totalBalanceAt = (input: PlanInput, date: ISODate): Fils => accountBalances(input, date).reduce((s, a) => s + a.balance, 0);
