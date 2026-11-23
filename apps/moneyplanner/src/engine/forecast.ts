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
  PlanInput,
  Transaction,
  YearSummary,
} from '@/types';
import {
  addDays,
  addMonthKey,
  compareDates,
  diffDays,
  monthEnd,
  monthKey,
  monthStart,
} from '@/lib/dates';

import { accountOf, cardOf, cashAccounts, countsAfterStart, isTransfer, startOf, totalStartingBalance } from './accounts';
import { occurrencesInRange } from './recurring';
import { debtOutflows } from './debts/schedule';
import { chequesInRange } from './debts/cheques';

// ---- Summaries ----

/** Key used in `costsByCategory` for costs without a category. */
export const UNCATEGORIZED = 'uncategorized';

/** Cards with purchases recorded in the app: their payments settle the card and are not spending again. */
export function cardsWithPurchases(input: Pick<PlanInput, 'transactions' | 'recurring' | 'debts'>): Set<string> {
  const ids = new Set<string>();
  for (const x of [...input.transactions, ...input.recurring]) {
    const c = cardOf(x, input);
    if (c) ids.add(c);
  }
  return ids;
}

/** Debt payments split into spending (loans, plans, cards without recorded purchases) and paid to cards. */
function splitDebt(payments: { debtId: string; amount: Fils }[], cards: Set<string>): { debt: Fils; toCards: Fils } {
  let debt = 0;
  let toCards = 0;
  for (const p of payments) {
    if (cards.has(p.debtId)) toCards += p.amount;
    else debt += p.amount;
  }
  return { debt, toCards };
}

function summarize(month: MonthKey, occs: Occurrence[], txs: Transaction[], debtPayments: Fils = 0, cheques: Fils = 0, paidToCards: Fils = 0): MonthSummary {
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
    // Money moved between the user's own accounts is neither income nor spending.
    if (isTransfer(t)) continue;
    if (t.kind === 'income') oneTimeIncome += t.amount;
    else {
      oneTimeCosts += t.amount;
      addCost(t.categoryId, t.amount);
    }
  }
  const totalIncome = recurringIncome + oneTimeIncome;
  const totalSpend = recurringCosts + oneTimeCosts + debtPayments + cheques;
  return {
    month,
    recurringIncome,
    oneTimeIncome,
    totalIncome,
    recurringCosts,
    oneTimeCosts,
    debtPayments,
    paidToCards,
    cheques,
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
  const { debt, toCards } = splitDebt(debtOutflows(input, from, to), cardsWithPurchases(input));
  const chq = chequesInRange(input, from, to).reduce((t, c) => t + c.amount, 0);
  return summarize(month, occs, txs, debt, chq, toCards);
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

  const debtBy = new Map<MonthKey, Fils>();
  const toCardsBy = new Map<MonthKey, Fils>();
  const cards = cardsWithPurchases(input);
  for (const p of debtOutflows(input, monthStart(keys[0]), monthEnd(keys[11]))) {
    const by = cards.has(p.debtId) ? toCardsBy : debtBy;
    by.set(monthKey(p.date), (by.get(monthKey(p.date)) ?? 0) + p.amount);
  }
  const chqBy = new Map<MonthKey, Fils>();
  for (const c of chequesInRange(input, monthStart(keys[0]), monthEnd(keys[11]))) chqBy.set(monthKey(c.date), (chqBy.get(monthKey(c.date)) ?? 0) + c.amount);
  const months = keys.map((k) => summarize(k, occBy.get(k) ?? [], txBy.get(k) ?? [], debtBy.get(k) ?? 0, chqBy.get(k) ?? 0, toCardsBy.get(k) ?? 0));
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

  // Bucket every cash flow after its account's starting balance date by day. The balance is the total of the bank and
  // cash accounts; items on a card move the card (its payments are the cash flow), so they are left out here.
  const earliestStart = cashAccounts(input).reduce<ISODate>((m, a) => {
    const d = startOf(a.id, input).date;
    return compareDates(d, m) < 0 ? d : m;
  }, sbd);
  const flowFrom = addDays(earliestStart, 1);
  const mainFrom = addDays(sbd, 1);
  const byDay = new Map<ISODate, ForecastEvent[]>();
  let balanceAsOf = totalStartingBalance(input);
  const isCash = (item: { date: ISODate; accountId?: string | null; cardId?: string | null }) =>
    !cardOf(item, input) && countsAfterStart(accountOf(item, input), item.date, input);
  const add = (e: ForecastEvent) => {
    if (compareDates(e.date, asOf) <= 0) balanceAsOf += e.kind === 'income' ? e.amount : -e.amount;
    else push(byDay, e.date, e);
  };
  const flowTo = compareDates(horizon, asOf) > 0 ? horizon : asOf;
  if (compareDates(flowFrom, flowTo) <= 0) {
    for (const o of occurrencesInRange(input.recurring, input.overrides, flowFrom, flowTo)) {
      if (!isCash(o)) continue;
      add({ date: o.date, label: o.name, kind: o.kind, amount: o.amount, source: 'recurring', refId: o.recurringId });
    }
    for (const t of input.transactions) {
      if (compareDates(t.date, flowFrom) < 0 || compareDates(t.date, flowTo) > 0 || !isCash(t)) continue;
      add({ date: t.date, label: t.description, kind: t.kind, amount: t.amount, source: 'transaction', refId: t.id });
    }
  }

  // Debt payments and cheques leave the main account.
  if (compareDates(mainFrom, flowTo) <= 0) {
    for (const p of debtOutflows(input, mainFrom, flowTo)) {
      add({ date: p.date, label: p.label, kind: 'cost', amount: p.amount, source: 'debt', refId: p.debtId });
    }
    for (const c of chequesInRange(input, mainFrom, flowTo)) {
      add({ date: c.date, label: `Cheque to ${c.payee}`, kind: 'cost', amount: c.amount, source: 'cheque', refId: c.id });
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
