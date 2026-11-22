// Quarterly and yearly reports (Pro): pure functions on a PlanInput, integer fils, 'YYYY-MM-DD' dates.
// Facts only: the wording never gives advice.
import type { Fils, ISODate, MonthKey, PlanInput } from '@/types';
import { addDays, addMonthKey, addMonths, compareDates, diffDays, monthEnd, monthStart, MONTHS, toISODate } from '@/lib/dates';
import { formatMoneyTrim, percent } from '@/lib/money';

import { UNCATEGORIZED } from './forecast';
import { occurrencesInRange } from './recurring';
import { activeDebts, debtLifetime, debtOutflows, debtSchedule, interestFor } from './debts/schedule';
import { chequesInRange } from './debts/cheques';
import { debtStats } from './debts/stats';

// ---- Types ----

export type ReportKind = 'quarter' | 'year';

export interface ReportPeriod {
  kind: ReportKind;
  /** '2026-Q3' or '2026'. */
  key: string;
  /** 'Q3 2026' or '2026'. */
  label: string;
  from: ISODate;
  /** Last day covered: the end of the period, or today for the current period ("so far"). */
  to: ISODate;
  isCurrent: boolean;
}

/** A figure compared with an earlier one. `pct` is null when the earlier figure was 0. */
export interface Delta {
  previous: Fils;
  change: Fils;
  pct: number | null;
}

export interface Comparison {
  /** What it is compared with: 'Q2' or 'Q3 2025' or '2025'. */
  label: string;
  income: Delta;
  spending: Delta;
  saved: Delta;
  /** Savings rate of the earlier period and the change in percentage points (null when either has no income). */
  savingsRate: { previous: number | null; changePoints: number | null };
}

export interface ReportSummary {
  income: Fils;
  spending: Fils;
  saved: Fils;
  /** saved / income in %, null without income. */
  savingsRate: number | null;
  vsPrevious: Comparison | null;
  vsLastYear: Comparison | null;
}

export interface ReportRow {
  id: string;
  name: string;
  amount: Fils;
  /** Same row in the previous period; null when there is no previous period with data. */
  previous: Fils | null;
  change: Fils | null;
  pct: number | null;
}

export interface CashFlow {
  startBalance: Fils;
  endBalance: Fils;
  recurringIncome: Fils;
  recurringCosts: Fils;
  /** One-time income minus one-time costs. */
  oneTimeNet: Fils;
  debtPayments: Fils;
  cheques: Fils;
}

export interface DebtsSection {
  owedStart: Fils;
  owedEnd: Fils;
  /** Debt payments made or scheduled in the period. */
  paid: Fils;
  /** Estimated from the interest rates entered; null when no rate is set. */
  interestEstimate: Fils | null;
  /** Debt payments as % of income in the period, and in the previous period (null without income). */
  dtiPct: number | null;
  dtiPreviousPct: number | null;
  /** Debt-free date as it stood at the end of the period, and now. Null when not known. */
  debtFreeThen: ISODate | null;
  debtFreeNow: ISODate | null;
}

export interface KeyFigures {
  savingsRate: number | null;
  debtToIncomePct: number | null;
  spendingPct: number | null;
  biggestCategory: { name: string; amount: Fils; sharePct: number | null } | null;
  /** Fixed = recurring costs, debt payments and cheques; flexible = one-time costs. */
  fixedCosts: Fils;
  flexibleCosts: Fils;
  /** End balance / average monthly spending, one decimal; null without spending. */
  monthsOfBuffer: number | null;
}

export interface QuarterColumn {
  key: string;
  label: string;
  income: Fils;
  spending: Fils;
  saved: Fils;
  /** False for a quarter that has not started or has no entries. */
  hasData: boolean;
}

export interface MonthResult {
  month: MonthKey;
  label: string;
  saved: Fils;
}

export interface Report {
  period: ReportPeriod;
  title: string;
  /** '1 Jul - 30 Sep 2026' (adds "so far" for the current period). */
  rangeText: string;
  currency: string;
  generatedOn: ISODate;
  isSample: boolean;
  /** False when the period has no income and no spending. */
  hasData: boolean;
  summary: ReportSummary;
  income: ReportRow[];
  spending: ReportRow[];
  cashFlow: CashFlow;
  /** Null when there are no debts. */
  debts: DebtsSection | null;
  keyFigures: KeyFigures;
  /** Up to 5 factual lines. */
  highlights: string[];
  /** Year reports only. */
  quarters: QuarterColumn[] | null;
  bestMonth: MonthResult | null;
  worstMonth: MonthResult | null;
}

