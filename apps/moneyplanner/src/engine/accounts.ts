// Money accounts (milestone 3b): which account an item moves, and the rules every engine function shares.
// The main account is Settings.startingBalance / startingBalanceDate; other bank and cash accounts carry their own.
// An item on a card (cardId) moves that card's balance, never a bank account's. A transfer (transferId) moves two of
// the user's own accounts and is never spending or income.
import { compareDates } from '@/lib/dates';
import { MAIN_ACCOUNT_ID, type Account, type Fils, type ISODate, type PlanInput } from '@/types';

/** Anything that can sit in an account or on a card: transactions, recurring items, occurrences. */
export interface Placed {
  accountId?: string | null;
  cardId?: string | null;
}

/** The bank/cash account an item moves: its own, or the main account. Unknown ids fall back to the main account. */
export function accountOf(item: Placed, input: Pick<PlanInput, 'accounts'>): string {
  const id = item.accountId;
  if (!id || id === MAIN_ACCOUNT_ID) return MAIN_ACCOUNT_ID;
  return (input.accounts ?? []).some((a) => a.id === id) ? id : MAIN_ACCOUNT_ID;
}

/** The card an item is charged to, when that card exists (not archived) in Debts; otherwise null (a cash item). */
export function cardOf(item: Placed, input: Pick<PlanInput, 'debts'>): string | null {
  if (!item.cardId) return null;
  return (input.debts ?? []).some((d) => d.id === item.cardId && d.type === 'card' && !d.archived) ? item.cardId : null;
}

/** Money moved between the user's own accounts: never spending or income. */
export const isTransfer = (t: { transferId?: string | null }) => !!t.transferId;

/** Starting balance and date of an account (the main one from Settings). */
export function startOf(accountId: string, input: Pick<PlanInput, 'settings' | 'accounts'>): { balance: Fils; date: ISODate } {
  if (accountId !== MAIN_ACCOUNT_ID) {
    const a = (input.accounts ?? []).find((x) => x.id === accountId);
    if (a) return { balance: a.startingBalance, date: a.startingBalanceDate };
  }
  return { balance: input.settings.startingBalance, date: input.settings.startingBalanceDate };
}

/**
 * Whether a cash flow on `date` in `accountId` is still to be added to that account's balance: flows on or before
 * the account's starting balance date are already in it. A move between the user's own accounts on that day counts,
 * though: it is made after setting the balance (developer, 2026-11-24: a move made today did nothing).
 */
export function countsAfterStart(accountId: string, date: ISODate, input: Pick<PlanInput, 'settings' | 'accounts'>, transfer = false): boolean {
  const c = compareDates(date, startOf(accountId, input).date);
  return transfer ? c >= 0 : c > 0;
}

/** Every bank/cash account the totals include: the main one first, then the others in their order (archived too). */
export function cashAccounts(input: Pick<PlanInput, 'settings' | 'accounts'>): { id: string; name: string; account: Account | null }[] {
  const others = [...(input.accounts ?? [])].sort((a, b) => a.sort - b.sort || (a.id < b.id ? -1 : 1));
  return [{ id: MAIN_ACCOUNT_ID, name: input.settings.mainAccountName ?? 'Main account', account: null }, ...others.map((a) => ({ id: a.id, name: a.name, account: a }))];
}

/** Sum of the starting balances of every bank/cash account. */
export const totalStartingBalance = (input: Pick<PlanInput, 'settings' | 'accounts'>): Fils =>
  cashAccounts(input).reduce((s, a) => s + startOf(a.id, input).balance, 0);
