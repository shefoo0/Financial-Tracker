// A short confirmation with Undo that floats above the bottom of the screen for 5 seconds.
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const UNDO_MS = 5000;

export function UndoBar({ message, onUndo, onDismiss, testID = 'undo-bar' }: { message: string; onUndo: () => void; onDismiss: () => void; testID?: string }) {
  const c = useTheme();
  useEffect(() => {
    const t = setTimeout(onDismiss, UNDO_MS);
    return () => clearTimeout(t);
  }, [message, onDismiss]);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: Spacing.three, right: 92, bottom: 16 }}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={message}
        testID={testID}
        style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, backgroundColor: c.toast, borderRadius: Radius.pill, paddingLeft: Spacing.three, paddingRight: Spacing.one, minHeight: 48 }}>
        <T variant="label" numberOfLines={2} style={{ flex: 1, color: c.toastInk }}>
          {message}
        </T>
        <Pressable
          onPress={onUndo}
          accessibilityRole="button"
          accessibilityLabel="Undo"
          testID="undo-button"
          style={{ minHeight: 44, minWidth: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two }}>
          <T variant="label" style={{ color: c.toastAction, fontWeight: '800' }}>
            Undo
          </T>
        </Pressable>
      </View>
    </View>
  );
}
