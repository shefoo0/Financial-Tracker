// The planning engine: pure TypeScript on 'YYYY-MM-DD' strings and integer fils.
// No React, no storage, no Date objects in outputs.
export { expandRecurring, occurrencesInRange, monthlyEquivalent } from './recurring';
export { UNCATEGORIZED, forecast, monthSummary, yearSummary } from './forecast';
export { balanceHistory } from './history';
export type { HistoryDay } from './history';
export { categoryLimits, monthBalances } from './limits';
export type { CategoryLimitRow, MonthBalances } from './limits';
export { debtSchedule, planInstalments, debtProgress, remainingOf, allDebtPayments, debtOutflows } from './debts/schedule';
export type { DebtScheduledPayment } from './debts/schedule';
export { chequesInRange } from './debts/cheques';
export { debtStats } from './debts/stats';
export type { DebtStats, DebtStatsItem } from './debts/stats';
export { buildAlerts, alertId, ALERT_DAYS } from './alerts';
export { paydayView } from './payday';
export type { PaydayView, PaydayItem } from './payday';
export { periodsWithData, periodForKey, buildReport, sampleReport, sampleInput } from './reports';
export type {
  CashFlow,
  Comparison,
  DebtsSection,
  Delta,
  KeyFigures,
  MonthResult,
  QuarterColumn,
  Report,
  ReportKind,
  ReportPeriod,
  ReportRow,
  ReportSummary,
} from './reports';
export { accountOf, cardOf, isTransfer, cashAccounts, startOf } from './accounts';
export { accountBalances, accountBalanceAt, cardsOwed, totalBalanceAt } from './balances';
export { cardsWithPurchases } from './forecast';
export { cardPurchases, statementDateFor } from './debts/schedule';
