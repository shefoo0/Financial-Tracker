// The charts a user can add to Home: Income vs spending (free), Debt payoff and Savings rate (Pro). Each is a
// ChartDef: build(input, range, today) gives the series, the shared ChartCard draws them. Pure: no React.
import { debtLifetime, remainingOf, activeDebts } from '@/engine/debts/schedule';
import { monthSummary } from '@/engine';
import { addMonthKey, addMonths, compareDates, MONTHS, monthEnd, monthKey, parseISODate } from '@/lib/dates';
import { formatMoneyTrim } from '@/lib/money';
import type { Fils, ISODate, PlanInput } from '@/types';
import type { SeriesPoint } from './chartMath';
import type { ChartDef, ChartSeries, ChartUnit } from './registry';

const MINUS = '−';

/** "12.5%" / "−3%" for a value in hundredths of a percent. */
export function formatPercent(hundredths: number): string {
  const pct = Math.round(Math.abs(hundredths) / 10) / 10;
  return `${hundredths < 0 && pct !== 0 ? MINUS : ''}${pct}%`;
}

/** A chart value as text: money in the profile's currency, or a percentage. */
export const formatChartValue = (unit: ChartUnit | undefined, v: number, currency: string): string =>
  unit === 'percent' ? formatPercent(v) : formatMoneyTrim(v, currency);

const monthTitle = (mk: string) => `${MONTHS[Number(mk.slice(5, 7)) - 1]} ${mk.slice(0, 4)}`;

/** `back` months before this one (actual) and this one plus the following months up to `total` (forecast). */
function monthsAround(today: ISODate, back: number, total: number): { mk: string; kind: 'actual' | 'forecast' }[] {
  const cur = monthKey(today);
  return Array.from({ length: total }, (_, i) => ({ mk: addMonthKey(cur, i - back), kind: i < back ? ('actual' as const) : ('forecast' as const) }));
}

const SPANS = [
  { key: '3M', label: '3M', spoken: 'next 3 months', pastSpoken: 'last 3 months' },
  { key: '6M', label: '6M', spoken: 'next 6 months', pastSpoken: 'last 6 months' },
] as const;
const spanMonths = (r: string) => (r === '3M' ? 3 : 6);

export const incomeVsSpendingChart: ChartDef = {
  id: 'income-vs-spending',
  title: 'Income vs spending',
  description: 'Income and spending for each of the last 6 months and the next 6, actual then forecast.',
  pro: false,
  style: 'bars',
  tones: { income: 'positive', spending: 'negative' },
  defaultRange: '6M',
  emptyMessage: 'Add income or costs and this chart shows income against spending month by month.',
  ranges: SPANS,
  overlays: ['zero'],
  build: (input, range, today) => {
    const n = spanMonths(range);
    const months = monthsAround(today, n, n * 2).map((m) => ({ ...m, s: monthSummary(m.mk, input) }));
    if (months.every((m) => m.s.totalIncome === 0 && m.s.totalSpend === 0)) return [];
    const point = (m: (typeof months)[number], value: Fils): SeriesPoint => ({
      date: monthEnd(m.mk),
      balance: value,
      title: monthTitle(m.mk),
      lines: [],
      monthly: true,
      kind: m.kind,
    });
    return [
      { id: 'income', label: 'Income', points: months.map((m) => point(m, m.s.totalIncome)) },
      { id: 'spending', label: 'Spending', points: months.map((m) => point(m, m.s.totalSpend)) },
    ];
  },
};

export const savingsRateChart: ChartDef = {
  id: 'savings-rate',
  title: 'Savings rate',
  description: 'The share of income left over each month: the last 6 months and the next 6.',
  pro: true,
  unit: 'percent',
  tones: { rate: 'accent' },
  defaultRange: '6M',
  emptyMessage: 'Savings rate needs income. Add your salary and this chart shows how much of it is left each month.',
  ranges: SPANS,
  overlays: ['zero'],
  build: (input, range, today) => {
    const n = spanMonths(range);
    const months = monthsAround(today, n, n * 2).map((m) => ({ ...m, s: monthSummary(m.mk, input) }));
    if (months.every((m) => m.s.totalIncome <= 0)) return [];
    const points: SeriesPoint[] = months.map((m) => ({
      date: monthEnd(m.mk),
      balance: m.s.totalIncome > 0 ? Math.round(((m.s.totalIncome - m.s.totalSpend) / m.s.totalIncome) * 10000) : 0,
      title: monthTitle(m.mk),
      lines: [
        { label: 'Income', amount: m.s.totalIncome },
        { label: 'Spending', amount: -m.s.totalSpend },
      ],
      monthly: true,
      kind: m.kind,
    }));
    return [{ id: 'rate', label: 'Savings rate', points }];
  },
};