// ---- Periods ----

const pad = (n: number) => String(n).padStart(2, '0');
const quarterOf = (d: ISODate) => Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1;

function makePeriod(kind: ReportKind, year: number, q: number, todayStr: ISODate): ReportPeriod {
  const from = kind === 'year' ? `${year}-01-01` : `${year}-${pad((q - 1) * 3 + 1)}-01`;
  const end = kind === 'year' ? `${year}-12-31` : monthEnd(`${year}-${pad(q * 3)}`);
  const isCurrent = compareDates(from, todayStr) <= 0 && compareDates(todayStr, end) <= 0;
  return {
    kind,
    key: kind === 'year' ? String(year) : `${year}-Q${q}`,
    label: kind === 'year' ? String(year) : `Q${q} ${year}`,
    from,
    to: isCurrent ? todayStr : end,
    isCurrent,
  };
}

/** The period a key like '2026-Q3' or '2026' stands for, or null when the key is not valid. */
export function periodForKey(key: string, todayStr: ISODate): ReportPeriod | null {
  const q = /^(\d{4})-Q([1-4])$/.exec(key);
  if (q) return makePeriod('quarter', Number(q[1]), Number(q[2]), todayStr);
  if (/^\d{4}$/.test(key)) return makePeriod('year', Number(key), 1, todayStr);
  return null;
}

/** The period `n` quarters (or years) away from the given one, as a full period. */
function shifted(p: ReportPeriod, n: number, todayStr: ISODate): ReportPeriod {
  const year = Number(p.from.slice(0, 4));
  if (p.kind === 'year') return makePeriod('year', year + n, 1, todayStr);
  const idx = year * 4 + (quarterOf(p.from) - 1) + n;
  return makePeriod('quarter', Math.floor(idx / 4), (idx % 4) + 1, todayStr);
}

function earliestDate(input: PlanInput, todayStr: ISODate): ISODate | null {
  const dates: ISODate[] = [];
  for (const t of input.transactions) dates.push(t.date);
  for (const r of input.recurring) dates.push(r.startDate);
  for (const d of activeDebts(input)) dates.push(d.type === 'plan' ? d.firstPaymentDate : d.balanceDate);
  for (const c of input.cheques ?? []) dates.push(c.date);
  const usable = dates.filter((d) => compareDates(d, todayStr) <= 0).sort(compareDates);
  return usable[0] ?? null;
}

/**
 * Quarters and years that have income or spending, up to today. The current quarter and year come
 * first (when there is any data at all), then past quarters, then past years, newest first.
 * Looks back at most 10 years.
 */
export function periodsWithData(input: PlanInput, todayStr: ISODate): ReportPeriod[] {
  const earliest = earliestDate(input, todayStr);
  if (!earliest) return [];
  const thisYear = Number(todayStr.slice(0, 4));
  const firstYear = Math.max(Number(earliest.slice(0, 4)), thisYear - 10);
  const quarters: ReportPeriod[] = [];
  const years: ReportPeriod[] = [];
  for (let y = thisYear; y >= firstYear; y--) {
    const yearP = makePeriod('year', y, 1, todayStr);
    if (!hasData(flowsIn(input, yearP.from, yearP.to))) continue;
    years.push(yearP);
    for (let q = 4; q >= 1; q--) {
      const p = makePeriod('quarter', y, q, todayStr);
      if (compareDates(p.from, todayStr) > 0) continue;
      if (hasData(flowsIn(input, p.from, p.to))) quarters.push(p);
    }
  }
  if (quarters.length === 0) return [];
  const currentQ = makePeriod('quarter', thisYear, quarterOf(todayStr), todayStr);
  const currentY = makePeriod('year', thisYear, 1, todayStr);
  const rest = (list: ReportPeriod[]) => list.filter((p) => !p.isCurrent);
  return [currentQ, currentY, ...rest(quarters), ...rest(years)];
}

// ---- Flows ----

interface Flows {
  recurringIncome: Fils;
  oneTimeIncome: Fils;
  recurringCosts: Fils;
  oneTimeCosts: Fils;
  debt: Fils;
  cheques: Fils;
  income: Fils;
  spending: Fils;
  incomeBy: Map<string, { name: string; amount: Fils }>;
  costBy: Map<string, { name: string; amount: Fils }>;
}

