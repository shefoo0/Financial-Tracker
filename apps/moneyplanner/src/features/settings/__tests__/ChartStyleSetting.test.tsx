import { render, screen } from '@testing-library/react-native';

import { ForecastHero } from '@/components/charts/ForecastHero';
import { HeroCard } from '@/components/ui';
import { ChartStyles, CHART_STYLE_NAMES } from '@/constants/theme';
import { defaultSettings } from '@/data/defaults';
import { T } from '@/components/ui';
import type { Forecast } from '@/types';

function lum(hex: string) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

describe('chart card style', () => {
  it('defaults to plain', () => {
    expect(defaultSettings().chartStyle).toBe('plain');
  });

  it('every gradient stop has at least 4.5:1 contrast with white text', () => {
    for (const name of CHART_STYLE_NAMES) {
      for (const stop of ChartStyles[name].gradient ?? []) expect(1.05 / (lum(stop) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(CHART_STYLE_NAMES)('renders the %s card', async (name) => {
    await render(
      <HeroCard chartStyle={name} testID="card">
        <T>Hi</T>
      </HeroCard>,
    );
    expect(screen.getByTestId('card')).toBeTruthy();
    expect(screen.getByText('Hi')).toBeTruthy();
  });

  it('the hero uses dark text on plain and white on a gradient', async () => {
    const fc = { from: '2026-12-01', asOf: '2026-11-30', balanceAsOf: 100000, days: [], months: [], lowest: { date: '2026-12-02', balance: 0 }, firstBelowBuffer: null } as unknown as Forecast;
    const { rerender } = await render(<ForecastHero fc={fc} todayStr="2026-11-30" currency="AED" buffer={0} chartStyle="plain" />);
    const colour = () => (Array.isArray(screen.getByText('AED 1,000').props.style) ? Object.assign({}, ...screen.getByText('AED 1,000').props.style.flat(3)) : screen.getByText('AED 1,000').props.style).color;
    expect(colour()).not.toBe('#FFFFFF');
    await rerender(<ForecastHero fc={fc} todayStr="2026-11-30" currency="AED" buffer={0} chartStyle="ocean" />);
    expect(colour()).toBe('#FFFFFF');
  });
});
