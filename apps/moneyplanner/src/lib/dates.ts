// Calendar-date helpers on 'YYYY-MM-DD' strings. All maths is done in UTC on
// date-only values, so time zones and daylight saving can't shift a day.
import type { ISODate, MonthKey } from '@/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(year: number, month: number, day: number): ISODate {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseISODate(d: ISODate): { year: number; month: number; day: number } {
  const [year, month, day] = d.split('-').map(Number);
  return { year, month, day };
}

export function isValidISODate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const { year, month, day } = parseISODate(d);
  return year >= 1900 && year <= 2200 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

const toUTC = (d: ISODate) => {
  const { year, month, day } = parseISODate(d);
  return Date.UTC(year, month - 1, day);
};
const fromUTC = (ms: number): ISODate => {
  const x = new Date(ms);
  return toISODate(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
};

/** Today's date in the device's local time zone. */
export function today(now: Date = new Date()): ISODate {
  return toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUTC(toUTC(d) + n * 86_400_000);
}

/** Adds months, clamping the day to the target month's length (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(d: ISODate, n: number): ISODate {
  const { year, month, day } = parseISODate(d);
  const total = year * 12 + (month - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return toISODate(y, m, Math.min(day, daysInMonth(y, m)));
}

/** Whole days from a to b (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(d: ISODate): number {
  return new Date(toUTC(d)).getUTCDay();
}

export function monthKey(d: ISODate): MonthKey {
  return d.slice(0, 7);
}

export function monthStart(m: MonthKey): ISODate {
  return `${m}-01`;
}

export function monthEnd(m: MonthKey): ISODate {
  const [y, mo] = m.split('-').map(Number);
  return toISODate(y, mo, daysInMonth(y, mo));
}

export function addMonthKey(m: MonthKey, n: number): MonthKey {
  return monthKey(addMonths(monthStart(m), n));
}

/** 'YYYY-MM' -> 'Mar 2026'. */
export function formatMonth(m: MonthKey): string {
  const [y, mo] = m.split('-').map(Number);
  return `${MONTHS[mo - 1]} ${y}`;
}

/** 'YYYY-MM-DD' -> '14 Mar 2026'. */
export function formatDate(d: ISODate): string {
  const { year, month, day } = parseISODate(d);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const compareDates = (a: ISODate, b: ISODate) => (a < b ? -1 : a > b ? 1 : 0);
