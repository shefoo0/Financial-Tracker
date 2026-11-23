// The charts the app can show, as data: a new chart is an entry here (title, tier, ranges, overlays) plus a build
// function that turns the plan input into series. The shared frame (<ChartFrame>), scrubbing (useScrub) and range
// chips (<RangeChips>) do the rest. The Home balance chart is the first entry.
import { forecastFor, historyFor } from '@/features/plan/memo';
import type { HistoryDay } from '@/engine/history';
import type { ForecastDay, ForecastMonth, ISODate, PlanInput } from '@/types';
import { buildSeries, RANGES, type Range, type SeriesPoint } from './chartMath';

/** One line of a chart: its points in date order, past (actual) then future (forecast). */
export interface ChartSeries {
  id: string;
  label: string;
  points: SeriesPoint[];
}

/** Extra marks a chart can draw over its series. */
export type ChartOverlay = 'buffer' | 'zero' | 'today' | 'lowest';

export interface ChartDef<R extends string = string> {
  id: string;
  title: string;
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
export const CHARTS: readonly ChartDef[] = [balanceChart as unknown as ChartDef];

export const chartById = (id: string): ChartDef | undefined => CHARTS.find((c) => c.id === id);
