// Move money between the user's own accounts (milestone 3b): two items with one transferId, never spending or income.
import { isValidISODate } from '@/lib/dates';
import { MAIN_ACCOUNT_ID, type Fils, type ISODate, type Transaction } from '@/types';

export interface TransferForm {
  from: string;
  to: string;
  amount: Fils | null;
  date: ISODate;
  note: string;
}

export type TransferErrors = Partial<Record<'to' | 'amount' | 'date', string>>;

/** The two sides of a transfer, or the problems with the form. */
export function buildTransfer(
  form: TransferForm,
  names: { from: string; to: string },
  ids: { out: string; in: string; transfer: string },
): { errors: TransferErrors; items: null } | { errors: Record<string, never>; items: [Transaction, Transaction] } {
  const errors: TransferErrors = {};
  if (form.from === form.to) errors.to = 'Choose a different account to move the money to.';
  if (form.amount == null || form.amount <= 0) errors.amount = 'Enter an amount greater than zero.';
  if (!isValidISODate(form.date)) errors.date = 'Choose a date.';
  if (Object.keys(errors).length) return { errors, items: null };
  const side = (id: string, kind: 'cost' | 'income', accountId: string, description: string): Transaction => ({
    id,
    kind,
    date: form.date,
    description,
    categoryId: null,
    amount: form.amount as Fils,
    note: form.note.trim(),
    source: 'manual',
    importId: null,
    planned: false,
    transferId: ids.transfer,
    ...(accountId !== MAIN_ACCOUNT_ID ? { accountId } : {}),
  });
  return {
    errors: {},
    items: [side(ids.out, 'cost', form.from, `To ${names.to}`), side(ids.in, 'income', form.to, `From ${names.from}`)],
  };
}
