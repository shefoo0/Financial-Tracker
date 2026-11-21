// Per-occurrence overrides: merge a change into the one override for an
// occurrence, and drop the override when nothing differs any more.
import type { Fils, ISODate, OccurrenceOverride, RecurringItem } from '@/types';

export type OverridePatch = Partial<Pick<OccurrenceOverride, 'skip' | 'newDate' | 'newAmount' | 'paid'>>;

export type OverrideAction = { type: 'upsert'; override: OccurrenceOverride } | { type: 'delete'; id: string } | { type: 'none' };

export const isDefaultOverride = (o: Pick<OccurrenceOverride, 'skip' | 'newDate' | 'newAmount' | 'paid'>) =>
  !o.skip && o.newDate == null && o.newAmount == null && !o.paid;

/**
 * Merges `patch` into `existing` (or a fresh override). A new date equal to the
 * original date, or a new amount equal to `baseAmount`, counts as "no change".
 */
export function applyOverridePatch(
  existing: OccurrenceOverride | undefined,
  ids: { recurringId: string; originalDate: ISODate; baseAmount?: Fils },
  patch: OverridePatch,
  makeId: () => string,
): OverrideAction {
  const merged: OccurrenceOverride = {
    id: existing?.id ?? makeId(),
    recurringId: ids.recurringId,
    originalDate: ids.originalDate,
    skip: existing?.skip ?? false,
    newDate: existing?.newDate ?? null,
    newAmount: existing?.newAmount ?? null,
    paid: existing?.paid ?? false,
    ...patch,
  };
  if (merged.newDate === ids.originalDate) merged.newDate = null;
  if (ids.baseAmount != null && merged.newAmount === ids.baseAmount) merged.newAmount = null;
  if (isDefaultOverride(merged)) return existing ? { type: 'delete', id: existing.id } : { type: 'none' };
  return { type: 'upsert', override: merged };
}

/** True when the schedule or start date differs, which would leave the item's overrides pointing at dates that no longer exist. */
export function scheduleChanged(before: Pick<RecurringItem, 'schedule' | 'startDate'>, after: Pick<RecurringItem, 'schedule' | 'startDate'>): boolean {
  if (before.startDate !== after.startDate) return true;
  const norm = (s: RecurringItem['schedule']) =>
    s.type === 'monthly' ? { type: s.type, day: s.day, every: s.everyMonths ?? 1 } : s.type === 'weekly' ? { type: s.type, every: s.everyWeeks === 2 ? 2 : 1 } : { type: s.type, month: s.month, day: s.day };
  return JSON.stringify(norm(before.schedule)) !== JSON.stringify(norm(after.schedule));
}
