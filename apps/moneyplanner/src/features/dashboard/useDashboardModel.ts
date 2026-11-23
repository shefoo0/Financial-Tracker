import { useMemo, useState } from 'react';

import { monthSummary, yearSummary } from '@/engine';
import { categoryBars } from '@/features/dashboard/helpers';
import { buildUpcoming } from '@/features/dashboard/upcoming';
import { useToday } from '@/features/dashboard/useToday';
import { forecastFor, historyFor } from '@/features/plan/memo';
import { monthKey } from '@/lib/dates';
import type { PlanInput } from '@/types';

/** A row of the year table: its label and the value for month index `i`. */
export interface YearRow {
  label: string;
  get: (i: number) => number | null;
  kind?: 'pct' | 'money';
  bold?: boolean;
}

/**
 * Everything the Home screen shows, derived from the plan input: today, the forecast and balance history (shared
 * with other screens through the memo), the selected month and year with their summaries, the category bars and
 * the "coming up" list. The selectors (month, year, category scope) live here too.
 */
export function useDashboardModel(input: PlanInput) {
  const todayStr = useToday();
  const currentMonth = monthKey(todayStr);
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(Number(currentMonth.slice(0, 4)));
  const [catScope, setCatScope] = useState<'month' | 'year'>('month');

  const empty = input.recurring.length === 0 && input.transactions.length === 0 && input.debts.length === 0 && input.cheques.length === 0;
  const fc = forecastFor(input, todayStr, 60, 12);
  const history = historyFor(input, todayStr, 400);
  const ms = useMemo(() => monthSummary(month, input), [month, input]);
  const ys = useMemo(() => yearSummary(year, input), [year, input]);
  const upcoming = useMemo(() => buildUpcoming(input, todayStr), [input, todayStr]);
  const bars = categoryBars(catScope === 'month' ? ms.costsByCategory : ys.costsByCategory, input.categories);

  const rows: YearRow[] = [
    { label: 'Recurring income', get: (i) => ys.months[i].recurringIncome },
    { label: 'One-time income', get: (i) => ys.months[i].oneTimeIncome },
    { label: 'Total income', get: (i) => ys.months[i].totalIncome, bold: true },
    { label: 'Recurring costs', get: (i) => ys.months[i].recurringCosts },
    { label: 'One-time costs', get: (i) => ys.months[i].oneTimeCosts },
    { label: 'Total spend', get: (i) => ys.months[i].totalSpend, bold: true },
    { label: 'Free money', get: (i) => ys.months[i].freeMoney, bold: true },
    { label: 'Cumulative free money', get: (i) => ys.cumulativeFreeMoney[i] },
    { label: 'Spent %', get: (i) => ys.months[i].spentPct, kind: 'pct' },
  ];

  return { todayStr, currentMonth, month, setMonth, year, setYear, catScope, setCatScope, empty, fc, history, ms, ys, upcoming, bars, rows };
}
