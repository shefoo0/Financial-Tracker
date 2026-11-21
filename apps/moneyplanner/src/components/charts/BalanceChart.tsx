import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { areaPath, linePath, scaleSeries } from '@/features/dashboard/helpers';
import type { Fils, ForecastDay } from '@/types';

/** Line/area chart of daily balances with a zero line, a buffer line and the lowest point marked. */
export function BalanceChart({
  days,
  buffer,
  lowestDate,
  accessibilityLabel,
  height = 160,
  testID,
}: {
  days: ForecastDay[];
  buffer: Fils;
  lowestDate: string;
  accessibilityLabel: string;
  height?: number;
  testID?: string;
}) {
  const c = useTheme();
  const [width, setWidth] = useState(0);
  const values = days.map((d) => d.balance);
  const s = scaleSeries(values, width, height, [0, buffer]);
  const lowIdx = Math.max(0, days.findIndex((d) => d.date === lowestDate));
  const low = s.points[lowIdx];
  const baseY = s.y(Math.min(s.min, 0));
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
          <Path d={areaPath(s.points, baseY)} fill={c.accent} fillOpacity={0.12} />
          <Line x1={0} x2={width} y1={s.y(0)} y2={s.y(0)} stroke={c.textSecondary} strokeWidth={1} />
          <Line x1={0} x2={width} y1={s.y(buffer)} y2={s.y(buffer)} stroke={c.warning} strokeWidth={1} strokeDasharray="6,4" />
          <Path d={linePath(s.points)} stroke={c.accent} strokeWidth={2} fill="none" strokeLinejoin="round" />
          {low && <Circle cx={low.x} cy={low.y} r={5} fill={values[lowIdx] < 0 ? c.negative : c.accent} stroke={c.background} strokeWidth={2} />}
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
