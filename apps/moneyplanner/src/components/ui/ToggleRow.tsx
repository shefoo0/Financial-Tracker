import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { T } from './text';

export function ToggleRow({
  label,
  description,
  value,
  onChange,
  testID,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  const c = useTheme();
  // The whole row is the switch (like iOS Settings): a big target, one VoiceOver/TalkBack
  // element, and a tap that always lands (taps on the small native iPhone switch
  // didn't always register in the simulator tests).
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={description}
      testID={testID}
      style={styles.row}>
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {description ? (
          <T variant="caption" tone="secondary">
            {description}
          </T>
        ) : null}
      </View>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Switch value={value} trackColor={{ true: c.accent, false: c.border }} thumbColor={c.thumb} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 52, paddingVertical: Spacing.two },
});
