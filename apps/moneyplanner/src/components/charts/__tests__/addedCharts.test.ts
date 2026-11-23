import { cheque, card, income, input, loan, settings } from '@/engine/test-fixtures';
import type { RecurringItem } from '@/types';
import { debtPayoffChart, formatChartValue, formatPercent, incomeVsSpendingChart, savingsRateChart } from '../addedCharts';
import { ADDABLE_CHARTS, CHARTS, chartById } from '../registry';

const TODAY = '2026-06-10';
/** Six months of history exist (the fixtures' recurring items start in January). */
const LATER = '2026-09-10';
const cost = (amount: number): RecurringItem => ({ ...income(amount), id: 'c1', kind: 'cost', name: 'Rent' });
const plan = (over = {}) => input({ settings: settings({ startingBalance: 100000, startingBalanceDate: '2026-01-01' }), recurring: [income(1000000), cost(400000)], ...over });

describe('Added charts in the registry', () => {
  it('lists three addable charts after the balance chart: income vs spending free, debt payoff and savings rate Pro', () => {
    expect(CHARTS.map((c) => c.id)).toEqual(['balance', 'income-vs-spending', 'debt-payoff', 'savings-rate']);
    expect(ADDABLE_CHARTS.map((c) => [c.id, c.pro])).toEqual([
      ['income-vs-spending', false],
      ['debt-payoff', true],
      ['savings-rate', true],
    ]);
    expect(chartById('savings-rate')).toBe(savingsRateChart);
  });
});

describe('Income vs spending build()', () => {
  it('gives income and spending for 6 months back and 6 ahead: past months actual, this one on forecast', () => {
    const [inc, spend] = incomeVsSpendingChart.build(plan(), '6M', LATER);
    expect([inc.id, spend.id]).toEqual(['income', 'spending']);
    expect(inc.points).toHaveLength(12);
    expect(inc.points[0].title).toBe('Mar 2026');
    expect(inc.points[5].kind).toBe('actual');
    expect(inc.points[6]).toMatchObject({ title: 'Sep 2026', kind: 'forecast', date: '2026-09-30' });
    expect(inc.points[11].title).toBe('Feb 2027');
    expect(inc.points.every((p) => p.balance === 1000000)).toBe(true);
    expect(spend.points.every((p) => p.balance === 400000)).toBe(true);
  });

  it('has a 3 month range and returns nothing for an empty plan', () => {
    expect(incomeVsSpendingChart.build(plan(), '3M', TODAY)[0].points).toHaveLength(6);
    expect(incomeVsSpendingChart.build(input(), '6M', TODAY)).toEqual([]);
  });
});

describe('Savings rate build()', () => {
  it('is (income - spending) / income per month in hundredths of a percent', () => {
    const [s] = savingsRateChart.build(plan(), '6M', LATER);
    expect(s.points).toHaveLength(12);
    expect(s.points.every((p) => p.balance === 6000)).toBe(true); // 60%
    expect(formatChartValue('percent', s.points[0].balance, 'AED')).toBe('60%');
    expect(s.points[0].lines).toEqual([
      { label: 'Income', amount: 1000000 },
      { label: 'Spending', amount: -400000 },
    ]);
  });

  it('goes negative when spending is higher and has no series without income', () => {
    const [s] = savingsRateChart.build(plan({ recurring: [income(1000000), cost(1500000)] }), '3M', LATER);
    expect(s.points[0].balance).toBe(-5000);
    expect(formatPercent(-5000)).toBe('−50%');
    expect(savingsRateChart.build(plan({ recurring: [cost(100)] }), '6M', TODAY)).toEqual([]);
  });
});

describe('Debt payoff build()', () => {
  const withLoan = () => plan({ debts: [loan({ balance: 100000, monthlyPayment: 30000, paymentDay: 15, balanceDate: '2026-06-01' })] });

  it('falls from what is owed today to zero on the last payment (the debt-free date)', () => {
    const [s] = debtPayoffChart.build(withLoan(), 'All', TODAY);
    const pts = s.points;
    expect(pts[0]).toMatchObject({ title: 'Today', balance: 100000, kind: 'actual' });
    expect(pts[1].kind).toBe('forecast');
    const last = pts[pts.length - 1];
    // 100,000 in payments of 30,000 on the 15th: Jun 15, Jul, Aug, then 10,000 on Sep 15.
    expect(last).toMatchObject({ balance: 0, date: '2026-09-15' });
    expect(last.title).toBe('Debt-free, 15 Sep 2026');
    for (let i = 1; i < pts.length; i++) expect(pts[i].balance).toBeLessThanOrEqual(pts[i - 1].balance);
    expect(pts.find((p) => p.date === '2026-06-30')?.balance).toBe(70000);
  });

  it('cuts the 1Y range at the end of the year and sums several debts', () => {
    const long = plan({ debts: [loan({ balance: 3_000_000, monthlyPayment: 100000, balanceDate: '2026-06-01' }), card({ balance: 50000, balanceDate: '2026-06-01' })] });
    const [s] = debtPayoffChart.build(long, '1Y', TODAY);
    expect(s.points[s.points.length - 1].date <= '2027-06-10').toBe(true);
    expect(s.points[0].balance).toBe(3_050_000);
    expect(s.points[s.points.length - 1].balance).toBeGreaterThan(0);
  });

  it('is empty without debts or when everything is paid off, and ignores cheques', () => {
    expect(debtPayoffChart.build(plan(), 'All', TODAY)).toEqual([]);
    expect(debtPayoffChart.build(plan({ cheques: [cheque()] }), 'All', TODAY)).toEqual([]);
    expect(debtPayoffChart.build(plan({ debts: [loan({ balance: 0 })] }), 'All', TODAY)).toEqual([]);
  });
});
