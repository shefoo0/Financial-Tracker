// Writes the automatic daily backup of the open profile. Renders nothing.
// Mount it once inside <DataProvider>, next to <AlertScheduler />, so a
// profile switch remounts it for the new profile.
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { runAutoBackup } from '@/data/backup/auto';
import { useData } from '@/data/DataProvider';
import { useProfiles } from '@/data/profiles/ProfileProvider';

const START_DELAY_MS = 4000;
const BACKGROUND_DELAY_MS = 300;

export function AutoBackup() {
  const { repo } = useData();
  const { active } = useProfiles();
  const profileId = active.id;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Debounced: several triggers close together run one backup (and it only writes once a day anyway).
    const schedule = (delay: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void runAutoBackup(repo, profileId, new Date());
      }, delay);
    };
    schedule(START_DELAY_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' || s === 'inactive') schedule(BACKGROUND_DELAY_MS);
    });
    return () => {
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, [repo, profileId]);

  return null;
}
