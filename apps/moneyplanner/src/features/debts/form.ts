// Form state, validation and conversion for loans, credit cards and instalment plans.
import { isValidISODate, today } from '@/lib/dates';
import type { CardPlan, CreditCard, Debt, DebtType, Fils, InstalmentPlan, ISODate, Loan } from '@/types';

export type DebtField =
  | 'name'
  | 'balance'
  | 'balanceDate'
  | 'monthly'
  | 'day'
  | 'rate'
  | 'endDate'
  | 'limit'
  | 'statementDay'
  | 'dueDay'
  | 'minPct'
  | 'minFloor'
  | 'monthlyRate'
  | 'fixedAmount'
  | 'total'
  | 'firstPaymentDate'
  | 'payments';
export type DebtErrors = Partial<Record<DebtField, string>>;

export interface DebtForm {
  type: DebtType;
  name: string;
  note: string;
  // Loan and card
  balance: Fils | null;
  balanceDate: ISODate;
  // Loan and plan
  monthly: Fils | null;
  // Loan
  day: string;
  rate: string;
  endDate: ISODate | null;
  // Card
  limit: Fils | null;
  statementDay: string;
  dueDay: string;
  minPct: string;
  minFloor: Fils | null;
  monthlyRate: string;
  plan: CardPlan;
  fixedAmount: Fils | null;
  // Plan
  total: Fils | null;
  firstPaymentDate: ISODate;
  payments: string;
  cardId: string | null;
}

export function emptyDebtForm(type: DebtType, now: ISODate = today()): DebtForm {
  return {
    type,
    name: '',
    note: '',
    balance: null,
    balanceDate: now,
    monthly: null,
    day: '1',
    rate: '',
    endDate: null,
    limit: null,
    statementDay: '1',
    dueDay: '25',
    minPct: '5',
    minFloor: 10000,
    monthlyRate: '',
    plan: 'full',
    fixedAmount: null,
    total: null,
    firstPaymentDate: now,
    payments: '12',
    cardId: null,
  };
}

const numText = (n: number | null) => (n == null ? '' : String(n));

export function formFromDebt(d: Debt): DebtForm {
  const base = { ...emptyDebtForm(d.type, d.createdAt), name: d.name, note: d.note };
  if (d.type === 'loan') {
    return { ...base, balance: d.balance, balanceDate: d.balanceDate, monthly: d.monthlyPayment, day: String(d.paymentDay), rate: numText(d.annualRatePct), endDate: d.endDate };
  }
  if (d.type === 'card') {
    return {
      ...base,
      limit: d.limit,
      balance: d.balance,
      balanceDate: d.balanceDate,
      statementDay: String(d.statementDay),
      dueDay: String(d.dueDay),
      minPct: String(d.minPct),
      minFloor: d.minFloor,
      monthlyRate: String(d.monthlyRatePct),
      plan: d.plan,
      fixedAmount: d.fixedAmount,
    };
  }
  return { ...base, total: d.total, monthly: d.monthlyAmount, firstPaymentDate: d.firstPaymentDate, payments: String(d.payments), cardId: d.cardId };
}

