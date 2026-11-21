// The planning engine: pure TypeScript on 'YYYY-MM-DD' strings and integer fils.
// No React, no storage, no Date objects in outputs.
import type {
  Fils,
  Forecast,
  ForecastDay,
  ForecastEvent,
  ForecastMonth,
  ISODate,
  MonthKey,
  MonthSummary,
  Occurrence,
  OccurrenceOverride,
  PlanInput,
  RecurringItem,
  Transaction,
  YearSummary,
} from '@/types';
import {
  addDays,
  addMonthKey,
  compareDates,
  daysInMonth,
  diffDays,
  monthEnd,
  monthKey,
  monthStart,
  parseISODate,
  toISODate,
} from '@/lib/dates';

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

// ---- Summaries ----

/** Key used in `costsByCategory` for costs without a category. */
export const UNCATEGORIZED = 'uncategorized';

function summarize(month: MonthKey, occs: Occurrence[], txs: Transaction[]): MonthSummary {
  let recurringIncome = 0;
  let oneTimeIncome = 0;
  let recurringCosts = 0;
  let oneTimeCosts = 0;
  const costsByCategory: Record<string, Fils> = {};
  const addCost = (cat: string | null, amt: Fils) => {
    const k = cat ?? UNCATEGORIZED;
    costsByCategory[k] = (costsByCategory[k] ?? 0) + amt;
  };
  for (const o of occs) {
    if (o.kind === 'income') recurringIncome += o.amount;
    else {
      recurringCosts += o.amount;
      addCost(o.categoryId, o.amount);
    }
  }
  for (const t of txs) {
    if (t.kind === 'income') oneTimeIncome += t.amount;
    else {
      oneTimeCosts += t.amount;
      addCost(t.categoryId, t.amount);
    }
  }
  const totalIncome = recurringIncome + oneTimeIncome;
  const totalSpend = recurringCosts + oneTimeCosts;
  return {
    month,
    recurringIncome,
    oneTimeIncome,
    totalIncome,
    recurringCosts,
    oneTimeCosts,
    totalSpend,
    freeMoney: totalIncome - totalSpend,
    spentPct: totalIncome > 0 ? Math.round((totalSpend / totalIncome) * 1000) / 10 : null,
    costsByCategory,
  };
}

/** The spreadsheet's month summary for one month. */
export function monthSummary(month: MonthKey, input: PlanInput): MonthSummary {
  const from = monthStart(month);
  const to = monthEnd(month);
  const occs = occurrencesInRange(input.recurring, input.overrides, from, to);
  const txs = input.transactions.filter((t) => monthKey(t.date) === month);
  return summarize(month, occs, txs);
}

/** The spreadsheet's year dashboard. */
export function yearSummary(year: number, input: PlanInput): YearSummary {
  const keys: MonthKey[] = [];
  for (let m = 1; m <= 12; m++) keys.push(`${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}`);
  const occs = occurrencesInRange(input.recurring, input.overrides, monthStart(keys[0]), monthEnd(keys[11]));
  const occBy = new Map<MonthKey, Occurrence[]>();
  const txBy = new Map<MonthKey, Transaction[]>();
  for (const o of occs) push(occBy, monthKey(o.date), o);
  for (const t of input.transactions) push(txBy, monthKey(t.date), t);

  const months = keys.map((k) => summarize(k, occBy.get(k) ?? [], txBy.get(k) ?? []));
  let totalIncome = 0;
  let totalSpend = 0;
  let running = 0;
  let highest: MonthKey | null = null;
  let highestSpend = 0;
  const cumulativeFreeMoney: Fils[] = [];
  const costsByCategory: Record<string, Fils> = {};
  for (const m of months) {
    totalIncome += m.totalIncome;
    totalSpend += m.totalSpend;
    running += m.freeMoney;
    cumulativeFreeMoney.push(running);
    if (m.totalSpend > highestSpend) {
      highestSpend = m.totalSpend;
      highest = m.month;
    }
    for (const [c, v] of Object.entries(m.costsByCategory)) costsByCategory[c] = (costsByCategory[c] ?? 0) + v;
  }
  return {
    year,
    months,
    totalIncome,
    totalSpend,
    freeMoney: totalIncome - totalSpend,
    cumulativeFreeMoney,
    averageMonthlySpend: Math.round(totalSpend / 12),
    highestSpendMonth: highest,
    costsByCategory,
  };
}

