// Money accounts screen logic (milestone 3b): names, new accounts and what free and Pro users may do.
import { newId } from '@/lib/id';
import { MAIN_ACCOUNT_ID, type Account, type AccountType, type Fils, type ISODate } from '@/types';

export const ACCOUNT_NAME_MAX = 40;

/** Free users have the main account (plus every card in Debts); more bank or cash accounts are Pro. */
export const canAddAccount = (isPro: boolean) => isPro;

/** The problem with a name, or null. Names are unique (ignoring case) among the main account and the others. */
export function validateAccountName(name: string, mainName: string, accounts: Account[], editingId?: string): string | null {
  const n = name.trim();
  if (!n) return 'Enter a name, like "ENBD current" or "Cash".';
  if (n.length > ACCOUNT_NAME_MAX) return `Keep the name to ${ACCOUNT_NAME_MAX} characters.`;
  const taken = [
    ...(editingId === MAIN_ACCOUNT_ID ? [] : [mainName]),
    ...accounts.filter((a) => a.id !== editingId && !a.archived).map((a) => a.name),
  ];
  if (taken.some((t) => t.trim().toLowerCase() === n.toLowerCase())) return 'You already have an account with this name.';
  return null;
}

/** A new account, placed after the others. */
export function buildAccount(args: { name: string; type: AccountType; balance: Fils; date: ISODate; existing: Account[]; today: ISODate }): Account {
  const sort = args.existing.reduce((m, a) => Math.max(m, a.sort), 0) + 1;
  return {
    id: newId(),
    name: args.name.trim(),
    type: args.type,
    startingBalance: Math.round(args.balance),
    startingBalanceDate: args.date,
    archived: false,
    sort,
    createdAt: args.today,
  };
}

/** The accounts a picker offers: the main one first, then open accounts in order. */
export function pickableAccounts(mainName: string, accounts: Account[]): { id: string; name: string }[] {
  return [{ id: MAIN_ACCOUNT_ID, name: mainName }, ...accounts.filter((a) => !a.archived).sort((a, b) => a.sort - b.sort).map((a) => ({ id: a.id, name: a.name }))];
}
