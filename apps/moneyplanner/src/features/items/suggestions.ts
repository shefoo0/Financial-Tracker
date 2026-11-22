// Faster entry: recent descriptions as chips, and the last-used category, computed from existing items.
import { addDays, compareDates, today } from '@/lib/dates';
import type { Category, Fils, ISODate, Kind, RecurringItem, Transaction } from '@/types';

export const SUGGESTION_DAYS = 90;
export const SUGGESTION_LIMIT = 6;

export interface Suggestion {
  /** The text as last typed (original capitalisation). */
  text: string;
  categoryId: string | null;
  /** The amount last used with this text. */
  amount: Fils;
}

const keyOf = (text: string) => text.trim().toLowerCase();

interface Entry extends Suggestion {
  key: string;
  count: number;
  last: ISODate;
}

function collect(entries: Map<string, Entry>, text: string, date: ISODate, categoryId: string | null, amount: Fils) {
  const key = keyOf(text);
  if (!key) return;
  const e = entries.get(key);
  if (!e) {
    entries.set(key, { key, text: text.trim(), categoryId, amount, count: 1, last: date });
    return;
  }
  e.count += 1;
  // The newest use decides the category and the amount.
  if (compareDates(date, e.last) >= 0) {
    e.last = date;
    e.text = text.trim();
    e.categoryId = categoryId;
    e.amount = amount;
  }
}

function rank(entries: Map<string, Entry>, limit: number): Suggestion[] {
  return [...entries.values()]
    .sort((a, b) => b.count - a.count || compareDates(b.last, a.last) || a.key.localeCompare(b.key))
    .slice(0, limit)
    .map(({ text, categoryId, amount }) => ({ text, categoryId, amount }));
}

function recentTransactions(transactions: Transaction[], kind: Kind, now: ISODate) {
  const from = addDays(now, -SUGGESTION_DAYS);
  return transactions.filter((t) => t.kind === kind && compareDates(t.date, from) >= 0 && compareDates(t.date, now) <= 0);
}

/** The most frequent descriptions of the last 90 days for one kind (ties: newest first). */
export function recentTransactionSuggestions(transactions: Transaction[], kind: Kind, now: ISODate = today(), limit = SUGGESTION_LIMIT): Suggestion[] {
  const entries = new Map<string, Entry>();
  for (const t of recentTransactions(transactions, kind, now)) collect(entries, t.description, t.date, t.categoryId, t.amount);
  return rank(entries, limit);
}

/** Names of recurring items of this kind (any age) plus recent one-time descriptions. */
export function recentRecurringSuggestions(recurring: RecurringItem[], transactions: Transaction[], kind: Kind, now: ISODate = today(), limit = SUGGESTION_LIMIT): Suggestion[] {
  const entries = new Map<string, Entry>();
  for (const r of recurring) if (r.kind === kind) collect(entries, r.name, r.startDate, r.categoryId, r.amount);
  for (const t of recentTransactions(transactions, kind, now)) collect(entries, t.description, t.date, t.categoryId, t.amount);
  return rank(entries, limit);
}

/** Category of the most recent item of this kind that has one (items dated in the future are ignored). */
export function lastUsedCategory(
  items: { kind: Kind; categoryId: string | null; date: ISODate }[],
  kind: Kind,
  categories: Category[],
  now: ISODate = today(),
): string | null {
  const live = new Set(categories.filter((c) => c.kind === kind && !c.archived).map((c) => c.id));
  let best: { categoryId: string; date: ISODate } | null = null;
  for (const i of items) {
    if (i.kind !== kind || !i.categoryId || !live.has(i.categoryId) || compareDates(i.date, now) > 0) continue;
    if (!best || compareDates(i.date, best.date) > 0) best = { categoryId: i.categoryId, date: i.date };
  }
  return best?.categoryId ?? null;
}

export const lastTransactionCategory = (transactions: Transaction[], kind: Kind, categories: Category[], now?: ISODate) => lastUsedCategory(transactions, kind, categories, now);

export const lastRecurringCategory = (recurring: RecurringItem[], kind: Kind, categories: Category[], now?: ISODate) =>
  lastUsedCategory(
    recurring.map((r) => ({ kind: r.kind, categoryId: r.categoryId, date: r.startDate })),
    kind,
    categories,
    now,
  );

/** A category id that still exists, is of this kind and isn't archived; otherwise null. */
export function usableCategory(categoryId: string | null, kind: Kind, categories: Category[]): string | null {
  return categoryId && categories.some((c) => c.id === categoryId && c.kind === kind && !c.archived) ? categoryId : null;
}