const hasData = (f: Flows) => f.income !== 0 || f.spending !== 0;

function bump(map: Map<string, { name: string; amount: Fils }>, id: string, name: string, amount: Fils) {
  const cur = map.get(id);
  if (cur) cur.amount += amount;
  else map.set(id, { name, amount });
}

/** Everything that moves money between two dates (inclusive), the same flows the forecast uses. */
function flowsIn(input: PlanInput, from: ISODate, to: ISODate): Flows {
  const f: Flows = {
    recurringIncome: 0,
    oneTimeIncome: 0,
    recurringCosts: 0,
    oneTimeCosts: 0,
    debt: 0,
    cheques: 0,
    income: 0,
    spending: 0,
    incomeBy: new Map(),
    costBy: new Map(),
  };
  if (compareDates(from, to) > 0) return f;
  const catNames = new Map(input.categories.map((c) => [c.id, c.name]));
  const costKey = (id: string | null) => (id && catNames.has(id) ? id : UNCATEGORIZED);
  const costName = (id: string) => catNames.get(id) ?? 'Uncategorized';

  for (const o of occurrencesInRange(input.recurring, input.overrides, from, to)) {
    if (o.kind === 'income') {
      f.recurringIncome += o.amount;
      bump(f.incomeBy, `rec:${o.recurringId}`, o.name, o.amount);
    } else {
      f.recurringCosts += o.amount;
      const k = costKey(o.categoryId);
      bump(f.costBy, k, costName(k), o.amount);
    }
  }
  for (const t of input.transactions) {
    if (compareDates(t.date, from) < 0 || compareDates(t.date, to) > 0) continue;
    if (t.kind === 'income') {
      f.oneTimeIncome += t.amount;
      const named = t.categoryId && catNames.has(t.categoryId);
      bump(f.incomeBy, named ? `cat:${t.categoryId}` : 'one-time', named ? catNames.get(t.categoryId as string)! : 'Other income', t.amount);
    } else {
      f.oneTimeCosts += t.amount;
      const k = costKey(t.categoryId);
      bump(f.costBy, k, costName(k), t.amount);
    }
  }
  f.debt = debtOutflows(input, from, to).reduce((s, p) => s + p.amount, 0);
  f.cheques = chequesInRange(input, from, to).reduce((s, c) => s + c.amount, 0);
  if (f.debt > 0) f.costBy.set('debts', { name: 'Debt payments', amount: f.debt });
  if (f.cheques > 0) f.costBy.set('cheques', { name: 'Cheques', amount: f.cheques });
  f.income = f.recurringIncome + f.oneTimeIncome;
  f.spending = f.recurringCosts + f.oneTimeCosts + f.debt + f.cheques;
  return f;
}

/** Bank balance at the end of a date, from the starting balance and the same flows as the forecast. */
function balanceAt(input: PlanInput, date: ISODate): Fils {
  const { startingBalance, startingBalanceDate } = input.settings;
  const net = (from: ISODate, to: ISODate) => {
    const f = flowsIn(input, from, to);
    return f.income - f.spending;
  };
  if (compareDates(date, startingBalanceDate) >= 0) return startingBalance + net(addDays(startingBalanceDate, 1), date);
  return startingBalance - net(addDays(date, 1), startingBalanceDate);
}

// ---- Debts ----

const FAR_YEARS = 30;

/** What is owed on one debt at the end of a date (an estimate: it works back from the schedule). */
function owedAt(input: PlanInput, debtId: string, date: ISODate, todayStr: ISODate): Fils {
  const debt = activeDebts(input).find((d) => d.id === debtId);
  if (!debt) return 0;
  const far = addMonths(todayStr, FAR_YEARS * 12);
  const life = debtLifetime(debt, input, far);
  const after = addDays(date, 1);
  const scheduled = life.payments.filter((p) => compareDates(p.date, after) >= 0).reduce((s, p) => s + p.amount, 0);
  const start = debt.type === 'plan' ? '0000-01-01' : debt.balanceDate;
  const logged = (input.debtPayments ?? [])
    .filter((p) => p.debtId === debtId && compareDates(p.date, after) >= 0 && compareDates(p.date, start) >= 0)
    .reduce((s, p) => s + p.amount, 0);
  return Math.max(0, life.remaining + scheduled + logged);
}

