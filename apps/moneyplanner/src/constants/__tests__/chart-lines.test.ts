import { chartStyleOf, CHART_STYLE_NAMES, ChartStyles, PlainCard } from '../theme';

function lum(hex: string) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('chart line colours', () => {
  it.each(CHART_STYLE_NAMES)('%s: actual and forecast are different hues and both stand out from the card (3:1)', (name) => {
    for (const scheme of ['light', 'dark'] as const) {
      const { actual, forecast } = ChartStyles[name].lines[scheme];
      expect(actual.toLowerCase()).not.toBe(forecast.toLowerCase());
      const backgrounds = ChartStyles[name].gradient ?? [PlainCard[scheme].bg];
      for (const bg of backgrounds) {
        expect(ratio(actual, bg)).toBeGreaterThanOrEqual(3);
        expect(ratio(forecast, bg)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('chartStyleOf', () => {
  it('keeps real styles and turns the removed violet (or anything unknown) into plain', () => {
    expect(chartStyleOf('ocean')).toBe('ocean');
    expect(chartStyleOf('graphite')).toBe('graphite');
    expect(chartStyleOf('violet')).toBe('plain');
    expect(chartStyleOf(undefined)).toBe('plain');
    expect(chartStyleOf(7)).toBe('plain');
    expect(CHART_STYLE_NAMES).not.toContain('violet');
  });
});
