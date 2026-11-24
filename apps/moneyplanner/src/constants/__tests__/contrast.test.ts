// Accessibility (milestone 4): text and status colours meet WCAG AA contrast on the screen and card backgrounds,
// in light and dark. Normal text needs 4.5:1; the accent and status colours are used for bold labels and numbers
// (large or bold text), which need 3:1, and we hold them to 4.5:1 on cards where the app uses them for words.
import { Colors } from '../theme';

const hex = (h: string) => {
  const v = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
};
const lum = (h: string) => {
  const [r, g, b] = hex(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe.each(['light', 'dark'] as const)('%s theme contrast', (mode) => {
  const c = Colors[mode] as unknown as Record<string, string>;
  const grounds = { background: c.background, card: c.backgroundElement };
  it.each(Object.entries(grounds))('text and secondary text are AA (4.5:1) on %s', (_n, ground) => {
    expect(contrast(c.text, ground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.textSecondary, ground)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(Object.entries(grounds))('accent, positive, negative and warning are AA (4.5:1) on %s', (_n, ground) => {
    for (const k of ['accent', 'positive', 'negative', 'warning']) expect([k, contrast(c[k], ground) >= 4.5]).toEqual([k, true]);
  });
  it('text on the negative (destructive) button is AA', () => {
    expect(contrast(c.onNegative, c.negative)).toBeGreaterThanOrEqual(4.5);
  });
});
