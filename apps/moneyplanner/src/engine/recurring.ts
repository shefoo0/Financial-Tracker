// Recurring items: expand a schedule into dated occurrences (pure, 'YYYY-MM-DD' strings).
import type { Fils, ISODate, Occurrence, OccurrenceOverride, RecurringItem } from '@/types';
import { addDays, compareDates, daysInMonth, diffDays, parseISODate, toISODate } from '@/lib/dates';

/** Hard cap on generated originals per item per call (a runaway guard). */
const MAX_GENERATED = 20000;

const pos = (n: number | undefined, fallback = 1) =>
  typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;

/** Original date of the i-th raw candidate (before dropping those earlier than startDate). */
function candidate(item: RecurringItem, i: number): ISODate {
  const s = item.schedule;
  const start = parseISODate(item.startDate);
  if (s.type === 'weekly') return addDays(item.startDate, i * 7 * pos(s.everyWeeks));
  if (s.type === 'monthly') {
    const total = start.year * 12 + (start.month - 1) + i * pos(s.everyMonths);
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    const dim = daysInMonth(y, m);
    const d = s.day === 'last' ? dim : Math.min(Math.max(1, Math.floor(Number(s.day)) || 1), dim);
    return toISODate(y, m, d);
  }
  const y = start.year + i;
  const m = Math.min(12, Math.max(1, Math.floor(s.month) || 1));
  const dim = daysInMonth(y, m);
  return toISODate(y, m, Math.min(Math.max(1, Math.floor(s.day) || 1), dim));
}

/** A safe (never too high) index to start from when nothing needs counting. */
function skipIndex(item: RecurringItem, from: ISODate): number {
  if (compareDates(from, item.startDate) <= 0) return 0;
  const s = item.schedule;
  if (s.type === 'weekly') return Math.max(0, Math.floor(diffDays(item.startDate, from) / (7 * pos(s.everyWeeks))) - 1);
  const a = parseISODate(item.startDate);
  const b = parseISODate(from);
  if (s.type === 'monthly') {
    const months = (b.year - a.year) * 12 + (b.month - a.month);
    return Math.max(0, Math.floor(months / pos(s.everyMonths)) - 1);
  }
  return Math.max(0, b.year - a.year - 1);
}

/** Occurrences of one recurring item between from and to (inclusive), after its overrides. Skipped ones are left out. */
export function expandRecurring(
  item: RecurringItem,
  overrides: OccurrenceOverride[],
  from: ISODate,
  to: ISODate,
): Occurrence[] {
  if (compareDates(from, to) > 0) return [];
  if (item.endDate && compareDates(item.endDate, item.startDate) < 0) return [];
  if (item.count !== null && item.count !== undefined && item.count <= 0) return [];

  const mine = new Map<ISODate, OccurrenceOverride>();
  let lastOverridden: ISODate | null = null;
  let anyMove = false;
  for (const o of overrides) {
    if (o.recurringId !== item.id) continue;
    mine.set(o.originalDate, o);
    if (o.newDate) anyMove = true;
    if (lastOverridden === null || compareDates(o.originalDate, lastOverridden) > 0) lastOverridden = o.originalDate;
  }

  // Originals up to `to` matter, plus any overridden original that may have moved into range.
  let limit = to;
  if (anyMove && lastOverridden && compareDates(lastOverridden, limit) > 0) limit = lastOverridden;
  if (item.endDate && compareDates(item.endDate, limit) < 0) limit = item.endDate;

  const needCount = item.count !== null && item.count !== undefined;
  const startIndex = needCount || anyMove ? 0 : skipIndex(item, from);
  const out: Occurrence[] = [];
  let kept = 0; // originals produced so far (only meaningful when counting from index 0)

  for (let i = startIndex, n = 0; n < MAX_GENERATED; i++, n++) {
    const orig = candidate(item, i);
    if (compareDates(orig, item.startDate) < 0) continue;
    if (compareDates(orig, limit) > 0) break;
    kept++;
    if (needCount && kept > (item.count as number)) break;

    const o = mine.get(orig);
    if (o?.skip) continue;
    const date = o?.newDate ?? orig;
    if (compareDates(date, from) < 0 || compareDates(date, to) > 0) continue;
    out.push({
      recurringId: item.id,
      name: item.name,
      kind: item.kind,
      categoryId: item.categoryId,
      date,
      originalDate: orig,
      amount: o?.newAmount ?? item.amount,
      paid: o ? !!o.paid : false,
      overridden: !!o,
      ...(item.accountId ? { accountId: item.accountId } : {}),
      ...(item.cardId ? { cardId: item.cardId } : {}),
    });
  }
  return out.sort((a, b) => compareDates(a.date, b.date) || compareDates(a.originalDate, b.originalDate));
}

/** Occurrences of all recurring items between from and to (inclusive), sorted by date then name. */
export function occurrencesInRange(
  items: RecurringItem[],
  overrides: OccurrenceOverride[],
  from: ISODate,
  to: ISODate,
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const item of items) out.push(...expandRecurring(item, overrides, from, to));
  return out.sort(
    (a, b) =>
      compareDates(a.date, b.date) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
      compareDates(a.originalDate, b.originalDate),
  );
}

/** Monthly equivalent of a recurring item's amount, rounded to whole fils. */
export function monthlyEquivalent(item: RecurringItem): Fils {
  const s = item.schedule;
  if (s.type === 'weekly') return Math.round((item.amount * 52) / (12 * pos(s.everyWeeks)));
  if (s.type === 'monthly') return Math.round(item.amount / pos(s.everyMonths));
  return Math.round(item.amount / 12);
}
