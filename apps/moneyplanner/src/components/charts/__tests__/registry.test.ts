import { input, income, settings } from '@/engine/test-fixtures';
import { alertsFor, forecastFor } from '@/features/plan/memo';
import { balanceChart, chartById, CHARTS } from '../registry';
import { RANGES } from '../chartMath';

describe('chart registry', () => {
  it('lists the balance chart first, free, with the four ranges and its overlays', () => {
    expect(CHARTS[0]).toBe(balanceChart);
    expect(chartById('balance')).toBe(balanceChart);
    expect(chartById('nope')).toBeUndefined();
    expect(balanceChart).toMatchObject({ id: 'balance', title: 'Balance', pro: false });
    expect(balanceChart.ranges.map((r) => r.key)).toEqual(RANGES.map((r) => r.key));
    expect(balanceChart.overlays).toEqual(['buffer', 'zero', 'today', 'lowest']);
  });

  it('builds one balance series per range, forecast points from today on', () => {
    const plan = input({ settings: settings({ startingBalance: 100000, startingBalanceDate: '2026-06-01' }), recurring: [income(500000)] });
    for (const r of RANGES) {
      const series = balanceChart.build(plan, r.key, '2026-06-10');
      expect(series).toHaveLength(1);
      expect(series[0]).toMatchObject({ id: 'balance', label: 'Balance' });
      expect(series[0].points.length).toBeGreaterThan(1);
      expect(series[0].points.some((p) => p.kind === 'forecast')).toBe(true);
    }
  });

  it('shares one engine result per loaded input and day', () => {
    const plan = input();
    expect(forecastFor(plan, '2026-06-10', 60, 12)).toBe(forecastFor(plan, '2026-06-10', 60, 12));
    expect(alertsFor(plan, '2026-06-10')).toBe(alertsFor(plan, '2026-06-10'));
    expect(alertsFor(plan, '2026-06-11')).not.toBe(alertsFor(plan, '2026-06-10'));
    expect(alertsFor(input(), '2026-06-10')).not.toBe(alertsFor(plan, '2026-06-10'));
  });
});