function owedTotal(input: PlanInput, date: ISODate, todayStr: ISODate): Fils {
  const debts = activeDebts(input);
  // A plan on a card is already inside the card's balance.
  return debts
    .filter((d) => !(d.type === 'plan' && d.cardId && debts.some((c) => c.id === d.cardId && c.type === 'card')))
    .reduce((s, d) => s + owedAt(input, d.id, date, todayStr), 0);
}

function interestEstimate(input: PlanInput, from: ISODate, to: ISODate, todayStr: ISODate): Fils | null {
  let any = false;
  let total = 0;
  for (const d of activeDebts(input)) {
    if (d.type === 'loan' && d.annualRatePct && d.annualRatePct > 0) {
      any = true;
      for (const p of debtSchedule(d, input, from, to)) {
        total += Math.round((owedAt(input, d.id, addDays(p.date, -1), todayStr) * d.annualRatePct) / 12 / 100);
      }
    } else if (d.type === 'card' && d.plan !== 'full' && d.monthlyRatePct > 0) {
      any = true;
      for (const p of debtSchedule(d, input, from, to)) total += interestFor(d, owedAt(input, d.id, p.date, todayStr));
    }
  }
  return any ? total : null;
}

// ---- Report ----

const delta = (now: Fils, previous: Fils): Delta => ({
  previous,
  change: now - previous,
  pct: previous === 0 ? null : Math.round(((now - previous) / Math.abs(previous)) * 1000) / 10,
});

const rate = (income: Fils, spending: Fils): number | null => percent(income - spending, income);

function compare(now: Flows, then: Flows, label: string): Comparison {
  const a = rate(now.income, now.spending);
  const b = rate(then.income, then.spending);
  return {
    label,
    income: delta(now.income, then.income),
    spending: delta(now.spending, then.spending),
    saved: delta(now.income - now.spending, then.income - then.spending),
    savingsRate: { previous: b, changePoints: a != null && b != null ? Math.round((a - b) * 10) / 10 : null },
  };
}

/** The window of an earlier period to compare with: the whole of it, or the same elapsed part when the current one is "so far". */
function windowOf(earlier: ReportPeriod, p: ReportPeriod, shiftMonths: number): { from: ISODate; to: ISODate } {
  if (!p.isCurrent) return { from: earlier.from, to: earlier.to };
  const to = addMonths(p.to, shiftMonths);
  return { from: earlier.from, to: compareDates(to, earlier.to) < 0 ? to : earlier.to };
}

function rowsFrom(now: Map<string, { name: string; amount: Fils }>, prev: Map<string, { name: string; amount: Fils }> | null): ReportRow[] {
  const ids = new Set([...now.keys(), ...(prev ? prev.keys() : [])]);
  const rows: ReportRow[] = [];
  for (const id of ids) {
    const cur = now.get(id);
    const before = prev ? (prev.get(id)?.amount ?? 0) : null;
    const amount = cur?.amount ?? 0;
    if (amount === 0 && !before) continue;
    rows.push({
      id,
      name: cur?.name ?? prev!.get(id)!.name,
      amount,
      previous: before,
      change: before == null ? null : amount - before,
      pct: before == null || before === 0 ? null : Math.round(((amount - before) / before) * 1000) / 10,
    });
  }
  return rows.sort((x, y) => y.amount - x.amount || x.name.localeCompare(y.name));
}

function shortPeriodLabel(p: ReportPeriod, relativeTo: ReportPeriod): string {
  return p.kind === 'quarter' && p.from.slice(0, 4) === relativeTo.from.slice(0, 4) ? p.label.split(' ')[0] : p.label;
}

const fmtPct = (n: number) => `${Math.abs(Math.round(n))}%`;

function rangeText(p: ReportPeriod): string {
  const f = (d: ISODate) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
  return `${f(p.from)} - ${f(p.to)} ${p.to.slice(0, 4)}${p.isCurrent ? ' (so far)' : ''}`;
}

