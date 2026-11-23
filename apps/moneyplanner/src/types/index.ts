// Shared domain types. Owned by the lead: ask for changes, don't edit in tasks.
import type { ChartStyleName } from '@/constants/theme';

/** A local calendar date, 'YYYY-MM-DD'. Never a Date object in stored data. */
export type ISODate = string;
/** A calendar month, 'YYYY-MM'. */
export type MonthKey = string;
/** Money in integer minor units (fils: 1 AED = 100 fils). Never floats. */
export type Fils = number;

export type Kind = 'income' | 'cost';

export interface Category {
  id: string;
  name: string;
  kind: Kind;
  sort: number;
  archived: boolean;
  /** Optional monthly spending limit for a cost category; null or missing means none (repositories return null). */
  monthlyLimit?: Fils | null;
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
  /** Bank or cash account the money goes out of or into (Account.id); null or missing = the main account. */
  accountId?: string | null;
  /** Card (a card in Debts) it is charged to: it adds to that card's balance, not the bank's. Null or missing = not on a card. */
  cardId?: string | null;
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
  /** The recurring item's account and card (see RecurringItem). */
  accountId?: string | null;
  cardId?: string | null;
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
  /**
   * Set on both sides of money moved between the user's own accounts (one cost, one income, same id): they move the
   * accounts' balances but are never spending or income.
   */
  transferId?: string | null;
  /** Bank or cash account the money goes out of or into (Account.id); null or missing = the main account. */
  accountId?: string | null;
  /** Card (a card in Debts) it is charged to: it adds to that card's balance, not the bank's. Null or missing = not on a card. */
  cardId?: string | null;
}

export interface AlertThresholds {
  /** Debt payments as % of monthly income that triggers a caution. Default 40. */
  debtCautionPct: number;
  /** Debt payments as % of monthly income that triggers a high warning. Default 50. */
  debtHighPct: number;
  /** Credit card usage % of limit that triggers a warning. Default 80. */
  cardUsagePct: number;
}

/** Notifications before a bill is due (recurring costs, debt payments, cheques, planned costs). */
export interface BillReminders {
  on: boolean;
  /** Days before the due date (0 = same day), reminded at 09:00. */
  leadDays: number;
  /** Ids of recurring items, debts, cheques and planned items the user muted. */
  muted: string[];
}

/** Look of the dashboard balance card: solid white/black, or one of four gradients. */
export type ChartStyle = ChartStyleName;
/** Months shown each side of today on the balance chart. */
export type ChartRange = '1M' | '2M' | '6M' | '1Y';
/** The period of the Home spending-by-category card. */
export type SpendingPeriod = 'month' | 'year';

/** One Home card in the saved layout: its id (see features/home/layout.ts) and whether it is shown. */
export interface HomeLayoutEntry {
  id: string;
  visible: boolean;
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
  /** Phone notifications (bill reminders and alerts) are switched on. */
  notificationsOn: boolean;
  alertThresholds: AlertThresholds;
  billReminders: BillReminders;
  onboarded: boolean;
  lockEnabled: boolean;
  /** Background of the dashboard balance card. */
  chartStyle: ChartStyle;
  /** Range chip the balance chart starts on. */
  chartRange: ChartRange;
  /** Period of the spending-by-category card. */
  spendingPeriod: SpendingPeriod;
  /** The Home cards in order, with show/hide. Saved per profile; app updates never rearrange it. */
  homeLayout: HomeLayoutEntry[];
  /** One-time tips the user has dismissed. */
  tipsSeen: string[];
  /** How many times Home has been opened (the "Edit Home" tip waits for 3). */
  homeVisits: number;
  /** Name of the main bank account (the one whose balance is startingBalance). */
  mainAccountName: string;
  /** Account new items use (Pro); null = the main account. */
  defaultAccountId: string | null;
}

// ---- Money accounts (milestone 3b) ----

/** The main account: its balance is Settings.startingBalance, so it has no row of its own. */
export const MAIN_ACCOUNT_ID = 'main';

export type AccountType = 'bank' | 'cash';

/** A bank or cash account besides the main one (Pro). Cards stay in Debts; items point at them with cardId. */
export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Balance the forecast starts from... */
  startingBalance: Fils;
  /** ...as of the end of this date. */
  startingBalanceDate: ISODate;
  /** Hidden from lists once closed; kept so old items keep their account. */
  archived: boolean;
  sort: number;
  createdAt: ISODate;
}

// ---- Debts (milestone 2) ----

export type DebtType = 'loan' | 'card' | 'plan';

interface DebtBase {
  id: string;
  type: DebtType;
  /** Free text: "Car loan", "Visa card". No bank names or logos are suggested. */
  name: string;
  note: string;
  /** Hidden from lists and the forecast once paid off or closed; kept for history. */
  archived: boolean;
  createdAt: ISODate;
}

/** A loan paid in equal monthly payments. */
export interface Loan extends DebtBase {
  type: 'loan';
  /** Balance on `balanceDate`, before any payment logged in the app on that day. */
  balance: Fils;
  balanceDate: ISODate;
  monthlyPayment: Fils;
  /** Day of the month the payment is taken (1-31; short months use their last day). */
  paymentDay: number;
  /** Yearly interest rate in %, informational only (e.g. 4.99). */
  annualRatePct: number | null;
  /** Last payment date if known; otherwise payments run until the balance is paid. */
  endDate: ISODate | null;
}

export type CardPlan = 'full' | 'minimum' | 'fixed';

