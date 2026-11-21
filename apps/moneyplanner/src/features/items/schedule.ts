// Words for schedules and end rules ("Monthly on the 25th", "until Mar 2027").
import { formatMonth, weekday } from '@/lib/dates';
import type { ISODate, RecurringItem, Schedule } from '@/types';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** 1 -> "1st", 22 -> "22nd", 11 -> "11th". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** The schedule in words. `startDate` gives the weekday for weekly schedules. */
export function describeSchedule(schedule: Schedule, startDate?: ISODate): string {
  switch (schedule.type) {
    case 'monthly': {
      const every = schedule.everyMonths ?? 1;
      const on = schedule.day === 'last' ? 'the last day' : `the ${ordinal(schedule.day)}`;
      return every === 1 ? `Monthly on ${on}` : `Every ${every} months on ${on}`;
    }
    case 'weekly': {
      const base = schedule.everyWeeks === 1 ? 'Every week' : `Every ${schedule.everyWeeks} weeks`;
      return startDate ? `${base} on ${WEEKDAY_NAMES[weekday(startDate)]}` : base;
    }
    case 'yearly':
      return `Yearly on ${schedule.day} ${MONTH_SHORT[schedule.month - 1]}`;
  }
}

/** End rule in words, or null when the item never ends. */
export function describeEnd(item: Pick<RecurringItem, 'endDate' | 'count'>): string | null {
  const parts: string[] = [];
  if (item.count != null) parts.push(`${item.count} ${item.count === 1 ? 'payment' : 'payments'}`);
  if (item.endDate) parts.push(`until ${formatMonth(item.endDate.slice(0, 7))}`);
  return parts.length ? parts.join(', or ') : null;
}
