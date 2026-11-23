// Form state, validation and conversion for recurring and one-time items.
import { compareDates, daysInMonth, isValidISODate, parseISODate, today } from '@/lib/dates';
import type { Category, Fils, ISODate, Kind, RecurringItem, Schedule, Transaction } from '@/types';
import { MAIN_WHERE, placeOf, whereOf, type Where } from '@/features/accounts/where';

export type ScheduleType = 'monthly' | 'weekly' | 'yearly';
export type EndMode = 'none' | 'date' | 'count';

export interface RecurringForm {
  kind: Kind;
  name: string;
  categoryId: string | null;
  amount: Fils | null;
  scheduleType: ScheduleType;
  monthlyMode: 'day' | 'last';
  /** Day of month as typed (monthly and yearly). */
  day: string;
  everyMonths: string;
  everyWeeks: 1 | 2;
  /** Yearly month, 1-12. */
  month: number;
  startDate: ISODate;
  endMode: EndMode;
  endDate: ISODate | null;
  count: string;
  note: string;
  /** Account or card ('main', 'acc:<id>', 'card:<id>'). */
  where: Where;
}

export type FormErrors<K extends string> = Partial<Record<K, string>>;
export type RecurringField = 'name' | 'amount' | 'day' | 'everyMonths' | 'month' | 'startDate' | 'endDate' | 'count';

export function emptyRecurringForm(kind: Kind, now: ISODate = today()): RecurringForm {
  const { day, month } = parseISODate(now);
  return {
    kind,
    name: '',
    categoryId: null,
    amount: null,
    scheduleType: 'monthly',
    monthlyMode: 'day',
    day: String(day),
    everyMonths: '1',
    everyWeeks: 1,
    month,
    startDate: now,
    endMode: 'none',
    endDate: null,
    count: '12',
    note: '',
    where: MAIN_WHERE,
  };
}

export function formFromRecurring(item: RecurringItem): RecurringForm {
  const base = emptyRecurringForm(item.kind, item.startDate);
  const s = item.schedule;
  const form: RecurringForm = {
    ...base,
    kind: item.kind,
    name: item.name,
    categoryId: item.categoryId,
    amount: item.amount,
    scheduleType: s.type,
    startDate: item.startDate,
    endMode: item.count != null ? 'count' : item.endDate ? 'date' : 'none',
    endDate: item.endDate,
    count: item.count != null ? String(item.count) : '12',
    note: item.note,
    where: whereOf(item),
  };
  if (s.type === 'monthly') {
    form.monthlyMode = s.day === 'last' ? 'last' : 'day';
    form.day = s.day === 'last' ? String(parseISODate(item.startDate).day) : String(s.day);
    form.everyMonths = String(s.everyMonths ?? 1);
  } else if (s.type === 'weekly') {
    form.everyWeeks = s.everyWeeks === 2 ? 2 : 1;
  } else {
    form.month = s.month;
    form.day = String(s.day);
  }
  return form;
}

const isWholeNumber = (t: string) => /^\d+$/.test(t.trim());

