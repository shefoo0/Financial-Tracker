// "Paid from / Received into" on items (milestone 3b): which account an item moves, or the card it is charged to,
// as one picker value: 'main', 'acc:<id>' or 'card:<id>'.
import { MAIN_ACCOUNT_ID, type Account, type Debt, type Kind, type Settings } from '@/types';

export type Where = string;
export const MAIN_WHERE: Where = 'main';

/** The picker value of an item. */
export function whereOf(item: { accountId?: string | null; cardId?: string | null }): Where {
  if (item.cardId) return `card:${item.cardId}`;
  if (item.accountId && item.accountId !== MAIN_ACCOUNT_ID) return `acc:${item.accountId}`;
  return MAIN_WHERE;
}

/** The fields an item stores for a picker value: nothing for the main account. */
export function placeOf(where: Where): { accountId?: string; cardId?: string } {
  if (where.startsWith('card:')) return { cardId: where.slice(5) };
  if (where.startsWith('acc:')) return { accountId: where.slice(4) };
  return {};
}

/**
 * What the picker offers. Everyone: the main account and every card (cards are free). Pro: every open account too.
 * The item's current value is always offered, so editing never loses it.
 */
export function whereOptions(args: { mainName: string; accounts: Account[]; debts: Debt[]; isPro: boolean; current: Where }): { value: Where; label: string }[] {
  const out: { value: Where; label: string }[] = [{ value: MAIN_WHERE, label: args.mainName }];
  for (const a of [...args.accounts].sort((x, y) => x.sort - y.sort)) {
    const value = `acc:${a.id}`;
    if ((args.isPro && !a.archived) || value === args.current) out.push({ value, label: a.archived ? `${a.name} (closed)` : a.name });
  }
  for (const d of args.debts) {
    const value = `card:${d.id}`;
    if ((d.type === 'card' && !d.archived) || value === args.current) out.push({ value, label: `${d.name} (card)` });
  }
  if (!out.some((o) => o.value === args.current)) out.push({ value: args.current, label: 'Removed account' });
  return out;
}

/** Where a new item starts: the default account (Pro), else the main account. */
export function defaultWhere(settings: Pick<Settings, 'defaultAccountId'>, accounts: Account[], isPro: boolean): Where {
  const id = settings.defaultAccountId;
  return isPro && id && accounts.some((a) => a.id === id && !a.archived) ? `acc:${id}` : MAIN_WHERE;
}

/** The field's label for an item's direction. */
export const whereLabel = (kind: Kind) => (kind === 'income' ? 'Received into' : 'Paid from');
