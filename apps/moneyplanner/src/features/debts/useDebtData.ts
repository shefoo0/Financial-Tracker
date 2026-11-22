// Loads what the debts screens need: the engine input (active debts only) plus every debt.
import { useRepoQuery } from '@/data/DataProvider';
import type { Debt, PlanInput } from '@/types';

export interface DebtData {
  /** Engine input. Archived debts are left out of `debts`. */
  input: PlanInput;
  /** All debts, archived included. */
  all: Debt[];
}

export function useDebtData() {
  return useRepoQuery<DebtData>(async (r) => {
    const [settings, categories, recurring, overrides, transactions, debts, debtPayments, debtOverrides, cheques] = await Promise.all([
      r.getSettings(),
      r.listCategories(),
      r.listRecurring(),
      r.listOverrides(),
      r.listTransactions(),
      r.listDebts(),
      r.listDebtPayments(),
      r.listDebtOverrides(),
      r.listCheques(),
    ]);
    return { input: { settings, categories, recurring, overrides, transactions, debts: debts.filter((d) => !d.archived), debtPayments, debtOverrides, cheques }, all: debts };
  });
}
