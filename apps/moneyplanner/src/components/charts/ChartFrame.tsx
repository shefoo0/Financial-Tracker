import { useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import Svg, { Line, Text as SvgText } from 'react-native-svg';

import { scaleSeries, type ChartScale } from '@/features/dashboard/helpers';
import { axisDateLabels, compactAmount, niceTicks, todayIndexOf, type SeriesPoint } from './chartMath';
import { useScrub } from './useScrub';

const GUTTER = 40; // right-hand space for the y-axis labels
const XAXIS = 22; // bottom space for the date labels

/** What a chart draws its own layers with. */
export interface ChartGeometry {
  /** Scaled points (same order as `points`) and the value to y-pixel map. */
  s: ChartScale;
  width: number;
  height: number;
  plotW: number;
  plotH: number;
  /** Index and point under the cursor, and its scaled position. */
  active: { index: number; point: SeriesPoint; at: { x: number; y: number } } | null;
}

/**
 * The shared frame of a scrubbable time chart: measures its width, scales the series with room for the y labels and
 * the date labels, draws the gridlines, round y ticks, date ticks and a "Today" marker, runs the scrubbing, and
 * leaves slots for the chart's own layers: `under` (before the axis labels: areas, reference lines), `over` (after:
 * lines, dots, cursor), `overlay` (a View on top of the plot: the tooltip) and `legend` (below the plot, outside the
 * touch area).
 */
export function ChartFrame({
  points,
  domain = [],
  currency,
  accessibilityLabel,
  height = 200,
  testID,
  gridColor,
  labelColor,
  todayColor,
  onScrub,
  under,
  over,
  overlay,
  legend,
}: {
  points: SeriesPoint[];
  /** Values the y scale must include besides the points (zero, a buffer line, headroom). */
  domain?: number[];
  currency: string;
  accessibilityLabel: string;
  height?: number;
  testID?: string;
  gridColor: string;
  labelColor: string;
  todayColor: string;
  onScrub?: (p: SeriesPoint | null) => void;
  under?: (g: ChartGeometry) => ReactNode;
  over?: (g: ChartGeometry) => ReactNode;
  overlay?: (g: ChartGeometry) => ReactNode;
  legend?: ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const plotW = Math.max(1, width - GUTTER);
  const plotH = height - XAXIS;
  const scrub = useScrub({ points, plotW, currency, onScrub });
  const s = scaleSeries(
    points.map((p) => p.balance),
    plotW,
    plotH,
    domain,
  );
  const ticks = niceTicks(s.min, s.max);
  const xLabels = axisDateLabels(points);
  const todayIdx = todayIndexOf(points);
  const todayPt = todayIdx >= 0 ? s.points[todayIdx] : null;
  const g: ChartGeometry = {
    s,
    width,
    height,
    plotW,
    plotH,
    active: scrub.active !== null && s.points[scrub.active] ? { index: scrub.active, point: points[scrub.active], at: s.points[scrub.active] } : null,
  };

  return (
    <>
      <View
        {...scrub.accessibility}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
        {...scrub.responder}
        style={[{ height, width: '100%' }, Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none', cursor: 'crosshair' } as object) : null]}>
        {width > 0 && s.points.length > 0 && (
          <Svg width={width} height={height} pointerEvents="none">
            {ticks.map((t) => (
              <Line key={`g${t}`} x1={0} x2={plotW} y1={s.y(t)} y2={s.y(t)} stroke={gridColor} strokeWidth={1} />
            ))}
            {under?.(g)}
            {ticks.map((t) => (
              <SvgText key={`t${t}`} x={width - 2} y={s.y(t) + 3.5} fontSize={10.5} textAnchor="end" fill={labelColor}>
                {compactAmount(t)}
              </SvgText>
            ))}
            {xLabels.map((l) => {
              const x = s.points[l.index].x;
              const anchor = x < 18 ? 'start' : x > plotW - 18 ? 'end' : 'middle';
              return (
                <SvgText key={`x${l.index}`} x={anchor === 'start' ? 2 : anchor === 'end' ? plotW : x} y={height - 6} fontSize={10.5} textAnchor={anchor} fill={labelColor}>
                  {l.label}
                </SvgText>
              );
            })}
            {todayPt && (
              <>
                <Line x1={todayPt.x} x2={todayPt.x} y1={14} y2={plotH} stroke={labelColor} strokeWidth={1} strokeOpacity={0.7} />
                <SvgText x={todayPt.x} y={10} fontSize={10} fontWeight="700" textAnchor={todayPt.x < 22 ? 'start' : todayPt.x > plotW - 22 ? 'end' : 'middle'} fill={todayColor}>
                  Today
                </SvgText>
              </>
            )}
            {over?.(g)}
          </Svg>
        )}
        {overlay?.(g)}
      </View>
      {legend}
    </>
  );
}
