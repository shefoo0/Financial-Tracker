// Monthly category limits ("spent vs left") and opening/closing balance of a month.
import type { Fils, MonthKey, PlanInput } from '@/types';
import { forecast, monthSummary } from './forecast';
import { addMonthKey, monthEnd } from '@/lib/dates';

export interface CategoryLimitRow {
  categoryId: string;
  name: string;
  limit: Fils;
  /** Recurring + one-time costs in the category this month. */
  spent: Fils;
  /** limit - spent: negative when over. */
  left: Fils;
  /** spent / limit * 100, rounded to a whole number (can be above 100). */
  pct: number;
  over: boolean;
}

/** Only active cost categories that have a limit above zero, in category order. */
export function categoryLimits(month: MonthKey, input: PlanInput): CategoryLimitRow[] {
  const withLimit = input.categories.filter((c) => c.kind === 'cost' && !c.archived && c.monthlyLimit != null && c.monthlyLimit > 0);
  if (withLimit.length === 0) return [];
  const { costsByCategory } = monthSummary(month, input);
  return withLimit
    .sort((a, b) => a.sort - b.sort)
    .map((c) => {
      const limit = c.monthlyLimit as Fils;
      const spent = costsByCategory[c.id] ?? 0;
      return { categoryId: c.id, name: c.name, limit, spent, left: limit - spent, pct: Math.round((spent / limit) * 100), over: spent > limit };
    });
}

export interface MonthBalances {
  opening: Fils;
  closing: Fils;
  /** True when closing is a forecast (the month is not over yet). */
  projected: boolean;
}

/**
 * Balance at the start and end of a month: starting balance plus all flows,
 * the same flows the forecast uses. Projected unless the month is entirely in the past.
 */
export function monthBalances(month: MonthKey, input: PlanInput, today: string): MonthBalances {
  const startDate = input.settings.startingBalanceDate;
  const balanceAt = (date: string): Fils => {
    // Balance at the end of `date` (the starting balance is known at the end of its own date).
    if (date < startDate) return input.settings.startingBalance;
    const f = forecast(input, { today: date, days: 0, months: 0 });
    return f.balanceAsOf;
  };
  const prevEnd = monthEnd(addMonthKey(month, -1));
  const opening = balanceAt(prevEnd);
  const closing = balanceAt(monthEnd(month));
  return { opening, closing, projected: monthEnd(month) >= today };
}
