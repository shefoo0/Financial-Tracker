import type { Cheque, CreditCard, DebtOverride, DebtPayment, InstalmentPlan, Loan, PlanInput, RecurringItem, Settings } from '@/types';

export const settings = (over: Partial<Settings> = {}): Settings => ({
  currency: 'AED',
  payday: null,
  startingBalance: 0,
  startingBalanceDate: '2026-01-01',
  buffer: 0,
  enabledModules: { debts: true, cheques: true, alerts: true, import: false },
  alertThresholds: { debtCautionPct: 40, debtHighPct: 50, cardUsagePct: 80 },
  onboarded: true,
  lockEnabled: false,
  ...over,
});

export const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  settings: settings(),
  categories: [],
  recurring: [],
  overrides: [],
  transactions: [],
  debts: [],
  debtPayments: [],
  debtOverrides: [],
  cheques: [],
  ...over,
});

const base = { note: '', archived: false, createdAt: '2026-01-01' };

export const loan = (over: Partial<Loan> = {}): Loan => ({
  ...base,
  id: 'L1',
  type: 'loan',
  name: 'Car loan',
  balance: 100000,
  balanceDate: '2026-01-01',
  monthlyPayment: 30000,
  paymentDay: 15,
  annualRatePct: null,
  endDate: null,
  ...over,
});

export const card = (over: Partial<CreditCard> = {}): CreditCard => ({
  ...base,
  id: 'C1',
  type: 'card',
  name: 'Visa',
  limit: 1000000,
  balance: 100000,
  balanceDate: '2026-01-01',
  statementDay: 1,
  dueDay: 20,
  minPct: 5,
  minFloor: 5000,
  monthlyRatePct: 3,
  plan: 'full',
  fixedAmount: null,
  ...over,
});

export const plan = (over: Partial<InstalmentPlan> = {}): InstalmentPlan => ({
  ...base,
  id: 'P1',
  type: 'plan',
  name: 'Phone plan',
  total: 120000,
  monthlyAmount: 40000,
  firstPaymentDate: '2026-02-10',
  payments: 3,
  cardId: null,
  ...over,
});

export const pay = (over: Partial<DebtPayment> = {}): DebtPayment => ({
  id: 'pay1',
  debtId: 'L1',
  date: '2026-02-15',
  amount: 30000,
  kind: 'regular',
  note: '',
  ...over,
});

export const dov = (over: Partial<DebtOverride> = {}): DebtOverride => ({
  id: 'ov1',
  debtId: 'L1',
  originalDate: '2026-02-15',
  newDate: null,
  newAmount: null,
  skip: false,
  ...over,
});

export const cheque = (over: Partial<Cheque> = {}): Cheque => ({
  id: 'Q1',
  payee: 'Landlord',
  amount: 500000,
  date: '2026-03-01',
  purpose: 'Rent',
  status: 'upcoming',
  seriesId: null,
  note: '',
  ...over,
});

export const income = (amount: number): RecurringItem => ({
  id: 'inc',
  kind: 'income',
  name: 'Salary',
  categoryId: null,
  amount,
  schedule: { type: 'monthly', day: 25 },
  startDate: '2026-01-01',
  endDate: null,
  count: null,
  note: '',
});
