// Alert rules (pure): facts about the next 60 days, never advice.
import type { AlertKind, AppAlert, Debt, Fils, ISODate, PlanInput } from '@/types';
import { addDays, addMonthKey, compareDates, formatMonth, monthKey } from '@/lib/dates';
import { formatMoneyTrim } from '@/lib/money';
import { forecast } from '../forecast';
import { activeDebts } from '../debts/schedule';
import { debtStats } from '../debts/stats';
import { shortDate } from '@/features/dashboard/helpers';

/** How many days ahead alerts look. */
export const ALERT_DAYS = 60;

/** The id for a situation: kind + subject + date, so the same situation keeps the same id. */
export const alertId = (kind: AlertKind, refId: string | null, date: ISODate | null): string => `${kind}:${refId ?? '-'}:${date ?? '-'}`;

/** Builds alerts for every AlertKind from a 60-day daily forecast, the settings thresholds and buffer. */
export function buildAlerts(input: PlanInput, today: ISODate): AppAlert[] {
  const { settings } = input;
  const cur = settings.currency;
  const th = settings.alertThresholds;
  const money = (v: Fils) => formatMoneyTrim(v, cur).replace('-', '−');
  const out: AppAlert[] = [];
  const notifyOn = (date: ISODate): ISODate => {
    const d = addDays(date, -1);
    return compareDates(d, today) < 0 ? today : d;
  };
  const push = (a: Omit<AppAlert, 'id' | 'notifyOn'> & { notify?: boolean }) => {
    const { notify, ...rest } = a;
    out.push({ ...rest, id: alertId(a.kind, a.refId, a.date), notifyOn: a.date && notify !== false ? notifyOn(a.date) : null });
  };

  // Start from yesterday so today's own flows and cheques are part of the days.
  const fc = forecast(input, { today: addDays(today, -1), days: ALERT_DAYS + 1, months: 0 });

  // Shortfall: first date only.
  const zero = fc.days.find((d) => d.balance < 0);
  if (zero) {
    push({
      kind: 'shortfall-zero',
      severity: 'high',
      title: `Balance below zero on ${shortDate(zero.date)}`,
      message: `On ${shortDate(zero.date)} your balance is projected at ${money(zero.balance)}.`,
      date: zero.date,
      refId: null,
    });
  }
  const buf = settings.buffer > 0 ? fc.days.find((d) => d.balance < settings.buffer) : undefined;
  if (buf && !(zero && zero.date === buf.date)) {
    push({
      kind: 'shortfall-buffer',
      severity: 'caution',
      title: `Balance below your buffer on ${shortDate(buf.date)}`,
      message: `On ${shortDate(buf.date)} your balance is projected at ${money(buf.balance)}, below your ${money(settings.buffer)} buffer.`,
      date: buf.date,
      refId: null,
    });
  }

  const stats = debtStats(input, today);
  const debts = activeDebts(input);
  const nameOf = new Map<string, Debt>(debts.map((d) => [d.id, d]));

  // Debt payments against income.
  if (stats.debtToIncomePct !== null) {
    const pct = stats.debtToIncomePct;
    const high = pct >= th.debtHighPct;
    if (high || pct >= th.debtCautionPct) {
      push({
        kind: high ? 'debt-ratio-high' : 'debt-ratio-caution',
        severity: high ? 'high' : 'caution',
        title: `Debt payments are ${pct}% of income`,
        message: `Debt payments this month are ${money(stats.monthlyDebtPayments)}, ${pct}% of the ${money(stats.monthlyIncome)} monthly income.`,
        date: null,
        refId: null,
      });
    }
  }

  for (const item of stats.perDebt) {
    const debt = nameOf.get(item.debtId);
    if (!debt) continue;
    // Card near its limit.
    if (debt.type === 'card' && item.usagePct !== null && item.usagePct >= th.cardUsagePct) {
      push({
        kind: 'card-near-limit',
        severity: item.usagePct >= 100 ? 'high' : 'caution',
        title: `${debt.name} is at ${item.usagePct}% of its limit`,
        message: `${debt.name} has ${money(item.remaining)} used of its ${money(debt.limit)} limit (${item.usagePct}%).`,
        date: null,
        refId: debt.id,
      });
    }
    // Minimum-only interest.
    if (debt.type === 'card' && item.minimumInterestEstimate) {
      push({
        kind: 'card-minimum-interest',
        severity: 'info',
        title: `${debt.name}: minimum plan interest`,
        message: `On the minimum plan, ${debt.name} is estimated to add ${money(item.minimumInterestEstimate)} interest this month at ${debt.monthlyRatePct}% a month.`,
        date: null,
        refId: debt.id,
      });
    }
    // A loan or plan ends soon.
    if ((debt.type === 'loan' || debt.type === 'plan') && item.endDate && item.remaining > 0) {
      const end = item.endDate;
      if (compareDates(end, today) >= 0 && compareDates(end, addDays(today, ALERT_DAYS)) <= 0) {
        const freed = debt.type === 'loan' ? debt.monthlyPayment : debt.monthlyAmount;
        push({
          kind: 'debt-ends',
          severity: 'good',
          title: `${debt.name} ends on ${shortDate(end)}`,
          message: `${debt.name} has its last payment on ${shortDate(end)}. That frees ${money(freed)} a month from ${formatMonth(addMonthKey(monthKey(end), 1))}.`,
          date: end,
          refId: debt.id,
        });
      }
    }
  }

  // Cheques whose date has a lower projected balance than the amount.
  const idx = new Map(fc.days.map((d, i) => [d.date, i]));
  for (const c of input.cheques ?? []) {
    if (c.status !== 'upcoming') continue;
    const i = idx.get(c.date);
    if (i === undefined || compareDates(c.date, fc.asOf) <= 0) continue;
    const start = i === 0 ? fc.balanceAsOf : fc.days[i - 1].balance;
    if (start < c.amount) {
      push({
        kind: 'cheque-uncovered',
        severity: 'high',
        title: `Cheque to ${c.payee} on ${shortDate(c.date)}`,
        message: `The cheque to ${c.payee} for ${money(c.amount)} is dated ${shortDate(c.date)}. The balance at the start of that day is projected at ${money(start)}.`,
        date: c.date,
        refId: c.id,
      });
    }
  }
  return out;
}
