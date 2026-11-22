import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { ForecastHero } from '../ForecastHero';
import type { Forecast, ForecastDay, ForecastMonth } from '@/types';
import type { HistoryDay } from '@/engine/history';

const days: ForecastDay[] = Array.from({ length: 60 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 11, 1 + i)).toISOString().slice(0, 10);
  const rent = i === 11;
  return {
    date,
    inflow: 0,
    outflow: 0,
    balance: 1000000 - i * 5000 - (i > 11 ? 650000 : 0),
    events: rent ? [{ date, label: 'Rent', kind: 'cost' as const, amount: 650000, source: 'recurring' as const, refId: 'r' }] : [],
  };
});
const months: ForecastMonth[] = Array.from({ length: 12 }, (_, i) => ({
  month: `${2026 + Math.floor((11 + i) / 12)}-${String(((11 + i) % 12) + 1).padStart(2, '0')}`,
  startBalance: 0,
  income: 1800000,
  spend: 1500000,
  endBalance: 1000000 + i * 300000,
  minBalance: 0,
  minBalanceDate: '2026-12-02',
}));
const fc = { from: '2026-12-01', asOf: '2026-11-30', balanceAsOf: 1000000, days, months, lowest: { date: '2026-12-02', balance: 990000 }, firstBelowBuffer: null } as unknown as Forecast;

// 40 recorded days up to 30 Nov (a rent payment on 20 Nov).
const history: HistoryDay[] = Array.from({ length: 40 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 10, 30 - 39 + i)).toISOString().slice(0, 10);
  const rent = date === '2026-11-20';
  return { date, balance: 1000000 + (39 - i) * 2000, events: rent ? [{ date, label: 'Rent', kind: 'cost' as const, amount: 650000, source: 'recurring' as const, refId: 'r' }] : [] };
});

async function setup(h?: HistoryDay[], chartStyle?: 'plain' | 'ocean') {
  await render(<ForecastHero fc={fc} todayStr="2026-11-30" currency="AED" buffer={200000} history={h} chartStyle={chartStyle} />);
  await act(async () => {
    await fireEvent(screen.getByTestId('dashboard-balance-chart'), 'layout', { nativeEvent: { layout: { width: 340, height: 200 } } });
  });
  return screen.getByTestId('dashboard-balance-chart');
}
const touch = (x: number) => ({ nativeEvent: { pageX: x + 20, locationX: x } });

