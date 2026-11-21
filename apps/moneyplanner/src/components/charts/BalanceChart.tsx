import { useId, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { scaleSeries } from '@/features/dashboard/helpers';
import type { Fils, ForecastDay } from '@/types';

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

/**
 * Smooth line chart of daily balances with a glow, gradient area, zero line, dashed buffer line and the
 * lowest point marked. `variant="onHero"` draws it in white for the gradient hero card.
 */
export function BalanceChart({
  days,
  buffer,
  lowestDate,
  accessibilityLabel,
  height = 160,
  testID,
  variant = 'default',
}: {
  days: ForecastDay[];
  buffer: Fils;
  lowestDate: string;
  accessibilityLabel: string;
  height?: number;
  testID?: string;
  variant?: 'default' | 'onHero';
}) {
  const c = useTheme();
  const gid = 'a' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [width, setWidth] = useState(0);
  const onHero = variant === 'onHero';
  const values = days.map((d) => d.balance);
  const s = scaleSeries(values, width, height, [0, buffer]);
  const lowIdx = Math.max(0, days.findIndex((d) => d.date === lowestDate));
  const low = s.points[lowIdx];
  const baseY = s.y(Math.min(s.min, 0));
  const line = onHero ? '#FFFFFF' : c.glow;
  const bufferColor = onHero ? 'rgba(255,255,255,0.75)' : c.warning;
  const zeroColor = onHero ? 'rgba(255,255,255,0.35)' : c.textSecondary;
  const curve = smoothPath(s.points);
  const last = s.points[s.points.length - 1];
  const first = s.points[0];
  const area = last && first ? `${curve} L${last.x.toFixed(1)},${baseY.toFixed(1)} L${first.x.toFixed(1)},${baseY.toFixed(1)} Z` : '';
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
      style={{ height, width: '100%' }}>
      {width > 0 && s.points.length > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={line} stopOpacity={onHero ? 0.35 : 0.3} />
              <Stop offset="1" stopColor={line} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill={`url(#${gid})`} />
          <Line x1={0} x2={width} y1={s.y(0)} y2={s.y(0)} stroke={zeroColor} strokeWidth={1} />
          <Line x1={0} x2={width} y1={s.y(buffer)} y2={s.y(buffer)} stroke={bufferColor} strokeWidth={1} strokeDasharray="6,4" />
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
        </Svg>
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
