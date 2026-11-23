// Engine results shared by every screen and the notification scheduler: computed once per loaded plan input
// (the object DataProvider hands out) and day, then reused. A reload after a write makes a new input, so the old
// results are garbage collected with it.
import { balanceHistory, buildAlerts, forecast, type HistoryDay } from '@/engine';
import type { AppAlert, Forecast, PlanInput } from '@/types';

const results = new WeakMap<PlanInput, Map<string, unknown>>();

function memo<T>(input: PlanInput, key: string, compute: () => T): T {
  let perInput = results.get(input);
  if (!perInput) results.set(input, (perInput = new Map()));
  if (!perInput.has(key)) perInput.set(key, compute());
  return perInput.get(key) as T;
}

/** The alerts for `day` (not sorted). */
export const alertsFor = (input: PlanInput, day: string): AppAlert[] => memo(input, `alerts|${day}`, () => buildAlerts(input, day));

/** The forecast from `day` for `days` days and `months` months. */
export const forecastFor = (input: PlanInput, day: string, days: number, months: number): Forecast =>
  memo(input, `forecast|${day}|${days}|${months}`, () => forecast(input, { today: day, days, months }));

/** The recorded balance per day for the last `days` days up to `day`. */
export const historyFor = (input: PlanInput, day: string, days: number): HistoryDay[] => memo(input, `history|${day}|${days}`, () => balanceHistory(input, day, days));
