// Pure logic of the review screen: rows with their suggested category, duplicates, fixes and the totals.
import type { CategoryRule, ParsedRow } from '@/import/parse';
import { applySimilar, dedupe, merchantKey, suggestCategory } from '@/import/parse';
import type { Category, Fils, ISODate, Kind, Transaction } from '@/types';

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
}

/** The category suggested for a row: the user's rules first, then built-in words; only one of the right kind (income or cost). */
export function suggestFor(description: string, kind: Kind, rules: CategoryRule[], categories: Category[]): string | null {
  const id = suggestCategory(description, rules, categories);
  if (!id) return null;
  const cat = categories.find((c) => c.id === id);
  return cat && cat.kind === kind && !cat.archived ? id : null;
}

/** Rows from a parser, checked against what is already saved. Duplicates start unticked. */
export function buildReviewRows(rows: ParsedRow[], existing: Transaction[], rules: CategoryRule[], categories: Category[]): ReviewRow[] {
  return dedupe(rows, existing).map((r, index) => ({
    index,
    date: r.date,
    description: r.description,
    amount: r.amount,
    kind: r.kind,
    categoryId: suggestFor(r.description, r.kind, rules, categories),
    selected: !r.duplicateOf,
    duplicateOf: r.duplicateOf,
    confidence: r.confidence,
    warnings: r.warnings,
    raw: r.raw,
    fixed: false,
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
  return rows.map((r) => (r.index === index ? { ...r, categoryId } : r));
}

/** Indexes (file positions) of the other rows of the same merchant and direction. */
export function similarIndexes(rows: ReviewRow[], index: number): number[] {
  const at = rows.findIndex((r) => r.index === index);
  if (at < 0) return [];
  return applySimilar(rows, at, null)
    .map((x) => rows[x.index])
    .filter((r) => r.kind === rows[at].kind)
    .map((r) => r.index);
}

/** Gives every row like `index` (same merchant, same direction) the category of that row. */
export function applyCategoryToSimilar(rows: ReviewRow[], index: number, categoryId: string | null): ReviewRow[] {
  const same = new Set(similarIndexes(rows, index));
  return rows.map((r) => (same.has(r.index) ? { ...r, categoryId } : r));
}

export interface ReviewSummary {
  count: number;
  spending: Fils;
  income: Fils;
}

export function summarise(rows: ReviewRow[]): ReviewSummary {
  const out: ReviewSummary = { count: 0, spending: 0, income: 0 };
  for (const r of rows) {
    if (!r.selected) continue;
    out.count += 1;
    if (r.kind === 'income') out.income += r.amount;
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

/** The transactions an import saves: only ticked rows, as real (not planned) items marked as imported. */
export function toTransactions(rows: ReviewRow[], importId: string, makeId: () => string): Transaction[] {
  return rows
    .filter((r) => r.selected)
    .map((r) => ({
      id: makeId(),
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
