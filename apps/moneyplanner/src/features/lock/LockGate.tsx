// Covers the app with the lock screen while the open profile is locked.
// Mount it once inside <DataProvider> around the navigation (the profile
// provider re-creates it on every profile switch, so a profile opens locked).
// It re-locks after the app was in the background for more than 60 seconds.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { useData, useRepoQuery } from '@/data/DataProvider';
import { useProfiles } from '@/data/profiles/ProfileProvider';
import { useTheme } from '@/hooks/use-theme';
import { LockScreen } from './LockScreen';
import { lockStore } from './lockStore';

export const RELOCK_AFTER_MS = 60_000;

const LockContext = createContext<{ markUnlocked: () => void }>({ markUnlocked: () => undefined });

/** Lets Settings say "the user just proved who they are" after setting a PIN, so the lock doesn't appear at once. */
export const useLockSession = () => useContext(LockContext);

export function LockGate({ children }: { children: ReactNode }) {
  const c = useTheme();
  const { active } = useProfiles();
  const { repo, bump } = useData();
  const { data: settings } = useRepoQuery((r) => r.getSettings());
  const lockEnabled = settings?.lockEnabled ?? null;
  const [unlocked, setUnlocked] = useState(false);
  // Whether a PIN really exists for the profile ('unknown' until checked).
  const [pin, setPin] = useState<{ key: string; has: boolean } | null>(null);
  const pinKey = `${active.id}|${lockEnabled}`;

  useEffect(() => {
    if (lockEnabled !== true) return;
    let cancelled = false;
    lockStore.hasPin(active.id).then((has) => !cancelled && setPin({ key: pinKey, has }));
    return () => {
      cancelled = true;
    };
  }, [active.id, lockEnabled, pinKey]);

  // Re-lock after more than a minute in the background.
  useEffect(() => {
    let leftAt: number | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') leftAt = Date.now();
      else if (state === 'active') {
        if (leftAt !== null && Date.now() - leftAt > RELOCK_AFTER_MS) setUnlocked(false);
        leftAt = null;
      }
    });
    return () => sub.remove();
  }, []);

  const pinChecked = pin?.key === pinKey;
  // Lock is on in the settings but its PIN is gone (e.g. a backup restored on another phone): nothing can unlock it, so switch it off.
  const orphaned = lockEnabled === true && pinChecked && !pin?.has;
  useEffect(() => {
    if (orphaned) repo.updateSettings({ lockEnabled: false }).then(bump, () => undefined);
  }, [orphaned, repo, bump]);

  const loading = settings === undefined || (lockEnabled === true && !pinChecked);
  const locked = !loading && lockEnabled === true && !!pin?.has && !unlocked;
  const covered = loading || locked;

  return (
    <LockContext.Provider value={{ markUnlocked: () => setUnlocked(true) }}>
      <View style={{ flex: 1 }}>
        <View
          style={{ flex: 1 }}
          accessibilityElementsHidden={covered}
          importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}>
          {children}
        </View>
        {covered ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.background }]} testID={locked ? undefined : 'lock-cover'}>
            {locked ? <LockScreen profile={active} onUnlocked={() => setUnlocked(true)} /> : null}
          </View>
        ) : null}
      </View>
    </LockContext.Provider>
  );
}
