import { Pressable, StyleSheet } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Glass, GradientFill } from './internal';
import { T } from './text';
import { type SelectOption } from './SelectField';

/** Two to four options side by side, e.g. Income / Cost. */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
  testID,
}: {
  options: SelectOption<V>[];
  value: V;
  onChange: (v: V) => void;
  label: string;
  testID?: string;
}) {
  const c = useTheme();
  return (
    <Glass radius={Radius.md} style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={o.label}
            testID={testID ? `${testID}-${o.value}` : undefined}
            style={styles.segment}>
            {active && <GradientFill colors={c.hero} />}
            <T variant="label" tone={active ? 'onHero' : 'default'} style={active ? { fontWeight: '800' } : undefined}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </Glass>
  );
}

const styles = StyleSheet.create({
  segment: { flex: 1, minHeight: 44, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two },
  segmented: { flexDirection: 'row', padding: 4, gap: 4 },
});
