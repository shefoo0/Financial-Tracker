// "Coming up": the next recurring occurrences and planned one-time items from today.
import { occurrencesInRange } from '@/engine';
import { Palette } from '@/constants/theme';
import { addDays, diffDays } from '@/lib/dates';
import type { Category, Fils, ISODate, Kind, PlanInput } from '@/types';

export interface UpcomingItem {
  key: string;
  date: ISODate;
  title: string;
  kind: Kind;
  amount: Fils;
  categoryId: string | null;
  /** 'in 5 days', 'today' or 'tomorrow'. */
  when: string;
  /** '3 of 12 paid' for items with a fixed number of payments. */
  progress: string | null;
  href: string;
}

const EMOJI: Record<string, string> = {
  salary: '💼',
  'other-income': '💰',
  housing: '🏠',
  utilities: '💡',
  transport: '🚗',
  groceries: '🛒',
  dining: '☕',
  insurance: '🛡️',
  subscriptions: '🔁',
  health: '🩺',
  shopping: '🛍️',
  entertainment: '🎬',
  'loans-cards': '💳',
  family: '🎁',
  education: '🎓',
  savings: '🏦',
};

/** Emoji for a category, else a generic one for the kind. */
export function categoryEmoji(categoryId: string | null, kind: Kind): string {
  return (categoryId && EMOJI[categoryId]) || (kind === 'income' ? '💰' : '🧾');
}

/** Tile colour for a category (stable per category), neutral grey for none. */
export function categoryColor(categoryId: string | null, categories: Category[]): string {
  const i = categoryId ? categories.findIndex((c) => c.id === categoryId) : -1;
  return i < 0 ? Palette[Palette.length - 1] : Palette[i % Palette.length];
}

export function whenLabel(date: ISODate, todayStr: ISODate): string {
  const n = diffDays(todayStr, date);
  return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
}

/** The next `limit` items in the next `days` days, soonest first. */
export function buildUpcoming(input: PlanInput, todayStr: ISODate, limit = 5, days = 90): UpcomingItem[] {
  const to = addDays(todayStr, days);
  const byId = new Map(input.recurring.map((r) => [r.id, r]));
  const items: UpcomingItem[] = occurrencesInRange(input.recurring, input.overrides, todayStr, to)
    .filter((o) => !o.paid)
    .map((o) => {
      const item = byId.get(o.recurringId);
      let progress: string | null = null;
      if (item && item.count != null && item.count > 0) {
        const before = occurrencesInRange([item], input.overrides, item.startDate, addDays(o.originalDate, -1)).length;
        progress = `${Math.min(before, item.count)} of ${item.count} paid`;
      }
      return {
        key: `r-${o.recurringId}-${o.originalDate}`,
        date: o.date,
        title: o.name,
        kind: o.kind,
        amount: o.amount,
        categoryId: o.categoryId,
        when: whenLabel(o.date, todayStr),
        progress,
        href: `/recurring/${o.recurringId}`,
      };
    });
  for (const t of input.transactions) {
    if (!t.planned || t.date < todayStr || t.date > to) continue;
    items.push({
      key: `t-${t.id}`,
      date: t.date,
      title: t.description || (t.kind === 'income' ? 'Income' : 'Spend'),
      kind: t.kind,
      amount: t.amount,
      categoryId: t.categoryId,
      when: whenLabel(t.date, todayStr),
      progress: null,
      href: `/transaction/${t.id}`,
    });
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title)));
  return items.slice(0, limit);
}
