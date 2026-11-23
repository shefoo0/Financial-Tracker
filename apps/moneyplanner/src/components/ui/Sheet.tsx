import { type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { T } from './text';

/** Bottom sheet: dimmed backdrop (tap to close), grab handle, scrollable content. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  testID?: string;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: c.scrim }]} accessibilityViewIsModal>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View
          testID={testID}
          style={[styles.sheet, { backgroundColor: c.backgroundElement, borderColor: c.glassBorder, paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
          <View style={[styles.handle, { backgroundColor: c.textSecondary }]} />
          {title ? (
            <T variant="heading" accessibilityRole="header" style={{ marginBottom: Spacing.two }}>
              {title}
            </T>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, opacity: 0.5, marginBottom: Spacing.three },
  modalContainer: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '80%', width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, borderBottomWidth: 0, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
});
