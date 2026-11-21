// Pure helpers for the Dashboard and Month screens (chart scaling, labels, sorting).
import { MONTHS, parseISODate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { Category, Fils, ForecastDay, ISODate } from '@/types';

export const UNCATEGORIZED = 'uncategorized';

/** '2026-03-14' -> '14 Mar'. */
export function shortDate(d: ISODate): string {
  const { month, day } = parseISODate(d);
  return `${day} ${MONTHS[month - 1]}`;
}

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartScale {
  points: ChartPoint[];
  /** Maps a money value to a y pixel. */
  y: (value: Fils) => number;
  min: number;
  max: number;
}

/**
 * Scales balances into a width x height box. The range always includes the
 * `include` values (zero line, buffer line) so they are visible. Flat data gets a
 * non-zero range so nothing divides by zero.
 */
export function scaleSeries(values: Fils[], width: number, height: number, include: Fils[] = [], padding = 8): ChartScale {
  const all = [...values, ...include];
  let min = all.length ? Math.min(...all) : 0;
  let max = all.length ? Math.max(...all) : 0;
  if (max === min) {
    max = min + 100;
    min = min - 100;
  }
  const innerH = Math.max(1, height - padding * 2);
  const innerW = Math.max(1, width - padding * 2);
  const y = (v: Fils) => padding + (1 - (v - min) / (max - min)) * innerH;
  const points = values.map((v, i) => ({
    x: padding + (values.length <= 1 ? innerW / 2 : (i / (values.length - 1)) * innerW),
    y: y(v),
  }));
  return { points, y, min, max };
}

export function linePath(points: ChartPoint[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

export function areaPath(points: ChartPoint[], baseY: number): string {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)} L${last.x.toFixed(1)},${baseY.toFixed(1)} L${first.x.toFixed(1)},${baseY.toFixed(1)} Z`;
}

/** Spoken summary of a forecast chart. */
export function describeBalanceTrend(
  days: ForecastDay[],
  lowest: { date: ISODate; balance: Fils },
  currency: string,
  buffer: Fils,
): string {
  if (days.length === 0) return 'No forecast data.';
  const first = days[0].balance;
  const last = days[days.length - 1].balance;
  const trend = last > first ? 'rising' : last < first ? 'falling' : 'flat';
  const below = days.some((d) => d.balance < buffer);
  return (
    `Balance forecast for the next ${days.length} days, ${trend}: from ${formatMoney(first, currency)} to ${formatMoney(last, currency)}. ` +
    `Lowest ${formatMoney(lowest.balance, currency)} on ${shortDate(lowest.date)}. ` +
    (below ? `It goes below your ${formatMoney(buffer, currency)} buffer.` : 'It stays above your buffer.')
  );
}

export interface BarItem {
  id: string;
  label: string;
  value: Fils;
}

/** Category spend sorted largest first; zero amounts dropped. */
export function categoryBars(costsByCategory: Record<string, Fils>, categories: Category[]): BarItem[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  return Object.entries(costsByCategory)
    .filter(([, v]) => v > 0)
    .map(([id, value]) => ({
      id,
      label: id === UNCATEGORIZED ? 'Other / uncategorized' : (names.get(id) ?? 'Other / uncategorized'),
      value,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/** Bar width as a 0..1 share of the largest value. */
export function barFraction(value: Fils, max: Fils): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

/** 'Mar' from 'YYYY-MM'. */
export function monthShort(m: string): string {
  return MONTHS[Number(m.slice(5, 7)) - 1];
}

/** Signed money: negatives get a minus (formatMoney already does) and the tone is 'negative'. */
export function moneyTone(v: Fils): 'negative' | 'default' {
  return v < 0 ? 'negative' : 'default';
}
