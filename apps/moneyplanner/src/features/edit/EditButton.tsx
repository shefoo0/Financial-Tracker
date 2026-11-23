import { Pressable } from 'react-native';

import { T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';

/** A small round 44pt pencil button that opens an edit sheet ("Edit <label>" for screen readers). */
export function EditButton({ onPress, label, testID }: { onPress: () => void; label: string; testID?: string }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${label}`}
      testID={testID}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? c.backgroundSelected : c.glass,
        borderWidth: 1,
        borderColor: c.border,
      })}>
      <T tone="accent" variant="heading" maxFontSizeMultiplier={1.3}>
        ✎
      </T>
    </Pressable>
  );
}
