// Balance history: what the balance WAS on each past day, built from what was recorded as having happened.
// Pure TypeScript on 'YYYY-MM-DD' strings and integer fils (same rules as forecast.ts).
import type { Fils, ForecastEvent, ISODate, PlanInput } from '@/types';
import { addDays, compareDates, diffDays } from '@/lib/dates';

import { occurrencesInRange } from './recurring';

export interface HistoryDay {
  date: ISODate;
  /** End-of-day balance. */
  balance: Fils;
  /** The recorded items of that day. */
  events: ForecastEvent[];
}

/**
 * End-of-day balances for the `days` days up to and including `today`.
 *
 * Each day is worked out from the nearest known balance: the latest balance snapshot on or before it, else the
 * settings' starting balance on its date (a snapshot on the same date wins); a day before every known balance is
 * worked backwards from the earliest one. Between a day and its anchor, only what was RECORDED as having happened is
 * applied: one-time items that are not planned, recurring occurrences marked paid, logged debt payments, cleared
 * cheques and imported transactions. Days before the earliest balance or recorded item are left out (nothing is
 * invented), and with no known balance at all the result is empty.
 */
export function balanceHistory(input: PlanInput, today: ISODate, days: number): HistoryDay[] {
  const count = Math.max(0, Math.floor(days));
  if (count === 0) return [];
  const from = addDays(today, -(count - 1));

  const anchorMap = new Map<ISODate, Fils>();
  if (input.settings) anchorMap.set(input.settings.startingBalanceDate, input.settings.startingBalance);
  for (const s of input.balanceSnapshots ?? []) anchorMap.set(s.date, s.balance);
  const anchors = [...anchorMap].map(([date, balance]) => ({ date, balance })).sort((a, b) => compareDates(a.date, b.date));
  if (anchors.length === 0) return [];

  // Every recorded flow between the earliest date that matters and today.
  const lo = compareDates(anchors[0].date, from) < 0 ? anchors[0].date : from;
  const flows: ForecastEvent[] = [];
  if (compareDates(lo, today) <= 0) {
    for (const o of occurrencesInRange(input.recurring, input.overrides, lo, today)) {
      if (o.paid) flows.push({ date: o.date, label: o.name, kind: o.kind, amount: o.amount, source: 'recurring', refId: o.recurringId });
    }
    for (const t of input.transactions) {
      if (t.planned || compareDates(t.date, lo) < 0 || compareDates(t.date, today) > 0) continue;
      flows.push({ date: t.date, label: t.description, kind: t.kind, amount: t.amount, source: 'transaction', refId: t.id });
    }
    const names = new Map(input.debts.map((d) => [d.id, d.name]));
    for (const p of input.debtPayments) {
      if (!names.has(p.debtId) || compareDates(p.date, lo) < 0 || compareDates(p.date, today) > 0) continue;
      flows.push({ date: p.date, label: `${names.get(p.debtId)} payment`, kind: 'cost', amount: p.amount, source: 'debt', refId: p.debtId });
    }
    for (const c of input.cheques ?? []) {
      if (c.status !== 'cleared' || compareDates(c.date, lo) < 0 || compareDates(c.date, today) > 0) continue;
      flows.push({ date: c.date, label: `Cheque to ${c.payee}`, kind: 'cost', amount: c.amount, source: 'cheque', refId: c.id });
    }
  }
  const byDay = new Map<ISODate, ForecastEvent[]>();
  for (const f of flows) {
    const list = byDay.get(f.date);
    if (list) list.push(f);
    else byDay.set(f.date, [f]);
  }

  // Running total of recorded flows (income +, costs -) at the end of every day from `lo` to today.
  const span = diffDays(lo, today) + 1;
  const cum = new Map<ISODate, Fils>();
  let run = 0;
  for (let i = 0, d = lo; i < Math.max(span, 0); i++, d = addDays(d, 1)) {
    for (const f of byDay.get(d) ?? []) run += f.kind === 'income' ? f.amount : -f.amount;
    cum.set(d, run);
  }
  const cumAt = (d: ISODate): Fils => {
    // An anchor after today is outside the walk: use the total at today.
    const v = cum.get(compareDates(d, today) > 0 ? today : d);
    return v ?? 0;
  };

  // The first day we can speak for: the earliest known balance or recorded item.
  let first = anchors[0].date;
  for (const f of flows) if (compareDates(f.date, first) < 0) first = f.date;
  const start = compareDates(first, from) > 0 ? first : from;

  const out: HistoryDay[] = [];
  for (let d = start; compareDates(d, today) <= 0; d = addDays(d, 1)) {
    let anchor = anchors[0];
    for (const a of anchors) if (compareDates(a.date, d) <= 0) anchor = a;
    out.push({ date: d, balance: anchor.balance + cumAt(d) - cumAt(anchor.date), events: byDay.get(d) ?? [] });
  }
  return out;
}
