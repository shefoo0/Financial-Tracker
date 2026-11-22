import type { Cheque, ISODate, PlanInput } from '@/types';
import { compareDates } from '@/lib/dates';

/** Upcoming cheques (cleared and cancelled are ignored) dated between from and to, inclusive, by date. */
export function chequesInRange(input: PlanInput, from: ISODate, to: ISODate): Cheque[] {
  return (input.cheques ?? [])
    .filter((c) => c.status === 'upcoming' && compareDates(c.date, from) >= 0 && compareDates(c.date, to) <= 0)
    .sort((a, b) => compareDates(a.date, b.date) || a.payee.localeCompare(b.payee));
}
