import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { barFraction, type BarItem } from '@/features/dashboard/helpers';

/** Horizontal bars with a label and amount above each; sorted by the caller. */
export function BarList({
  items,
  format,
  testID,
}: {
  items: BarItem[];
  format: (value: number) => string;
  testID?: string;
}) {
  const c = useTheme();
  const uid = 'bar' + useId().replace(/[^a-zA-Z0-9]/g, '') + '-';
  const max = items.reduce((m, i) => Math.max(m, i.value), 0);
  return (
    <View style={{ gap: Spacing.two }} testID={testID}>
      {items.map((item) => (
        <View key={item.id} accessible accessibilityLabel={`${item.label}: ${format(item.value)}`} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two }}>
            <T variant="caption" style={{ flex: 1 }}>
              {item.label}
            </T>
            <T variant="caption" style={{ fontVariant: ['tabular-nums'] }}>
              {format(item.value)}
            </T>
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: c.backgroundSelected, overflow: 'hidden' }}>
            <View style={{ height: 10, borderRadius: 5, overflow: 'hidden', width: `${Math.max(2, barFraction(item.value, max) * 100)}%` }}>
              <Svg width="100%" height="100%" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Defs>
                  <LinearGradient id={`${uid}${item.id}`.replace(/[^a-zA-Z0-9-]/g, '')} x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor={c.hero[0]} />
                    <Stop offset="1" stopColor={c.hero[2]} />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${`${uid}${item.id}`.replace(/[^a-zA-Z0-9-]/g, '')})`} />
              </Svg>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}
