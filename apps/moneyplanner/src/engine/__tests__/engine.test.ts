import {
  expandRecurring,
  forecast,
  monthlyEquivalent,
  monthSummary,
  occurrencesInRange,
  yearSummary,
} from '../index';
import type {
  OccurrenceOverride,
  PlanInput,
  RecurringItem,
  Schedule,
  Settings,
  Transaction,
} from '@/types';

const item = (over: Partial<RecurringItem> & { schedule: Schedule }): RecurringItem => ({
  id: 'r1',
  kind: 'cost',
  name: 'Item',
  categoryId: null,
  amount: 1000,
  startDate: '2026-01-01',
  endDate: null,
  count: null,
  note: '',
  ...over,
});
const ov = (over: Partial<OccurrenceOverride>): OccurrenceOverride => ({
  id: 'o1',
  recurringId: 'r1',
  originalDate: '2026-01-01',
  skip: false,
  newDate: null,
  newAmount: null,
  paid: false,
  ...over,
});
const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't1',
  kind: 'cost',
  date: '2026-01-01',
  description: 'Tx',
  categoryId: null,
  amount: 100,
  note: '',
  source: 'manual',
  importId: null,
  planned: false,
  ...over,
});
const settings = (over: Partial<Settings> = {}): Settings => ({
  currency: 'AED',
  payday: null,
  startingBalance: 0,
  startingBalanceDate: '2026-01-01',
  buffer: 0,
  enabledModules: { debts: false, cheques: false, alerts: false, import: false },
  alertThresholds: { debtCautionPct: 40, debtHighPct: 50, cardUsagePct: 80 },
  onboarded: true,
  lockEnabled: false,
  ...over,
});
const input = (over: Partial<PlanInput> = {}): PlanInput => ({
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
const dates = (os: { date: string }[]) => os.map((o) => o.date);

describe('expandRecurring monthly', () => {
  it('every month on a day', () => {
    const r = expandRecurring(item({ schedule: { type: 'monthly', day: 15 }, startDate: '2026-01-10' }), [], '2026-01-01', '2026-04-30');
    expect(dates(r)).toEqual(['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15']);
  });
  it('drops candidates before startDate', () => {
    const r = expandRecurring(item({ schedule: { type: 'monthly', day: 5 }, startDate: '2026-01-10' }), [], '2026-01-01', '2026-03-31');
    expect(dates(r)).toEqual(['2026-02-05', '2026-03-05']);
  });
  it('clamps the 31st and handles leap years', () => {
    const it = item({ schedule: { type: 'monthly', day: 31 }, startDate: '2027-12-01' });
    expect(dates(expandRecurring(it, [], '2028-01-01', '2028-04-30'))).toEqual(['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30']);
    expect(dates(expandRecurring(it, [], '2029-02-01', '2029-02-28'))).toEqual(['2029-02-28']);
  });
  it("'last' is the month's last day", () => {
    const r = expandRecurring(item({ schedule: { type: 'monthly', day: 'last' } }), [], '2026-01-01', '2026-04-30');
    expect(dates(r)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });
  it('everyMonths', () => {
    const r = expandRecurring(item({ schedule: { type: 'monthly', day: 1, everyMonths: 3 } }), [], '2026-01-01', '2026-12-31');
    expect(dates(r)).toEqual(['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01']);
  });
  it('starts mid-range correctly with skip-ahead', () => {
    const it = item({ schedule: { type: 'monthly', day: 20, everyMonths: 2 }, startDate: '2020-03-01' });
    const r = expandRecurring(it, [], '2026-01-01', '2026-06-30');
    expect(dates(r)).toEqual(['2026-01-20', '2026-03-20', '2026-05-20']);
  });
});

describe('expandRecurring weekly and yearly', () => {
  it('weekly', () => {
    const r = expandRecurring(item({ schedule: { type: 'weekly', everyWeeks: 1 }, startDate: '2026-01-05' }), [], '2026-01-01', '2026-01-31');
    expect(dates(r)).toEqual(['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']);
  });
  it('every two weeks, range starting later', () => {
    const r = expandRecurring(item({ schedule: { type: 'weekly', everyWeeks: 2 }, startDate: '2026-01-05' }), [], '2026-01-20', '2026-02-28');
    expect(dates(r)).toEqual(['2026-02-02', '2026-02-16']);
  });
  it('yearly', () => {
    const r = expandRecurring(item({ schedule: { type: 'yearly', month: 6, day: 15 }, startDate: '2026-07-01' }), [], '2026-01-01', '2029-12-31');
    expect(dates(r)).toEqual(['2027-06-15', '2028-06-15', '2029-06-15']);
  });
  it('yearly Feb 29 falls back to Feb 28', () => {
    const r = expandRecurring(item({ schedule: { type: 'yearly', month: 2, day: 29 }, startDate: '2027-01-01' }), [], '2027-01-01', '2029-12-31');
    expect(dates(r)).toEqual(['2027-02-28', '2028-02-29', '2029-02-28']);
  });
});

describe('expandRecurring limits', () => {
  const monthly = { type: 'monthly', day: 10 } as const;
  it('endDate is inclusive', () => {
    const r = expandRecurring(item({ schedule: monthly, endDate: '2026-03-10' }), [], '2026-01-01', '2026-12-31');
    expect(dates(r)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
  });
  it('endDate before startDate gives nothing', () => {
    expect(expandRecurring(item({ schedule: monthly, endDate: '2025-12-31' }), [], '2026-01-01', '2026-12-31')).toEqual([]);
  });
  it('count limits originals', () => {
    const r = expandRecurring(item({ schedule: monthly, count: 2 }), [], '2026-01-01', '2026-12-31');
    expect(dates(r)).toEqual(['2026-01-10', '2026-02-10']);
  });
  it('count still counts before the range and skipped ones', () => {
    const r = expandRecurring(item({ schedule: monthly, count: 4 }), [ov({ originalDate: '2026-03-10', skip: true })], '2026-02-01', '2026-12-31');
    expect(dates(r)).toEqual(['2026-02-10', '2026-04-10']);
  });
  it('whichever comes first of count and endDate', () => {
    const r = expandRecurring(item({ schedule: monthly, count: 10, endDate: '2026-02-28' }), [], '2026-01-01', '2026-12-31');
    expect(r).toHaveLength(2);
  });
  it('count 0 and inverted range give nothing', () => {
    expect(expandRecurring(item({ schedule: monthly, count: 0 }), [], '2026-01-01', '2026-12-31')).toEqual([]);
    expect(expandRecurring(item({ schedule: monthly }), [], '2026-02-01', '2026-01-01')).toEqual([]);
  });
  it('nothing before startDate', () => {
    expect(expandRecurring(item({ schedule: monthly, startDate: '2026-06-01' }), [], '2026-01-01', '2026-05-31')).toEqual([]);
  });
  it('survives a far-away range quickly', () => {
    const r = expandRecurring(item({ schedule: { type: 'weekly', everyWeeks: 1 }, count: 100000 }), [], '2026-01-01', '2999-12-31');
    expect(r.length).toBeLessThanOrEqual(20000);
  });
  it('tolerates bad schedule numbers', () => {
    const r = expandRecurring(item({ schedule: { type: 'weekly', everyWeeks: 0 } }), [], '2026-01-01', '2026-01-15');
    expect(dates(r)).toEqual(['2026-01-01', '2026-01-08', '2026-01-15']);
  });
});

describe('overrides', () => {
  const it = item({ schedule: { type: 'monthly', day: 10 }, amount: 500 });
  it_('skip removes', () => {
    const r = expandRecurring(it, [ov({ originalDate: '2026-02-10', skip: true })], '2026-01-01', '2026-03-31');
    expect(dates(r)).toEqual(['2026-01-10', '2026-03-10']);
  });
  it_('newAmount and paid', () => {
    const r = expandRecurring(it, [ov({ originalDate: '2026-02-10', newAmount: 900, paid: true })], '2026-02-01', '2026-02-28');
    expect(r[0]).toMatchObject({ amount: 900, paid: true, overridden: true, date: '2026-02-10', originalDate: '2026-02-10' });
  });
  it_('plain occurrences are not overridden', () => {
    const r = expandRecurring(it, [], '2026-02-01', '2026-02-28');
    expect(r[0]).toMatchObject({ amount: 500, paid: false, overridden: false });
  });
  it_('newDate moves within range', () => {
    const r = expandRecurring(it, [ov({ originalDate: '2026-02-10', newDate: '2026-02-20' })], '2026-02-01', '2026-02-28');
    expect(r[0]).toMatchObject({ date: '2026-02-20', originalDate: '2026-02-10', overridden: true });
  });
  it_('moved INTO range from outside is included', () => {
    const r = expandRecurring(it, [ov({ originalDate: '2026-03-10', newDate: '2026-02-25' })], '2026-02-01', '2026-02-28');
    expect(r.map((o) => [o.date, o.originalDate])).toEqual([
      ['2026-02-10', '2026-02-10'],
      ['2026-02-25', '2026-03-10'],
    ]);
  });
  it_('moved from earlier into range', () => {
    const r = expandRecurring(it, [ov({ originalDate: '2026-01-10', newDate: '2026-02-03' })], '2026-02-01', '2026-02-28');
    expect(dates(r)).toEqual(['2026-02-03', '2026-02-10']);
  });
  it_('moved OUT of range is excluded', () => {
    const r = expandRecurring(it, [ov({ originalDate: '2026-02-10', newDate: '2026-03-02' })], '2026-02-01', '2026-02-28');
    expect(r).toEqual([]);
  });
  it_('ignores overrides of other items and unknown dates', () => {
    const r = expandRecurring(it, [ov({ recurringId: 'zzz', originalDate: '2026-02-10', skip: true }), ov({ originalDate: '2026-02-11', skip: true })], '2026-02-01', '2026-02-28');
    expect(dates(r)).toEqual(['2026-02-10']);
  });
  it_('result is sorted by date', () => {
    const r = expandRecurring(it, [ov({ originalDate: '2026-02-10', newDate: '2026-03-05' }), ov({ id: 'o2', originalDate: '2026-03-10', newDate: '2026-03-01' })], '2026-03-01', '2026-03-31');
    expect(dates(r)).toEqual(['2026-03-01', '2026-03-05']);
  });
});
// jest's `it` is shadowed by the item const above in one describe; alias it.
function it_(name: string, fn: () => void) {
  test(name, fn);
}

describe('occurrencesInRange', () => {
  it('sorts by date then name', () => {
    const a = item({ id: 'a', name: 'Zed', schedule: { type: 'monthly', day: 5 } });
    const b = item({ id: 'b', name: 'Alpha', schedule: { type: 'monthly', day: 5 } });
    const c = item({ id: 'c', name: 'Mid', schedule: { type: 'monthly', day: 1 } });
    const r = occurrencesInRange([a, b, c], [], '2026-01-01', '2026-01-31');
    expect(r.map((o) => o.name)).toEqual(['Mid', 'Alpha', 'Zed']);
  });
  it('empty', () => {
    expect(occurrencesInRange([], [], '2026-01-01', '2026-01-31')).toEqual([]);
  });
});

describe('monthlyEquivalent', () => {
  it('converts every schedule kind', () => {
    expect(monthlyEquivalent(item({ amount: 1200, schedule: { type: 'weekly', everyWeeks: 1 } }))).toBe(5200);
    expect(monthlyEquivalent(item({ amount: 1200, schedule: { type: 'weekly', everyWeeks: 2 } }))).toBe(2600);
    expect(monthlyEquivalent(item({ amount: 3000, schedule: { type: 'monthly', day: 1 } }))).toBe(3000);
    expect(monthlyEquivalent(item({ amount: 3000, schedule: { type: 'monthly', day: 1, everyMonths: 3 } }))).toBe(1000);
    expect(monthlyEquivalent(item({ amount: 1000, schedule: { type: 'yearly', month: 1, day: 1 } }))).toBe(83);
  });
});

describe('monthSummary', () => {
  const inp = input({
    recurring: [
      item({ id: 'sal', kind: 'income', amount: 10000, schedule: { type: 'monthly', day: 25 } }),
      item({ id: 'rent', amount: 4000, categoryId: 'home', schedule: { type: 'monthly', day: 1 } }),
    ],
    overrides: [ov({ recurringId: 'rent', originalDate: '2026-02-01', newAmount: 4500 })],
    transactions: [
      tx({ id: 'a', amount: 300, categoryId: 'food', date: '2026-01-10' }),
      tx({ id: 'b', amount: 200, date: '2026-01-12', planned: true }),
      tx({ id: 'c', amount: 700, kind: 'income', date: '2026-01-15' }),
      tx({ id: 'd', amount: 999, date: '2026-02-01' }),
    ],
  });
  it('sums a month', () => {
    const s = monthSummary('2026-01', inp);
    expect(s).toMatchObject({
      recurringIncome: 10000,
      oneTimeIncome: 700,
      totalIncome: 10700,
      recurringCosts: 4000,
      oneTimeCosts: 500,
      totalSpend: 4500,
      freeMoney: 6200,
      spentPct: 42.1,
    });
    expect(s.costsByCategory).toEqual({ home: 4000, food: 300, uncategorized: 200 });
  });
  it('uses overrides', () => {
    expect(monthSummary('2026-02', inp).recurringCosts).toBe(4500);
  });
  it('null spentPct without income, empty month is zeros', () => {
    const s = monthSummary('2026-03', input());
    expect(s.spentPct).toBeNull();
    expect(s.totalSpend).toBe(0);
    expect(s.costsByCategory).toEqual({});
    expect(monthSummary('2026-02', input({ transactions: [tx({ date: '2026-02-03' })] })).spentPct).toBeNull();
  });
});

describe('yearSummary', () => {
  const inp = input({
    recurring: [item({ id: 'sal', kind: 'income', amount: 1000, schedule: { type: 'monthly', day: 1 } })],
    transactions: [tx({ date: '2026-03-05', amount: 500, categoryId: 'x' }), tx({ id: 'q', date: '2026-07-05', amount: 700, categoryId: 'x' }), tx({ id: 'z', date: '2027-01-01', amount: 9 })],
  });
  it('totals the year', () => {
    const y = yearSummary(2026, inp);
    expect(y.months).toHaveLength(12);
    expect(y.months[0].month).toBe('2026-01');
    expect(y.totalIncome).toBe(12000);
    expect(y.totalSpend).toBe(1200);
    expect(y.freeMoney).toBe(10800);
    expect(y.cumulativeFreeMoney).toHaveLength(12);
    expect(y.cumulativeFreeMoney[0]).toBe(1000);
    expect(y.cumulativeFreeMoney[2]).toBe(2500);
    expect(y.cumulativeFreeMoney[11]).toBe(10800);
    expect(y.averageMonthlySpend).toBe(100);
    expect(y.highestSpendMonth).toBe('2026-07');
    expect(y.costsByCategory).toEqual({ x: 1200 });
  });
  it('no spend', () => {
    const y = yearSummary(2026, input());
    expect(y.highestSpendMonth).toBeNull();
    expect(y.averageMonthlySpend).toBe(0);
    expect(y.cumulativeFreeMoney.every((v) => v === 0)).toBe(true);
  });
  it('rounds the average', () => {
    const y = yearSummary(2026, input({ transactions: [tx({ date: '2026-03-05', amount: 1001 })] }));
    expect(y.averageMonthlySpend).toBe(83);
  });
});

describe('forecast', () => {
  it('empty input is flat', () => {
    const f = forecast(input({ settings: settings({ startingBalance: 5000 }) }), { today: '2026-01-01', days: 3, months: 2 });
    expect(f.asOf).toBe('2026-01-01');
    expect(f.from).toBe('2026-01-02');
    expect(f.balanceAsOf).toBe(5000);
    expect(f.days.map((d) => d.balance)).toEqual([5000, 5000, 5000]);
    expect(f.months).toHaveLength(2);
    expect(f.months[0]).toMatchObject({ month: '2026-01', startBalance: 5000, endBalance: 5000, minBalance: 5000 });
    expect(f.lowest).toEqual({ date: '2026-01-02', balance: 5000 });
    expect(f.firstBelowBuffer).toBeNull();
  });

  const base = input({
    settings: settings({ startingBalance: 1000, startingBalanceDate: '2026-01-01', buffer: 500 }),
    recurring: [
      item({ id: 'sal', kind: 'income', name: 'Salary', amount: 2000, schedule: { type: 'monthly', day: 5 } }),
      item({ id: 'rent', name: 'Rent', amount: 1800, schedule: { type: 'monthly', day: 3 } }),
    ],
    transactions: [tx({ id: 't1', date: '2026-01-04', amount: 100, planned: true }), tx({ id: 't0', date: '2026-01-01', amount: 999 })],
  });

  it('computes daily balances by hand', () => {
    const f = forecast(base, { today: '2026-01-01', days: 6, months: 2 });
    // Flows on startingBalanceDate are already in the balance (t0 ignored).
    expect(f.days.map((d) => d.balance)).toEqual([1000, 1000, -800, -900, 1100, 1100].map((_, i) => [1000, -800, -900, 1100, 1100, 1100][i]));
    expect(f.days[1].events[0]).toMatchObject({ label: 'Rent', source: 'recurring', refId: 'rent', amount: 1800, kind: 'cost' });
    expect(f.days[2].events[0]).toMatchObject({ source: 'transaction', refId: 't1' });
    expect(f.days[3]).toMatchObject({ inflow: 2000, outflow: 0 });
    expect(f.lowest).toEqual({ date: '2026-01-04', balance: -900 });
    expect(f.firstBelowBuffer).toEqual({ date: '2026-01-03', balance: -800 });
  });

  it('monthly entries', () => {
    const f = forecast(base, { today: '2026-01-01', days: 3, months: 2 });
    expect(f.months[0]).toEqual({ month: '2026-01', startBalance: 1000, income: 2000, spend: 1900, endBalance: 1100, minBalance: -900, minBalanceDate: '2026-01-04' });
    // February: Rent 1800 on the 3rd, salary 2000 on the 5th.
    expect(f.months[1]).toEqual({ month: '2026-02', startBalance: 1100, income: 2000, spend: 1800, endBalance: 1300, minBalance: -700, minBalanceDate: '2026-02-03' });
  });

  it('asOf uses today when later, adding past flows', () => {
    const f = forecast(base, { today: '2026-01-04', days: 2, months: 1 });
    expect(f.asOf).toBe('2026-01-04');
    expect(f.balanceAsOf).toBe(1000 - 1800 - 100);
    expect(f.from).toBe('2026-01-05');
    expect(f.days.map((d) => d.balance)).toEqual([1100, 1100]);
    expect(f.months[0]).toMatchObject({ startBalance: -900, income: 2000, spend: 0, endBalance: 1100 });
  });

  it('uses the starting balance date when it is after today', () => {
    const f = forecast(
      { ...base, settings: { ...base.settings, startingBalanceDate: '2026-01-10' } },
      { today: '2026-01-01', days: 2, months: 1 },
    );
    expect(f.asOf).toBe('2026-01-10');
    expect(f.balanceAsOf).toBe(1000);
    expect(f.from).toBe('2026-01-11');
  });

  it('honours overrides (skip, move)', () => {
    const f = forecast(
      { ...base, overrides: [ov({ recurringId: 'rent', originalDate: '2026-01-03', skip: true }), ov({ id: 'o2', recurringId: 'sal', originalDate: '2026-01-05', newDate: '2026-01-08' })] },
      { today: '2026-01-01', days: 8, months: 1 },
    );
    expect(f.days.map((d) => d.balance)).toEqual([1000, 1000, 900, 900, 900, 900, 2900, 2900]);
    expect(f.firstBelowBuffer).toBeNull();
  });

  it('firstBelowBuffer is strictly below', () => {
    const inp = input({ settings: settings({ startingBalance: 500, buffer: 500 }), transactions: [tx({ date: '2026-01-03', amount: 1 })] });
    const f = forecast(inp, { today: '2026-01-01', days: 3, months: 1 });
    expect(f.firstBelowBuffer).toEqual({ date: '2026-01-03', balance: 499 });
  });

  it('defaults to 60 days and 24 months', () => {
    const f = forecast(base, { today: '2026-01-01' });
    expect(f.days).toHaveLength(60);
    expect(f.months).toHaveLength(24);
    expect(f.months[23].month).toBe('2027-12');
    // Months chain: each start equals previous end.
    for (let i = 1; i < 24; i++) expect(f.months[i].startBalance).toBe(f.months[i - 1].endBalance);
  });

  it('is fast for 24 months with many items', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      item({ id: `m${i}`, name: `N${i}`, startDate: '2015-01-01', schedule: i % 2 ? { type: 'weekly', everyWeeks: 1 } : { type: 'monthly', day: (i % 28) + 1 } }),
    );
    const t = Date.now();
    const f = forecast({ ...base, recurring: many }, { today: '2026-01-01' });
    expect(Date.now() - t).toBeLessThan(500);
    expect(f.months).toHaveLength(24);
  });
});
