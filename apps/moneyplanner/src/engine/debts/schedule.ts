// Scheduled payments of loans, cards and instalment plans (pure, no React or storage).
// Money is integer fils; dates are 'YYYY-MM-DD'.
import type {
  CreditCard,
  Debt,
  DebtOverride,
  DebtPayment,
  Fils,
  InstalmentPlan,
  ISODate,
  Loan,
  PlanInput,
} from '@/types';
import { addMonthKey, addMonths, compareDates, daysInMonth, monthKey, monthStart, toISODate } from '@/lib/dates';

export interface DebtScheduledPayment {
  debtId: string;
  /** Date it happens (after a move override). */
  date: ISODate;
  /** Date it was scheduled for before overrides. */
  originalDate: ISODate;
  amount: Fils;
  kind: 'loan' | 'card' | 'plan';
  label: string;
}

/** Hard cap on months simulated per debt (a runaway guard: 125 years). */
const MAX_MONTHS = 1500;

/** Debts that are not archived. Tolerates inputs without the milestone 2 lists. */
export function activeDebts(input: PlanInput): Debt[] {
  return (input.debts ?? []).filter((d) => !d.archived);
}

const paymentsOf = (input: PlanInput, debtId: string): DebtPayment[] =>
  (input.debtPayments ?? []).filter((p) => p.debtId === debtId);

function overridesOf(input: PlanInput, debtId: string): Map<ISODate, DebtOverride> {
  const m = new Map<ISODate, DebtOverride>();
  for (const o of input.debtOverrides ?? []) if (o.debtId === debtId) m.set(o.originalDate, o);
  return m;
}

/** The latest original date of an override that moves a payment, so moved payments are not cut off. */
function extendLimit(limit: ISODate, ov: Map<ISODate, DebtOverride>): ISODate {
  let out = limit;
  for (const o of ov.values()) if (o.newDate && compareDates(o.originalDate, out) > 0) out = o.originalDate;
  return out;
}

/** The date in a month for a day number 1-31, clamped to the month's end. */
function dayIn(month: string, day: number): ISODate {
  const [y, m] = month.split('-').map(Number);
  const d = Math.floor(Number(day)) || 1;
  return toISODate(y, m, Math.min(Math.max(1, d), daysInMonth(y, m)));
}

const sum = (xs: { amount: Fils }[]) => xs.reduce((s, x) => s + x.amount, 0);

/** Logged payments of a debt dated after `after` (they reduce the remaining balance). */
function loggedAfter(input: PlanInput, debtId: string, after: ISODate): DebtPayment[] {
  return paymentsOf(input, debtId).filter((p) => compareDates(p.date, after) > 0);
}

/** Months (YYYY-MM) that have a logged 'regular' payment: that month's scheduled payment is replaced. */
function regularMonths(logs: DebtPayment[]): Set<string> {
  return new Set(logs.filter((p) => p.kind === 'regular').map((p) => monthKey(p.date)));
}

interface Sim {
  payments: DebtScheduledPayment[];
  /** Balance left after the last simulated payment. */
  remaining: Fils;
}

function loanSim(loan: Loan, input: PlanInput, to: ISODate): Sim {
  const logs = loggedAfter(input, loan.id, loan.balanceDate);
  let remaining = Math.max(0, loan.balance - sum(logs));
  const replaced = regularMonths(logs);
  const ov = overridesOf(input, loan.id);
  const limit = extendLimit(to, ov);
  const payments: DebtScheduledPayment[] = [];
  const first = monthKey(loan.balanceDate);
  for (let i = 0; i < MAX_MONTHS && remaining > 0; i++) {
    const month = addMonthKey(first, i);
    const orig = dayIn(month, loan.paymentDay);
    if (compareDates(orig, loan.balanceDate) <= 0) continue;
    if (compareDates(orig, limit) > 0) break;
    if (loan.endDate && compareDates(orig, loan.endDate) > 0) break;
    if (replaced.has(month)) continue;
    const o = ov.get(orig);
    if (o?.skip) continue;
    const amount = Math.min(o?.newAmount ?? loan.monthlyPayment, remaining);
    if (amount <= 0) continue;
    remaining -= amount;
    payments.push({ debtId: loan.id, date: o?.newDate ?? orig, originalDate: orig, amount, kind: 'loan', label: `${loan.name} payment` });
  }
  return { payments, remaining };
}