/** The whole report for a period. `todayStr` decides what is "so far". */
export function buildReport(input: PlanInput, period: ReportPeriod, todayStr: ISODate): Report {
  const cur = flowsIn(input, period.from, period.to);
  const currency = input.settings.currency;
  const money = (n: Fils) => formatMoneyTrim(n, currency);

  // Earlier periods to compare with.
  const prevP = shifted(period, -1, todayStr);
  const yearAgoP = period.kind === 'quarter' ? shifted(period, -4, todayStr) : null;
  const prevW = windowOf(prevP, period, period.kind === 'year' ? -12 : -3);
  const yearW = yearAgoP ? windowOf(yearAgoP, period, -12) : null;
  const prev = flowsIn(input, prevW.from, prevW.to);
  const yearAgo = yearW ? flowsIn(input, yearW.from, yearW.to) : null;
  const prevHas = hasData(prev);
  const vsPrevious = prevHas ? compare(cur, prev, shortPeriodLabel(prevP, period)) : null;
  const vsLastYear = yearAgo && hasData(yearAgo) && yearAgoP ? compare(cur, yearAgo, yearAgoP.label) : null;

  const saved = cur.income - cur.spending;
  const savingsRate = rate(cur.income, cur.spending);
  const income = rowsFrom(cur.incomeBy, prevHas ? prev.incomeBy : null);
  const spending = rowsFrom(cur.costBy, prevHas ? prev.costBy : null);

  const startBalance = balanceAt(input, addDays(period.from, -1));
  const endBalance = balanceAt(input, period.to);
  const cashFlow: CashFlow = {
    startBalance,
    endBalance,
    recurringIncome: cur.recurringIncome,
    recurringCosts: cur.recurringCosts,
    oneTimeNet: cur.oneTimeIncome - cur.oneTimeCosts,
    debtPayments: cur.debt,
    cheques: cur.cheques,
  };

  // Debts.
  const debtsOn = activeDebts(input).length > 0;
  const dtiPct = percent(cur.debt, cur.income);
  let debts: DebtsSection | null = null;
  const statsEnd = debtsOn ? debtStats(input, period.to) : null;
  if (debtsOn && statsEnd) {
    debts = {
      owedStart: owedTotal(input, addDays(period.from, -1), todayStr),
      owedEnd: owedTotal(input, period.to, todayStr),
      paid: cur.debt,
      interestEstimate: interestEstimate(input, period.from, period.to, todayStr),
      dtiPct,
      dtiPreviousPct: prevHas ? percent(prev.debt, prev.income) : null,
      debtFreeThen: statsEnd.debtFreeDate,
      debtFreeNow: debtStats(input, todayStr).debtFreeDate,
    };
  }

  // Key figures.
  const totalDays = Math.max(1, diffDays(period.from, period.to) + 1);
  const avgMonthly = (cur.spending * 30.4375) / totalDays;
  const categoryRows = spending.filter((r) => r.id !== 'debts' && r.id !== 'cheques');
  const biggest = spending[0] && spending[0].amount > 0 ? spending[0] : null;
  const keyFigures: KeyFigures = {
    savingsRate,
    debtToIncomePct: dtiPct,
    spendingPct: percent(cur.spending, cur.income),
    biggestCategory: biggest ? { name: biggest.name, amount: biggest.amount, sharePct: percent(biggest.amount, cur.spending) } : null,
    fixedCosts: cur.recurringCosts + cur.debt + cur.cheques,
    flexibleCosts: cur.oneTimeCosts,
    monthsOfBuffer: avgMonthly > 0 ? Math.round((Math.max(0, endBalance) / avgMonthly) * 10) / 10 : null,
  };

  // Highlights (facts only).
  const highlights: string[] = [];
  if (vsPrevious) {
    const rel = vsPrevious.label;
    const moves = categoryRows
      .filter((r) => r.change != null && r.change !== 0 && (r.previous ?? 0) > 0)
      .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!));
    const up = moves.find((r) => r.change! > 0);
    const down = moves.find((r) => r.change! < 0);
    if (up) highlights.push(`${up.name} rose ${fmtPct(up.pct!)} vs ${rel} (+${money(up.change!)})`);
    if (down) highlights.push(`${down.name} fell ${fmtPct(down.pct!)} vs ${rel} (-${money(Math.abs(down.change!))})`);
    const pts = vsPrevious.savingsRate.changePoints;
    if (pts != null && pts !== 0 && savingsRate != null && vsPrevious.savingsRate.previous != null) {
      highlights.push(`Savings rate ${pts > 0 ? 'rose' : 'fell'} from ${fmtPct(vsPrevious.savingsRate.previous)} to ${fmtPct(savingsRate)} vs ${rel}`);
    }
  }
  if (statsEnd) {
    const names = new Map(activeDebts(input).map((d) => [d.id, d.name]));
    const few = statsEnd.perDebt
      .filter((d) => d.totalCount != null && d.totalCount - d.paidCount > 0 && d.totalCount - d.paidCount <= 12)
      .sort((a, b) => a.totalCount! - a.paidCount - (b.totalCount! - b.paidCount));
    for (const d of few.slice(0, 2)) {
      const left = d.totalCount! - d.paidCount;
      highlights.push(`${names.get(d.debtId)}: ${left} ${left === 1 ? 'payment' : 'payments'} left`);
    }
  }
  if (highlights.length === 0 && saved !== 0 && cur.income > 0) {
    highlights.push(saved > 0 ? `Income was ${money(saved)} more than spending` : `Spending was ${money(-saved)} more than income`);
  }

  // Year in review.
  let quarters: QuarterColumn[] | null = null;
  let bestMonth: MonthResult | null = null;
  let worstMonth: MonthResult | null = null;
  if (period.kind === 'year') {
    const year = Number(period.from.slice(0, 4));
    quarters = [1, 2, 3, 4].map((q) => {
      const p = makePeriod('quarter', year, q, todayStr);
      const started = compareDates(p.from, period.to) <= 0;
      const end = compareDates(p.to, period.to) < 0 ? p.to : period.to;
      const f = started ? flowsIn(input, p.from, end) : flowsIn(input, p.from, addDays(p.from, -1));
      return { key: p.key, label: `Q${q}`, income: f.income, spending: f.spending, saved: f.income - f.spending, hasData: started && hasData(f) };
    });
    const months: MonthResult[] = [];
    for (let m = 1; m <= 12; m++) {
      const mk = `${year}-${pad(m)}`;
      if (compareDates(monthStart(mk), period.to) > 0) break;
      const end = compareDates(monthEnd(mk), period.to) < 0 ? monthEnd(mk) : period.to;
      const f = flowsIn(input, monthStart(mk), end);
      if (hasData(f)) months.push({ month: mk, label: `${MONTHS[m - 1]} ${year}`, saved: f.income - f.spending });
    }
    if (months.length >= 2) {
      const sorted = [...months].sort((a, b) => b.saved - a.saved || compareDates(a.month, b.month));
      if (sorted[0].saved !== sorted[sorted.length - 1].saved) {
        bestMonth = sorted[0];
        worstMonth = sorted[sorted.length - 1];
      }
    }
  }

  return {
    period,
    title: `${period.kind === 'year' ? 'Year' : 'Quarter'} report: ${period.label}`,
    rangeText: rangeText(period),
    currency,
    generatedOn: todayStr,
    isSample: false,
    hasData: hasData(cur),
    summary: { income: cur.income, spending: cur.spending, saved, savingsRate, vsPrevious, vsLastYear },
    income,
    spending,
    cashFlow,
    debts,
    keyFigures,
    highlights: highlights.slice(0, 5),
    quarters,
    bestMonth,
    worstMonth,
  };
}

