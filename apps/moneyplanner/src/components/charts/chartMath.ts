// Pure helpers for the balance chart: axis ticks, labels, nearest point, series for each range.
import { MONTHS, monthEnd, parseISODate } from '@/lib/dates';
import { formatMoneyTrim } from '@/lib/money';
import type { Fils, ForecastDay, ForecastMonth, ISODate } from '@/types';

export type Range = '1M' | '2M' | '6M' | '1Y';
export const RANGES: { key: Range; label: string; spoken: string }[] = [
  { key: '1M', label: '1M', spoken: 'next month' },
  { key: '2M', label: '2M', spoken: 'next 2 months' },
  { key: '6M', label: '6M', spoken: 'next 6 months' },
  { key: '1Y', label: '1Y', spoken: 'next year' },
];

export interface SeriesLine {
  label: string;
  /** Signed: income positive, costs negative. */
  amount: Fils;
}

export interface SeriesPoint {
  date: ISODate;
  balance: Fils;
  /** What the tooltip and the screen reader say for this point ("12 Dec", "End of Dec"). */
  title: string;
  lines: SeriesLine[];
  /** Month-end points (6M / 1Y) vs single days. */
  monthly: boolean;
}

const MINUS = '−';

function day(d: ISODate): string {
  const { month, day: n } = parseISODate(d);
  return `${n} ${MONTHS[month - 1]}`;
}

/** 1250000 fils -> "12.5k", 500000 -> "5k", -200000 -> "−2k", 12345 -> "123", 1.2M -> "1.2M". */
export function compactAmount(fils: Fils): string {
  const units = Math.abs(fils) / 100;
  const sign = fils < 0 && Math.round(units) !== 0 ? MINUS : '';
  const trim = (n: number) => String(Number(n.toFixed(1)));
  if (units >= 1_000_000) return `${sign}${trim(units / 1_000_000)}M`;
  if (units >= 1000) return `${sign}${trim(units / 1000)}k`;
  return `${sign}${Math.round(units)}`;
}

/** 3-5 round tick values (fils) inside [min, max]: the largest 1/2/2.5/5 x 10^n step that still gives 3 ticks. */
export function niceTicks(min: Fils, max: Fils): Fils[] {
  if (!(max > min)) return [];
  const lo = min / 100;
  const hi = max / 100;
  const count = (s: number) => Math.floor(hi / s + 1e-9) - Math.ceil(lo / s - 1e-9) + 1;
  const steps: number[] = [];
  for (let p = 1; p <= 1e8; p *= 10) steps.push(p, 2 * p, 5 * p, ...(p >= 10 ? [2.5 * p] : []));
  const step = steps.sort((a, b) => b - a).find((s) => count(s) >= 3) ?? 1;
  const out: Fils[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) + 0);
  return out.length > 5 ? out.filter((_, i) => i % 2 === 0) : out;
}

/** Index of the point nearest to pixel x, for `n` points spread between padding and width - padding. */
export function nearestIndex(x: number, n: number, width: number, padding = 8): number {
  if (n <= 1) return 0;
  const inner = Math.max(1, width - padding * 2);
  const i = Math.round(((x - padding) / inner) * (n - 1));
  return Math.min(n - 1, Math.max(0, i));
}

function evenly(n: number, count: number): number[] {
  if (n <= 0) return [];
  if (n <= count) return Array.from({ length: n }, (_, i) => i);
  return Array.from({ length: count }, (_, i) => Math.round((i * (n - 1)) / (count - 1)));
}

/**
 * 3-5 x-axis labels. Days: calendar dates ("1 Dec", "15 Dec", "1 Jan"; weekly for a month or less).
 * Months: "Dec", "Jan", thinned to at most 5.
 */
export function axisDateLabels(points: { date: ISODate; monthly: boolean }[], max = 5): { index: number; label: string }[] {
  const n = points.length;
  if (n === 0) return [];
  if (points[0].monthly) {
    const step = Math.ceil(n / max);
    return points.flatMap((p, i) => (i % step === 0 ? [{ index: i, label: MONTHS[parseISODate(p.date).month - 1] }] : []));
  }
  const days = n <= 35 ? [1, 8, 15, 22] : [1, 15];
  let picked = points.flatMap((p, i) => (days.includes(parseISODate(p.date).day) ? [i] : []));
  if (picked.length < 3) picked = evenly(n, Math.min(4, n));
  if (picked.length > max) picked = picked.filter((_, i) => i % Math.ceil(picked.length / max) === 0);
  return picked.map((i) => ({ index: i, label: day(points[i].date) }));
}

/** Tooltip/spoken lines: at most 3, then "and N more". */
export function limitLines(lines: SeriesLine[], max = 3): { shown: SeriesLine[]; more: number } {
  return { shown: lines.slice(0, max), more: Math.max(0, lines.length - max) };
}

export function signed(amount: Fils): string {
  const abs = formatMoneyTrim(Math.abs(amount), '').trim();
  return `${amount < 0 ? MINUS : '+'}${abs}`;
}

/** "12 Dec: AED 8,240. Rent −6,500, Salary +18,000 and 1 more" */
export function speakPoint(p: SeriesPoint, currency: string): string {
  const { shown, more } = limitLines(p.lines);
  const parts = shown.map((l) => `${l.label} ${signed(l.amount)}`);
  if (more) parts.push(`and ${more} more`);
  return `${p.title}: ${formatMoneyTrim(p.balance, currency)}.${parts.length ? ' ' + parts.join(', ') : ''}`;
}

/** The points for a range: daily for 1M/2M, month-ends for 6M/1Y. */
export function buildSeries(range: Range, days: ForecastDay[], months: ForecastMonth[]): SeriesPoint[] {
  if (range === '1M' || range === '2M') {
    return days.slice(0, range === '1M' ? 30 : 60).map((d) => ({
      date: d.date,
      balance: d.balance,
      title: day(d.date),
      monthly: false,
      lines: d.events.map((e) => ({ label: e.label, amount: e.kind === 'income' ? Math.abs(e.amount) : -Math.abs(e.amount) })),
    }));
  }
  return months.slice(0, range === '6M' ? 6 : 12).map((m) => {
    const { year, month } = parseISODate(monthEnd(m.month));
    return {
      date: monthEnd(m.month),
      balance: m.endBalance,
      title: `End of ${MONTHS[month - 1]} ${year}`,
      monthly: true,
      lines: [
        { label: 'Income', amount: m.income },
        { label: 'Spending', amount: -Math.abs(m.spend) },
      ],
    };
  });
}

/** Index of the lowest balance (first one on a tie). */
export function lowestIndex(points: { balance: Fils }[]): number {
  let best = 0;
  points.forEach((p, i) => {
    if (p.balance < points[best].balance) best = i;
  });
  return best;
}

/** Spoken summary of the series shown. */
export function describeSeries(points: SeriesPoint[], rangeSpoken: string, currency: string, buffer: Fils): string {
  if (points.length === 0) return 'No forecast data.';
  const first = points[0].balance;
  const last = points[points.length - 1].balance;
  const low = points[lowestIndex(points)];
  const trend = last > first ? 'rising' : last < first ? 'falling' : 'flat';
  const below = points.some((p) => p.balance < buffer);
  return (
    `Balance forecast for the ${rangeSpoken}, ${trend}: from ${formatMoneyTrim(first, currency)} to ${formatMoneyTrim(last, currency)}. ` +
    `Lowest ${formatMoneyTrim(low.balance, currency)} on ${day(low.date)}. ` +
    (below ? `It goes below your ${formatMoneyTrim(buffer, currency)} buffer.` : 'It stays above your buffer.')
  );
}