/** A whole number from typed text, or null. */
function wholeNumber(text: string): number | null {
  const t = text.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

/** A decimal number from typed text ("4.99" or "4,99"), or null. Empty is null too. */
export function decimalNumber(text: string): number | null {
  const t = text.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

const checkDay = (text: string): string | null => {
  const n = wholeNumber(text);
  return n != null && n >= 1 && n <= 31 ? null : 'Enter a day from 1 to 31.';
};

export interface DebtValidation {
  debt: Debt | null;
  errors: DebtErrors;
}

/**
 * Checks the form. When it is valid, `debt` is the debt to save: `existing`
 * keeps its id, createdAt and archived flag; a new one gets `id`.
 */
export function validateDebt(form: DebtForm, id: string, existing: Debt | null, now: ISODate = today()): DebtValidation {
  const errors: DebtErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Enter a name, for example "Car loan" or "Visa card".';
  const meta = { id, name, note: form.note.trim(), archived: existing?.archived ?? false, createdAt: existing?.createdAt ?? now };

  if (form.type === 'loan') {
    if (form.balance == null || form.balance <= 0) errors.balance = 'Enter the remaining balance, greater than zero.';
    if (!isValidISODate(form.balanceDate)) errors.balanceDate = 'Choose the date of this balance.';
    if (form.monthly == null || form.monthly <= 0) errors.monthly = 'Enter the monthly payment, greater than zero.';
    else if (form.balance != null && form.balance > 0 && form.monthly > form.balance) errors.monthly = 'The monthly payment can’t be more than the remaining balance.';
    const dayError = checkDay(form.day);
    if (dayError) errors.day = dayError;
    let rate: number | null = null;
    if (form.rate.trim()) {
      rate = decimalNumber(form.rate);
      if (rate == null || rate > 100) errors.rate = 'Enter a rate from 0 to 100, or leave it empty.';
    }
    if (form.endDate && isValidISODate(form.balanceDate) && form.endDate < form.balanceDate) errors.endDate = 'The end date can’t be before the balance date.';
    if (Object.keys(errors).length) return { debt: null, errors };
    const debt: Loan = {
      ...meta,
      type: 'loan',
      balance: form.balance!,
      balanceDate: form.balanceDate,
      monthlyPayment: form.monthly!,
      paymentDay: Number(form.day),
      annualRatePct: rate,
      endDate: form.endDate,
    };
    return { debt, errors };
  }

  if (form.type === 'card') {
    if (form.limit == null || form.limit < 0) errors.limit = 'Enter the credit limit (zero or more).';
    if (form.balance == null || form.balance < 0) errors.balance = 'Enter the balance owed (zero if none).';
    if (!isValidISODate(form.balanceDate)) errors.balanceDate = 'Choose the date of this balance.';
    const sErr = checkDay(form.statementDay);
    if (sErr) errors.statementDay = sErr;
    const dErr = checkDay(form.dueDay);
    if (dErr) errors.dueDay = dErr;
    const minPct = decimalNumber(form.minPct);
    if (minPct == null || minPct > 100) errors.minPct = 'Enter a percentage from 0 to 100.';
    if (form.minFloor == null || form.minFloor < 0) errors.minFloor = 'Enter the minimum amount (zero or more).';
    const rate = form.monthlyRate.trim() ? decimalNumber(form.monthlyRate) : 0;
    if (rate == null || rate > 100) errors.monthlyRate = 'Enter a monthly rate from 0 to 100, or leave it empty.';
    if (form.plan === 'fixed' && (form.fixedAmount == null || form.fixedAmount <= 0)) errors.fixedAmount = 'Enter the amount you plan to pay each month.';
    if (Object.keys(errors).length) return { debt: null, errors };
    const debt: CreditCard = {
      ...meta,
      type: 'card',
      limit: form.limit!,
      balance: form.balance!,
      balanceDate: form.balanceDate,
      statementDay: Number(form.statementDay),
      dueDay: Number(form.dueDay),
      minPct: minPct!,
      minFloor: form.minFloor!,
      monthlyRatePct: rate!,
      plan: form.plan,
      fixedAmount: form.plan === 'fixed' ? form.fixedAmount : null,
    };
    return { debt, errors };
  }

  if (form.total == null || form.total <= 0) errors.total = 'Enter the total, greater than zero.';
  if (form.monthly == null || form.monthly <= 0) errors.monthly = 'Enter the monthly amount, greater than zero.';
  else if (form.total != null && form.total > 0 && form.monthly > form.total) errors.monthly = 'The monthly amount can’t be more than the total.';
  const payments = wholeNumber(form.payments);
  if (payments == null || payments < 1 || payments > 600) errors.payments = 'Enter a number of payments from 1 to 600.';
  if (!isValidISODate(form.firstPaymentDate)) errors.firstPaymentDate = 'Choose the date of the first payment.';
  if (Object.keys(errors).length) return { debt: null, errors };
  const debt: InstalmentPlan = {
    ...meta,
    type: 'plan',
    total: form.total!,
    monthlyAmount: form.monthly!,
    firstPaymentDate: form.firstPaymentDate,
    payments: payments!,
    cardId: form.cardId,
  };
  return { debt, errors };
}

export const TYPE_LABEL: Record<DebtType, string> = { loan: 'Loan', card: 'Credit card', plan: 'Instalment plan' };
export const TYPE_GLYPH: Record<DebtType, string> = { loan: '🏦', card: '💳', plan: '🧾' };

/** The payment amount a card's minimum rule gives for a balance: max(balance x pct%, floor), never above the balance. */
export function minimumPayment(balance: Fils, minPct: number, minFloor: Fils): Fils {
  return Math.min(balance, Math.max(Math.round((balance * minPct) / 100), minFloor));
}
