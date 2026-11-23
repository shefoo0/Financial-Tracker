import { InputAccessoryView, Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { T } from './text';

/** The "Done" bar above an iPhone number pad (which has no Return key). */
export function DoneBar({ nativeID }: { nativeID: string }) {
  const c = useTheme();
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View style={[styles.doneBar, { backgroundColor: c.backgroundElement, borderTopColor: c.border }]}>
        <Pressable onPress={() => Keyboard.dismiss()} accessibilityRole="button" accessibilityLabel="Done" testID="keyboard-done" style={styles.doneButton}>
          <T variant="label" tone="accent">
            Done
          </T>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

/** @deprecated Numeric fields now render their own Done bar; kept so old imports still work. */
export function KeyboardDoneBar() {
  return null;
}

const styles = StyleSheet.create({
  doneBar: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.two },
  doneButton: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
});
