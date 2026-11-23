// The Home cards as data: id, title, component, which edit sheet its pencil opens (or none) and whether it starts
// shown. The saved layout (settings.homeLayout) decides the order and visibility; the default order is the order of
// FIXED_CARD_IDS in ./layout. Added charts are cards too (`chart:<id>`), drawn by the shared ChartCard.
import type { ComponentType } from 'react';

import { ADDABLE_CHARTS, ChartCard } from '@/components/charts';
import { AlertsCard } from '@/features/alerts/AlertsCard';
import { alertsFor } from '@/features/plan/memo';
import { BackupReminderCard } from '@/features/backup/BackupReminderCard';
import { PaydayCard } from '@/features/payday/PaydayCard';
import { ReportsCard } from '@/features/reports/ReportsCard';
import { BalanceCard } from './BalanceCard';
import type { HomeCtx, SheetKey } from './ctx';
import { CHART_CARD_PREFIX, FIXED_CARD_IDS, defaultHomeLayout } from './layout';
import { CategoriesCard, EndOfMonthCard, MonthCard, TilesCard, YearCard } from './MonthCards';
import { UpcomingCard } from './UpcomingCard';

export interface HomeCardDef {
  id: string;
  title: string;
  /** What the card is, for the Edit Home list. */
  description: string;
  component: ComponentType<{ ctx: HomeCtx }>;
  /** The sheet its pencil opens, or null for a card without a pencil. */
  sheet: SheetKey | null;
  defaultVisible: boolean;
  /** Added through the gallery (can be removed), not one of the fixed cards. */
  chartId?: string;
  /** False when the card draws nothing right now (so its pencil is not shown either). */
  hasContent?: (ctx: HomeCtx) => boolean;
}

const FIXED: Record<(typeof FIXED_CARD_IDS)[number], Omit<HomeCardDef, 'id' | 'defaultVisible'>> = {
  balance: { title: 'Balance', description: 'Balance today and the forecast chart', component: BalanceCard, sheet: 'balance' },
  payday: { title: 'Safe to spend', description: 'What is free until payday', component: ({ ctx }) => <PaydayCard input={ctx.input} today={ctx.model.todayStr} />, sheet: 'payday' },
  tiles: { title: 'Income, spent, free', description: 'Three tiles for this month', component: TilesCard, sheet: null },
  alerts: {
    title: 'Alerts',
    description: 'What needs a look: low balance, debts, cheques',
    component: () => <AlertsCard limit={4} />,
    sheet: 'alerts',
    hasContent: (ctx) => alertsFor(ctx.input, ctx.model.todayStr).length > 0,
  },
  upcoming: { title: 'Coming up', description: 'The next payments and income', component: UpcomingCard, sheet: 'reminders' },
  reports: { title: 'Reports', description: 'Quarterly and yearly reports', component: ({ ctx }) => <ReportsCard input={ctx.input} />, sheet: null },
  month: { title: 'This month', description: 'Income, costs and free money for a month', component: MonthCard, sheet: null },
  categories: { title: 'Spending by category', description: 'Where the money goes', component: CategoriesCard, sheet: 'spending' },
  endOfMonth: { title: 'End-of-month balances', description: 'The balance at the end of each of the next 12 months', component: EndOfMonthCard, sheet: null },
  year: { title: 'Year table', description: 'Month by month income, spending and free money', component: YearCard, sheet: null },
  backup: { title: 'Backup reminder', description: 'A monthly nudge to save a backup file', component: () => <BackupReminderCard testID="home-backup-reminder" />, sheet: null },
};

const defaultVisible = new Map(defaultHomeLayout().map((e) => [e.id, e.visible]));

/** Every fixed card, in the default order. */
export const FIXED_CARDS: readonly HomeCardDef[] = FIXED_CARD_IDS.map((id) => ({ id, defaultVisible: defaultVisible.get(id) ?? false, ...FIXED[id] }));

/** The card for an id in the saved layout, or undefined for an unknown one. */
export function cardFor(id: string): HomeCardDef | undefined {
  const fixed = FIXED_CARDS.find((c) => c.id === id);
  if (fixed) return fixed;
  if (!id.startsWith(CHART_CARD_PREFIX)) return undefined;
  const chart = ADDABLE_CHARTS.find((c) => `${CHART_CARD_PREFIX}${c.id}` === id);
  if (!chart) return undefined;
  return {
    id,
    title: chart.title,
    description: chart.description ?? '',
    sheet: null,
    defaultVisible: false,
    chartId: chart.id,
    component: ({ ctx }) => <ChartCard def={chart} input={ctx.input} today={ctx.model.todayStr} />,
  };
}
