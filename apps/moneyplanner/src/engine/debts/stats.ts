// Debt totals for the debts screen, the forecast header and the alerts.
import type { Fils, ISODate, PlanInput } from '@/types';
import { addDays, addMonths, compareDates, monthEnd, monthKey, monthStart } from '@/lib/dates';
import { percent } from '@/lib/money';
import { monthlyEquivalent } from '../recurring';
import {
  activeDebts,
  cardPaymentFor,
  debtLifetime,
  debtProgress,
  loanHasRate,
  interestFor,
  remainingOf,
} from './schedule';

export interface DebtStatsItem {
  debtId: string;
  remaining: Fils;
  nextPayment: { date: ISODate; amount: Fils } | null;
  /** Date the last payment is made (within 30 years), or null if it isn't paid off in that time. */
  endDate: ISODate | null;
  /** Payments made so far (scheduled dates up to today, plus logged regular payments). */
  paidCount: number;
  /** Total number of payments, or null when unknown (cards, loans without an end date). */
  totalCount: number | null;
  availableCredit: Fils | null;
  usagePct: number | null;
  /** Estimated interest this month for a card on the 'minimum' plan, else null. */
  minimumInterestEstimate: Fils | null;
  /** True when the schedule includes interest estimated from the loan's annual rate. */
  interestEstimated: boolean;
}

export interface DebtStats {
  totalRemaining: Fils;
  monthlyDebtPayments: Fils;
  monthlyIncome: Fils;
  debtToIncomePct: number | null;
  debtFreeDate: ISODate | null;
  perDebt: DebtStatsItem[];
}

/** How far ahead the debt-free date is looked for. */
const HORIZON_YEARS = 30;

/**
 * Totals for the current month and per debt. Monthly debt payments are the scheduled payments in
 * today's month plus any 'regular' payments already logged this month. Instalment plans that sit on
 * a card count separately from the card's own balance.
 */
export function debtStats(input: PlanInput, today: ISODate): DebtStats {
  const horizon = addMonths(today, HORIZON_YEARS * 12);
  const from = monthStart(monthKey(today));
  const to = monthEnd(monthKey(today));
  const debts = activeDebts(input);
  const perDebt: DebtStatsItem[] = [];
  let totalRemaining = 0;
  let monthly = 0;
  let allFinish = true;
  let last: ISODate | null = null;

  for (const debt of debts) {
    const remaining = remainingOf(debt, input);
    totalRemaining += remaining;
    const life = debtLifetime(debt, input, horizon);
    const linked = debt.type === 'plan' && isLinked(debt, debts);
    const own = [...life.payments].sort((x, y) => compareDates(x.date, y.date));

    // This month's payments (linked plans are paid through their card, so not counted twice).
    if (!linked) {
      monthly += own.filter((p) => compareDates(p.date, from) >= 0 && compareDates(p.date, to) <= 0).reduce((s, p) => s + p.amount, 0);
      monthly += (input.debtPayments ?? [])
        .filter((p) => p.debtId === debt.id && p.kind === 'regular' && monthKey(p.date) === monthKey(today))
        .reduce((s, p) => s + p.amount, 0);
    }

    const next = own.find((p) => compareDates(p.date, today) >= 0) ?? null;
    const lastPay = own.length ? own[own.length - 1].date : null;
    let endDate: ISODate | null = null;
    if (remaining > 0) {
      if (life.remaining <= 0 && lastPay) endDate = lastPay;
      else if (debt.type === 'loan' && debt.endDate) endDate = debt.endDate;
    }
    // The debt-free date follows the last payment actually made; a card pays its linked plans.
    if (!linked) {
      if (remaining > 0 && !endDate) allFinish = false;
      const finish = endDate ?? (life.remaining <= 0 ? lastPay : null);
      if (finish && (!last || compareDates(finish, last) > 0)) last = finish;
    }

    const progress = debtProgress(debt, input, addDays(today, 1));
    const loggedRegular = (input.debtPayments ?? []).filter(
      (p) =>
        p.debtId === debt.id &&
        p.kind === 'regular' &&
        compareDates(p.date, today) <= 0 &&
        (debt.type === 'plan' || compareDates(p.date, debt.balanceDate) > 0),
    ).length;
    const paidCount = progress ? progress.paid : own.filter((p) => compareDates(p.date, today) <= 0).length + loggedRegular;

    let availableCredit: Fils | null = null;
    let usagePct: number | null = null;
    let minimumInterestEstimate: Fils | null = null;
    if (debt.type === 'card') {
      availableCredit = debt.limit - remaining;
      usagePct = percent(remaining, debt.limit);
      if (debt.plan === 'minimum' && remaining > 0) {
        minimumInterestEstimate = interestFor(debt, remaining - cardPaymentFor(debt, remaining));
      }
    }
    perDebt.push({
      debtId: debt.id,
      remaining,
      nextPayment: next ? { date: next.date, amount: next.amount } : null,
      endDate,
      paidCount,
      totalCount: progress ? progress.total : null,
      availableCredit,
      usagePct,
      minimumInterestEstimate,
      interestEstimated: loanHasRate(debt),
    });
  }

  const monthlyIncome = input.recurring
    .filter((r) => r.kind === 'income' && (!r.endDate || compareDates(r.endDate, today) >= 0))
    .reduce((s, r) => s + monthlyEquivalent(r), 0);

  return {
    totalRemaining,
    monthlyDebtPayments: monthly,
    monthlyIncome,
    debtToIncomePct: monthlyIncome > 0 ? percent(monthly, monthlyIncome) : null,
    debtFreeDate: totalRemaining > 0 && allFinish ? last : null,
    perDebt,
  };
}

function isLinked(plan: { cardId: string | null }, debts: { id: string; type: string }[]): boolean {
  return !!plan.cardId && debts.some((d) => d.id === plan.cardId && d.type === 'card');
}
