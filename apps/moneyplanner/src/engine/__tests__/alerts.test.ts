import { buildAlerts } from '../index';
import { card, cheque, income, input, loan, plan, settings } from '../test-fixtures';
import type { AppAlert, Transaction } from '@/types';

const TODAY = '2026-01-10';
const tx = (date: string, amount: number, kind: 'cost' | 'income' = 'cost'): Transaction => ({
  id: `t-${date}-${amount}`, kind, date, description: 'x', categoryId: null, amount, note: '', source: 'manual', importId: null, planned: true,
});
const base = { settings: settings({ startingBalance: 1000000, startingBalanceDate: '2026-01-01' }) };
const of = (alerts: AppAlert[], kind: string) => alerts.filter((a) => a.kind === kind);

describe('buildAlerts', () => {
  it('is empty when nothing is wrong', () => {
    expect(buildAlerts(input(base), TODAY)).toEqual([]);
    expect(buildAlerts(input(), TODAY)).toEqual([]);
  });

  it('shortfall-zero: first date only, factual wording, notify the day before', () => {
    const a = buildAlerts(input({ ...base, transactions: [tx('2026-01-20', 1124000), tx('2026-01-25', 100000)] }), TODAY);
    const z = of(a, 'shortfall-zero');
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({
      severity: 'high',
      date: '2026-01-20',
      notifyOn: '2026-01-19',
      refId: null,
      message: 'On 20 Jan your balance is projected at −AED 1,240.',
    });
  });

  it('notifies today when the day before is past', () => {
    const a = buildAlerts(input({ ...base, transactions: [tx('2026-01-10', 1100000)] }), TODAY);
    expect(of(a, 'shortfall-zero')[0]).toMatchObject({ date: '2026-01-10', notifyOn: TODAY });
  });

  it('shortfall-buffer when below the buffer but not zero; not duplicated on a zero day', () => {
    const s = settings({ startingBalance: 1000000, startingBalanceDate: '2026-01-01', buffer: 500000 });
    const a = buildAlerts(input({ settings: s, transactions: [tx('2026-02-01', 600000)] }), TODAY);
    expect(of(a, 'shortfall-zero')).toHaveLength(0);
    expect(of(a, 'shortfall-buffer')[0]).toMatchObject({
      severity: 'caution',
      date: '2026-02-01',
      message: 'On 1 Feb your balance is projected at AED 4,000, below your AED 5,000 buffer.',
    });
    const b = buildAlerts(input({ settings: s, transactions: [tx('2026-02-01', 1100000)] }), TODAY);
    expect(of(b, 'shortfall-zero')).toHaveLength(1);
    expect(of(b, 'shortfall-buffer')).toHaveLength(0);
  });

  it('no shortfalls beyond 60 days', () => {
    const a = buildAlerts(input({ ...base, transactions: [tx('2026-04-01', 2000000)] }), TODAY);
    expect(a).toEqual([]);
  });

  it('debt ratio: caution, high, and below threshold', () => {
    const mk = (monthly: number, thresholds = {}) =>
      buildAlerts(
        input({
          settings: settings({ alertThresholds: { debtCautionPct: 40, debtHighPct: 50, cardUsagePct: 80, ...thresholds } }),
          debts: [loan({ balance: 10000000, monthlyPayment: monthly, paymentDay: 28 })],
          recurring: [income(100000)],
        }),
        TODAY,
      );
    expect(of(mk(39000), 'debt-ratio-caution')).toHaveLength(0);
    const c = of(mk(45000), 'debt-ratio-caution');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ severity: 'caution', date: null, notifyOn: null, refId: null });
    expect(c[0].message).toBe('Debt payments this month are AED 450, 45% of the AED 1,000 monthly income.');
    expect(of(mk(45000), 'debt-ratio-high')).toHaveLength(0);
    const h = mk(50000);
    expect(of(h, 'debt-ratio-high')).toHaveLength(1);
    expect(of(h, 'debt-ratio-caution')).toHaveLength(0);
    expect(of(mk(45000, { debtCautionPct: 60 }), 'debt-ratio-caution')).toHaveLength(0);
  });

  it('no debt ratio alert without income', () => {
    const a = buildAlerts(input({ debts: [loan({ monthlyPayment: 90000 })] }), TODAY);
    expect(a.filter((x) => x.kind.startsWith('debt-ratio'))).toEqual([]);
  });

  it('card-near-limit at the threshold', () => {
    const c = card({ id: 'C9', name: 'Visa', limit: 1000000, balance: 800000, plan: 'fixed', fixedAmount: 1000, dueDay: 28 });
    const a = of(buildAlerts(input({ debts: [c] }), TODAY), 'card-near-limit');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ refId: 'C9', date: null, notifyOn: null, severity: 'caution', id: 'card-near-limit:C9:-' });
    expect(a[0].message).toBe('Visa has AED 8,000 used of its AED 10,000 limit (80%).');
    const low = card({ balance: 790000, limit: 1000000 });
    expect(of(buildAlerts(input({ debts: [low] }), TODAY), 'card-near-limit')).toHaveLength(0);
    const full = card({ balance: 1000000, limit: 1000000 });
    expect(of(buildAlerts(input({ debts: [full] }), TODAY), 'card-near-limit')[0].severity).toBe('high');
  });

  it('cheque-uncovered uses the balance at the start of the cheque date', () => {
    const s = settings({ startingBalance: 400000, startingBalanceDate: '2026-01-01' });
    const covered = buildAlerts(input({ settings: s, cheques: [cheque({ amount: 400000, date: '2026-01-20' })] }), TODAY);
    expect(of(covered, 'cheque-uncovered')).toHaveLength(0);
    const a = buildAlerts(input({ settings: s, cheques: [cheque({ id: 'Q7', amount: 500000, date: '2026-01-20', payee: 'Landlord' })] }), TODAY);
    const u = of(a, 'cheque-uncovered');
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({ refId: 'Q7', date: '2026-01-20', notifyOn: '2026-01-19', severity: 'high', id: 'cheque-uncovered:Q7:2026-01-20' });
    expect(u[0].message).toBe('The cheque to Landlord for AED 5,000 is dated 20 Jan. The balance at the start of that day is projected at AED 4,000.');
  });

  it('cheque alerts skip cleared and cancelled cheques, and cheques after 60 days', () => {
    const s = settings({ startingBalance: 0, startingBalanceDate: '2026-01-01' });
    const a = buildAlerts(
      input({ settings: s, cheques: [cheque({ status: 'cleared' }), cheque({ id: 'b', status: 'cancelled' }), cheque({ id: 'c', date: '2026-06-01' })] }),
      TODAY,
    );
    expect(of(a, 'cheque-uncovered')).toEqual([]);
  });

  it('a cheque dated today is checked against the balance before it', () => {
    const s = settings({ startingBalance: 100000, startingBalanceDate: '2026-01-01' });
    const a = buildAlerts(input({ settings: s, cheques: [cheque({ date: TODAY, amount: 500000 })] }), TODAY);
    expect(of(a, 'cheque-uncovered')).toHaveLength(1);
  });

  it('card-minimum-interest for the minimum plan only', () => {
    const c = card({ id: 'C2', name: 'Gold', plan: 'minimum', balance: 400000, monthlyRatePct: 3, dueDay: 28 });
    const a = of(buildAlerts(input({ debts: [c] }), TODAY), 'card-minimum-interest');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ severity: 'info', refId: 'C2', date: null });
    expect(a[0].message).toBe('On the minimum plan, Gold is estimated to add AED 114 interest this month at 3% a month.');
    expect(of(buildAlerts(input({ debts: [card({ plan: 'full' })] }), TODAY), 'card-minimum-interest')).toHaveLength(0);
  });

  it('debt-ends for a loan finishing within 60 days', () => {
    const l = loan({ id: 'L3', name: 'Car loan', balance: 60000, monthlyPayment: 30000, paymentDay: 15, balanceDate: '2026-01-01' });
    const a = of(buildAlerts(input({ debts: [l] }), TODAY), 'debt-ends');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ severity: 'good', date: '2026-02-15', notifyOn: '2026-02-14', refId: 'L3', id: 'debt-ends:L3:2026-02-15' });
    expect(a[0].message).toBe('Car loan has its last payment on 15 Feb. That frees AED 300 a month from Mar 2026.');
  });

  it('debt-ends says estimated when interest was used', () => {
    const l = loan({ id: 'L4', balance: 50000, monthlyPayment: 30000, annualRatePct: 12 });
    const a = of(buildAlerts(input({ debts: [l] }), TODAY), 'debt-ends');
    expect(a[0].message).toMatch(/^Car loan has an estimated last payment on \d+ \w+\./);
  });

  it('debt-ends for a plan, and not for a loan ending later or a card', () => {
    const p = plan({ id: 'P2', name: 'Sofa', firstPaymentDate: '2025-12-20', payments: 2, total: 80000, monthlyAmount: 40000 });
    expect(of(buildAlerts(input({ debts: [p] }), TODAY), 'debt-ends')[0]).toMatchObject({ refId: 'P2', date: '2026-01-20' });
    const later = loan({ balance: 1000000, monthlyPayment: 30000 });
    expect(of(buildAlerts(input({ debts: [later] }), TODAY), 'debt-ends')).toEqual([]);
    expect(of(buildAlerts(input({ debts: [card()] }), TODAY), 'debt-ends')).toEqual([]);
  });

  it('ids are stable across calls and unique', () => {
    const i = input({
      ...base,
      debts: [loan({ balance: 60000 }), card({ balance: 900000, plan: 'minimum', dueDay: 28 })],
      cheques: [cheque({ amount: 99999999, date: '2026-01-20' })],
      transactions: [tx('2026-01-20', 5000000)],
    });
    const a = buildAlerts(i, TODAY);
    const b = buildAlerts(i, TODAY);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
    expect(a.length).toBeGreaterThanOrEqual(4);
  });

  it('wording is facts, never advice', () => {
    const i = input({
      ...base,
      recurring: [income(100000)],
      debts: [loan({ balance: 60000, monthlyPayment: 60000 }), card({ balance: 900000, plan: 'minimum', dueDay: 28 })],
      cheques: [cheque({ amount: 99999999, date: '2026-01-20' })],
      transactions: [tx('2026-01-20', 5000000)],
      settings: settings({ startingBalance: 1000000, startingBalanceDate: '2026-01-01', buffer: 99999999 }),
    });
    const a = buildAlerts(i, TODAY);
    const kinds = new Set(a.map((x) => x.kind));
    for (const k of ['shortfall-zero', 'debt-ratio-high', 'card-near-limit', 'cheque-uncovered', 'card-minimum-interest', 'debt-ends']) expect(kinds.has(k as never)).toBe(true);
    for (const x of a) expect(`${x.title} ${x.message}`).not.toMatch(/\b(should|must|consider|try to|avoid|recommend)\b/i);
  });
});