/**
 * All instalments of a plan (also when it sits on a card), after logged payments and overrides.
 * Logged payments of the plan are used up against the earliest instalments first.
 * `consumed` is the number of instalments fully covered by logged payments.
 */
export function planInstalments(plan: InstalmentPlan, input: PlanInput): { payments: DebtScheduledPayment[]; consumed: number } {
  const n = Math.max(0, Math.floor(plan.payments));
  const ov = overridesOf(input, plan.id);
  let logged = sum(paymentsOf(input, plan.id));
  let consumed = 0;
  const payments: DebtScheduledPayment[] = [];
  for (let i = 0; i < n; i++) {
    const orig = addMonths(plan.firstPaymentDate, i);
    let amount = i === n - 1 ? plan.total - plan.monthlyAmount * (n - 1) : plan.monthlyAmount;
    amount = Math.max(0, amount);
    const use = Math.min(logged, amount);
    logged -= use;
    amount -= use;
    if (amount <= 0) {
      consumed++;
      continue;
    }
    const o = ov.get(orig);
    if (o?.skip) continue;
    payments.push({
      debtId: plan.id,
      date: o?.newDate ?? orig,
      originalDate: orig,
      amount: o?.newAmount ?? amount,
      kind: 'plan',
      label: `${plan.name} instalment`,
    });
  }
  return { payments, consumed };
}

/** Whether a plan is paid as part of a card (the card exists and isn't archived). */
function linkedCard(plan: InstalmentPlan, input: PlanInput): CreditCard | null {
  if (!plan.cardId) return null;
  const c = activeDebts(input).find((d) => d.id === plan.cardId);
  return c && c.type === 'card' ? c : null;
}

/** The amount a card plan pays on a due date for a balance. */
export function cardPaymentFor(card: CreditCard, balance: Fils): Fils {
  if (balance <= 0) return 0;
  if (card.plan === 'full') return balance;
  if (card.plan === 'fixed') return Math.min(Math.max(0, card.fixedAmount ?? 0), balance);
  return Math.min(balance, Math.max(Math.round((balance * card.minPct) / 100), card.minFloor));
}

/** Estimated interest for a month on a balance, at the card's monthly rate. */
export const interestFor = (card: CreditCard, balance: Fils): Fils =>
  balance > 0 ? Math.round((balance * Math.max(0, card.monthlyRatePct)) / 100) : 0;

function cardSim(card: CreditCard, input: PlanInput, to: ISODate): Sim {
  const logs = loggedAfter(input, card.id, card.balanceDate);
  let balance = Math.max(0, card.balance - sum(logs));
  const replaced = regularMonths(logs);
  const ov = overridesOf(input, card.id);
  const limit = extendLimit(to, ov);
  const instalments = activeDebts(input)
    .filter((d): d is InstalmentPlan => d.type === 'plan' && d.cardId === card.id)
    .flatMap((p) => planInstalments(p, input).payments)
    .filter((p) => compareDates(p.date, card.balanceDate) > 0);
  const lastInstalment = instalments.reduce<ISODate>((m, p) => (compareDates(p.date, m) > 0 ? p.date : m), '0000-00-00');
  const payments: DebtScheduledPayment[] = [];
  const first = monthKey(card.balanceDate);
  for (let i = 0; i < MAX_MONTHS; i++) {
    const month = addMonthKey(first, i);
    if (compareDates(monthStart(month), limit) > 0) break;
    if (balance <= 0 && monthKey(lastInstalment) < month) break;
    balance += sum(instalments.filter((p) => monthKey(p.date) === month));
    const orig = dayIn(month, card.dueDay);
    if (compareDates(orig, card.balanceDate) <= 0 || compareDates(orig, limit) > 0) continue;
    const o = ov.get(orig);
    if (!replaced.has(month) && !o?.skip) {
      const pay = Math.min(o?.newAmount ?? cardPaymentFor(card, balance), balance);
      if (pay > 0) {
        balance -= pay;
        payments.push({ debtId: card.id, date: o?.newDate ?? orig, originalDate: orig, amount: pay, kind: 'card', label: `${card.name} payment` });
      }
    }
    if (card.plan !== 'full') balance += interestFor(card, balance);
  }
  return { payments, remaining: balance };
}

