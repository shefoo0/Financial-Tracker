import { StyleSheet, Switch, View } from 'react-native';

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
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {description ? (
          <T variant="caption" tone="secondary">
            {description}
          </T>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        testID={testID}
        trackColor={{ true: c.accent, false: c.border }}
        thumbColor={c.thumb}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 52, paddingVertical: Spacing.two },
});
