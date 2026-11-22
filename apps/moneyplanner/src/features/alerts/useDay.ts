// Today's date, refreshed when the app returns to the foreground. Unlike
// dashboard/useToday it needs no navigation, so it works in the root layout.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { today } from '@/lib/dates';

export function useDay(): string {
  const [day, setDay] = useState(() => today());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setDay(today()));
    return () => sub.remove();
  }, []);
  return day;
}