const DEBT_RANGES = [
  { key: '1Y', label: '1Y', spoken: 'next year', pastSpoken: '' },
  { key: '3Y', label: '3Y', spoken: 'next 3 years', pastSpoken: '' },
  { key: 'All', label: 'All', spoken: 'time until debt-free', pastSpoken: '' },
] as const;
const MAX_POINTS = 60;

export const debtPayoffChart: ChartDef = {
  id: 'debt-payoff',
  title: 'Debt payoff',
  description: 'What you still owe, falling month by month to the debt-free date.',
  pro: true,
  tones: { owed: 'warning' },
  defaultRange: 'All',
  emptyMessage: 'Nothing to pay off right now. Add a loan, card or instalment plan and its balance shows here, falling to the debt-free date.',
  ranges: DEBT_RANGES,
  overlays: ['zero'],
  build: (input: PlanInput, range, today) => {
    const horizon = addMonths(today, 360);
    const parts = activeDebts(input)
      .map((d) => {
        const remaining = remainingOf(d, input);
        const life = debtLifetime(d, input, horizon);
        // Only what is still to come: payments dated before today are history (a logged payment already lowered `remaining`).
        const payments = life.payments.filter((p) => compareDates(p.date, today) > 0).sort((a, b) => compareDates(a.date, b.date));
        const paid = payments.reduce((s, p) => s + p.amount, 0);
        return { remaining, payments, paid, left: Math.min(remaining, life.remaining) };
      })
      .filter((p) => p.remaining > 0);
    if (parts.length === 0) return [];
    // What is owed on `date`: the balance today, falling in step with the payments made (so the line ends at what is
    // left after the last scheduled one: zero for a debt that is paid off).
    const owedOn = (date: ISODate): Fils =>
      parts.reduce((sum, p) => {
        const done = p.payments.filter((x) => compareDates(x.date, date) <= 0).reduce((s, x) => s + x.amount, 0);
        return sum + (p.paid > 0 ? p.remaining - (done / p.paid) * (p.remaining - p.left) : p.remaining);
      }, 0);
    const last = parts.reduce<ISODate>((m, p) => {
      const l = p.payments.length ? p.payments[p.payments.length - 1].date : today;
      return compareDates(l, m) > 0 ? l : m;
    }, today);
    const allPaid = parts.every((p) => p.left <= 0);
    const limit = range === '1Y' ? addMonths(today, 12) : range === '3Y' ? addMonths(today, 36) : horizon;
    const end = compareDates(last, limit) <= 0 ? last : limit;
    const dates: ISODate[] = [today];
    for (let mk = monthKey(today); ; mk = addMonthKey(mk, 1)) {
      const e = monthEnd(mk);
      if (compareDates(e, end) >= 0) break;
      if (compareDates(e, today) > 0) dates.push(e);
    }
    if (compareDates(end, today) > 0) dates.push(end);
    const step = Math.ceil(dates.length / MAX_POINTS);
    const kept = dates.filter((_, i) => i % step === 0 || i === dates.length - 1);
    const points: SeriesPoint[] = kept.map((date, i) => {
      const value = Math.max(0, Math.round(owedOn(date)));
      const { year, month, day } = parseISODate(date);
      const debtFree = allPaid && date === last && i > 0;
      return {
        date,
        balance: value,
        title: i === 0 ? 'Today' : debtFree ? `Debt-free, ${day} ${MONTHS[month - 1]} ${year}` : `${day} ${MONTHS[month - 1]} ${year}`,
        lines: [],
        monthly: true,
        kind: i === 0 ? 'actual' : 'forecast',
      };
    });
    return [{ id: 'owed', label: 'Still owed', points }] satisfies ChartSeries[];
  },
};

/** The charts added to Home through Edit Home, in the order the gallery offers them. */
export const ADDED_CHARTS = [incomeVsSpendingChart, debtPayoffChart, savingsRateChart] as const;