export interface CreditCard extends DebtBase {
  type: 'card';
  limit: Fils;
  /** Balance on `balanceDate`, before any payment logged in the app on that day. */
  balance: Fils;
  balanceDate: ISODate;
  /** Day the statement is issued (1-31) and day the payment is due (1-31). */
  statementDay: number;
  dueDay: number;
  /** Minimum payment rule set by the user: max(balance x minPct%, minFloor), never more than the balance. */
  minPct: number;
  minFloor: Fils;
  /** Monthly interest rate in % as printed by the bank (e.g. 3.25), used for estimates only. */
  monthlyRatePct: number;
  /** What the user plans to pay each due date; drives the forecast. */
  plan: CardPlan;
  /** Amount for plan 'fixed'. */
  fixedAmount: Fils | null;
}

/** A 0% card instalment plan or buy-now-pay-later: equal monthly payments. */
export interface InstalmentPlan extends DebtBase {
  type: 'plan';
  total: Fils;
  monthlyAmount: Fils;
  firstPaymentDate: ISODate;
  /** Number of monthly payments in total. */
  payments: number;
  /** Optional card the plan sits on (its payments add to that card's due amount). */
  cardId: string | null;
}

export type Debt = Loan | CreditCard | InstalmentPlan;

/** A payment that really happened (the log), including partial and extra payments. */
export interface DebtPayment {
  id: string;
  debtId: string;
  date: ISODate;
  amount: Fils;
  kind: 'regular' | 'extra' | 'partial';
  note: string;
}

/** Changes one scheduled payment of a loan or plan: move it, change its amount, or skip it. */
export interface DebtOverride {
  id: string;
  debtId: string;
  /** The scheduled date being changed. One override per (debtId, originalDate). */
  originalDate: ISODate;
  newDate: ISODate | null;
  newAmount: Fils | null;
  skip: boolean;
}

// ---- Cheques (milestone 2) ----

export type ChequeStatus = 'upcoming' | 'cleared' | 'cancelled';

export interface Cheque {
  id: string;
  payee: string;
  amount: Fils;
  /** The date on the cheque (when it can be cashed). */
  date: ISODate;
  /** Free text, e.g. "Rent". */
  purpose: string;
  status: ChequeStatus;
  /** Cheques made with the series helper share an id, so they can be edited together. */
  seriesId: string | null;
  note: string;
}

// ---- Alerts (milestone 2) ----

export type AlertKind =
  | 'shortfall-zero'
  | 'shortfall-buffer'
  | 'debt-ratio-caution'
  | 'debt-ratio-high'
  | 'card-near-limit'
  | 'cheque-uncovered'
  | 'card-minimum-interest'
  | 'debt-ends';

export interface AppAlert {
  /** Stable for the same situation (kind + subject + date), so notifications aren't duplicated. */
  id: string;
  kind: AlertKind;
  severity: 'good' | 'info' | 'caution' | 'high';
  /** Short, factual. Never advice ("you should..."). */
  title: string;
  message: string;
  /** The date the situation happens (e.g. the shortfall day), or null for an ongoing state. */
  date: ISODate | null;
  /** When to send a notification for it (a day or so before `date`), or null for in-app only. */
  notifyOn: ISODate | null;
  /** The debt or cheque it's about, if any. */
  refId: string | null;
}

// ---- Engine outputs ----

export interface MonthSummary {
  month: MonthKey;
  recurringIncome: Fils;
  oneTimeIncome: Fils;
  totalIncome: Fils;
  recurringCosts: Fils;
  oneTimeCosts: Fils;
  /** Scheduled loan, card and instalment payments in the month (cards whose purchases are recorded excluded). */
  debtPayments: Fils;
  /**
   * Payments to cards whose purchases are recorded in the app (items with cardId): those purchases are the spending,
   * so the payment only settles the card and is not counted again. Not in totalSpend.
   */
  paidToCards: Fils;
  /** Upcoming cheques dated in the month. */
  cheques: Fils;
  /** Includes debtPayments and cheques (not paidToCards). */
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
  source: 'recurring' | 'transaction' | 'debt' | 'cheque';
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
  /** Milestone 2. Empty when the module is off. */
  debts: Debt[];
  debtPayments: DebtPayment[];
  debtOverrides: DebtOverride[];
  cheques: Cheque[];
  /** Known bank balances (end of day), saved whenever the user sets a balance. Optional: empty or missing means none. */
  balanceSnapshots?: BalanceSnapshot[];
  /** Bank and cash accounts besides the main one (milestone 3b). Optional: missing means only the main account. */
  accounts?: Account[];
}

/** The balance the user said they had at the end of `date`. Anchors the balance history. */
export interface BalanceSnapshot {
  date: ISODate;
  balance: Fils;
}

// ---- Statement import (milestone 3) ----

/** One finished import: the transactions it saved carry its id (`Transaction.importId`). */
export interface ImportRecord {
  id: string;
  /** File name, or "Shared text" for a pasted or shared SMS. */
  sourceName: string;
  /** csv, xlsx, ofx, pdf, image or text. */
  fileKind: string;
  /** ISO timestamp. */
  importedAt: string;
  rowCount: number;
  /** The account (or card) the statement belongs to; missing = the main account. */
  accountId?: string | null;
  cardId?: string | null;
}

/** The column layout remembered for a bank file, so the next one imports without questions. */
export interface ImportTemplate {
  sourceName: string;
  /** A CsvMapping (plus the sheet number for Excel files), kept as plain JSON. */
  mapping: Record<string, unknown>;
  /** ISO timestamp. */
  lastUsed: string;
  /** The account (or card) this source's statements belong to, remembered like the columns. */
  accountId?: string | null;
  cardId?: string | null;
}

/** "Descriptions containing this merchant go to this category", learned from the review screen. */
export interface CategoryRuleRecord {
  id: string;
  /** Matched case-insensitively; unique. */
  pattern: string;
  categoryId: string;
  /** ISO timestamp. */
  createdAt: string;
}
