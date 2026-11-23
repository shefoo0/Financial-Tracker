// What every Home card gets: the loaded plan, the dashboard model, and the few actions cards share.
import type { useDashboardModel } from '@/features/dashboard/useDashboardModel';
import type { UpcomingItem } from '@/features/dashboard/upcoming';
import type { PlanInput } from '@/types';

export type DashboardModel = ReturnType<typeof useDashboardModel>;

/** The edit sheets a card's pencil can open (the sheets live in features/edit). */
export type SheetKey = 'balance' | 'payday' | 'reminders' | 'alerts' | 'spending';

export interface HomeCtx {
  input: PlanInput;
  model: DashboardModel;
  /** Money in the profile's currency label ("AED 1,200.00"). */
  money: (fils: number) => string;
  onPaid: (u: UpcomingItem) => void;
  toggleReminder: (u: UpcomingItem) => void;
  openSheet: (key: SheetKey) => void;
  /** The "Tap ✎ to edit" tip is showing on the balance card. */
  balanceTip: boolean;
  dismissTip: (id: string) => void;
}
