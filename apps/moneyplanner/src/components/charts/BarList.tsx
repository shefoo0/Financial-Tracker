import { View } from 'react-native';

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
          <View style={{ height: 8, borderRadius: 4, backgroundColor: c.backgroundSelected }}>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: c.accent, width: `${Math.max(2, barFraction(item.value, max) * 100)}%` }} />
          </View>
        </View>
      ))}
    </View>
  );
}
