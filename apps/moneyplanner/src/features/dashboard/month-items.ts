import { debtOutflows, chequesInRange } from '@/engine';
import type { Fils, ISODate, Kind, Occurrence, PlanInput, Transaction } from '@/types';

export interface MonthItem {
  key: string;
  date: ISODate;
  title: string;
  kind: Kind;
  amount: Fils;
  badges: string[];
  href: string;
}

/**
 * Merges recurring occurrences and one-time items of a month, sorted by date (then name).
 * Pass the plan input to include debt payments and upcoming cheques too.
 */
export function buildMonthItems(
  occurrences: Occurrence[],
  transactions: Transaction[],
  from: ISODate,
  to: ISODate,
  input?: PlanInput,
): MonthItem[] {
  const items: MonthItem[] = [
    ...occurrences.map((o) => ({
      key: `r-${o.recurringId}-${o.originalDate}`,
      date: o.date,
      title: o.name,
      kind: o.kind,
      amount: o.amount,
      badges: [...(o.paid ? ['Paid'] : []), ...(o.overridden ? ['Moved'] : [])],
      href: `/recurring/${o.recurringId}`,
    })),
    ...transactions
      .filter((t) => t.date >= from && t.date <= to)
      .map((t) => ({
        key: `t-${t.id}`,
        date: t.date,
        title: t.description || (t.kind === 'income' ? 'Income' : 'Spend'),
        kind: t.kind,
        amount: t.amount,
        badges: t.planned ? ['Planned'] : [],
        href: `/transaction/${t.id}`,
      })),
    ...(input
      ? debtOutflows(input, from, to).map((p) => ({
          key: `d-${p.debtId}-${p.originalDate}-${p.label.endsWith('(logged)') ? 'l' : 's'}`,
          date: p.date,
          title: p.label,
          kind: 'cost' as Kind,
          amount: p.amount,
          badges: p.date !== p.originalDate ? ['Moved'] : [],
          href: `/debts/${p.debtId}`,
        }))
      : []),
    ...(input
      ? chequesInRange(input, from, to).map((c) => ({
          key: `c-${c.id}`,
          date: c.date,
          title: `Cheque to ${c.payee}`,
          kind: 'cost' as Kind,
          amount: c.amount,
          badges: c.purpose ? [c.purpose] : [],
          href: `/cheques/${c.id}`,
        }))
      : []),
  ];
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title)));
}
