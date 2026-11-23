import { useCallback, useEffect, useRef, useState } from 'react';

/** A brief "Saved" tick: `flash()` turns `saved` on for about a second and a half. */
export function useSavedTick() {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const flash = useCallback(() => {
    setSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1500);
  }, []);
  return { saved, flash };
}

export const SAVED_TEXT = '✓ Saved';
