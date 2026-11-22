import { addMonths, today } from '@/lib/dates';
import type { CreditCard, InstalmentPlan, Loan } from '@/types';

const base = { note: '', archived: false, createdAt: '2026-01-01' };

export const loan = (p: Partial<Loan> = {}): Loan => ({
  ...base,
  id: 'loan1',
  type: 'loan',
  name: 'Car loan',
  balance: 2_000_000,
  balanceDate: today(),
  monthlyPayment: 300_000,
  paymentDay: 15,
  annualRatePct: 4.99,
  endDate: null,
  ...p,
});

export const card = (p: Partial<CreditCard> = {}): CreditCard => ({
  ...base,
  id: 'card1',
  type: 'card',
  name: 'Visa card',
  limit: 1_000_000,
  balance: 620_000,
  balanceDate: today(),
  statementDay: 1,
  dueDay: 25,
  minPct: 5,
  minFloor: 10_000,
  monthlyRatePct: 3.25,
  plan: 'full',
  fixedAmount: null,
  ...p,
});

export const plan = (p: Partial<InstalmentPlan> = {}): InstalmentPlan => ({
  ...base,
  id: 'plan1',
  type: 'plan',
  name: 'Phone plan',
  total: 480_000,
  monthlyAmount: 160_000,
  firstPaymentDate: addMonths(today(), -2),
  payments: 3,
  cardId: null,
  ...p,
});
