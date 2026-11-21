// STUB — task T1 replaces these with the real engine. The signatures are the
// contract the screens are built against: keep them (adding is fine).
import type {
  Forecast,
  ISODate,
  MonthKey,
  MonthSummary,
  Occurrence,
  OccurrenceOverride,
  PlanInput,
  RecurringItem,
  YearSummary,
} from '@/types';

/** Occurrences of one recurring item between from and to (inclusive), after its overrides. Skipped ones are left out. */
export function expandRecurring(
  _item: RecurringItem,
  _overrides: OccurrenceOverride[],
  _from: ISODate,
  _to: ISODate,
): Occurrence[] {
  throw new Error('engine: not implemented yet (task T1)');
}

/** Occurrences of all recurring items between from and to (inclusive), sorted by date then name. */
export function occurrencesInRange(
  _items: RecurringItem[],
  _overrides: OccurrenceOverride[],
  _from: ISODate,
  _to: ISODate,
): Occurrence[] {
  throw new Error('engine: not implemented yet (task T1)');
}

/** The spreadsheet's month summary for one month. */
export function monthSummary(_month: MonthKey, _input: PlanInput): MonthSummary {
  throw new Error('engine: not implemented yet (task T1)');
}

/** The spreadsheet's year dashboard. */
export function yearSummary(_year: number, _input: PlanInput): YearSummary {
  throw new Error('engine: not implemented yet (task T1)');
}

/**
 * Balance forecast from `today` (or the starting balance date, if later):
 * `days` daily entries (default 60) and `months` monthly entries (default 24).
 */
export function forecast(_input: PlanInput, _opts: { today: ISODate; days?: number; months?: number }): Forecast {
  throw new Error('engine: not implemented yet (task T1)');
}
