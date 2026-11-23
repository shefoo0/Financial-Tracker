// Pure logic of the review screen: rows with their suggested category, duplicates, fixes and the totals.
import type { CategoryRule, ParsedRow } from '@/import/parse';
import { dedupe, merchantKey, suggestCategory } from '@/import/parse';
import type { Category, Debt, DebtPayment, Fils, ISODate, Kind, Transaction } from '@/types';

/** Rows below this confidence are shown with "Check this". */
export const LOW_CONFIDENCE = 0.7;

export interface ReviewRow {
  /** Position in the file; stays the same when the list is grouped. */
  index: number;
  date: ISODate;
  description: string;
  amount: Fils;
  kind: Kind;
  categoryId: string | null;
  selected: boolean;
  /** Id of the saved item this row probably repeats. */
  duplicateOf?: string;
  confidence: number;
  warnings: string[];
  raw: string;
  /** The user fixed the date or direction, so the warning no longer applies. */
  fixed: boolean;
  /** Merchant key, worked out once (used to find similar rows). */
  key: string;
  /** The user chose this row's category by hand: "apply to similar" leaves it alone. */
  manual: boolean;
  /** Money in that only pays off a card (not income). */
  cardPayment?: boolean;
  /** The card (Debts) this payment pays off. Ticked with a card: saved as a payment on that card, never as income. */
  cardId?: string | null;
}

/**
 * The card a statement belongs to: the only active card, or the one whose name has the statement's last 4 digits
 * or shares a word with the file name ("visa-nov.pdf" → "Visa card"). Null when unsure: the user picks.
 */
export function matchCard(debts: Debt[], sourceName: string, account?: string): string | null {
  const cards = debts.filter((d) => d.type === 'card' && !d.archived);
  if (cards.length === 1) return cards[0].id;
  if (account) {
    const byDigits = cards.filter((c) => c.name.includes(account) || c.note.includes(account));
    if (byDigits.length === 1) return byDigits[0].id;
  }
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9\u0600-\u06ff]+/).filter((w) => w.length >= 3 && w !== 'card' && w !== 'credit'));
  const source = words(sourceName);
  const byName = cards.filter((c) => [...words(c.name)].some((w) => source.has(w)));
  return byName.length === 1 ? byName[0].id : null;
}

/** Points every card-payment row at a card. With a card they start ticked (logged on the card); without, unticked (left out). */
export function assignCard(rows: ReviewRow[], cardId: string | null): ReviewRow[] {
  return rows.map((r) => (r.cardPayment && !r.duplicateOf ? { ...r, cardId, selected: !!cardId } : r));
}

/** A card-payment row that will be saved as a payment on its card. */
export const paysCard = (r: ReviewRow) => !!r.cardPayment && r.kind === 'income' && !!r.cardId;

/** Payments into a card account: they reduce what is owed, they are not income. */
export const CARD_PAYMENT = /\b(payment received|payment[\s-]+thank you|thank you for (your )?payment|card payment|credit card payment|cc payment|autopay|auto[\s-]?pay|direct debit payment|payment by direct debit)\b|سداد البطاقة|سداد بطاقة|دفعة بطاقة/i;

/** A money-in row that pays off a card. */
export const isCardPayment = (description: string, kind: Kind) => kind === 'income' && CARD_PAYMENT.test(description);

/** The cost category for spending nothing else matched: the profile's "Other" (by id, then by name). */
export function otherCostCategory(categories: Category[]): string | null {
  const live = categories.filter((c) => c.kind === 'cost' && !c.archived);
  return (live.find((c) => c.id === 'other') ?? live.find((c) => /^other\b/i.test(c.name.trim())))?.id ?? null;
}

/**
 * The category suggested for a row: the user's rules first, then built-in words; only one of the right kind (income or
 * cost). Spending that matches nothing goes to "Other", so it is never left without a category.
 */
export function suggestFor(description: string, kind: Kind, rules: CategoryRule[], categories: Category[]): string | null {
  const id = suggestCategory(description, rules, categories);
  const cat = id ? categories.find((c) => c.id === id) : undefined;
  if (cat && cat.kind === kind && !cat.archived) return cat.id;
  return kind === 'cost' ? otherCostCategory(categories) : null;
}

/** Rows from a parser, checked against what is already saved. Duplicates and card payments start unticked. */
export function buildReviewRows(rows: ParsedRow[], existing: Transaction[], rules: CategoryRule[], categories: Category[]): ReviewRow[] {
  return dedupe(rows, existing).map((r, index) => ({
    cardPayment: isCardPayment(r.description, r.kind),
    index,
    date: r.date,
    description: r.description,
    amount: r.amount,
    kind: r.kind,
    categoryId: suggestFor(r.description, r.kind, rules, categories),
    selected: !r.duplicateOf && !isCardPayment(r.description, r.kind),
    duplicateOf: r.duplicateOf,
    confidence: r.confidence,
    warnings: r.warnings,
    raw: r.raw,
    fixed: false,
    key: merchantKey(r.description),
    manual: false,
  }));
}

export const isLowConfidence = (r: ReviewRow) => !r.fixed && r.confidence < LOW_CONFIDENCE;

/** Why a row needs a look, in plain words. */
export function lowConfidenceReason(r: ReviewRow): string {
  const text = r.warnings.map((w) => w.trim().replace(/\.$/, '')).filter(Boolean);
  return text.length ? `${text.join('. ')}.` : 'The reader was not sure about this row.';
}

