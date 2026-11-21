// Shared domain types. Owned by the lead: ask for changes, don't edit in tasks.

/** A local calendar date, 'YYYY-MM-DD'. Never a Date object in stored data. */
export type ISODate = string;
/** A calendar month, 'YYYY-MM'. */
export type MonthKey = string;
/** Money in integer minor units (fils: 1 AED = 100 fils). Never floats. */
export type Fils = number;

export type Kind = 'income' | 'cost';

/** Optional modules the user can switch on. The planner core is always on. */
export type ModuleId = 'debts' | 'cheques' | 'alerts' | 'import';

export interface Category {
  id: string;
  name: string;
  kind: Kind;
  sort: number;
  archived: boolean;
}

/**
 * When a recurring item happens. The anchor is the item's startDate.
 * - monthly: on `day` (1-31, clamped to the month's last day) or 'last', every `everyMonths` months (default 1)
 * - weekly: on the startDate's weekday, every `everyWeeks` weeks (1 = weekly, 2 = every two weeks)
 * - yearly: on `month` (1-12) / `day` every year
 */
export type Schedule =
  | { type: 'monthly'; day: number | 'last'; everyMonths?: number }
  | { type: 'weekly'; everyWeeks: number }
  | { type: 'yearly'; month: number; day: number };

export interface RecurringItem {
  id: string;
  kind: Kind;
  name: string;
  categoryId: string | null;
  amount: Fils;
  schedule: Schedule;
  startDate: ISODate;
  /** Last date it can happen (inclusive), or null for no end. */
  endDate: ISODate | null;
  /** Number of occurrences, or null for no limit. If both endDate and count are set, whichever comes first. */
  count: number | null;
  note: string;
}

/**
 * A change to one occurrence of a recurring item, keyed by the date it would
 * originally have happened. Any combination of fields may be set.
 */
export interface OccurrenceOverride {
  id: string;
  recurringId: string;
  originalDate: ISODate;
  skip: boolean;
  newDate: ISODate | null;
  newAmount: Fils | null;
  paid: boolean;
}

/** One concrete occurrence of a recurring item, after overrides. Produced by the engine. */
export interface Occurrence {
  recurringId: string;
  name: string;
  kind: Kind;
  categoryId: string | null;
  /** Date it happens (after a move override). */
  date: ISODate;
  /** Date it would have happened without overrides. */
  originalDate: ISODate;
  amount: Fils;
  paid: boolean;
  overridden: boolean;
}

/** A one-time income or spend: past (actual) or future (planned). */
export interface Transaction {
  id: string;
  kind: Kind;
  date: ISODate;
  description: string;
  categoryId: string | null;
  amount: Fils;
  note: string;
  source: 'manual' | 'import';
  importId: string | null;
  /** True for a future item the user expects; false once it has happened. */
  planned: boolean;
}

export interface AlertThresholds {
  /** Debt payments as % of monthly income that triggers a caution. Default 40. */
  debtCautionPct: number;
  /** Debt payments as % of monthly income that triggers a high warning. Default 50. */
  debtHighPct: number;
  /** Credit card usage % of limit that triggers a warning. Default 80. */
  cardUsagePct: number;
}

export interface Settings {
  /** Label shown next to amounts. No conversion is done. */
  currency: string;
  /** Usual salary day (1-31), or null if not set. Informational for the wizard. */
  payday: number | null;
  /** Bank balance the forecast starts from... */
  startingBalance: Fils;
  /** ...as of the end of this date. Flows on or before it are already included in it. */
  startingBalanceDate: ISODate;
  /** Minimum balance the user wants to keep; the forecast warns below it. */
  buffer: Fils;
  enabledModules: Record<ModuleId, boolean>;
  alertThresholds: AlertThresholds;
  onboarded: boolean;
  lockEnabled: boolean;
}

// ---- Engine outputs ----

export interface MonthSummary {
  month: MonthKey;
  recurringIncome: Fils;
  oneTimeIncome: Fils;
  totalIncome: Fils;
  recurringCosts: Fils;
  oneTimeCosts: Fils;
  totalSpend: Fils;
  /** totalIncome - totalSpend */
  freeMoney: Fils;
  /** totalSpend / totalIncome * 100, or null when there's no income. */
  spentPct: number | null;
  /** Spend per category id ('uncategorized' for null), recurring + one-time costs. */
  costsByCategory: Record<string, Fils>;
}

export interface YearSummary {
  year: number;
  /** Always 12 entries, January to December. */
  months: MonthSummary[];
  totalIncome: Fils;
  totalSpend: Fils;
  freeMoney: Fils;
  /** Running total of freeMoney, 12 entries. */
  cumulativeFreeMoney: Fils[];
  averageMonthlySpend: Fils;
  /** Month with the highest totalSpend, or null if there was no spend. */
  highestSpendMonth: MonthKey | null;
  costsByCategory: Record<string, Fils>;
}

export interface ForecastEvent {
  date: ISODate;
  label: string;
  kind: Kind;
  amount: Fils;
  source: 'recurring' | 'transaction';
  refId: string;
}

export interface ForecastDay {
  date: ISODate;
  inflow: Fils;
  outflow: Fils;
  /** Balance at the end of this day. */
  balance: Fils;
  events: ForecastEvent[];
}

export interface ForecastMonth {
  month: MonthKey;
  startBalance: Fils;
  income: Fils;
  spend: Fils;
  endBalance: Fils;
  minBalance: Fils;
  minBalanceDate: ISODate;
}

export interface Forecast {
  /** First forecast day (the day after `asOf`). */
  from: ISODate;
  /** The date the balance is known for (today, or the starting balance date if later). */
  asOf: ISODate;
  balanceAsOf: Fils;
  /** Daily, `days` long. */
  days: ForecastDay[];
  /** Monthly, starting with the month containing `from`, `months` long. */
  months: ForecastMonth[];
  /** Lowest end-of-day balance across the daily range. */
  lowest: { date: ISODate; balance: Fils };
  /** First day the balance goes below the buffer within the daily range, or null. */
  firstBelowBuffer: { date: ISODate; balance: Fils } | null;
}

/** Everything the engine needs. Plain data, no storage or React. */
export interface PlanInput {
  settings: Settings;
  categories: Category[];
  recurring: RecurringItem[];
  overrides: OccurrenceOverride[];
  transactions: Transaction[];
}
