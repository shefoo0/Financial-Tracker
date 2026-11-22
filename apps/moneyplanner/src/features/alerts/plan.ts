// Which alerts become notifications, and what they say. Pure.
import { parseISODate, today } from '@/lib/dates';
import type { AppAlert } from '@/types';

export const MAX_NOTIFICATIONS = 20;
export const NOTIFY_HOUR = 9;
export const GENERIC_TITLE = 'Money Planner';
export const GENERIC_BODY = 'Something needs attention in Money Planner';

export interface PlannedNotification {
  alertId: string;
  at: Date;
  title: string;
  body: string;
}

/**
 * One notification per alert with a `notifyOn` date, at 09:00 local time, the
 * soonest 20 (iOS keeps at most 64 scheduled; the list is rebuilt on every
 * change and when the app opens). Past times are skipped. When the profile is
 * locked the text is generic so no amounts or names show on the lock screen.
 */
export function planNotifications(alerts: AppAlert[], locked: boolean, now: Date): PlannedNotification[] {
  const seen = new Set<string>();
  const out: PlannedNotification[] = [];
  for (const a of alerts) {
    if (!a.notifyOn || seen.has(a.id)) continue;
    seen.add(a.id);
    const { year, month, day } = parseISODate(a.notifyOn);
    let at = new Date(year, month - 1, day, NOTIFY_HOUR, 0, 0, 0);
    if (at.getTime() <= now.getTime()) {
      // Today's 09:00 has passed: remind in a minute instead of skipping it. Earlier days are skipped.
      if (a.notifyOn !== today(now)) continue;
      at = new Date(now.getTime() + 60_000);
    }
    out.push({ alertId: a.id, at, title: locked ? GENERIC_TITLE : a.title, body: locked ? GENERIC_BODY : a.message });
  }
  out.sort((x, y) => x.at.getTime() - y.at.getTime());
  return out.slice(0, MAX_NOTIFICATIONS);
}

const SEVERITY_ORDER = { high: 0, caution: 1, info: 2, good: 3 } as const;

/** Most serious first; same severity keeps the engine's order. */
export function sortBySeverity(alerts: AppAlert[]): AppAlert[] {
  return alerts
    .map((a, i) => ({ a, i }))
    .sort((x, y) => SEVERITY_ORDER[x.a.severity] - SEVERITY_ORDER[y.a.severity] || x.i - y.i)
    .map((x) => x.a);
}

/** The screen an alert is about. */
export function alertRoute(kind: AppAlert['kind']): '/month' | '/debts' | '/cheques' {
  switch (kind) {
    case 'shortfall-zero':
    case 'shortfall-buffer':
      return '/month';
    case 'cheque-uncovered':
      return '/cheques';
    default:
      return '/debts';
  }
}

export interface ThresholdDrafts {
  debtCautionPct: string;
  debtHighPct: string;
  cardUsagePct: string;
}

export type ThresholdErrors = Partial<Record<keyof ThresholdDrafts, string>>;

/** Whole percentages 1-100; the caution level must be below the high level. */
export function validateThresholds(d: ThresholdDrafts): { errors: ThresholdErrors; value: { debtCautionPct: number; debtHighPct: number; cardUsagePct: number } | null } {
  const errors: ThresholdErrors = {};
  const parse = (key: keyof ThresholdDrafts): number => {
    const t = d[key].trim();
    if (!/^\d{1,3}$/.test(t) || Number(t) < 1 || Number(t) > 100) {
      errors[key] = 'Enter a whole number from 1 to 100.';
      return NaN;
    }
    return Number(t);
  };
  const caution = parse('debtCautionPct');
  const high = parse('debtHighPct');
  const card = parse('cardUsagePct');
  if (!errors.debtCautionPct && !errors.debtHighPct && caution >= high) errors.debtCautionPct = 'The caution level must be lower than the high level.';
  if (Object.keys(errors).length) return { errors, value: null };
  return { errors, value: { debtCautionPct: caution, debtHighPct: high, cardUsagePct: card } };
}