describe('ForecastHero chart', () => {
  it('shows the balance today and no tooltip until touched', async () => {
    await setup();
    expect(screen.getByText('BALANCE TODAY')).toBeTruthy();
    expect(screen.queryByTestId('dashboard-balance-chart-tooltip')).toBeNull();
  });

  it('scrubs: tooltip with date, balance and events, big number follows, and returns on release', async () => {
    jest.useFakeTimers();
    const chart = await setup();
    // Plot width 300 (340 - 40 gutter), padding 8: point 11 of 60 is at x = 8 + 11/59 * 284.
    await act(async () => {
      await fireEvent(chart, 'responderGrant', touch(8 + (11 / 59) * 284));
    });
    const tip = screen.getByTestId('dashboard-balance-chart-tooltip');
    expect(tip).toHaveTextContent(/12 Dec/);
    expect(tip).toHaveTextContent(/Rent/);
    expect(tip).toHaveTextContent(/−6,500/);
    expect(screen.getByText('12 DEC')).toBeTruthy();
    await act(async () => {
      await fireEvent(chart, 'responderMove', touch(8 + (30 / 59) * 284));
      jest.advanceTimersByTime(100);
    });
    expect(screen.getByTestId('dashboard-balance-chart-tooltip')).toHaveTextContent(/31 Dec/);
    await act(async () => {
      await fireEvent(chart, 'responderRelease', touch(100));
      jest.advanceTimersByTime(100);
    });
    expect(screen.queryByTestId('dashboard-balance-chart-tooltip')).toBeNull();
    expect(screen.getByText('BALANCE TODAY')).toBeTruthy();
    jest.useRealTimers();
  });

  it('a tap pins the tooltip and a second tap clears it', async () => {
    const chart = await setup();
    await act(async () => {
      await fireEvent(chart, 'responderGrant', touch(150));
      await fireEvent(chart, 'responderRelease', touch(150));
    });
    expect(screen.getByTestId('dashboard-balance-chart-tooltip')).toBeTruthy();
    await act(async () => {
      await fireEvent(chart, 'responderGrant', touch(150));
      await fireEvent(chart, 'responderRelease', touch(150));
    });
    expect(screen.queryByTestId('dashboard-balance-chart-tooltip')).toBeNull();
  });

  it('switches range: 1Y shows month-end points', async () => {
    const chart = await setup();
    await fireEvent.press(screen.getByTestId('dashboard-balance-chart-range-1Y'));
    const again = screen.getByTestId('dashboard-balance-chart');
    expect(again.props.accessibilityLabel).toMatch(/next year/);
    await act(async () => {
      await fireEvent(again, 'responderGrant', touch(8));
    });
    expect(screen.getByTestId('dashboard-balance-chart-tooltip')).toHaveTextContent(/End of Dec 2026/);
    expect(screen.getByTestId('dashboard-balance-chart-range-1Y').props.accessibilityState.selected).toBe(true);
    expect(chart).toBeTruthy();
  });

  it('has increment and decrement accessibility actions that announce the point', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const chart = await setup();
    expect(chart.props.accessibilityRole).toBe('adjustable');
    expect(chart.props.accessibilityLabel).toMatch(/Balance forecast for the next 2 months/);
    await act(async () => {
      await fireEvent(chart, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    });
    expect(spy).toHaveBeenLastCalledWith('1 Dec, forecast: AED 10,000.');
    await act(async () => {
      for (let i = 0; i < 11; i++) await fireEvent(screen.getByTestId('dashboard-balance-chart'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    });
    expect(spy).toHaveBeenLastCalledWith('12 Dec, forecast: AED 9,450. Rent −6,500');
    await act(async () => {
      await fireEvent(screen.getByTestId('dashboard-balance-chart'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    });
    expect(spy).toHaveBeenLastCalledWith(expect.stringMatching(/^11 Dec, forecast: AED 9,500/));
    spy.mockRestore();
  });

  it('has no lowest or range-text pills', async () => {
    await setup();
    expect(screen.queryByText(/^Lowest/)).toBeNull();
    expect(screen.queryByText(/^next 2 months$/)).toBeNull();
  });

  it('without history: no legend, only forecast points', async () => {
    await setup();
    expect(screen.queryByTestId('dashboard-balance-chart-legend')).toBeNull();
    expect(screen.getByTestId('dashboard-balance-chart').props.accessibilityLabel).not.toMatch(/Actual/);
  });

  it('with history: legend shows Actual and Forecast, tooltips say which, summary mentions both', async () => {
    const chart = await setup(history);
    const legend = screen.getByTestId('dashboard-balance-chart-legend');
    expect(legend).toHaveTextContent(/Actual/);
    expect(legend).toHaveTextContent(/Forecast/);
    expect(chart.props.accessibilityLabel).toMatch(/Actual for the last 2 months.*Balance forecast for the next 2 months/);
    // 2M: 40 actual points (history is shorter than 60) then 60 forecast ones. Plot width 300, padding 8, 100 points.
    const x = (i: number) => 8 + (i / 99) * 284;
    await act(async () => {
      await fireEvent(chart, 'responderGrant', touch(x(5)));
    });
    expect(screen.getByTestId('dashboard-balance-chart-tooltip')).toHaveTextContent(/Actual/);
    await act(async () => {
      await fireEvent(chart, 'responderRelease', touch(x(5)));
      await fireEvent(chart, 'responderGrant', touch(x(70)));
    });
    expect(screen.getByTestId('dashboard-balance-chart-tooltip')).toHaveTextContent(/Forecast/);
  });

  it('works on a gradient card and switches ranges with history (1Y: month-ends)', async () => {
    await setup(history, 'ocean');
    expect(screen.getByTestId('dashboard-balance-chart-legend')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('dashboard-balance-chart-range-1Y'));
    expect(screen.getByTestId('dashboard-balance-chart').props.accessibilityLabel).toMatch(/Actual for the last year/);
  });
});
