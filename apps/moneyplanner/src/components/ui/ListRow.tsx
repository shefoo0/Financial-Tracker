import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { T, type Tone } from './text';

/** A tappable (or static) list row: title, optional subtitle, optional right-hand value. */
export function ListRow({
  title,
  subtitle,
  value,
  valueTone,
  onPress,
  testID,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  valueTone?: Tone;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const c = useTheme();
  const content = (
    <>
      <View style={{ flex: 1 }}>
        <T numberOfLines={2}>{title}</T>
        {subtitle ? (
          <T variant="caption" tone="secondary" numberOfLines={2}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {value ? (
        <T variant="number" tone={valueTone}>
          {value}
        </T>
      ) : null}
    </>
  );
  const label = accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ');
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.row, { borderBottomColor: c.border }, styles.rowDivider, pressed && { backgroundColor: c.backgroundSelected }]}>
      {content}
    </Pressable>
  ) : (
    <View style={[styles.row, styles.rowDivider, { borderBottomColor: c.border }]} accessible accessibilityLabel={label} testID={testID}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 52, paddingVertical: Spacing.two },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth },
});
