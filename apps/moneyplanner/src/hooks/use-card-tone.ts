import { ChartStyles, chartStyleOf, type ChartLineColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export interface CardTone {
  /** True for the solid 'plain' card (normal theme colours); false for a gradient card (white ink). */
  plain: boolean;
  /** Main text colour on the card. */
  ink: string;
  /** Secondary text colour on the card. */
  sub: string;
  /** Chart line colours (actual solid, forecast dashed) for this card and scheme. */
  lines: ChartLineColors;
  /** Gradient stops, or null for the plain card. */
  gradient: readonly string[] | null;
}

/** Text, chart-line and gradient colours for a dashboard card style, in the current colour scheme. */
export function useCardTone(chartStyle: unknown = 'plain'): CardTone {
  const c = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const def = ChartStyles[chartStyleOf(chartStyle)];
  const plain = def.gradient === null;
  return {
    plain,
    ink: plain ? c.text : c.onHero.ink,
    sub: plain ? c.textSecondary : c.onHero.ink, // white on a gradient: secondary white would drop below AA on the lightest stops
    lines: def.lines[scheme],
    gradient: def.gradient,
  };
}
