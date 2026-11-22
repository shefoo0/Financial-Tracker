// Shows the lock screen INSTEAD of the app while the open profile is locked:
// the children are not rendered at all, so no modal or sheet can show above it.
// Mount it once inside <DataProvider> around the navigation (the profile
// provider re-creates it on every profile switch, so a profile opens locked).
// It re-locks after the app was in the background for more than 60 seconds.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
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
  const router = useRouter();
  const { active } = useProfiles();
  const { repo, bump } = useData();
  const { data: settings } = useRepoQuery((r) => r.getSettings());
  const lockEnabled = settings?.lockEnabled ?? null;
  const [unlocked, setUnlocked] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  // Whether a PIN exists for the profile. A failed read counts as "has a PIN" (fail closed).
  const [pin, setPin] = useState<{ key: string; has: boolean } | null>(null);
  const pinKey = `${active.id}|${lockEnabled}`;

  useEffect(() => {
    if (lockEnabled !== true) return;
    let cancelled = false;
    lockStore.hasPin(active.id).then(
      (has) => !cancelled && setPin({ key: pinKey, has }),
      () => !cancelled && setPin({ key: pinKey, has: true }),
    );
    return () => {
      cancelled = true;
    };
  }, [active.id, lockEnabled, pinKey]);

  // Re-lock after more than a minute in the background; cover the app switcher snapshot.
  useEffect(() => {
    let leftAt: number | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') leftAt = Date.now();
      setPrivacy(state !== 'active');
      if (state === 'active') {
        if (leftAt !== null && Date.now() - leftAt > RELOCK_AFTER_MS) {
          // Close any open form (a native modal) before the app goes away.
          try {
            if (router.canDismiss()) router.dismissAll();
          } catch {
            // nothing to dismiss
          }
          setUnlocked(false);
        }
        leftAt = null;
      }
    });
    return () => sub.remove();
  }, [router]);

  const pinChecked = pin?.key === pinKey;
  // Lock is on in the settings but its PIN is really gone (e.g. a backup restored on another phone): nothing can unlock it, so switch it off.
  const orphaned = lockEnabled === true && pinChecked && pin?.has === false;
  useEffect(() => {
    if (orphaned) repo.updateSettings({ lockEnabled: false }).then(bump, () => undefined);
  }, [orphaned, repo, bump]);

  // Until the settings (and the PIN check) are known, show only a cover. Right after the user sets a PIN they are already unlocked, so the app stays.
  const loading = settings === undefined || (lockEnabled === true && !pinChecked && !unlocked);
  const locked = !loading && lockEnabled === true && pin?.has !== false && !unlocked;

  return (
    <LockContext.Provider value={{ markUnlocked: () => setUnlocked(true) }}>
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.background }]} testID="lock-cover" accessible accessibilityLabel="Opening Money Planner" />
        ) : locked ? (
          <LockScreen profile={active} onUnlocked={() => setUnlocked(true)} />
        ) : (
          children
        )}
        {privacy && !locked ? <View style={[StyleSheet.absoluteFill, { backgroundColor: c.background }]} testID="privacy-cover" pointerEvents="none" /> : null}
      </View>
    </LockContext.Provider>
  );
}
