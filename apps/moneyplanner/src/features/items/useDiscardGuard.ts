// Asks "Discard changes?" before leaving a form with unsaved edits. Built on
// expo-router's usePreventRemove, which wraps React Navigation's beforeRemove event.
import { usePreventRemove } from 'expo-router';
import { Alert } from 'react-native';

/** Returns `allowLeave`: call it right before leaving on purpose (after a save or delete). */
export function useDiscardGuard(dirty: boolean): () => void {
  return usePreventRemove(dirty, ({ repeat }) => {
    Alert.alert('Discard changes?', 'You have changes that are not saved.', [
      { text: 'Keep editing', style: 'cancel' },
      // `repeat` re-runs the blocked navigation (React Navigation's documented pattern).
      { text: 'Discard', style: 'destructive', onPress: repeat },
    ]);
  });
}
