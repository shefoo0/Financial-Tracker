// "Safe to spend until payday": what is left after the bills that fall before the next salary.
import type { Fils, ISODate, PlanInput } from '@/types';
import { addDays, compareDates, daysInMonth, diffDays, monthEnd, monthKey, parseISODate, toISODate } from '@/lib/dates';

import { forecast } from './forecast';
import { monthlyEquivalent, occurrencesInRange } from './recurring';

export interface PaydayItem {
  date: ISODate;
  label: string;
  amount: Fils;
}

export interface PaydayView {
  /** The next salary date, or null when nothing says when (the view then runs to the end of the month). */
  nextPayday: ISODate | null;
  /** Days from today up to the payday (or the end of the month), counting today. Always at least 1. */
  daysLeft: number;
  balanceNow: Fils;
  billsBeforePayday: Fils;
  /** The part of the bills that are planned one-time costs. */
  plannedBeforePayday: Fils;
  buffer: Fils;
  /** Balance today minus the bills before payday minus the buffer. Can be negative. */
  safeToSpend: Fils;
  /** Safe to spend per day, rounded down, never below 0. */
  perDay: Fils;
  /** The outflows from tomorrow to the day before payday, by date. */
  items: PaydayItem[];
}

/** The next date after `today` that falls on `day` of a month (clamped to short months). */
function nextDayOfMonth(day: number, today: ISODate): ISODate {
  let { year, month } = parseISODate(today);
  for (let i = 0; i < 3; i++) {
    const d = toISODate(year, month, Math.min(day, daysInMonth(year, month)));
    if (compareDates(d, today) > 0) return d;
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return addDays(today, 30);
}

/** Next occurrence of the biggest monthly income (the salary) after today, else the usual payday setting. */
function findNextPayday(input: PlanInput, today: ISODate): ISODate | null {
  const incomes = input.recurring.filter((r) => r.kind === 'income');
  if (incomes.length > 0) {
    const salary = incomes.reduce((best, r) => (monthlyEquivalent(r) > monthlyEquivalent(best) ? r : best));
    const next = occurrencesInRange([salary], input.overrides, addDays(today, 1), addDays(today, 400))[0];
    if (next) return next.date;
  }
  const day = input.settings.payday;
  return day != null && day >= 1 && day <= 31 ? nextDayOfMonth(day, today) : null;
}

export function paydayView(input: PlanInput, today: ISODate): PaydayView {
  const nextPayday = findNextPayday(input, today);
  // The first day that is no longer part of the period.
  const boundary = nextPayday ?? addDays(monthEnd(monthKey(today)), 1);
  const daysLeft = Math.max(1, diffDays(today, boundary));
  const fc = forecast(input, { today, days: Math.max(1, daysLeft), months: 0 });
  const buffer = input.settings.buffer;

  const items: PaydayItem[] = [];
  let bills = 0;
  let planned = 0;
  const plannedIds = new Set(input.transactions.filter((t) => t.planned).map((t) => t.id));
  for (const day of fc.days) {
    if (compareDates(day.date, boundary) >= 0) break;
    for (const e of day.events) {
      if (e.kind !== 'cost') continue;
      bills += e.amount;
      if (e.source === 'transaction' && plannedIds.has(e.refId)) planned += e.amount;
      items.push({ date: e.date, label: e.label, amount: e.amount });
    }
  }
  const safeToSpend = fc.balanceAsOf - bills - buffer;
  return {
    nextPayday,
    daysLeft,
    balanceNow: fc.balanceAsOf,
    billsBeforePayday: bills,
    plannedBeforePayday: planned,
    buffer,
    safeToSpend,
    perDay: Math.max(0, Math.floor(safeToSpend / daysLeft)),
    items,
  };
}
