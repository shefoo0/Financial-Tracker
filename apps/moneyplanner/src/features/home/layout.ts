// The Home layout: which cards exist, their default order and visibility, and the pure operations Edit Home uses.
// No React here: the settings schema imports it to validate a stored layout.
import type { HomeLayoutEntry } from '@/types';

/** The cards that are always on the list, in the default Home order (the year table and month-end list start hidden). */
export const FIXED_CARD_IDS = ['balance', 'payday', 'tiles', 'alerts', 'upcoming', 'reports', 'month', 'categories', 'endOfMonth', 'year', 'backup'] as const;
const HIDDEN_BY_DEFAULT: readonly string[] = ['endOfMonth', 'year'];

/** Card id of an added chart: `chart:` plus the chart's id in the registry (charts are not on the list until added). */
export const CHART_CARD_PREFIX = 'chart:';
export const chartCardId = (chartId: string) => `${CHART_CARD_PREFIX}${chartId}`;
/** The charts that can be added (the registry's non-balance charts; a test keeps the two in step). */
export const ADDABLE_CHART_IDS = ['income-vs-spending', 'debt-payoff', 'savings-rate'] as const;
const CHART_CARD_IDS: readonly string[] = ADDABLE_CHART_IDS.map(chartCardId);

export const isKnownCardId = (id: string) => (FIXED_CARD_IDS as readonly string[]).includes(id) || CHART_CARD_IDS.includes(id);
export const isChartCardId = (id: string) => CHART_CARD_IDS.includes(id);

export function defaultHomeLayout(): HomeLayoutEntry[] {
  return FIXED_CARD_IDS.map((id) => ({ id, visible: !HIDDEN_BY_DEFAULT.includes(id) }));
}

/**
 * A stored layout, checked: unknown ids and repeats dropped, bad entries dropped, the saved order kept. Cards that
 * are missing (added by an app update) are appended hidden, so an update never rearranges or surprises a saved
 * layout. Added charts are only there when the user added them. Not an array: undefined (the default is used).
 */
export function validateHomeLayout(v: unknown): HomeLayoutEntry[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const seen = new Set<string>();
  const out: HomeLayoutEntry[] = [];
  for (const e of v) {
    if (typeof e !== 'object' || e === null) continue;
    const { id, visible } = e as { id?: unknown; visible?: unknown };
    if (typeof id !== 'string' || typeof visible !== 'boolean' || !isKnownCardId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, visible });
  }
  for (const id of FIXED_CARD_IDS) if (!seen.has(id)) out.push({ id, visible: false });
  return out;
}

export function toggleCard(layout: HomeLayoutEntry[], id: string): HomeLayoutEntry[] {
  return layout.map((e) => (e.id === id ? { ...e, visible: !e.visible } : e));
}

/** Moves a card one place up (dir -1) or down (+1); at either end nothing changes. */
export function moveCard(layout: HomeLayoutEntry[], id: string, dir: -1 | 1): HomeLayoutEntry[] {
  const i = layout.findIndex((e) => e.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= layout.length) return layout;
  const out = [...layout];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Adds a chart at the end, shown (it is added once: adding it again changes nothing). */
export function addChartCard(layout: HomeLayoutEntry[], chartId: string): HomeLayoutEntry[] {
  const id = chartCardId(chartId);
  if (!isChartCardId(id) || layout.some((e) => e.id === id)) return layout;
  return [...layout, { id, visible: true }];
}

/** Takes an added chart off the list (it can be added again from the gallery). */
export const removeCard = (layout: HomeLayoutEntry[], id: string): HomeLayoutEntry[] => layout.filter((e) => e.id !== id || !isChartCardId(id));

/** The layout to show for a profile's settings (a stored layout is checked again; none stored: the default). */
export const homeLayoutOf = (settings: { homeLayout?: unknown }): HomeLayoutEntry[] => validateHomeLayout(settings.homeLayout) ?? defaultHomeLayout();
