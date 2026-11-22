import { useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, type GestureResponderEvent, Platform, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { scaleSeries } from '@/features/dashboard/helpers';
import type { Fils } from '@/types';
import { axisDateLabels, compactAmount, limitLines, lowestIndex, nearestIndex, niceTicks, signed, speakPoint, type SeriesPoint } from './chartMath';
import { formatMoneyTrim } from '@/lib/money';

type Pt = { x: number; y: number };

/** Smooth curve through the points (horizontal tangents at each point, so it never overshoots). */
function smoothPath(points: Pt[]): string {
  if (points.length === 0) return '';
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const mx = ((a.x + b.x) / 2).toFixed(1);
    d += ` C${mx},${a.y.toFixed(1)} ${mx},${b.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }
  return d;
}

const GUTTER = 40; // right-hand space for the y-axis labels
const XAXIS = 22; // bottom space for the date labels
const THROTTLE_MS = 50;
const TOOLTIP_W = 176;

/**
 * Line chart of the balance with axes (round y ticks on the right, dates below), faint gridlines, a labelled dashed
 * buffer line, a zero line, the lowest point marked, and stock-market style scrubbing: press and drag (or tap) to see
 * a cursor and a tooltip with the date, balance and that day's items. `variant="onHero"` draws it in white for the
 * gradient hero card. Scrub state stays in here; `onScrub` is throttled and gets `null` when a drag ends.
 */
export function BalanceChart({
  points,
  buffer,
  currency,
  accessibilityLabel,
  height = 200,
  testID,
  variant = 'default',
  onScrub,
}: {
  points: SeriesPoint[];
  buffer: Fils;
  currency: string;
  accessibilityLabel: string;
  height?: number;
  testID?: string;
  variant?: 'default' | 'onHero';
  onScrub?: (p: SeriesPoint | null) => void;
}) {
  const c = useTheme();
  const gid = 'a' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const grab = useRef({ left: 0, startX: 0, moved: false, wasPinnedAt: -1 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmit = useRef(0);
  const activeRef = useRef<number | null>(null);
  const onHero = variant === 'onHero';

  const plotW = Math.max(1, width - GUTTER);
  const plotH = height - XAXIS;
  const values = points.map((p) => p.balance);
  const s = scaleSeries(values, plotW, plotH, [0, buffer]);
  const lowIdx = lowestIndex(points);
  const low = s.points[lowIdx];
  const baseY = s.y(s.min);
  const line = onHero ? '#FFFFFF' : c.glow;
  const bufferColor = onHero ? 'rgba(255,255,255,0.85)' : c.warning;
  const gridColor = onHero ? 'rgba(255,255,255,0.16)' : c.border;
  const labelColor = onHero ? 'rgba(255,255,255,0.82)' : c.textSecondary;
  const zeroColor = onHero ? 'rgba(255,255,255,0.5)' : c.textSecondary;
  const curve = smoothPath(s.points);
  const last = s.points[s.points.length - 1];
  const first = s.points[0];
  const area = last && first ? `${curve} L${last.x.toFixed(1)},${baseY.toFixed(1)} L${first.x.toFixed(1)},${baseY.toFixed(1)} Z` : '';
  const ticks = niceTicks(s.min, s.max);
  const xLabels = axisDateLabels(points);
  const crossesZero = s.min < 0 && s.max > 0;

  const emit = (p: SeriesPoint | null) => {
    if (!onScrub) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (p === null) {
      lastEmit.current = 0;
      onScrub(null);
      return;
    }
    const wait = THROTTLE_MS - (Date.now() - lastEmit.current);
    if (wait <= 0) {
      lastEmit.current = Date.now();
      onScrub(p);
    } else {
      timer.current = setTimeout(() => {
        lastEmit.current = Date.now();
        onScrub(p);
      }, wait);
    }
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const select = (i: number | null) => {
    activeRef.current = i;
    setActive(i);
    emit(i === null ? null : points[i]);
  };
  const indexAt = (e: GestureResponderEvent) => nearestIndex(e.nativeEvent.pageX - grab.current.left, points.length, plotW);
  const onGrant = (e: GestureResponderEvent) => {
    const { pageX, locationX } = e.nativeEvent;
    grab.current.left = pageX - locationX;
    grab.current.startX = pageX;
    grab.current.moved = false;
    const i = indexAt(e);
    grab.current.wasPinnedAt = pinned ? (activeRef.current ?? -1) : -1;
    select(i);
  };
  const onMove = (e: GestureResponderEvent) => {
    if (Math.abs(e.nativeEvent.pageX - grab.current.startX) > 6) grab.current.moved = true;
    select(indexAt(e));
  };
  const onEnd = () => {
    const g = grab.current;
    if (g.moved) {
      setPinned(false);
      select(null);
    } else if (g.wasPinnedAt >= 0 && Math.abs((activeRef.current ?? -99) - g.wasPinnedAt) <= 1) {
      // A second tap on the pinned point clears it.
      setPinned(false);
      select(null);
    } else {
      setPinned(true); // a tap leaves the cursor and tooltip in place
    }
  };
  const onCancel = () => {
    setPinned(false);
    select(null);
  };

  const step = (dir: 1 | -1) => {
    if (points.length === 0) return;
    const at = activeRef.current;
    const i = at === null ? (dir === 1 ? 0 : points.length - 1) : Math.min(points.length - 1, Math.max(0, at + dir));
    setPinned(true);
    select(i);
    AccessibilityInfo.announceForAccessibility?.(speakPoint(points[i], currency));
  };

  const cur = active !== null ? points[active] : null;
  const curPt = active !== null ? s.points[active] : null;
  const cursorColor = onHero ? 'rgba(255,255,255,0.9)' : c.text;
  const tipLeft = curPt ? (curPt.x > plotW / 2 ? Spacing.two : Math.max(Spacing.two, plotW - TOOLTIP_W - Spacing.two)) : 0;
  const { shown, more } = cur ? limitLines(cur.lines) : { shown: [], more: 0 };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={cur ? { text: speakPoint(cur, currency) } : undefined}
      accessibilityActions={[
        { name: 'increment', label: 'Next point' },
        { name: 'decrement', label: 'Previous point' },
      ]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      testID={testID}
      onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={onGrant}
      onResponderMove={onMove}
      onResponderRelease={onEnd}
      onResponderTerminate={onCancel}
      style={[{ height, width: '100%' }, Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none', cursor: 'crosshair' } as object) : null]}>
      {width > 0 && s.points.length > 0 && (
        <Svg width={width} height={height} pointerEvents="none">
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={line} stopOpacity={onHero ? 0.35 : 0.3} />
              <Stop offset="1" stopColor={line} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {ticks.map((t) => (
            <Line key={`g${t}`} x1={0} x2={plotW} y1={s.y(t)} y2={s.y(t)} stroke={gridColor} strokeWidth={1} />
          ))}
          <Path d={area} fill={`url(#${gid})`} />
          {crossesZero && <Line x1={0} x2={plotW} y1={s.y(0)} y2={s.y(0)} stroke={zeroColor} strokeWidth={1.25} />}
          <Line x1={0} x2={plotW} y1={s.y(buffer)} y2={s.y(buffer)} stroke={bufferColor} strokeWidth={1} strokeDasharray="6,4" />
          <SvgText x={4} y={s.y(buffer) - 4} fontSize={10} fontWeight="600" fill={bufferColor}>
            {`Buffer ${compactAmount(buffer)}`}
          </SvgText>
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
          <Path d={curve} stroke={line} strokeOpacity={0.25} strokeWidth={8} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Path d={curve} stroke={line} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {low && (
            <Circle
              cx={low.x}
              cy={low.y}
              r={5}
              fill={onHero ? '#FFFFFF' : values[lowIdx] < 0 ? c.negative : c.accent}
              stroke={onHero ? 'rgba(139,69,240,0.9)' : c.background}
              strokeWidth={2}
            />
          )}
          {curPt && (
            <>
              <Line x1={curPt.x} x2={curPt.x} y1={0} y2={plotH} stroke={cursorColor} strokeWidth={1} strokeDasharray="3,3" />
              <Circle cx={curPt.x} cy={curPt.y} r={9} fill={line} fillOpacity={0.25} />
              <Circle cx={curPt.x} cy={curPt.y} r={5} fill={onHero ? '#FFFFFF' : c.accent} stroke={onHero ? 'rgba(139,69,240,0.9)' : c.background} strokeWidth={2} />
            </>
          )}
        </Svg>
      )}
      {cur && (
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
            backgroundColor: onHero ? 'rgba(255,255,255,0.96)' : c.backgroundElement,
            borderWidth: onHero ? 0 : 1,
            borderColor: c.border,
            boxShadow: '0 6px 18px rgba(20,10,60,0.28)',
          }}>
          <T variant="caption" style={{ color: onHero ? '#4A4D68' : c.textSecondary, fontWeight: '600' }} maxFontSizeMultiplier={1.2}>
            {cur.title}
          </T>
          <T variant="label" style={{ color: onHero ? '#12142B' : c.text, fontVariant: ['tabular-nums'] }} maxFontSizeMultiplier={1.2}>
            {formatMoneyTrim(cur.balance, currency)}
          </T>
          {shown.map((l, i) => (
            <View key={`${l.label}${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two }}>
              <T variant="caption" numberOfLines={1} style={{ flex: 1, color: onHero ? '#4A4D68' : c.textSecondary }} maxFontSizeMultiplier={1.2}>
                {l.label}
              </T>
              <T variant="caption" style={{ color: l.amount < 0 ? (onHero ? '#B01E55' : c.negative) : onHero ? '#07663C' : c.positive, fontVariant: ['tabular-nums'] }} maxFontSizeMultiplier={1.2}>
                {signed(l.amount)}
              </T>
            </View>
          ))}
          {more > 0 && (
            <T variant="caption" style={{ color: onHero ? '#4A4D68' : c.textSecondary }} maxFontSizeMultiplier={1.2}>
              {`and ${more} more`}
            </T>
          )}
        </View>
      )}
    </View>
  );
}

export function ChartLegend({ bufferLabel }: { bufferLabel: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.three, flexWrap: 'wrap' }}>
      <T variant="caption" tone="secondary">
        Solid grey: zero
      </T>
      <T variant="caption" tone="warning">
        Dashed: {bufferLabel}
      </T>
    </View>
  );
}
