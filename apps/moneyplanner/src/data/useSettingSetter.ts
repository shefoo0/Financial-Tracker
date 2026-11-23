import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { useRepoMutation } from '@/data/DataProvider';
import type { Settings } from '@/types';

/**
 * Saving settings from a screen: `set(patch)` writes the patch, refreshes every screen, keeps `busy` true meanwhile
 * and shows a "Could not save" alert when the write fails. It resolves to true when the write worked.
 *
 *   const { set, busy } = useSettingSetter();
 *   if (await set({ buffer })) clearDraft();
 *
 * `update(patch)` is the raw write (it throws) for callers that report failures their own way.
 */
export function useSettingSetter() {
  const update = useRepoMutation((r, patch: Partial<Settings>) => r.updateSettings(patch));
  const [busy, setBusy] = useState(false);
  const set = useCallback(
    async (patch: Partial<Settings>): Promise<boolean> => {
      setBusy(true);
      try {
        await update(patch);
        return true;
      } catch (e) {
        Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [update],
  );
  return { set, update, busy };
}
