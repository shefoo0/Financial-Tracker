// Cheque helpers: validation, series dates, grouping and the "covered or short" fact.
import { forecast } from '@/engine';
import { addDays, addMonths, compareDates, diffDays, isValidISODate } from '@/lib/dates';
import { newId } from '@/lib/id';
import type { Cheque, ChequeStatus, Fils, ISODate, PlanInput } from '@/types';

export const MAX_SERIES_COUNT = 24;
export const MAX_SERIES_EVERY = 12;

export const STATUS_LABEL: Record<ChequeStatus, string> = { upcoming: 'Upcoming', cleared: 'Cleared', cancelled: 'Cancelled' };

export interface ChequeForm {
  payee: string;
  amount: Fils | null;
  date: ISODate;
  purpose: string;
  status: ChequeStatus;
  note: string;
}
export type ChequeField = 'payee' | 'amount' | 'date';

export function emptyChequeForm(now: ISODate): ChequeForm {
  return { payee: '', amount: null, date: now, purpose: '', status: 'upcoming', note: '' };
}

export function formFromCheque(c: Cheque): ChequeForm {
  return { payee: c.payee, amount: c.amount, date: c.date, purpose: c.purpose, status: c.status, note: c.note };
}

export function validateCheque(form: ChequeForm, base: Pick<Cheque, 'id'> & Partial<Cheque>): { cheque: Cheque | null; errors: Partial<Record<ChequeField, string>> } {
  const errors: Partial<Record<ChequeField, string>> = {};
  if (!form.payee.trim()) errors.payee = 'Enter who the cheque is for.';
  if (form.amount == null || form.amount <= 0) errors.amount = 'Enter an amount greater than zero.';
  if (!isValidISODate(form.date)) errors.date = 'Choose the date on the cheque.';
  if (Object.keys(errors).length) return { cheque: null, errors };
  return {
    cheque: {
      id: base.id,
      seriesId: base.seriesId ?? null,
      payee: form.payee.trim(),
      amount: form.amount as Fils,
      date: form.date,
      purpose: form.purpose.trim(),
      status: form.status,
      note: form.note.trim(),
    },
    errors,
  };
}

/** Whole number in [min, max] from typed text, or null. */
export function parseWhole(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= min && n <= max ? n : null;
}

/** Dates of a series: first, then every `everyMonths` months; days 29-31 clamp to month end (from the first date, so 31 Jan -> 28 Feb -> 31 Mar). */
export function seriesDates(first: ISODate, count: number, everyMonths: number): ISODate[] {
  return Array.from({ length: count }, (_, i) => addMonths(first, i * everyMonths));
}

export interface SeriesForm {
  payee: string;
  amount: Fils | null;
  purpose: string;
  count: string;
  every: string;
  firstDate: ISODate;
}
export type SeriesField = 'payee' | 'amount' | 'count' | 'every' | 'firstDate';

export function validateSeries(form: SeriesForm): { cheques: Cheque[] | null; errors: Partial<Record<SeriesField, string>> } {
  const errors: Partial<Record<SeriesField, string>> = {};
  if (!form.payee.trim()) errors.payee = 'Enter who the cheques are for.';
  if (form.amount == null || form.amount <= 0) errors.amount = 'Enter an amount greater than zero.';
  const count = parseWhole(form.count, 1, MAX_SERIES_COUNT);
  if (count == null) errors.count = `Enter a whole number from 1 to ${MAX_SERIES_COUNT}.`;
  const every = parseWhole(form.every, 1, MAX_SERIES_EVERY);
  if (every == null) errors.every = `Enter a whole number from 1 to ${MAX_SERIES_EVERY}.`;
  if (!isValidISODate(form.firstDate)) errors.firstDate = 'Choose the date of the first cheque.';
  if (Object.keys(errors).length || count == null || every == null) return { cheques: null, errors };
  const seriesId = newId();
  const cheques = seriesDates(form.firstDate, count, every).map<Cheque>((date) => ({
    id: newId(),
    payee: form.payee.trim(),
    amount: form.amount as Fils,
    date,
    purpose: form.purpose.trim(),
    status: 'upcoming',
    seriesId,
    note: '',
  }));
  return { cheques, errors };
}

/** Cheques in the same series, later than `item`, still upcoming. */
export function laterInSeries(all: Cheque[], item: Cheque): Cheque[] {
  if (!item.seriesId) return [];
  return all.filter((c) => c.seriesId === item.seriesId && c.id !== item.id && c.status === 'upcoming' && compareDates(c.date, item.date) > 0);
}

export interface ChequeGroups {
  upcoming: Cheque[];
  cleared: Cheque[];
  cancelled: Cheque[];
}

const byDate = (a: Cheque, b: Cheque) => compareDates(a.date, b.date) || a.payee.localeCompare(b.payee);

export function groupCheques(all: Cheque[]): ChequeGroups {
  const pick = (s: ChequeStatus) => all.filter((c) => c.status === s);
  return {
    upcoming: pick('upcoming').sort(byDate),
    // Most recent first for history.
    cleared: pick('cleared').sort((a, b) => byDate(b, a)),
    cancelled: pick('cancelled').sort((a, b) => byDate(b, a)),
  };
}

export function inDaysLabel(date: ISODate, now: ISODate): string {
  const n = diffDays(now, date);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return '1 day ago';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export interface Coverage {
  /** Projected balance at the end of the day before the cheque date. */
  balance: Fils;
  covered: boolean;
  /** Fils missing when short, else 0. */
  shortBy: Fils;
}

/**
 * For each upcoming cheque dated after today: the projected balance at the
 * start of its date (end of the previous day) and whether it covers the amount.
 * Cheques on or before today get no entry (the balance for that day is not projected).
 */
export function chequeCoverage(input: PlanInput, upcoming: Cheque[], now: ISODate): Map<string, Coverage> {
  const result = new Map<string, Coverage>();
  if (upcoming.length === 0) return result;
  const last = upcoming.reduce((m, c) => (compareDates(c.date, m) > 0 ? c.date : m), upcoming[0].date);
  const f = forecast(input, { today: now, days: Math.min(1100, Math.max(1, diffDays(now, last) + 1)), months: 0 });
  for (const c of upcoming) {
    const prev = addDays(c.date, -1);
    let balance: Fils | null = null;
    if (prev === f.asOf) balance = f.balanceAsOf;
    else if (compareDates(prev, f.asOf) > 0) balance = f.days[diffDays(f.from, prev)]?.balance ?? null;
    if (balance == null) continue;
    result.set(c.id, { balance, covered: balance >= c.amount, shortBy: Math.max(0, c.amount - balance) });
  }
  return result;
}