// ---- Sample report (shown to free users instead of their own figures) ----

const SAMPLE_CATEGORIES = [
  { id: 'demo-groceries', name: 'Groceries', kind: 'cost' as const, sort: 1, archived: false },
  { id: 'demo-utilities', name: 'Utilities', kind: 'cost' as const, sort: 2, archived: false },
  { id: 'demo-dining', name: 'Dining out', kind: 'cost' as const, sort: 3, archived: false },
  { id: 'demo-transport', name: 'Transport', kind: 'cost' as const, sort: 4, archived: false },
  { id: 'demo-shopping', name: 'Shopping', kind: 'cost' as const, sort: 5, archived: false },
  { id: 'demo-health', name: 'Health and fitness', kind: 'cost' as const, sort: 6, archived: false },
  { id: 'demo-freelance', name: 'Freelance', kind: 'income' as const, sort: 6, archived: false },
];

/** A made-up UAE household: salary AED 18,000, rent by cheque, a car loan, a card, groceries. Starts two years back. */
export function sampleInput(todayStr: ISODate): PlanInput {
  const year = Number(todayStr.slice(0, 4));
  const start = `${year - 2}-01-01`;
  const rec = (id: string, name: string, kind: 'income' | 'cost', amount: Fils, day: number, categoryId: string | null) => ({
    id,
    kind,
    name,
    categoryId,
    amount,
    schedule: { type: 'monthly' as const, day },
    startDate: start,
    endDate: null,
    count: null,
    note: '',
  });
  const transactions = [];
  for (let i = 0; i < 36; i++) {
    const mk = addMonthKey(`${year - 2}-01`, i);
    const [y, m] = mk.split('-').map(Number);
    // Dining and shopping vary a little every month, and dining is higher in recent months.
    const wave = ((i * 7) % 5) * 12000;
    const dining = 70000 + wave + (i >= 30 ? 60000 : 0);
    const tx = (id: string, day: number, kind: 'income' | 'cost', amount: Fils, categoryId: string, description: string) => ({
      id: `${id}-${mk}`,
      kind,
      date: toISODate(y, m, day),
      description,
      categoryId,
      amount,
      note: '',
      source: 'manual' as const,
      importId: null,
      planned: false,
    });
    transactions.push(tx('dining', 12, 'cost', dining, 'demo-dining', 'Restaurants'));
    transactions.push(tx('fuel', 18, 'cost', 55000 + ((i * 3) % 4) * 6000, 'demo-transport', 'Fuel'));
    transactions.push(tx('shop', 22, 'cost', 40000 + ((i * 5) % 6) * 9000, 'demo-shopping', 'Shopping'));
    if (i % 3 === 1) transactions.push(tx('free', 28, 'income', 250000, 'demo-freelance', 'Freelance project'));
  }
  const cheques = [];
  for (let y = year - 2; y <= year; y++) {
    for (const m of [1, 4, 7, 10]) {
      cheques.push({
        id: `rent-${y}-${m}`,
        payee: 'Landlord',
        amount: 2200000,
        date: toISODate(y, m, 5),
        purpose: 'Rent',
        status: 'upcoming' as const,
        seriesId: 'rent',
        note: '',
      });
    }
  }
  return {
    settings: {
      currency: 'AED',
      payday: 25,
      startingBalance: 2500000,
      startingBalanceDate: start,
      buffer: 500000,
      enabledModules: { debts: true, cheques: true, alerts: true, import: false },
      alertThresholds: { debtCautionPct: 40, debtHighPct: 50, cardUsagePct: 80 },
      billReminders: { on: true, leadDays: 1, muted: [] },
      onboarded: true,
      lockEnabled: false,
    },
    categories: SAMPLE_CATEGORIES,
    recurring: [
      rec('demo-salary', 'Salary', 'income', 1800000, 25, null),
      rec('demo-groceries-r', 'Groceries', 'cost', 260000, 3, 'demo-groceries'),
      rec('demo-utilities-r', 'Electricity and water', 'cost', 70000, 8, 'demo-utilities'),
      rec('demo-phone', 'Phone and internet', 'cost', 45000, 10, 'demo-utilities'),
      rec('demo-gym', 'Gym', 'cost', 30000, 1, 'demo-health'),
    ],
    overrides: [],
    transactions,
    debts: [
      {
        id: 'demo-car',
        type: 'loan',
        name: 'Car loan',
        note: '',
        archived: false,
        createdAt: start,
        balance: 6300000,
        balanceDate: start,
        monthlyPayment: 180000,
        paymentDay: 15,
        annualRatePct: 4.99,
        endDate: `${year + 1}-06-15`,
      },
      {
        id: 'demo-card',
        type: 'card',
        name: 'Visa card',
        note: '',
        archived: false,
        createdAt: start,
        limit: 2000000,
        balance: 600000,
        balanceDate: start,
        statementDay: 1,
        dueDay: 20,
        minPct: 5,
        minFloor: 5000,
        monthlyRatePct: 3,
        plan: 'fixed',
        fixedAmount: 120000,
      },
    ],
    debtPayments: [],
    debtOverrides: [],
    cheques,
  };
}

/**
 * A full report built from the demo household, for free users. Quarter: the latest finished
 * quarter. Year: the latest finished year. Never uses the user's own data.
 */
export function sampleReport(todayStr: ISODate, kind: ReportKind = 'quarter'): Report {
  const input = sampleInput(todayStr);
  const year = Number(todayStr.slice(0, 4));
  const current = makePeriod('quarter', year, quarterOf(todayStr), todayStr);
  const period = kind === 'year' ? makePeriod('year', year - 1, 1, todayStr) : shifted(current, -1, todayStr);
  return { ...buildReport(input, period, todayStr), isSample: true };
}
