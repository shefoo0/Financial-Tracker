// One row of the short Settings list: title, the current value, and a chevron. Opens a sheet or a screen.
import { Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function SettingsRow({ title, value, onPress, testID, hint }: { title: string; value?: string; onPress: () => void; testID: string; hint?: string }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}, ${value}` : title}
      accessibilityHint={hint}
      testID={testID}
      style={({ pressed }) => [styles.row, { borderBottomColor: c.border }, pressed && { backgroundColor: c.backgroundSelected }]}>
      <T numberOfLines={2} style={styles.title}>
        {title}
      </T>
      <View style={styles.value}>
        {value ? (
          <T tone="secondary" numberOfLines={2} style={{ textAlign: 'right' }}>
            {value}
          </T>
        ) : null}
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <T tone="secondary">›</T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 52, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flexShrink: 0, maxWidth: '55%', fontWeight: '600' },
  value: { flex: 1, alignItems: 'flex-end' },
});
