import type { Fils, ISODate, Kind, Occurrence, Transaction } from '@/types';

export interface MonthItem {
  key: string;
  date: ISODate;
  title: string;
  kind: Kind;
  amount: Fils;
  badges: string[];
  href: string;
}

/** Merges recurring occurrences and one-time items of a month, sorted by date (then name). */
export function buildMonthItems(occurrences: Occurrence[], transactions: Transaction[], from: ISODate, to: ISODate): MonthItem[] {
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
  ];
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title)));
}