/** The merchant name shown in "Always put X in Y?". */
export const merchantName = (description: string) => merchantKey(description) || description.trim();

export function setSelected(rows: ReviewRow[], index: number, selected: boolean): ReviewRow[] {
  return rows.map((r) => (r.index === index ? { ...r, selected } : r));
}

export function setAllSelected(rows: ReviewRow[], selected: boolean): ReviewRow[] {
  return rows.map((r) => ({ ...r, selected }));
}

/** Switches a row between income and spending. The category is suggested again for the new direction. */
export function flipKind(rows: ReviewRow[], index: number, rules: CategoryRule[], categories: Category[]): ReviewRow[] {
  return rows.map((r) => {
    if (r.index !== index) return r;
    const kind: Kind = r.kind === 'income' ? 'cost' : 'income';
    return { ...r, kind, categoryId: suggestFor(r.description, kind, rules, categories), fixed: true };
  });
}

export function setDate(rows: ReviewRow[], index: number, date: ISODate): ReviewRow[] {
  return rows.map((r) => (r.index === index ? { ...r, date, fixed: true } : r));
}

export function setCategory(rows: ReviewRow[], index: number, categoryId: string | null): ReviewRow[] {
  return rows.map((r) => (r.index === index ? { ...r, categoryId, manual: true } : r));
}

/** Same merchant: equal keys, or one key's words are the start of the other's (like sameMerchant, on keys already worked out). */
function sameKey(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ta = a.split(' ');
  const tb = b.split(' ');
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((w, i) => long[i] === w);
}

/** Indexes (file positions) of the other rows of the same merchant and direction. */
export function similarIndexes(rows: ReviewRow[], index: number): number[] {
  const base = rows.find((r) => r.index === index);
  if (!base) return [];
  return rows.filter((r) => r.index !== index && r.kind === base.kind && sameKey(base.key, r.key)).map((r) => r.index);
}

/** Gives every row like `index` (same merchant, same direction) the category of that row, except rows the user set by hand. */
export function applyCategoryToSimilar(rows: ReviewRow[], index: number, categoryId: string | null): ReviewRow[] {
  const same = new Set(similarIndexes(rows, index));
  return rows.map((r) => (same.has(r.index) && !r.manual ? { ...r, categoryId } : r));
}

/** Switches every row between income and spending (card exports often show purchases as positive). */
export function flipAll(rows: ReviewRow[], rules: CategoryRule[], categories: Category[]): ReviewRow[] {
  return rows.map((r) => {
    const kind: Kind = r.kind === 'income' ? 'cost' : 'income';
    return { ...r, kind, categoryId: r.manual ? null : suggestFor(r.description, kind, rules, categories), manual: false, fixed: true };
  });
}

/** True when the source looks like a card statement whose signs may be the wrong way round. */
export function looksLikeCardExport(sourceName: string, rows: ReviewRow[]): boolean {
  if (/card|visa|master|amex|credit/i.test(sourceName)) return true;
  return rows.length >= 3 && rows.filter((r) => r.kind === 'income').length / rows.length > 0.6;
}

export interface ReviewSummary {
  count: number;
  spending: Fils;
  income: Fils;
  /** Ticked card payments, logged on their card (not income). */
  cardPayments: Fils;
}

export function summarise(rows: ReviewRow[]): ReviewSummary {
  const out: ReviewSummary = { count: 0, spending: 0, income: 0, cardPayments: 0 };
  for (const r of rows) {
    if (!r.selected) continue;
    out.count += 1;
    if (paysCard(r)) out.cardPayments += r.amount;
    else if (r.kind === 'income') out.income += r.amount;
    else out.spending += r.amount;
  }
  return out;
}

export interface DateGroup {
  date: ISODate;
  rows: ReviewRow[];
}

/** Newest day first; rows keep the file's order inside a day. */
export function groupByDate(rows: ReviewRow[]): DateGroup[] {
  const map = new Map<ISODate, ReviewRow[]>();
  for (const r of rows) {
    const list = map.get(r.date);
    if (list) list.push(r);
    else map.set(r.date, [r]);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)).map(([date, list]) => ({ date, rows: list }));
}

/** The transactions an import saves: only ticked rows, as real (not planned) items marked as imported. Card payments are not transactions. */
export function toTransactions(rows: ReviewRow[], importId: string, idFor: (index: number) => string): Transaction[] {
  return rows
    .filter((r) => r.selected && !paysCard(r))
    .map((r) => ({
      id: idFor(r.index),
      kind: r.kind,
      date: r.date,
      description: r.description,
      categoryId: r.categoryId,
      amount: r.amount,
      note: '',
      source: 'import' as const,
      importId,
      planned: false,
    }));
}

/**
 * Ticked card payments as payments on their card: the card's balance goes down and the forecast's expected payment
 * for that statement is replaced (a 'regular' payment), like paying it by hand in Debts.
 */
export function toCardPayments(rows: ReviewRow[], idFor: (index: number) => string): DebtPayment[] {
  return rows
    .filter((r) => r.selected && paysCard(r))
    .map((r) => ({ id: idFor(r.index), debtId: r.cardId!, date: r.date, amount: r.amount, kind: 'regular' as const, note: `Imported: ${r.description}`.slice(0, 200) }));
}
