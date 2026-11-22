import { axisDateLabels, buildSeries, compactAmount, describeSeries, limitLines, lowestIndex, nearestIndex, niceTicks, signed, speakPoint } from '../chartMath';
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
    expect(speakPoint({ ...buildSeries('1M', days, months)[0] }, 'AED')).toBe('1 Dec: AED 8,000. Rent −6,500, Salary +18,000');
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
