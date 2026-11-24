// Bank and cash balances per account (milestone 3b), by the same rules as the forecast: each account starts from its
// own starting balance; items on a card are not cash; debt payments and cheques leave the main account.
import { addDays, compareDates } from '@/lib/dates';
import { MAIN_ACCOUNT_ID, type CreditCard, type Fils, type ISODate, type PlanInput } from '@/types';

import { accountOf, cardOf, cashAccounts, isTransfer, startOf } from './accounts';
import { chequesInRange } from './debts/cheques';
import { cardOwedAt, debtOutflows } from './debts/schedule';
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

/** Moves between the user's own accounts in or out of one account on a date (they count from its start day on). */
export function transfersOn(input: PlanInput, accountId: string, date: ISODate): Fils {
  let net = 0;
  for (const t of input.transactions) {
    if (!isTransfer(t) || t.date !== date || cardOf(t, input) || accountOf(t, input) !== accountId) continue;
    net += t.kind === 'income' ? t.amount : -t.amount;
  }
  return net;
}

/** One account's balance at the end of a date. */
export function accountBalanceAt(input: PlanInput, accountId: string, date: ISODate): Fils {
  const start = startOf(accountId, input);
  // A move on the start day is not in the starting balance (see countsAfterStart).
  const sameDay = transfersOn(input, accountId, start.date);
  if (compareDates(date, start.date) >= 0) return start.balance + sameDay + cashIn(input, accountId, addDays(start.date, 1), date);
  return start.balance + sameDay - cashIn(input, accountId, addDays(date, 1), start.date);
}

/** Every bank/cash account's balance at the end of a date, main first; they add up to the forecast's balance. */
export function accountBalances(input: PlanInput, date: ISODate): { id: string; name: string; archived: boolean; balance: Fils }[] {
  return cashAccounts(input).map((a) => ({ id: a.id, name: a.name, archived: a.account?.archived ?? false, balance: accountBalanceAt(input, a.id, date) }));
}

/** What each card owes at the end of a date (a positive amount). */
export function cardsOwed(input: PlanInput, date: ISODate): { id: string; name: string; owed: Fils }[] {
  return (input.debts ?? [])
    .filter((d): d is CreditCard => d.type === 'card' && !d.archived)
    .map((d) => ({ id: d.id, name: d.name, owed: cardOwedAt(d, input, date) }));
}

/** The balance at the end of a date: every bank/cash account, minus what the cards owe (as in the forecast). */
export const totalBalanceAt = (input: PlanInput, date: ISODate): Fils =>
  accountBalances(input, date).reduce((s, a) => s + a.balance, 0) - cardsOwed(input, date).reduce((s, c) => s + c.owed, 0);
