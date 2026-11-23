import { StyleSheet, View } from 'react-native';

import { T, type Tone } from './text';

/** A label/value pair for summaries, e.g. "Free money" / "AED 2,300.00". */
export function Stat({ label, value, tone, testID }: { label: string; value: string; tone?: Tone; testID?: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`} testID={testID}>
      <T variant="caption" tone="secondary">
        {label}
      </T>
      <T variant="number" tone={tone}>
        {value}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  stat: { flex: 1, minWidth: 120, gap: 2 },
});
