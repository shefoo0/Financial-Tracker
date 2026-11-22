// "Mark paid" without a form: writes exactly one change and returns a function that reverses it.
import type { Repository } from '@/data/repository';
import type { MarkPaid } from '@/features/dashboard/upcoming';
import { applyOverridePatch } from '@/features/items/overrides';
import { compareDates } from '@/lib/dates';
import { newId } from '@/lib/id';
import type { PlanInput } from '@/types';

export type Undo = () => Promise<void>;

/** Records the payment and returns an undo, or null when the item is not there any more. */
export async function markPaid(repo: Repository, input: PlanInput, what: MarkPaid, todayStr: string, makeId: () => string = newId): Promise<Undo | null> {
  switch (what.kind) {
    case 'recurring': {
      const existing = input.overrides.find((o) => o.recurringId === what.recurringId && o.originalDate === what.originalDate);
      const action = applyOverridePatch(existing, { recurringId: what.recurringId, originalDate: what.originalDate }, { paid: true }, makeId);
      if (action.type !== 'upsert') return null;
      await repo.upsertOverride(action.override);
      return async () => {
        if (existing) await repo.upsertOverride(existing);
        else await repo.deleteOverride(action.override.id);
      };
    }
    case 'debt': {
      const id = makeId();
      const date = compareDates(what.date, todayStr) < 0 ? todayStr : what.date;
      await repo.upsertDebtPayment({ id, debtId: what.debtId, date, amount: what.amount, kind: 'regular', note: '' });
      return () => repo.deleteDebtPayment(id);
    }
    case 'cheque': {
      const cheque = input.cheques.find((c) => c.id === what.chequeId);
      if (!cheque) return null;
      await repo.upsertCheques([{ ...cheque, status: 'cleared' }]);
      return () => repo.upsertCheques([cheque]);
    }
    case 'planned': {
      const t = input.transactions.find((x) => x.id === what.transactionId);
      if (!t) return null;
      await repo.upsertTransaction({ ...t, planned: false });
      return () => repo.upsertTransaction(t);
    }
  }
}
