// A row of recent descriptions: one tap fills description, category and last amount.
import { Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/money';

import type { Suggestion } from './suggestions';

export function RecentChips({ suggestions, currency, onPick }: { suggestions: Suggestion[]; currency: string; onPick: (s: Suggestion) => void }) {
  const c = useTheme();
  if (suggestions.length === 0) return null;
  return (
    <View accessibilityRole="toolbar" accessibilityLabel="Recent" style={styles.wrap}>
      <T variant="caption" tone="secondary">
        Recent
      </T>
      <View style={styles.row}>
        {suggestions.map((s, i) => (
          <Pressable
            key={s.text.toLowerCase()}
            onPress={() => onPick(s)}
            accessibilityRole="button"
            accessibilityLabel={`${s.text}, ${formatMoney(s.amount, currency)}. Fill from this`}
            testID={`recent-chip-${i}`}
            style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? c.backgroundSelected : c.backgroundElement, borderColor: c.border }]}>
            <T variant="label" numberOfLines={1}>
              {s.text}
            </T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { minHeight: 44, maxWidth: '100%', justifyContent: 'center', paddingHorizontal: Spacing.three, borderRadius: Radius.md, borderWidth: 1 },
});
