// The charts the app can show, as data: a new chart is an entry here (title, tier, ranges, overlays) plus a build
// function that turns the plan input into series. The shared frame (<ChartFrame>), scrubbing (useScrub) and range
// chips (<RangeChips>) do the rest. The Home balance chart is the first entry.
import { forecastFor, historyFor } from '@/features/plan/memo';
import type { HistoryDay } from '@/engine/history';
import type { ForecastDay, ForecastMonth, ISODate, PlanInput } from '@/types';
import { ADDED_CHARTS } from './addedCharts';
import { buildSeries, RANGES, type Range, type SeriesPoint } from './chartMath';

/** One line of a chart: its points in date order, past (actual) then future (forecast). */
export interface ChartSeries {
  id: string;
  label: string;
  points: SeriesPoint[];
}

/** Extra marks a chart can draw over its series. */
export type ChartOverlay = 'buffer' | 'zero' | 'today' | 'lowest';

export type ChartUnit = 'money' | 'percent';
/** Colour tokens a chart's series can use (resolved from the theme by the chart card). */
export type SeriesTone = 'accent' | 'positive' | 'negative' | 'warning';

export interface ChartDef<R extends string = string> {
  id: string;
  title: string;
  /** One line of what the chart shows (the Add a chart gallery). */
  description?: string;
  /** Money (default) or a percentage; percent points hold hundredths of a percent (25% is 2500). */
  unit?: ChartUnit;
  /** Lines (default) or bars side by side per point. */
  style?: 'lines' | 'bars';
  /** Colour of each series by id (default: the accent). */
  tones?: Record<string, SeriesTone>;
  /** The range a chart card starts on (default: the first). */
  defaultRange?: R;
  /** Said by the chart card when the build gives nothing to draw. */
  emptyMessage?: string;
  /** Needs the Pro upgrade. */
  pro: boolean;
  ranges: readonly { key: R; label: string; spoken: string; pastSpoken: string }[];
  overlays: readonly ChartOverlay[];
  build: (input: PlanInput, range: R, today: ISODate) => ChartSeries[];
}

/** The balance series for a range from already-computed forecast and history parts. */
export function balanceSeries(range: Range, days: ForecastDay[], months: ForecastMonth[], history: HistoryDay[] = []): ChartSeries[] {
  return [{ id: 'balance', label: 'Balance', points: buildSeries(range, days, months, history) }];
}

export const balanceChart: ChartDef<Range> = {
  id: 'balance',
  title: 'Balance',
  pro: false,
  ranges: RANGES,
  overlays: ['buffer', 'zero', 'today', 'lowest'],
  build: (input, range, today) => {
    const fc = forecastFor(input, today, 60, 12);
    return balanceSeries(range, fc.days, fc.months, historyFor(input, today, 400));
  },
};

/** Every chart, in the order they are offered. */
export const CHARTS: readonly ChartDef[] = [balanceChart as unknown as ChartDef, ...(ADDED_CHARTS as readonly ChartDef[])];

/** The charts a user can add to Home (everything but the balance chart, which is the hero card). */
export const ADDABLE_CHARTS: readonly ChartDef[] = CHARTS.filter((c) => c.id !== balanceChart.id);

export const chartById = (id: string): ChartDef | undefined => CHARTS.find((c) => c.id === id);
