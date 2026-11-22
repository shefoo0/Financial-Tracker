// The column layout of a CSV / Excel file: checking a remembered one, and telling when a guess is weak.
import type { CsvMapping } from '@/import/parse';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);

/** A remembered layout from storage, or null when it is not a usable mapping. `sheet` is kept for Excel files. */
export function toCsvMapping(v: unknown): (CsvMapping & { sheet?: number }) | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.delimiter !== 'string' || (o.dateOrder !== 'dmy' && o.dateOrder !== 'mdy')) return null;
  const m: CsvMapping & { sheet?: number } = {
    delimiter: o.delimiter,
    headerRow: typeof o.headerRow === 'number' && Number.isInteger(o.headerRow) ? o.headerRow : -1,
    date: num(o.date),
    description: num(o.description),
    debit: num(o.debit),
    credit: num(o.credit),
    amount: num(o.amount),
    balance: num(o.balance),
    direction: num(o.direction),
    dateOrder: o.dateOrder,
  };
  if (num(o.sheet) !== null) m.sheet = o.sheet as number;
  return usable(m) ? m : null;
}

/** A layout can read rows when it has a date and an amount (or debit/credit) column. */
export function usable(m: CsvMapping): boolean {
  return m.date !== null && (m.amount !== null || m.debit !== null || m.credit !== null);
}