/** Validates the form. Returns messages per field, or the finished item when there are none. */
export function validateRecurring(
  form: RecurringForm,
  id: string,
): { errors: FormErrors<RecurringField>; item: null } | { errors: Record<string, never>; item: RecurringItem } {
  const errors: FormErrors<RecurringField> = {};
  if (!form.name.trim()) errors.name = 'Enter a name, for example "Salary" or "Rent".';
  if (form.amount == null || form.amount <= 0) errors.amount = 'Enter an amount greater than zero.';
  if (!isValidISODate(form.startDate)) errors.startDate = 'Choose a start date.';

  let schedule: Schedule | null = null;
  if (form.scheduleType === 'monthly') {
    const every = Number(form.everyMonths);
    if (!isWholeNumber(form.everyMonths) || every < 1 || every > 12) errors.everyMonths = 'Enter a whole number from 1 to 12.';
    let day: number | 'last' = 'last';
    if (form.monthlyMode === 'day') {
      day = Number(form.day);
      if (!isWholeNumber(form.day) || day < 1 || day > 31) errors.day = 'Enter a day from 1 to 31.';
    }
    if (!errors.everyMonths && !errors.day) schedule = { type: 'monthly', day, everyMonths: every };
  } else if (form.scheduleType === 'weekly') {
    schedule = { type: 'weekly', everyWeeks: form.everyWeeks };
  } else {
    const day = Number(form.day);
    const max = daysInMonth(2024, form.month); // leap year: Feb 29 allowed (clamped in other years)
    if (!isWholeNumber(form.day) || day < 1 || day > max) errors.day = `Enter a day from 1 to ${max}.`;
    else schedule = { type: 'yearly', month: form.month, day };
  }

  let endDate: ISODate | null = null;
  let count: number | null = null;
  if (form.endMode === 'date') {
    if (!form.endDate || !isValidISODate(form.endDate)) errors.endDate = 'Choose an end date.';
    else if (isValidISODate(form.startDate) && compareDates(form.endDate, form.startDate) < 0) errors.endDate = 'The end date must be on or after the start date.';
    else endDate = form.endDate;
  } else if (form.endMode === 'count') {
    const n = Number(form.count);
    if (!isWholeNumber(form.count) || n < 1 || n > 1200) errors.count = 'Enter a whole number of payments from 1 to 1200.';
    else count = n;
    // An end date saved together with a count stays (the item stops at whichever comes first).
    if (form.endDate && isValidISODate(form.endDate) && isValidISODate(form.startDate) && compareDates(form.endDate, form.startDate) >= 0) endDate = form.endDate;
  }

  if (Object.keys(errors).length || !schedule) return { errors, item: null };
  return {
    errors: {},
    item: {
      id,
      kind: form.kind,
      name: form.name.trim(),
      categoryId: form.categoryId,
      amount: form.amount as Fils,
      schedule,
      startDate: form.startDate,
      endDate,
      count,
      note: form.note.trim(),
      ...placeOf(form.where ?? MAIN_WHERE),
    },
  };
}

// ---- One-time items ----

export interface TransactionForm {
  kind: Kind;
  description: string;
  amount: Fils | null;
  date: ISODate;
  categoryId: string | null;
  planned: boolean;
  note: string;
  /** Account or card ('main', 'acc:<id>', 'card:<id>'): see features/accounts/where. */
  where: Where;
}
export type TransactionField = 'description' | 'amount' | 'date';

/** New items default to "planned" only when the date is in the future. */
export function defaultPlanned(date: ISODate, now: ISODate = today()): boolean {
  return compareDates(date, now) > 0;
}

export function emptyTransactionForm(kind: Kind, date: ISODate = today(), where: Where = MAIN_WHERE): TransactionForm {
  return { kind, description: '', amount: null, date, categoryId: null, planned: defaultPlanned(date), note: '', where };
}

export function formFromTransaction(t: Transaction): TransactionForm {
  return { kind: t.kind, description: t.description, amount: t.amount, date: t.date, categoryId: t.categoryId, planned: t.planned, note: t.note, where: whereOf(t) };
}

export function validateTransaction(
  form: TransactionForm,
  base: Pick<Transaction, 'id'> & Partial<Pick<Transaction, 'source' | 'importId' | 'transferId'>>,
): { errors: FormErrors<TransactionField>; item: null } | { errors: Record<string, never>; item: Transaction } {
  const errors: FormErrors<TransactionField> = {};
  if (!form.description.trim()) errors.description = 'Enter a description, for example "Groceries".';
  if (form.amount == null || form.amount <= 0) errors.amount = 'Enter an amount greater than zero.';
  if (!isValidISODate(form.date)) errors.date = 'Choose a date.';
  if (Object.keys(errors).length) return { errors, item: null };
  return {
    errors: {},
    item: {
      id: base.id,
      kind: form.kind,
      date: form.date,
      description: form.description.trim(),
      categoryId: form.categoryId,
      amount: form.amount as Fils,
      note: form.note.trim(),
      source: base.source ?? 'manual',
      importId: base.importId ?? null,
      planned: form.planned,
      ...placeOf(form.where ?? MAIN_WHERE),
      // Editing one side of a transfer keeps it a transfer.
      ...(base.transferId ? { transferId: base.transferId } : {}),
    },
  };
}

// ---- Categories ----

/** Categories for a kind: not archived (unless it's the current one), sorted. */
export function categoryOptions(categories: Category[], kind: Kind, currentId: string | null) {
  return categories
    .filter((c) => c.kind === kind && (!c.archived || c.id === currentId))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.archived ? `${c.name} (archived)` : c.name }));
}
