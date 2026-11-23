import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { T } from '@/components/ui';
import { ChartStyles, Radius, Spacing, type ChartLineColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Fils } from '@/types';
import { ChartFrame } from './ChartFrame';
import { compactAmount, headroom, kindLabel, limitLines, lowestIndex, signed, smoothPath, todayIndexOf, type SeriesPoint } from './chartMath';
import { formatMoneyTrim } from '@/lib/money';

const TOOLTIP_W = 176;

/**
 * Line chart of the balance with axes (round y ticks on the right, dates below), faint gridlines, a labelled dashed
 * buffer line, a zero line, the lowest point marked, and stock-market style scrubbing: press and drag (or tap) to see
 * a cursor and a tooltip with the date, balance and that day's items. `variant="onHero"` draws it in white for the
 * gradient hero card. The frame (measuring, axes, scrubbing) is <ChartFrame>; this component adds the balance layers.
 * `onScrub` is throttled and gets `null` when a drag ends.
 */
export function BalanceChart({
  points,
  buffer,
  currency,
  accessibilityLabel,
  height = 200,
  testID,
  variant = 'default',
  lineColors,
  onScrub,
}: {
  points: SeriesPoint[];
  buffer: Fils;
  currency: string;
  accessibilityLabel: string;
  height?: number;
  testID?: string;
  variant?: 'default' | 'onHero';
  /** Colours of the actual (solid) and forecast (dashed) lines; defaults to the plain card's colours. */
  lineColors?: ChartLineColors;
  onScrub?: (p: SeriesPoint | null) => void;
}) {
  const c = useTheme();
  const gid = 'a' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const onHero = variant === 'onHero';

  const values = points.map((p) => p.balance);
  const todayIdx = todayIndexOf(points);
  const hasActual = todayIdx >= 0;
  const aheadFrom = todayIdx + 1; // first forecast point
  // The lowest point is a forecast one (the hero's "lowest" always refers to the forecast).
  const lowIdx = aheadFrom + lowestIndex(points.slice(aheadFrom));
  const colors = lineColors ?? (onHero ? ChartStyles.ocean.lines.light : ChartStyles.plain.lines.light);
  const line = colors.actual;
  const fcLine = colors.forecast;
  const bufferColor = onHero ? c.onHero.buffer : c.warning;
  const gridColor = onHero ? c.onHero.grid : c.border;
  const labelColor = onHero ? c.onHero.label : c.textSecondary;
  const zeroColor = onHero ? c.onHero.zero : c.textSecondary;
  const outline = onHero ? c.onHero.dot : c.background;
  const cursorColor = onHero ? c.onHero.cursor : c.text;
  const tipSub = onHero ? c.onHero.tipSub : c.textSecondary;

  return (
    <ChartFrame
      points={points}
      // Headroom: scale up to the next round tick above the highest balance, so the
      // line never runs into the top edge (a 33k peak was drawn above the 30k label).
      domain={[0, buffer, ...headroom(values, buffer)]}
      currency={currency}
      accessibilityLabel={accessibilityLabel}
      height={height}
      testID={testID}
      gridColor={gridColor}
      labelColor={labelColor}
      todayColor={onHero ? c.onHero.ink : c.text}
      onScrub={onScrub}
      under={({ s, plotW }) => {
        const baseY = s.y(s.min);
        const closed = (pts: { x: number; y: number }[], curve: string) =>
          pts.length > 1 ? `${curve} L${pts[pts.length - 1].x.toFixed(1)},${baseY.toFixed(1)} L${pts[0].x.toFixed(1)},${baseY.toFixed(1)} Z` : '';
        // Actual part: first point to today. Forecast part: today (so the two lines meet) to the end.
        const actualPts = hasActual ? s.points.slice(0, todayIdx + 1) : [];
        const aheadPts = s.points.slice(Math.max(todayIdx, 0));
        const actualArea = closed(actualPts, smoothPath(actualPts));
        const aheadArea = closed(aheadPts, smoothPath(aheadPts));
        return (
          <>
            <Defs>
              <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={line} stopOpacity={onHero ? 0.34 : 0.28} />
                <Stop offset="1" stopColor={line} stopOpacity={0} />
              </LinearGradient>
              <LinearGradient id={`${gid}f`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={fcLine} stopOpacity={onHero ? 0.2 : 0.16} />
                <Stop offset="1" stopColor={fcLine} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {actualArea !== '' && <Path d={actualArea} fill={`url(#${gid})`} />}
            {aheadArea !== '' && <Path d={aheadArea} fill={`url(#${gid}f)`} />}
            {s.min < 0 && s.max > 0 && <Line x1={0} x2={plotW} y1={s.y(0)} y2={s.y(0)} stroke={zeroColor} strokeWidth={1.25} />}
            <Line x1={0} x2={plotW} y1={s.y(buffer)} y2={s.y(buffer)} stroke={bufferColor} strokeWidth={1} strokeDasharray="6,4" />
            <SvgText x={4} y={s.y(buffer) - 4} fontSize={10} fontWeight="600" fill={bufferColor}>
              {`Buffer ${compactAmount(buffer)}`}
            </SvgText>
          </>
        );
      }}
      over={({ s, plotH, active }) => {
        const actualPts = hasActual ? s.points.slice(0, todayIdx + 1) : [];
        const aheadPts = s.points.slice(Math.max(todayIdx, 0));
        const actualCurve = smoothPath(actualPts);
        const aheadCurve = smoothPath(aheadPts);
        const low = s.points[lowIdx];
        const curColor = active?.point.kind === 'actual' ? line : fcLine;
        return (
          <>
            {actualPts.length > 1 && (
              <>
                <Path d={actualCurve} stroke={line} strokeOpacity={0.25} strokeWidth={8} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                <Path d={actualCurve} stroke={line} strokeWidth={2.75} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              </>
            )}
            {aheadPts.length > 1 && <Path d={aheadCurve} stroke={fcLine} strokeWidth={2.75} strokeDasharray="7,5" fill="none" strokeLinejoin="round" />}
            {low && lowIdx < s.points.length && <Circle cx={low.x} cy={low.y} r={5} fill={values[lowIdx] < 0 && !onHero ? c.negative : fcLine} stroke={outline} strokeWidth={2} />}
            {active && (
              <>
                <Line x1={active.at.x} x2={active.at.x} y1={0} y2={plotH} stroke={cursorColor} strokeWidth={1} strokeDasharray="3,3" />
                <Circle cx={active.at.x} cy={active.at.y} r={9} fill={curColor} fillOpacity={0.25} />
                <Circle cx={active.at.x} cy={active.at.y} r={5} fill={curColor} stroke={outline} strokeWidth={2} />
              </>
            )}
          </>
        );
      }}
      overlay={({ plotW, active }) => {
        if (!active) return null;
        const cur = active.point;
        const tipLeft = active.at.x > plotW / 2 ? Spacing.two : Math.max(Spacing.two, plotW - TOOLTIP_W - Spacing.two);
        const { shown, more } = limitLines(cur.lines);
        return (
          <View
            pointerEvents="none"
            testID={testID ? `${testID}-tooltip` : undefined}
            style={{
              position: 'absolute',
              top: 2,
              left: tipLeft,
              width: TOOLTIP_W,
              borderRadius: Radius.sm,
              paddingHorizontal: Spacing.two,
              paddingVertical: Spacing.one + 2,
              backgroundColor: onHero ? c.onHero.tipBg : c.backgroundElement,
              borderWidth: onHero ? 0 : 1,
              borderColor: c.border,
              boxShadow: c.tooltipShadow,
            }}>
            <T variant="caption" style={{ color: tipSub, fontWeight: '600' }} maxFontSizeMultiplier={1.2}>
              {`${cur.title} · ${kindLabel(cur.kind)}`}
            </T>
            <T variant="label" style={{ color: onHero ? c.onHero.tipInk : c.text, fontVariant: ['tabular-nums'] }} maxFontSizeMultiplier={1.2}>
              {formatMoneyTrim(cur.balance, currency)}
            </T>
            {shown.map((l, i) => (
              <View key={`${l.label}${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two }}>
                <T variant="caption" numberOfLines={1} style={{ flex: 1, color: tipSub }} maxFontSizeMultiplier={1.2}>
                  {l.label}
                </T>
                <T variant="caption" style={{ color: l.amount < 0 ? (onHero ? c.onHero.negative : c.negative) : onHero ? c.onHero.positive : c.positive, fontVariant: ['tabular-nums'] }} maxFontSizeMultiplier={1.2}>
                  {signed(l.amount)}
                </T>
              </View>
            ))}
            {more > 0 && (
              <T variant="caption" style={{ color: tipSub }} maxFontSizeMultiplier={1.2}>
                {`and ${more} more`}
              </T>
            )}
          </View>
        );
      }}
    />
  );
}

/** Key under the chart: a solid swatch in the actual colour and a dashed one in the forecast colour. */
export function ChartLegend({ colors, onHero = false, testID }: { colors: ChartLineColors; onHero?: boolean; testID?: string }) {
  const c = useTheme();
  const ink = onHero ? c.onHero.ink : c.text;
  const item = (label: string, color: string, dashed: boolean) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 }}>
      <Svg width={28} height={6} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Line x1={0} x2={28} y1={3} y2={3} stroke={color} strokeWidth={3} strokeDasharray={dashed ? '6,4' : undefined} />
      </Svg>
      <T variant="caption" maxFontSizeMultiplier={1.4} style={{ color: ink, fontWeight: '600' }}>
        {label}
      </T>
    </View>
  );
  return (
    <View
      accessible
      accessibilityLabel="Key: solid line is the actual balance, dashed line is the forecast"
      testID={testID}
      style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.four, flexWrap: 'wrap' }}>
      {item('Actual', colors.actual, false)}
      {item('Forecast', colors.forecast, true)}
    </View>
  );
}
