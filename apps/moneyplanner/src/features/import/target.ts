// Where an import goes (milestone 3b): a bank/cash account or a card, and what that means for its rows.
// Pure functions; the review screen keeps the state.
import { accountOf } from '@/engine/accounts';
import { diffDays } from '@/lib/dates';
import { MAIN_ACCOUNT_ID, type Account, type Debt, type DebtPayment, type Settings, type Transaction } from '@/types';

import { CARD_PAYMENT, matchCard, type ReviewRow } from './review';

export type ImportTarget = { kind: 'account'; id: string } | { kind: 'card'; id: string };

export const MAIN_TARGET: ImportTarget = { kind: 'account', id: MAIN_ACCOUNT_ID };

/** Days apart two sides of the same money can be (a transfer, or a card payment seen from the bank and the card). */
export const PAIR_DAYS = 5;

const liveCards = (debts: Debt[]) => debts.filter((d) => d.type === 'card' && !d.archived);
const liveAccounts = (accounts: Account[]) => accounts.filter((a) => !a.archived);

/**
 * The target a review starts with: what this source used last time; else, for a card statement, the matching card;
 * else the default account (Pro); else the main account.
 */
export function defaultTarget(args: {
  template?: { accountId?: string | null; cardId?: string | null } | null;
  debts: Debt[];
  accounts: Account[];
  settings: Pick<Settings, 'defaultAccountId'>;
  sourceName: string;
  /** Last 4 digits the statement shows. */
  account?: string;
  /** The statement looks like a card statement. */
  cardLike: boolean;
}): ImportTarget {
  const cards = liveCards(args.debts);
  const accounts = liveAccounts(args.accounts);
  const t = args.template;
  if (t?.cardId && cards.some((c) => c.id === t.cardId)) return { kind: 'card', id: t.cardId };
  if (t?.accountId && (t.accountId === MAIN_ACCOUNT_ID || accounts.some((a) => a.id === t.accountId))) return { kind: 'account', id: t.accountId };
  if (args.cardLike) {
    const card = matchCard(args.debts, args.sourceName, args.account);
    if (card) return { kind: 'card', id: card };
  }
  const d = args.settings.defaultAccountId;
  if (d && accounts.some((a) => a.id === d)) return { kind: 'account', id: d };
  return MAIN_TARGET;
}

/** The card a bank row pays: the one whose last 4 digits are in the description, else the only card. */
function cardInDescription(description: string, debts: Debt[]): string | null {
  const cards = liveCards(debts);
  const digits = description.match(/\d{4}(?!\d)/g) ?? [];
  const byDigits = cards.filter((c) => digits.some((d) => c.name.includes(d) || c.note.includes(d)));
  if (byDigits.length === 1) return byDigits[0].id;
  return cards.length === 1 ? cards[0].id : null;
}

/** A payment already logged on the card for the same amount within a few days: the same money seen again. */
function alreadyLogged(cardId: string, row: ReviewRow, payments: DebtPayment[]): DebtPayment | undefined {
  return payments.find((p) => p.debtId === cardId && p.amount === row.amount && Math.abs(diffDays(p.date, row.date)) <= PAIR_DAYS);
}

/**
 * Points every row at the target.
 * - A card: purchases and refunds are charged to it; a payment to the card (money in) is logged on it.
 * - An account: rows go into it; a card payment (money out with card-payment words) pays the card it names (or the
 *   only card) instead of being spending, unless the card statement already logged it.
 * A payment that is already logged starts unticked as a duplicate. Duplicates of saved items stay unticked.
 */
export function applyTarget(rows: ReviewRow[], target: ImportTarget, debts: Debt[], payments: DebtPayment[]): ReviewRow[] {
  return rows.map((r) => {
    const savedDup = r.duplicateOf && !r.duplicateOf.startsWith('payment:') ? r.duplicateOf : undefined;
    const base: ReviewRow = { ...r, duplicateOf: savedDup, pairWith: undefined };
    const card = target.kind === 'card' ? target.id : null;
    const paysOut = target.kind === 'account' && r.kind === 'cost' && CARD_PAYMENT.test(r.description);
    // Money in that pays off a card is never income, whatever the target (left out when no card matches).
    const paysIn = r.kind === 'income' && CARD_PAYMENT.test(r.description);
    if (paysIn || paysOut) {
      const paid = card ?? cardInDescription(r.description, debts);
      const logged = paid ? alreadyLogged(paid, r, payments) : undefined;
      return {
        ...base,
        accountId: target.kind === 'account' ? target.id : null,
        cardPayment: true,
        cardId: paid,
        duplicateOf: savedDup ?? (logged ? `payment:${logged.id}` : undefined),
        selected: !!paid && !savedDup && !logged,
      };
    }
    return {
      ...base,
      cardPayment: false,
      accountId: target.kind === 'account' ? target.id : null,
      cardId: card,
      selected: !savedDup,
    };
  });
}

/**
 * Pairs rows with money moving the other way in another of the user's accounts (same amount, within a few days):
 * they are a transfer, not spending or income. Only for a bank/cash target; card payments and duplicates are left alone.
 * One saved item pairs with one row at most.
 */
export function pairTransfers(rows: ReviewRow[], target: ImportTarget, existing: Transaction[], accounts: Account[]): ReviewRow[] {
  if (target.kind !== 'account') return rows;
  const input = { accounts };
  const used = new Set<string>();
  return rows.map((r) => {
    if (r.cardPayment || r.duplicateOf || r.pairWith || r.unpaired) return r;
    const match = existing.find(
      (t) =>
        !used.has(t.id) &&
        !t.transferId &&
        !t.cardId &&
        t.kind !== r.kind &&
        t.amount === r.amount &&
        accountOf(t, input) !== target.id &&
        Math.abs(diffDays(t.date, r.date)) <= PAIR_DAYS,
    );
    if (!match) return r;
    used.add(match.id);
    return { ...r, pairWith: match.id, pairAccount: accountOf(match, input), categoryId: null };
  });
}

/** Undoes a pairing: the row is ordinary spending or income again. */
export function unpair(rows: ReviewRow[], index: number): ReviewRow[] {
  return rows.map((r) => (r.index === index ? { ...r, pairWith: undefined, pairAccount: undefined, unpaired: true } : r));
}

/** The saved items a pairing turns into the other side of a transfer: they get the same transferId as their row. */
export function pairedUpdates(rows: ReviewRow[], existing: Transaction[], transferIdFor: (index: number) => string): Transaction[] {
  const out: Transaction[] = [];
  for (const r of rows) {
    if (!r.selected || !r.pairWith) continue;
    const t = existing.find((x) => x.id === r.pairWith);
    if (t) out.push({ ...t, transferId: transferIdFor(r.index), categoryId: null });
  }
  return out;
}
