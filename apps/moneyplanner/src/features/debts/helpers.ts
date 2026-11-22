// Small pure helpers for the debts screens.
import { diffDays } from '@/lib/dates';
import type { AlertThresholds, Debt, Fils, ISODate } from '@/types';

/** 'today', 'tomorrow' or 'in 5 days'. */
export function whenLabel(date: ISODate, now: ISODate): string {
  const n = diffDays(date, now);
  return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
}

export type RatioLevel = 'normal' | 'caution' | 'high';

export function ratioLevel(pct: number | null, t: AlertThresholds): RatioLevel | null {
  if (pct == null) return null;
  return pct >= t.debtHighPct ? 'high' : pct >= t.debtCautionPct ? 'caution' : 'normal';
}

/** Whole-percent text: 46 or 46.5 stays 46.5. */
export const pctText = (pct: number) => `${Math.round(pct * 10) / 10}%`;

/** Fraction 0-1 for a progress bar. */
export const fraction = (part: number, whole: number | null) => (!whole || whole <= 0 ? 0 : Math.max(0, Math.min(1, part / whole)));

export function sortDebts(list: Debt[]): Debt[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export const PAYMENT_KIND_LABEL = { regular: 'Regular', extra: 'Extra', partial: 'Partial' } as const;

export const sumFils = (xs: Fils[]) => xs.reduce((a, b) => a + b, 0);
