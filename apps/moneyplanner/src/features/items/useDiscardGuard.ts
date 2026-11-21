// Asks "Discard changes?" before leaving a form with unsaved edits.
import { useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

/** Returns `allowLeave`: call it right before leaving on purpose (after a save or delete). */
export function useDiscardGuard(dirty: boolean): () => void {
  const navigation = useNavigation();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const bypass = useRef(false);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (bypass.current || !dirtyRef.current) return;
        e.preventDefault();
        Alert.alert('Discard changes?', 'You have changes that are not saved.', [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation],
  );

  return () => {
    bypass.current = true;
  };
}
