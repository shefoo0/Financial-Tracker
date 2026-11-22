// A small stand-in for the debt engine (built separately), so these screen tests
// check the screens and not the engine's maths.
import { addMonths, parseISODate, toISODate, daysInMonth } from '@/lib/dates';
import type { Debt, ISODate, PlanInput } from '@/types';

const monthly = (d: Debt) => (d.type === 'loan' ? d.monthlyPayment : d.type === 'plan' ? d.monthlyAmount : 0);

function nextDate(day: number, from: ISODate): ISODate {
  const { year, month, day: fromDay } = parseISODate(from);
  const clamp = (y: number, m: number) => toISODate(y, m, Math.min(day, daysInMonth(y, m)));
  const thisMonth = clamp(year, month);
  return fromDay <= day && thisMonth >= from ? thisMonth : addMonths(clamp(year, month), 1).slice(0, 8) + String(Math.min(day, 28)).padStart(2, '0');
}

export function debtSchedule(debt: Debt, input: PlanInput, from: ISODate, to: ISODate) {
  if (debt.type === 'card') return [];
  const day = debt.type === 'loan' ? debt.paymentDay : parseISODate(debt.firstPaymentDate).day;
  const out = [];
  let date = nextDate(day, from);
  for (let i = 0; i < 8 && date <= to; i++) {
    const ov = input.debtOverrides.find((o) => o.debtId === debt.id && o.originalDate === date);
    if (!ov?.skip) {
      out.push({ debtId: debt.id, date: ov?.newDate ?? date, originalDate: date, amount: ov?.newAmount ?? monthly(debt), kind: debt.type, label: debt.type === 'loan' ? 'Loan payment' : 'Plan payment' });
    }
    date = addMonths(date, 1);
  }
  return out;
}

export function debtStats(input: PlanInput, today: ISODate) {
  const income = input.recurring.filter((r) => r.kind === 'income').reduce((a, r) => a + r.amount, 0);
  const monthlyDebtPayments = input.debts.reduce((a, d) => a + monthly(d), 0);
  return {
    totalRemaining: input.debts.reduce((a, d) => a + (d.type === 'plan' ? d.total : d.balance), 0),
    monthlyDebtPayments,
    monthlyIncome: income,
    debtToIncomePct: income > 0 ? Math.round((monthlyDebtPayments / income) * 1000) / 10 : null,
    debtFreeDate: null as ISODate | null,
    perDebt: input.debts.map((d) => {
      const next = debtSchedule(d, input, today, addMonths(today, 3))[0];
      return {
        debtId: d.id,
        remaining: d.type === 'plan' ? d.total : d.balance,
        nextPayment: next ? { date: next.date, amount: next.amount } : null,
        endDate: d.type === 'loan' ? d.endDate : null,
        paidCount: d.type === 'plan' ? 2 : 0,
        totalCount: d.type === 'plan' ? d.payments : null,
        availableCredit: d.type === 'card' ? d.limit - d.balance : null,
        usagePct: d.type === 'card' && d.limit > 0 ? Math.round((d.balance / d.limit) * 100) : null,
        minimumInterestEstimate: d.type === 'card' ? Math.round((d.balance * d.monthlyRatePct) / 100) : null,
      };
    }),
  };
}
