// Asks "Discard changes?" before leaving a form with unsaved edits. Built on
// expo-router's usePreventRemove, which wraps React Navigation's beforeRemove event.
import { router, usePreventRemove } from 'expo-router';
import { useRef } from 'react';
import { Alert } from 'react-native';

/**
 * Returns `leave`: call it to close the form on purpose (after a save or a
 * delete). Switching the guard off with state is too late: the navigator only
 * learns about it after a re-render, so going back right away (or from an
 * effect) is still blocked — on iPhone the form simply stayed open after Save.
 * Instead `leave` marks the exit as intended and goes back; the guard sees the
 * mark and lets that navigation through with `repeat`. expo-router applies
 * the "no longer prevented" state on its next render, so a navigation can be
 * stopped once more right after; with the mark set, that just repeats again
 * instead of asking the user a second time.
 */
export function useDiscardGuard(dirty: boolean): () => void {
  const leaving = useRef(false);
  // The mark only covers this exit: if the navigation doesn't happen (nothing
  // to go back to, or it was cancelled), the guard protects edits again.
  const markLeaving = () => {
    leaving.current = true;
    setTimeout(() => {
      leaving.current = false;
    }, 1500);
  };
  usePreventRemove(dirty, ({ repeat }) => {
    if (leaving.current) {
      repeat();
      return;
    }
    Alert.alert('Discard changes?', 'You have changes that are not saved.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          markLeaving();
          repeat();
        },
      },
    ]);
  });
  return () => {
    markLeaving();
    router.back();
  };
}
