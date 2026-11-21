import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { today } from '@/lib/dates';

/** Today's ISO date, refreshed when the screen gains focus or the app returns to the foreground. */
export function useToday(): string {
  const [todayStr, setToday] = useState(() => today());
  useFocusEffect(
    useCallback(() => {
      setToday(today());
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setToday(today());
    });
    return () => sub.remove();
  }, []);
  return todayStr;
}
