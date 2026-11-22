import { axisDateLabels, buildSeries, kindLabel, todayIndexOf, compactAmount, describeSeries, limitLines, lowestIndex, nearestIndex, niceTicks, signed, speakPoint } from '../chartMath';
import type { ForecastDay, ForecastMonth } from '@/types';

const day = (date: string, balance: number, events: ForecastDay['events'] = []): ForecastDay => ({ date, inflow: 0, outflow: 0, balance, events });
const ev = (label: string, kind: 'income' | 'cost', amount: number) => ({ date: '2026-12-01', label, kind, amount, source: 'recurring' as const, refId: label });

describe('compactAmount', () => {
  it('shortens to k and M with a real minus sign', () => {
    expect(compactAmount(500000)).toBe('5k');
    expect(compactAmount(1250000)).toBe('12.5k');
    expect(compactAmount(-200000)).toBe('−2k');
    expect(compactAmount(0)).toBe('0');
    expect(compactAmount(45000)).toBe('450');
    expect(compactAmount(120000000)).toBe('1.2M');
  });
});

describe('niceTicks', () => {
  it('gives 3-5 round ticks inside the range', () => {
    const t = niceTicks(0, 1800000);
    expect(t.length).toBeGreaterThanOrEqual(3);
    expect(t.length).toBeLessThanOrEqual(5);
    expect(t.every((v) => v >= 0 && v <= 1800000)).toBe(true);
    expect(t[0]).toBeCloseTo(0);
  });
  it('includes zero when the range crosses it and handles tiny or empty ranges', () => {
    expect(niceTicks(-200000, 800000)).toContain(0);
    expect(niceTicks(5, 5)).toEqual([]);
    expect(niceTicks(0, 1000).length).toBeGreaterThanOrEqual(3);
  });
});

describe('nearestIndex', () => {
  it('maps x to the closest point and clamps', () => {
    expect(nearestIndex(8, 5, 108)).toBe(0);
    expect(nearestIndex(58, 5, 108)).toBe(2);
    expect(nearestIndex(-50, 5, 108)).toBe(0);
    expect(nearestIndex(900, 5, 108)).toBe(4);
    expect(nearestIndex(30, 1, 100)).toBe(0);
  });
});

describe('axisDateLabels', () => {
  const dates = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 10, 22 + i));
    return { date: d.toISOString().slice(0, 10), monthly: false };
  });
  it('labels calendar dates, at most 5', () => {
    const l = axisDateLabels(dates);
    expect(l.length).toBeGreaterThanOrEqual(3);
    expect(l.length).toBeLessThanOrEqual(5);
    expect(l.map((x) => x.label)).toEqual(['1 Dec', '15 Dec', '1 Jan', '15 Jan']);
  });
  it('labels months for long ranges', () => {
    const months = ['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'].map((date) => ({ date, monthly: true }));
    expect(axisDateLabels(months).map((x) => x.label)).toEqual(['Nov', 'Jan', 'Mar']);
  });
  it('falls back to even spacing and copes with empty', () => {
    expect(axisDateLabels([{ date: '2026-12-02', monthly: false }, { date: '2026-12-03', monthly: false }, { date: '2026-12-04', monthly: false }]).length).toBe(3);
    expect(axisDateLabels([])).toEqual([]);
  });
});

describe('series', () => {
  const days = [day('2026-12-01', 800000, [ev('Rent', 'cost', 650000), ev('Salary', 'income', 1800000)]), day('2026-12-02', 300000)];
  const months: ForecastMonth[] = [{ month: '2026-12', startBalance: 0, income: 1800000, spend: 950000, endBalance: 900000, minBalance: 0, minBalanceDate: '2026-12-02' }];
  it('builds signed lines for days and month-end points', () => {
    const d = buildSeries('1M', days, months);
    expect(d[0].lines).toEqual([{ label: 'Rent', amount: -650000 }, { label: 'Salary', amount: 1800000 }]);
    const m = buildSeries('1Y', days, months);
    expect(m[0]).toMatchObject({ monthly: true, date: '2026-12-31', balance: 900000, title: 'End of Dec 2026' });
  });
  it('speaks a point and limits lines to 3', () => {
    expect(speakPoint({ ...buildSeries('1M', days, months)[0] }, 'AED')).toBe('1 Dec, forecast: AED 8,000. Rent −6,500, Salary +18,000');
    const lines = [1, 2, 3, 4, 5].map((n) => ({ label: `x${n}`, amount: n }));
    expect(limitLines(lines)).toEqual({ shown: lines.slice(0, 3), more: 2 });
    expect(signed(-650000)).toBe('−6,500');
  });
  it('finds the lowest and describes the series', () => {
    const s = buildSeries('1M', days, months);
    expect(lowestIndex(s)).toBe(1);
    expect(describeSeries(s, 'next month', 'AED', 400000)).toMatch(/falling.*Lowest AED 3,000 on 2 Dec.*below your AED 4,000 buffer/);
    expect(describeSeries([], 'x', 'AED', 0)).toBe('No forecast data.');
  });
});