function push<K, V>(map: Map<K, V[]>, key: K, v: V) {
  const arr = map.get(key);
  if (arr) arr.push(v);
  else map.set(key, [v]);
}

// ---- Forecast ----

/**
 * Balance forecast from `today` (or the starting balance date, if later):
 * `days` daily entries (default 60) and `months` monthly entries (default 24).
 */
export function forecast(input: PlanInput, opts: { today: ISODate; days?: number; months?: number }): Forecast {
  const { settings } = input;
  const days = Math.max(0, Math.floor(opts.days ?? 60));
  const months = Math.max(0, Math.floor(opts.months ?? 24));
  const sbd = settings.startingBalanceDate;
  const asOf = compareDates(opts.today, sbd) >= 0 ? opts.today : sbd;
  const from = addDays(asOf, 1);

  const firstMonth = monthKey(from);
  const monthsEnd = months > 0 ? monthEnd(addMonthKey(firstMonth, months - 1)) : addDays(from, -1);
  const daysEnd = addDays(from, days - 1);
  const horizon = compareDates(monthsEnd, daysEnd) > 0 ? monthsEnd : daysEnd;

  // Bucket every flow after the starting balance date by day.
  const flowFrom = addDays(sbd, 1);
  const byDay = new Map<ISODate, ForecastEvent[]>();
  let balanceAsOf = settings.startingBalance;
  const add = (e: ForecastEvent) => {
    if (compareDates(e.date, asOf) <= 0) balanceAsOf += e.kind === 'income' ? e.amount : -e.amount;
    else push(byDay, e.date, e);
  };
  const flowTo = compareDates(horizon, asOf) > 0 ? horizon : asOf;
  if (compareDates(flowFrom, flowTo) <= 0) {
    for (const o of occurrencesInRange(input.recurring, input.overrides, flowFrom, flowTo)) {
      add({ date: o.date, label: o.name, kind: o.kind, amount: o.amount, source: 'recurring', refId: o.recurringId });
    }
    for (const t of input.transactions) {
      if (compareDates(t.date, flowFrom) < 0 || compareDates(t.date, flowTo) > 0) continue;
      add({ date: t.date, label: t.description, kind: t.kind, amount: t.amount, source: 'transaction', refId: t.id });
    }
  }

  const dayList: ForecastDay[] = [];
  const monthList: ForecastMonth[] = [];
  let balance = balanceAsOf;
  let lowest: { date: ISODate; balance: Fils } | null = null;
  let firstBelowBuffer: { date: ISODate; balance: Fils } | null = null;
  let cur: ForecastMonth | null = null;

  const total = diffDays(from, horizon) + 1;
  let date = from;
  for (let i = 0; i < total; i++, date = addDays(date, 1)) {
    const events = byDay.get(date) ?? [];
    let inflow = 0;
    let outflow = 0;
    for (const e of events) {
      if (e.kind === 'income') inflow += e.amount;
      else outflow += e.amount;
    }
    const startOfDay = balance;
    balance += inflow - outflow;

    if (i < days) {
      dayList.push({ date, inflow, outflow, balance, events });
      if (!lowest || balance < lowest.balance) lowest = { date, balance };
      if (!firstBelowBuffer && balance < settings.buffer) firstBelowBuffer = { date, balance };
    }

    const mk = monthKey(date);
    if (!cur || cur.month !== mk) {
      if (monthList.length >= months) continue;
      cur = { month: mk, startBalance: startOfDay, income: 0, spend: 0, endBalance: balance, minBalance: balance, minBalanceDate: date };
      monthList.push(cur);
    }
    cur.income += inflow;
    cur.spend += outflow;
    cur.endBalance = balance;
    if (balance < cur.minBalance) {
      cur.minBalance = balance;
      cur.minBalanceDate = date;
    }
  }

  return {
    from,
    asOf,
    balanceAsOf,
    days: dayList,
    months: monthList,
    lowest: lowest ?? { date: asOf, balance: balanceAsOf },
    firstBelowBuffer,
  };
}