function simulate(debt: Debt, input: PlanInput, to: ISODate): Sim {
  if (debt.type === 'loan') return loanSim(debt, input, to);
  if (debt.type === 'card') return cardSim(debt, input, to);
  const { payments } = planInstalments(debt, input);
  const remaining = Math.max(0, debt.total - sum(paymentsOf(input, debt.id)));
  return { payments, remaining: payments.reduce((r, p) => r - p.amount, remaining) };
}

const byDate = (a: DebtScheduledPayment, b: DebtScheduledPayment) =>
  compareDates(a.date, b.date) || compareDates(a.originalDate, b.originalDate);

/**
 * Scheduled payments of one debt between from and to (inclusive), after logged payments and overrides.
 * Archived debts give []. A plan that sits on an active card gives [] too: its instalments are
 * added to the card's balance, so they are paid as part of the card (use `planInstalments` to list them).
 */
export function debtSchedule(debt: Debt, input: PlanInput, from: ISODate, to: ISODate): DebtScheduledPayment[] {
  if (debt.archived || compareDates(from, to) > 0) return [];
  if (debt.type === 'plan' && linkedCard(debt, input)) return [];
  return simulate(debt, input, to)
    .payments.filter((p) => compareDates(p.date, from) >= 0 && compareDates(p.date, to) <= 0)
    .sort(byDate);
}

/** Scheduled payments of all active debts between from and to, sorted by date. */
export function allDebtPayments(input: PlanInput, from: ISODate, to: ISODate): DebtScheduledPayment[] {
  const out: DebtScheduledPayment[] = [];
  for (const d of activeDebts(input)) out.push(...debtSchedule(d, input, from, to));
  return out.sort(byDate);
}

/** What is left to pay today: balance minus logged payments (loans, cards) or total minus logged payments (plans). */
export function remainingOf(debt: Debt, input: PlanInput): Fils {
  if (debt.type === 'plan') return Math.max(0, debt.total - sum(paymentsOf(input, debt.id)));
  return Math.max(0, debt.balance - sum(loggedAfter(input, debt.id, debt.balanceDate)));
}

/** Result of simulating a debt to the end of its schedule (up to `to`). */
export function debtLifetime(debt: Debt, input: PlanInput, to: ISODate): { payments: DebtScheduledPayment[]; remaining: Fils } {
  return simulate(debt, input, to);
}

/**
 * "k of N paid" for a loan with an end date or an instalment plan, counting the payments before
 * `beforeDate` (the payment about to be shown). Null for cards and loans without an end date.
 */
export function debtProgress(debt: Debt, input: PlanInput, beforeDate: ISODate): { paid: number; total: number } | null {
  if (debt.type === 'card' || (debt.type === 'loan' && !debt.endDate)) return null;
  if (debt.type === 'plan') {
    const { payments, consumed } = planInstalments(debt, input);
    const paid = consumed + payments.filter((p) => compareDates(p.date, beforeDate) < 0).length;
    return { paid: Math.min(paid, debt.payments), total: debt.payments };
  }
  const logs = loggedAfter(input, debt.id, debt.balanceDate).filter((p) => p.kind === 'regular');
  const all = loanSim(debt, input, debt.endDate as ISODate).payments;
  const paid = logs.length + all.filter((p) => compareDates(p.date, beforeDate) < 0).length;
  return { paid, total: logs.length + all.length };
}
