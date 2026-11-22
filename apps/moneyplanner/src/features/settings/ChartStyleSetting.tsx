// "Chart card" row: five round swatches for the dashboard balance card background.
import { Alert, Pressable, View } from 'react-native';

import { T } from '@/components/ui';
import { GradientFill } from '@/components/ui/internal';
import { chartStyleOf, CHART_STYLE_NAMES, ChartStyles, PlainCard, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { ChartStyle } from '@/types';

export function ChartStyleSetting({ value, onChange, testID = 'chart-style' }: { value?: ChartStyle; onChange: (v: ChartStyle) => Promise<void> | void; testID?: string }) {
  const c = useTheme();
  const dark = useColorScheme() === 'dark';
  return (
    <View style={{ gap: Spacing.two }} testID={testID}>
      <T variant="label">Chart card</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }} accessibilityRole="radiogroup">
        {CHART_STYLE_NAMES.map((name) => {
          const on = name === chartStyleOf(value);
          const def = ChartStyles[name];
          return (
            <Pressable
              key={name}
              onPress={() => {
                Promise.resolve(onChange(name)).catch((e) => Alert.alert('Could not change the chart card', e instanceof Error ? e.message : String(e)));
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              accessibilityLabel={def.label}
              testID={`chart-style-${name}`}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: on ? c.accent : 'transparent' }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  overflow: 'hidden',
                  backgroundColor: def.gradient ? undefined : PlainCard[dark ? 'dark' : 'light'].bg,
                  borderWidth: def.gradient ? 0 : 1,
                  borderColor: c.border,
                }}>
                {def.gradient && <GradientFill colors={def.gradient} />}
              </View>
            </Pressable>
          );
        })}
      </View>
      <T variant="caption" tone="secondary">
        {ChartStyles[chartStyleOf(value)].label}
      </T>
    </View>
  );
}