describe('two-sided series (history + forecast)', () => {
  const fdays: ForecastDay[] = Array.from({ length: 60 }, (_, i) => day(new Date(Date.UTC(2026, 10, 23 + i)).toISOString().slice(0, 10), 500000 + i));
  const fmonths: ForecastMonth[] = Array.from({ length: 12 }, (_, i) => ({
    month: `${2026 + Math.floor((10 + i) / 12)}-${String(((10 + i) % 12) + 1).padStart(2, '0')}`,
    startBalance: 0, income: 0, spend: 0, endBalance: 600000 + i, minBalance: 0, minBalanceDate: '2026-11-30',
  }));
  // 100 days of history ending 2026-11-22
  const hist = Array.from({ length: 100 }, (_, i) => ({ date: new Date(Date.UTC(2026, 10, 22 - 99 + i)).toISOString().slice(0, 10), balance: 400000 + i, events: [] }));

  it('1M: 30 actual days then 30 forecast days, joined at today', () => {
    const s = buildSeries('1M', fdays, fmonths, hist);
    expect(s).toHaveLength(60);
    expect(s.filter((p) => p.kind === 'actual')).toHaveLength(30);
    expect(s[29]).toMatchObject({ kind: 'actual', date: '2026-11-22' });
    expect(s[30]).toMatchObject({ kind: 'forecast', date: '2026-11-23' });
    expect(todayIndexOf(s)).toBe(29);
  });
  it('2M: 60 + 60; with little history shows what exists plus the full forecast', () => {
    expect(buildSeries('2M', fdays, fmonths, hist)).toHaveLength(120);
    const short = buildSeries('2M', fdays, fmonths, hist.slice(-10));
    expect(short.filter((p) => p.kind === 'actual')).toHaveLength(10);
    expect(short.filter((p) => p.kind === 'forecast')).toHaveLength(60);
  });
  it('6M uses month-end actual balances where history has them, then today, then forecast months', () => {
    const s = buildSeries('6M', fdays, fmonths, hist);
    const actual = s.filter((p) => p.kind === 'actual');
    // history starts 2026-08-15, so only the Aug, Sep and Oct month-ends exist, plus today
    expect(actual.map((p) => p.date)).toEqual(['2026-08-31', '2026-09-30', '2026-10-31', '2026-11-22']);
    expect(actual[3].title).toBe('Today');
    expect(s.filter((p) => p.kind === 'forecast')).toHaveLength(6);
    expect(s.every((p) => p.monthly)).toBe(true);
  });
  it('no history or a single day gives forecast only', () => {
    expect(buildSeries('2M', fdays, fmonths).every((p) => p.kind === 'forecast')).toBe(true);
    expect(buildSeries('2M', fdays, fmonths, hist.slice(-1))).toHaveLength(60);
    expect(todayIndexOf(buildSeries('2M', fdays, fmonths))).toBe(-1);
  });
  it('describes both parts and names the kind', () => {
    const s = buildSeries('1M', fdays, fmonths, hist);
    const text = describeSeries(s, 'next month', 'AED', 0, 'last month');
    expect(text).toMatch(/^Actual for the last month: from AED 4,000.70 on 24 Oct to AED 4,000.99 today\. Balance forecast for the next month/);
    expect(kindLabel('actual')).toBe('Actual');
    expect(speakPoint(s[0], 'AED')).toMatch(/^24 Oct, actual:/);
  });
});
