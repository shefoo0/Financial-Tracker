// Opens the profile store and the active profile's data, and lets screens
// switch, add, rename and delete profiles and change the appearance. Owned by
// the lead. Everything below <ProfileProvider> sees only the active profile's
// data: <DataProvider> is keyed by the profile id, so switching remounts the
// screens with fresh data.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Appearance as RNAppearance, Platform } from 'react-native';

import { createProfileStore } from '@/data/create-repository';
import { DataProvider } from '@/data/DataProvider';
import type { Repository } from '@/data/repository';
import type { Appearance, DeviceState, Profile, ProfileStore } from './types';

interface ProfilesContextValue {
  profiles: Profile[];
  active: Profile;
  appearance: Appearance;
  /** Opens another profile's data. Resolves once its screens show. */
  switchProfile(id: string): Promise<void>;
  /** Adds a profile and switches to it (it starts with the setup wizard). */
  addProfile(name: string, color: number): Promise<Profile>;
  updateProfile(id: string, patch: { name?: string; color?: number }): Promise<void>;
  /** Deletes a profile that is not the active one, with all its data. */
  deleteProfile(id: string): Promise<void>;
  setAppearance(appearance: Appearance): Promise<void>;
}

const ProfilesContext = createContext<ProfilesContextValue | null>(null);
/** The appearance setting, readable before the profiles have loaded ('system'). */
export const AppearanceContext = createContext<Appearance>('system');

export function useProfiles(): ProfilesContextValue {
  const ctx = useContext(ProfilesContext);
  if (!ctx) throw new Error('useProfiles must be used inside <ProfileProvider>');
  return ctx;
}

/** Makes native parts (date pickers, alerts, tab bar, keyboard) follow the setting too. */
function applyNativeAppearance(appearance: Appearance) {
  if (Platform.OS === 'web') return;
  const set = (RNAppearance as { setColorScheme?: (s: 'light' | 'dark' | 'unspecified' | null) => void }).setColorScheme;
  set?.(appearance === 'system' ? 'unspecified' : appearance);
}

type Status =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; state: DeviceState; repo: Repository };

export function ProfileProvider({
  children,
  renderError,
  renderLoading,
  storeFactory = createProfileStore,
}: {
  children: ReactNode;
  renderError: (message: string, retry: () => void) => ReactNode;
  renderLoading: () => ReactNode;
  /** Tests pass a memory store. */
  storeFactory?: () => ProfileStore;
}) {
  const [store] = useState(storeFactory);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Profile changes run one at a time.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const state = await store.init();
        applyNativeAppearance(state.appearance);
        const profile = state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0];
        const repo = store.openRepository(profile);
        await repo.init();
        if (!cancelled) setStatus({ kind: 'ready', state: { ...state, activeProfileId: profile.id }, repo });
        else await repo.close();
      } catch (e) {
        if (!cancelled) setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, attempt]);

  const run = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(task);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  const ready = () => {
    const s = statusRef.current;
    if (s.kind !== 'ready') throw new Error('Profiles are not loaded yet');
    return s;
  };

  const openProfile = useCallback(
    async (id: string) => {
      const s = ready();
      if (s.state.activeProfileId === id) return;
      const profile = s.state.profiles.find((p) => p.id === id);
      if (!profile) throw new Error('That profile no longer exists');
      const repo = store.openRepository(profile);
      await repo.init();
      await store.setActiveProfile(id);
      const state = await store.init();
      const old = s.repo;
      setStatus({ kind: 'ready', state, repo });
      await old.close().catch(() => undefined);
    },
    [store],
  );

  const value = useMemo<ProfilesContextValue | null>(() => {
    if (status.kind !== 'ready') return null;
    const { state } = status;
    const refresh = async () => {
      const next = await store.init();
      setStatus((cur) => (cur.kind === 'ready' ? { ...cur, state: next } : cur));
    };
    return {
      profiles: state.profiles,
      active: state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0],
      appearance: state.appearance,
      switchProfile: (id) => run(() => openProfile(id)),
      addProfile: (name, color) =>
        run(async () => {
          const p = await store.addProfile(name, color);
          await refresh();
          await openProfile(p.id);
          return p;
        }),
      updateProfile: (id, patch) =>
        run(async () => {
          await store.updateProfile(id, patch);
          await refresh();
        }),
      deleteProfile: (id) =>
        run(async () => {
          await store.deleteProfile(id);
          await refresh();
        }),
      setAppearance: (appearance) =>
        run(async () => {
          await store.setAppearance(appearance);
          applyNativeAppearance(appearance);
          await refresh();
        }),
    };
  }, [status, store, run, openProfile]);

  if (status.kind === 'error') {
    return renderError(status.message, () => {
      setStatus({ kind: 'loading' });
      setAttempt((a) => a + 1);
    });
  }
  if (status.kind === 'loading' || !value) return renderLoading();
  return (
    <AppearanceContext.Provider value={value.appearance}>
      <ProfilesContext.Provider value={value}>
        <DataProvider key={value.active.id} repo={status.repo}>
          {children}
        </DataProvider>
      </ProfilesContext.Provider>
    </AppearanceContext.Provider>
  );
}
