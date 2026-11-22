import { debtSchedule, debtStats, forecast, monthSummary, yearSummary, planInstalments } from '../index';
import { card, cheque, dov, income, input, loan, pay, plan, settings } from '../test-fixtures';

const sched = (d: Parameters<typeof debtSchedule>[0], i: ReturnType<typeof input>, from = '2026-01-01', to = '2026-12-31') =>
  debtSchedule(d, i, from, to);
const pairs = (ps: { date: string; amount: number }[]) => ps.map((p) => [p.date, p.amount]);

describe('loans', () => {
  it('pays monthly until the balance is gone, last one partial', () => {
    const l = loan();
    const r = sched(l, input({ debts: [l] }));
    expect(pairs(r)).toEqual([
      ['2026-01-15', 30000],
      ['2026-02-15', 30000],
      ['2026-03-15', 30000],
      ['2026-04-15', 10000],
    ]);
    expect(r[0]).toMatchObject({ debtId: 'L1', kind: 'loan', label: 'Car loan payment', originalDate: '2026-01-15' });
  });

  it('starts after balanceDate (a payment on that day is already in the balance)', () => {
    const l = loan({ balanceDate: '2026-01-15' });
    expect(sched(l, input({ debts: [l] }))[0].date).toBe('2026-02-15');
    const l2 = loan({ balanceDate: '2026-01-14' });
    expect(sched(l2, input({ debts: [l2] }))[0].date).toBe('2026-01-15');
  });

  it('clamps day 31 to month end and handles leap years', () => {
    const l = loan({ paymentDay: 31, balance: 1000000, balanceDate: '2027-12-31' });
    const r = sched(l, input({ debts: [l] }), '2028-01-01', '2028-04-30');
    expect(r.map((p) => p.date)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30']);
    const r2 = sched(l, input({ debts: [l] }), '2029-02-01', '2029-02-28');
    expect(r2.map((p) => p.date)).toEqual(['2029-02-28']);
  });

  it('stops at endDate even with balance left', () => {
    const l = loan({ balance: 1000000, endDate: '2026-03-15' });
    expect(sched(l, input({ debts: [l] })).map((p) => p.date)).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  it('logged extra and partial payments reduce the balance', () => {
    const l = loan();
    const extra = pay({ kind: 'extra', date: '2026-01-20', amount: 40000 });
    const r = sched(l, input({ debts: [l], debtPayments: [extra] }));
    expect(pairs(r)).toEqual([
      ['2026-01-15', 30000],
      ['2026-02-15', 30000],
    ]);
    const partial = pay({ kind: 'partial', date: '2026-01-10', amount: 10000 });
    expect(sched(l, input({ debts: [l], debtPayments: [partial] })).reduce((s, p) => s + p.amount, 0)).toBe(90000);
  });

  it('ignores logged payments on or before the balance date', () => {
    const l = loan();
    const old = pay({ kind: 'extra', date: '2026-01-01', amount: 40000 });
    expect(sched(l, input({ debts: [l], debtPayments: [old] })).reduce((s, p) => s + p.amount, 0)).toBe(100000);
  });

  it('a logged regular payment replaces that month', () => {
    const l = loan();
    const r = sched(l, input({ debts: [l], debtPayments: [pay({ date: '2026-02-14', amount: 30000 })] }));
    expect(pairs(r)).toEqual([
      ['2026-01-15', 30000],
      ['2026-03-15', 30000],
      ['2026-04-15', 10000],
    ]);
  });

  it('overrides skip, move and change amount', () => {
    const l = loan();
    const i = input({
      debts: [l],
      debtOverrides: [
        dov({ id: 'a', originalDate: '2026-01-15', skip: true }),
        dov({ id: 'b', originalDate: '2026-02-15', newDate: '2026-02-20', newAmount: 20000 }),
      ],
    });
    const r = sched(l, i);
    expect(pairs(r)).toEqual([
      ['2026-02-20', 20000],
      ['2026-03-15', 30000],
      ['2026-04-15', 30000],
      ['2026-05-15', 20000],
    ]);
    expect(r[0].originalDate).toBe('2026-02-15');
  });

  it('a payment moved from beyond the range into it is found', () => {
    const l = loan();
    const i = input({ debts: [l], debtOverrides: [dov({ originalDate: '2026-03-15', newDate: '2026-02-01' })] });
    expect(sched(l, i, '2026-02-01', '2026-02-01').map((p) => p.originalDate)).toEqual(['2026-03-15']);
  });

  it('ignores archived debts, paid-off loans and empty ranges', () => {
    const l = loan({ archived: true });
    expect(sched(l, input({ debts: [l] }))).toEqual([]);
    const paid = loan({ balance: 0 });
    expect(sched(paid, input({ debts: [paid] }))).toEqual([]);
    expect(sched(loan(), input(), '2026-05-01', '2026-04-01')).toEqual([]);
  });

  it('a zero monthly payment never loops forever', () => {
    const l = loan({ monthlyPayment: 0 });
    expect(sched(l, input({ debts: [l] }))).toEqual([]);
  });
});

describe('cards', () => {
  it('full: pays the balance on the due day, then stops', () => {
    const c = card();
    expect(pairs(sched(c, input({ debts: [c] })))).toEqual([['2026-01-20', 100000]]);
  });

  it('minimum: max(pct, floor) capped at the balance, interest carried', () => {
    const c = card({ plan: 'minimum', balance: 100000 });
    const r = sched(c, input({ debts: [c] }), '2026-01-01', '2026-03-31');
    // Jan: min(100000, max(5000, 5000)) = 5000; left 95000; +3% = 2850 -> 97850
    // Feb: 5% of 97850 = 4893 -> floor 5000
    expect(pairs(r)).toEqual([
      ['2026-01-20', 5000],
      ['2026-02-20', 5000],
      ['2026-03-20', 5000],
    ]);
    const big = card({ plan: 'minimum', balance: 400000 });
    expect(sched(big, input({ debts: [big] }), '2026-01-01', '2026-02-28').map((p) => p.amount)).toEqual([20000, Math.round((380000 + 11400) * 0.05)]);
  });

  it('minimum never exceeds the balance', () => {
    const c = card({ plan: 'minimum', balance: 3000 });
    expect(pairs(sched(c, input({ debts: [c] })))).toEqual([['2026-01-20', 3000]]);
  });

  it('fixed: pays the amount, capped at the balance, with interest on the rest', () => {
    const c = card({ plan: 'fixed', fixedAmount: 40000, balance: 100000, monthlyRatePct: 2 });
    const r = sched(c, input({ debts: [c] }));
    // 100000 -40000 = 60000 +1200 = 61200 -> 40000 -> 21200+424 = 21624 -> 21624 -> +0 interest after 0
    expect(pairs(r)).toEqual([
      ['2026-01-20', 40000],
      ['2026-02-20', 40000],
      ['2026-03-20', 21624],
    ]);
  });

  it('fixed with no amount pays nothing', () => {
    const c = card({ plan: 'fixed', fixedAmount: null });
    expect(sched(c, input({ debts: [c] }))).toEqual([]);
  });

  it('due day 31 clamps to the month end', () => {
    const c = card({ dueDay: 31, plan: 'fixed', fixedAmount: 10000, balance: 100000, monthlyRatePct: 0 });
    expect(sched(c, input({ debts: [c] }), '2026-01-01', '2026-04-30').map((p) => p.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('a logged regular payment replaces the month; extra reduces the balance', () => {
    const c = card({ plan: 'fixed', fixedAmount: 40000, monthlyRatePct: 0 });
    const i = input({
      debts: [c],
      debtPayments: [
        pay({ debtId: 'C1', date: '2026-01-18', amount: 40000, kind: 'regular' }),
        pay({ id: 'p2', debtId: 'C1', date: '2026-01-19', amount: 10000, kind: 'extra' }),
      ],
    });
    expect(pairs(sched(c, i))).toEqual([
      ['2026-02-20', 40000],
      ['2026-03-20', 10000],
    ]);
  });

  it('overrides apply to card payments', () => {
    const c = card();
    const i = input({ debts: [c], debtOverrides: [dov({ debtId: 'C1', originalDate: '2026-01-20', newDate: '2026-01-25', newAmount: 60000 })] });
    expect(pairs(sched(c, i))).toEqual([
      ['2026-01-25', 60000],
      ['2026-02-20', 40000],
    ]);
  });
});

describe('instalment plans', () => {
  it('equal payments with the last adjusted so the sum equals the total', () => {
    const p = plan({ total: 100000, monthlyAmount: 33333, payments: 3 });
    const r = sched(p, input({ debts: [p] }));
    expect(pairs(r)).toEqual([
      ['2026-02-10', 33333],
      ['2026-03-10', 33333],
      ['2026-04-10', 33334],
    ]);
    expect(r[0]).toMatchObject({ kind: 'plan', label: 'Phone plan instalment' });
  });

  it('anchors month-end first dates (31 Jan, then 28 Feb, 31 Mar)', () => {
    const p = plan({ firstPaymentDate: '2026-01-31' });
    expect(sched(p, input({ debts: [p] })).map((x) => x.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('logged payments are used up against the earliest instalments', () => {
    const p = plan();
    const logged = pay({ debtId: 'P1', date: '2026-02-10', amount: 60000, kind: 'regular' });
    const i = input({ debts: [p], debtPayments: [logged] });
    expect(pairs(sched(p, i))).toEqual([
      ['2026-03-10', 20000],
      ['2026-04-10', 40000],
    ]);
    expect(planInstalments(p, i).consumed).toBe(1);
  });

  it('overrides skip and move instalments', () => {
    const p = plan();
    const i = input({
      debts: [p],
      debtOverrides: [dov({ debtId: 'P1', originalDate: '2026-02-10', skip: true }), dov({ id: 'o2', debtId: 'P1', originalDate: '2026-03-10', newDate: '2026-03-12' })],
    });
    expect(pairs(sched(p, i))).toEqual([
      ['2026-03-12', 40000],
      ['2026-04-10', 40000],
    ]);
  });

  it('a plan on a card is not a separate outflow, and the card pays it (no double counting)', () => {
    const c = card({ balance: 0 });
    const p = plan({ cardId: 'C1' });
    const i = input({ debts: [c, p] });
    expect(sched(p, i)).toEqual([]);
    // Each month's instalment is added to the card balance, paid in full on the 20th.
    expect(pairs(sched(c, i))).toEqual([
      ['2026-02-20', 40000],
      ['2026-03-20', 40000],
      ['2026-04-20', 40000],
    ]);
    const total = [c, p].flatMap((d) => sched(d, i)).reduce((s, x) => s + x.amount, 0);
    expect(total).toBe(120000);
  });

  it('a card with a plan and an existing balance pays both once', () => {
    const c = card({ balance: 100000, plan: 'full' });
    const p = plan({ cardId: 'C1', total: 80000, monthlyAmount: 40000, payments: 2 });
    expect(pairs(sched(c, input({ debts: [c, p] })))).toEqual([
      ['2026-01-20', 100000],
      ['2026-02-20', 40000],
      ['2026-03-20', 40000],
    ]);
  });

  it('a plan on an archived or missing card is standalone', () => {
    const c = card({ archived: true });
    const p = plan({ cardId: 'C1' });
    expect(sched(p, input({ debts: [c, p] })).length).toBe(3);
    const q = plan({ cardId: 'nope' });
    expect(sched(q, input({ debts: [q] })).length).toBe(3);
  });
});

describe('forecast, summaries and cheques', () => {
  const i = input({
    settings: settings({ startingBalance: 1000000, startingBalanceDate: '2026-01-01' }),
    debts: [loan(), card({ id: 'C1', balance: 50000 })],
    cheques: [
      cheque({ id: 'up', date: '2026-02-05', amount: 200000, payee: 'Landlord' }),
      cheque({ id: 'cl', date: '2026-02-06', status: 'cleared' }),
      cheque({ id: 'ca', date: '2026-02-07', status: 'cancelled' }),
    ],
  });
  it('puts debt payments and upcoming cheques in the daily forecast', () => {
    const f = forecast(i, { today: '2026-01-01', days: 60, months: 2 });
    const events = f.days.flatMap((d) => d.events).filter((e) => e.source !== 'recurring');
    expect(events.map((e) => [e.date, e.source, e.refId, e.amount, e.label])).toEqual([
      ['2026-01-15', 'debt', 'L1', 30000, 'Car loan payment'],
      ['2026-01-20', 'debt', 'C1', 50000, 'Visa payment'],
      ['2026-02-05', 'cheque', 'up', 200000, 'Cheque to Landlord'],
      ['2026-02-15', 'debt', 'L1', 30000, 'Car loan payment'],
      ['2026-03-15', 'debt', 'L1', 30000, 'Car loan payment'],
    ].filter((e) => e[0] <= '2026-03-02'));
    expect(f.days[f.days.length - 1].balance).toBe(1000000 - 30000 - 50000 - 200000 - 30000);
  });

  it('payments before today are folded into the starting point', () => {
    const f = forecast(i, { today: '2026-01-31', days: 5, months: 1 });
    expect(f.balanceAsOf).toBe(1000000 - 30000 - 50000);
  });

  it('month and year summaries include debts and cheques in spend and free money', () => {
    const m = monthSummary('2026-02', i);
    expect(m.debtPayments).toBe(30000);
    expect(m.cheques).toBe(200000);
    expect(m.totalSpend).toBe(230000);
    expect(m.freeMoney).toBe(-230000);
    const y = yearSummary(2026, i);
    expect(y.months[0].debtPayments).toBe(80000);
    expect(y.months[1].cheques).toBe(200000);
    expect(y.totalSpend).toBe(80000 + 230000 + 30000 + 10000);
    expect(y.highestSpendMonth).toBe('2026-02');
  });

  it('cleared and cancelled cheques are ignored', () => {
    const only = input({ cheques: [cheque({ status: 'cleared' }), cheque({ id: 'x', status: 'cancelled' })] });
    expect(monthSummary('2026-03', only).cheques).toBe(0);
  });
});

describe('debtStats', () => {
  const today = '2026-01-10';
  it('handles no debts and no income', () => {
    const s = debtStats(input(), today);
    expect(s).toMatchObject({ totalRemaining: 0, monthlyDebtPayments: 0, monthlyIncome: 0, debtToIncomePct: null, debtFreeDate: null, perDebt: [] });
  });

  it('totals, ratio and debt-free date', () => {
    const l = loan();
    const i = input({ debts: [l], recurring: [income(100000)] });
    const s = debtStats(i, today);
    expect(s.totalRemaining).toBe(100000);
    expect(s.monthlyDebtPayments).toBe(30000);
    expect(s.monthlyIncome).toBe(100000);
    expect(s.debtToIncomePct).toBe(30);
    expect(s.debtFreeDate).toBe('2026-04-15');
    expect(s.perDebt[0]).toMatchObject({ debtId: 'L1', remaining: 100000, nextPayment: { date: '2026-01-15', amount: 30000 }, endDate: '2026-04-15', totalCount: null, paidCount: 0 });
  });

  it('no income gives a null ratio', () => {
    const s = debtStats(input({ debts: [loan()] }), today);
    expect(s.debtToIncomePct).toBeNull();
    expect(s.monthlyDebtPayments).toBe(30000);
  });

  it('weekly income uses its monthly equivalent and ended income is ignored', () => {
    const w = { ...income(10000), id: 'w', schedule: { type: 'weekly' as const, everyWeeks: 1 } };
    const old = { ...income(999999), id: 'old', endDate: '2025-12-31' };
    expect(debtStats(input({ recurring: [w, old] }), today).monthlyIncome).toBe(Math.round((10000 * 52) / 12));
  });

  it('counts a logged regular payment of this month and reduces the remaining balance', () => {
    const l = loan();
    const i = input({ debts: [l], debtPayments: [pay({ date: '2026-01-05', amount: 30000 })] });
    const s = debtStats(i, today);
    expect(s.totalRemaining).toBe(70000);
    expect(s.monthlyDebtPayments).toBe(30000);
    expect(s.perDebt[0].paidCount).toBe(1);
  });

  it('no debt-free date when a debt never ends within 30 years', () => {
    const c = card({ plan: 'fixed', fixedAmount: 1000, balance: 1000000, monthlyRatePct: 3 });
    const s = debtStats(input({ debts: [loan(), c] }), today);
    expect(s.debtFreeDate).toBeNull();
    expect(s.perDebt[1].endDate).toBeNull();
  });

  it('loan with an end date: k of N', () => {
    const l = loan({ endDate: '2026-04-15' });
    const s = debtStats(input({ debts: [l] }), '2026-03-20');
    expect(s.perDebt[0]).toMatchObject({ paidCount: 3, totalCount: 4 });
  });

  it('cards: available credit, usage, minimum interest', () => {
    const c = card({ plan: 'minimum', balance: 400000, limit: 500000 });
    const s = debtStats(input({ debts: [c] }), today);
    expect(s.perDebt[0]).toMatchObject({ availableCredit: 100000, usagePct: 80, minimumInterestEstimate: Math.round(380000 * 0.03) });
    const f = card({ plan: 'full' });
    expect(debtStats(input({ debts: [f] }), today).perDebt[0].minimumInterestEstimate).toBeNull();
    const z = card({ limit: 0 });
    expect(debtStats(input({ debts: [z] }), today).perDebt[0].usagePct).toBeNull();
  });

  it('plans: progress, and a card-linked plan is not counted twice monthly', () => {
    const c = card({ balance: 0 });
    const p = plan({ cardId: 'C1' });
    const s = debtStats(input({ debts: [c, p] }), '2026-02-12');
    expect(s.totalRemaining).toBe(120000);
    expect(s.monthlyDebtPayments).toBe(40000); // the card's payment on 20 Feb only
    const item = s.perDebt.find((x) => x.debtId === 'P1');
    expect(item).toMatchObject({ paidCount: 1, totalCount: 3, nextPayment: { date: '2026-03-10', amount: 40000 }, endDate: '2026-04-10' });
    expect(s.debtFreeDate).toBe('2026-04-20');
  });

  it('archived debts are left out', () => {
    expect(debtStats(input({ debts: [loan({ archived: true })] }), today).perDebt).toEqual([]);
  });
});

describe('logged payments as outflows', () => {
  const s = settings({ startingBalance: 1000000, startingBalanceDate: '2026-02-01' });
  const l = loan({ balanceDate: '2026-01-01' });
  const logs = [
    pay({ id: 'a', date: '2026-01-20', amount: 10000, kind: 'extra' }), // before the balance date: history
    pay({ id: 'b', date: '2026-02-10', amount: 30000, kind: 'regular' }),
    pay({ id: 'c', date: '2026-02-12', amount: 5000, kind: 'extra' }),
    pay({ id: 'd', date: '2026-02-13', amount: 2000, kind: 'partial' }),
  ];
  const i = input({ settings: s, debts: [l], debtPayments: logs });

  it('count after the starting balance date, once, and replace the month regular payment', () => {
    const f = forecast(i, { today: '2026-02-01', days: 30, months: 1 });
    const ev = f.days.flatMap((d) => d.events).filter((e) => e.source === 'debt');
    expect(ev.map((e) => [e.date, e.amount, e.label])).toEqual([
      ['2026-02-10', 30000, 'Car loan payment (logged)'],
      ['2026-02-12', 5000, 'Car loan payment (logged)'],
      ['2026-02-13', 2000, 'Car loan payment (logged)'],
      ['2026-03-15', 30000, 'Car loan payment'],
    ]);
    expect(monthSummary('2026-02', i).debtPayments).toBe(37000);
    expect(yearSummary(2026, i).months[1].debtPayments).toBe(37000);
  });

  it('a logged payment of a card-linked plan is one outflow, not also in the card', () => {
    const c = card({ balance: 0, balanceDate: '2026-01-01' });
    const p = plan({ cardId: 'C1', firstPaymentDate: '2026-02-10' });
    const j = input({ settings: s, debts: [c, p], debtPayments: [pay({ debtId: 'P1', date: '2026-02-10', amount: 40000, kind: 'regular' })] });
    expect(monthSummary('2026-02', j).debtPayments).toBe(40000);
    expect(monthSummary('2026-03', j).debtPayments).toBe(40000);
  });
});
