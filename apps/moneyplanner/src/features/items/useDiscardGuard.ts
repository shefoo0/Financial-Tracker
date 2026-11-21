// Asks "Discard changes?" before leaving a form with unsaved edits. Built on
// expo-router's usePreventRemove, which wraps React Navigation's beforeRemove event.
import { router, usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

/**
 * Returns `leave`: call it to close the form on purpose (after a save or a
 * delete). Turning the guard off is a state update, so going back right away
 * would still be blocked (and show "Discard changes?" after a save). `leave`
 * switches the guard off first and goes back once that has taken effect.
 */
export function useDiscardGuard(dirty: boolean): () => void {
  const [leaving, setLeaving] = useState(false);
  usePreventRemove(dirty && !leaving, ({ repeat }) => {
    Alert.alert('Discard changes?', 'You have changes that are not saved.', [
      { text: 'Keep editing', style: 'cancel' },
      // `repeat` re-runs the blocked navigation (React Navigation's documented pattern).
      { text: 'Discard', style: 'destructive', onPress: repeat },
    ]);
  });
  useEffect(() => {
    if (leaving) router.back(); // runs after the guard was switched off (layout effects run first)
  }, [leaving]);
  return () => setLeaving(true);
}
