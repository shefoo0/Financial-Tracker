// Turns an edit of one scheduled debt payment into a repository action.
import type { DebtOverride, Fils, ISODate } from '@/types';

export interface DebtOverridePatch {
  skip?: boolean;
  newDate?: ISODate | null;
  newAmount?: Fils | null;
}

export type DebtOverrideAction = { type: 'upsert'; override: DebtOverride } | { type: 'delete'; id: string } | { type: 'none' };

/**
 * Merges `patch` into the payment's existing override (if any). An override
 * with nothing changed is removed again, so "Undo" leaves no trace.
 */
export function applyDebtOverridePatch(
  existing: DebtOverride | undefined,
  base: { debtId: string; originalDate: ISODate },
  patch: DebtOverridePatch,
  makeId: () => string,
): DebtOverrideAction {
  const next: DebtOverride = {
    id: existing?.id ?? makeId(),
    debtId: base.debtId,
    originalDate: base.originalDate,
    newDate: existing?.newDate ?? null,
    newAmount: existing?.newAmount ?? null,
    skip: existing?.skip ?? false,
    ...patch,
  };
  if (next.newDate === base.originalDate) next.newDate = null;
  if (!next.skip && next.newDate == null && next.newAmount == null) {
    return existing ? { type: 'delete', id: existing.id } : { type: 'none' };
  }
  return { type: 'upsert', override: next };
}
