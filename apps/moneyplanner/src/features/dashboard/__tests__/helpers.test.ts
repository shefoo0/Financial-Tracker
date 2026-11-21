import { areaPath, barFraction, categoryBars, describeBalanceTrend, linePath, scaleSeries, shortDate } from '../helpers';

describe('dashboard helpers', () => {
  it('formats short dates', () => {
    expect(shortDate('2026-03-14')).toBe('14 Mar');
  });
  it('scales series including reference lines', () => {
    const s = scaleSeries([100, 300], 100, 50, [0], 0);
    expect(s.min).toBe(0);
    expect(s.max).toBe(300);
    expect(s.points[0]).toEqual({ x: 0, y: s.y(100) });
    expect(s.y(300)).toBe(0);
    expect(s.y(0)).toBe(50);
  });
  it('handles flat and empty data', () => {
    const flat = scaleSeries([500, 500], 100, 50, [], 0);
    expect(Number.isFinite(flat.points[0].y)).toBe(true);
    expect(scaleSeries([], 100, 50).points).toEqual([]);
    expect(scaleSeries([5], 100, 50, [], 0).points[0].x).toBe(50);
  });
  it('builds paths', () => {
    const pts = [{ x: 0, y: 1 }, { x: 10, y: 2 }];
    expect(linePath(pts)).toBe('M0.0,1.0 L10.0,2.0');
    expect(areaPath(pts, 9)).toContain('Z');
    expect(areaPath([], 9)).toBe('');
  });
  it('sorts category bars and names uncategorized', () => {
    const cats = [{ id: 'a', name: 'Rent', kind: 'cost' as const, sort: 0, archived: false }];
    const bars = categoryBars({ a: 500, uncategorized: 900, gone: 0 }, cats);
    expect(bars.map((b) => b.label)).toEqual(['Other / uncategorized', 'Rent']);
    expect(barFraction(450, 900)).toBe(0.5);
    expect(barFraction(1, 0)).toBe(0);
  });
  it('describes the trend', () => {
    const days = [
      { date: '2026-03-01', inflow: 0, outflow: 0, balance: 1000, events: [] },
      { date: '2026-03-02', inflow: 0, outflow: 0, balance: 500, events: [] },
    ];
    const text = describeBalanceTrend(days, { date: '2026-03-02', balance: 500 }, 'AED', 800);
    expect(text).toContain('falling');
    expect(text).toContain('2 Mar');
    expect(text).toContain('below');
  });
});
