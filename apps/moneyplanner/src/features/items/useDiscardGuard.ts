// Asks "Discard changes?" before leaving a form with unsaved edits. Built on
// expo-router's usePreventRemove.
import { router, usePreventRemove } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export interface DiscardGuard {
  /** Call just before saving or deleting: switches the guard off while the write runs. */
  begin(): void;
  /** Call when the save or delete failed: the guard protects the edits again. */
  cancel(): void;
  /** Call after a successful save or delete: closes the form. */
  leave(): Promise<void>;
}

/**
 * Turning the guard off is a state change that expo-router's navigator only
 * applies on a later render, and on iPhone a modal that was still protected
 * simply stayed open after Save. So the guard is switched off when the save
 * STARTS (begin), the write runs meanwhile, and leave() waits two more frames
 * before going back, by which time the navigator no longer blocks it. If the
 * guard is still called for an exit we started, it stays quiet.
 */
export function useDiscardGuard(dirty: boolean): DiscardGuard {
  const [closing, setClosing] = useState(false);
  const leaving = useRef(false);
  // The mark only covers this exit: if the navigation doesn't happen (nothing
  // to go back to, or it was cancelled), the guard protects edits again.
  const markLeaving = () => {
    leaving.current = true;
    setTimeout(() => {
      leaving.current = false;
    }, 1500);
  };
  usePreventRemove(dirty && !closing, ({ repeat }) => {
    // Already leaving on purpose (Save, Delete, Discard): never ask, and never
    // repeat the navigation — on Android that went back twice and closed the app.
    if (leaving.current) return;
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
  return {
    begin: () => setClosing(true),
    cancel: () => setClosing(false),
    leave: async () => {
      markLeaving();
      await nextFrame();
      await nextFrame();
      router.back();
    },
  };
}
