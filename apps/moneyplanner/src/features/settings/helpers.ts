// Pure helpers for the setup wizard, Settings and Categories screens.
import { addMonths, daysInMonth, monthKey, parseISODate, toISODate } from '@/lib/dates';
import { newId } from '@/lib/id';
import type { Category, Fils, ISODate, Kind, ModuleId, RecurringItem } from '@/types';

export type PaydayDay = number | 'last';

export const MODULE_INFO: { id: ModuleId; label: string; description: string }[] = [
  { id: 'debts', label: 'Debts', description: 'Loans, credit cards and instalment plans' },
  { id: 'cheques', label: 'Cheques', description: 'Post-dated cheques you have written or expect' },
  { id: 'alerts', label: 'Alerts', description: 'Warnings before money runs short' },
  { id: 'import', label: 'Statement import', description: 'Read bank and card statements' },
];

/** Select options for a payday: "Not set", 1-31 and "Last day of the month". Values are strings. */
export const PAYDAY_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'Not set' },
  ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `Day ${i + 1}` })),
  { value: 'last', label: 'Last day of the month' },
];

export function paydayToChoice(payday: number | null): string {
  return payday == null ? 'none' : String(payday);
}

/** Select value -> payday day, or null when not set. */
export function choiceToPayday(choice: string): PaydayDay | null {
  if (choice === 'last') return 'last';
  const n = Number(choice);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

/** What is stored in settings.payday: 'last' is kept as 31 (clamped to the month's end). */
export function paydayForSettings(day: PaydayDay | null): number | null {
  return day === 'last' ? 31 : day;
}

export function formatPayday(payday: number | null): string {
  return payday == null ? 'Not set' : payday === 31 ? 'Day 31 (or the last day)' : `Day ${payday}`;
}

/** The next date on or after `from` that falls on payday (clamped to short months). */
export function nextPayday(from: ISODate, day: PaydayDay): ISODate {
  const { year, month } = parseISODate(from);
  const inMonth = (y: number, m: number) => toISODate(y, m, day === 'last' ? daysInMonth(y, m) : Math.min(day, daysInMonth(y, m)));
  const thisMonth = inMonth(year, month);
  if (thisMonth >= from) return thisMonth;
  const next = addMonths(`${monthKey(from)}-01`, 1);
  const n = parseISODate(next);
  return inMonth(n.year, n.month);
}

/** The recurring "Salary" income made by the wizard. */
export function buildSalaryItem(amount: Fils, day: PaydayDay, todayDate: ISODate): RecurringItem {
  return {
    id: newId(),
    kind: 'income',
    name: 'Salary',
    categoryId: 'salary',
    amount,
    schedule: { type: 'monthly', day },
    startDate: nextPayday(todayDate, day),
    endDate: null,
    count: null,
    note: '',
  };
}

/** Balance entered as a positive number, negative when the account is overdrawn. */
export function signedBalance(amount: Fils | null, overdrawn: boolean): Fils {
  const a = Math.abs(amount ?? 0);
  return overdrawn && a !== 0 ? -a : a;
}

/** Currency label: 1-6 characters after trimming. Returns an error message or null. */
export function validateCurrency(text: string): string | null {
  const t = text.trim();
  if (t.length < 1) return 'Enter a currency label, for example AED.';
  if (t.length > 6) return 'Use 6 characters or fewer.';
  return null;
}

export function validateCategoryName(name: string, existing: Category[], kind: Kind, ignoreId?: string): string | null {
  const t = name.trim();
  if (!t) return 'Enter a name.';
  if (t.length > 40) return 'Use 40 characters or fewer.';
  const clash = existing.some((c) => !c.archived && c.id !== ignoreId && c.kind === kind && c.name.trim().toLowerCase() === t.toLowerCase());
  return clash ? 'You already have a category with this name.' : null;
}

export function buildCategory(name: string, kind: Kind, existing: Category[]): Category {
  const sort = existing.reduce((max, c) => Math.max(max, c.sort), -1) + 1;
  return { id: newId(), name: name.trim(), kind, sort, archived: false };
}

export function activeCategories(all: Category[], kind: Kind): Category[] {
  return all.filter((c) => !c.archived && c.kind === kind).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}
