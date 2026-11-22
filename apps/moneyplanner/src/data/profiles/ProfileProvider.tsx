// Opens the profile store and the active profile's data, and lets screens
// switch, add, rename and delete profiles and change the appearance. Owned by
// the lead. Everything below <ProfileProvider> sees only the active profile's
// data: <DataProvider> is keyed by the profile id, so switching remounts the
// screens with fresh data.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Appearance as RNAppearance, Platform } from 'react-native';

import { createProfileStore } from '@/data/create-repository';
import { DataProvider } from '@/data/DataProvider';
import { removeProfileBackups } from '@/data/backup/auto';
import { clearProfileLock } from '@/features/lock/lockStore';
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

const CLOSE_DELAY_MS = 1000;

type Status =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; state: DeviceState; repo: Repository };

/**
 * Owns the store, the open repository and a queue so profile changes run one
 * at a time. Created once per provider; it pushes each new status to React.
 */
class ProfileController {
  private status: Status = { kind: 'loading' };
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly store: ProfileStore,
    private readonly publish: (status: Status) => void,
  ) {}

  private set(status: Status) {
    this.status = status;
    if (!this.disposed) this.publish(status);
  }

  private run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private ready() {
    if (this.status.kind !== 'ready') throw new Error('Profiles are not loaded yet');
    return this.status;
  }

  private async refresh() {
    const state = await this.store.init();
    this.set({ ...this.ready(), state });
  }

  private async open(id: string) {
    const s = this.ready();
    if (s.state.activeProfileId === id) return;
    const profile = s.state.profiles.find((p) => p.id === id);
    if (!profile) throw new Error('That profile no longer exists');
    const repo = this.store.openRepository(profile);
    let state: DeviceState;
    try {
      await repo.init();
      await this.store.setActiveProfile(id);
      state = await this.store.init();
    } catch (e) {
      await repo.close().catch(() => undefined);
      throw e;
    }
    this.set({ kind: 'ready', state, repo });
    // The old screens unmount on React's next commit; close their database a
    // moment later so a read in flight doesn't hit "This database is closed".
    setTimeout(() => s.repo.close().catch(() => undefined), CLOSE_DELAY_MS);
  }

  /** (Re)loads everything. Also runs again after dispose() (dev Strict Mode, Fast Refresh). */
  load() {
    this.disposed = false;
    this.set({ kind: 'loading' });
    return this.run(async () => {
      let repo: Repository | null = null;
      try {
        const state = await this.store.init();
        applyNativeAppearance(state.appearance);
        const profile = state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0];
        repo = this.store.openRepository(profile);
        await repo.init();
        this.set({ kind: 'ready', state: { ...state, activeProfileId: profile.id }, repo });
      } catch (e) {
        await repo?.close().catch(() => undefined);
        this.set({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    });
  }

  dispose() {
    this.disposed = true;
    const s = this.status;
    this.status = { kind: 'loading' };
    if (s.kind === 'ready') s.repo.close().catch(() => undefined);
  }

  switchProfile = (id: string) => this.run(() => this.open(id));
  addProfile = (name: string, color: number) =>
    this.run(async () => {
      const p = await this.store.addProfile(name, color);
      await this.refresh();
      await this.open(p.id);
      return p;
    });
  updateProfile = (id: string, patch: { name?: string; color?: number }) =>
    this.run(async () => {
      await this.store.updateProfile(id, patch);
      await this.refresh();
    });
  /** Only profiles that aren't open are deleted, so their database is already closed. */
  deleteProfile = (id: string) =>
    this.run(async () => {
      await this.store.deleteProfile(id);
      // Its automatic backups and PIN live outside the database: remove them too.
      await removeProfileBackups(id);
      // Its PIN lives in the phone's secure storage, outside the database: remove it too.
      await clearProfileLock(id).catch(() => undefined);
      await this.refresh();
    });
  setAppearance = (appearance: Appearance) =>
    this.run(async () => {
      await this.store.setAppearance(appearance);
      applyNativeAppearance(appearance);
      await this.refresh();
    });
}

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
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [controller] = useState(() => new ProfileController(storeFactory(), setStatus));

  useEffect(() => {
    controller.load();
    return () => controller.dispose();
  }, [controller]);

  if (status.kind === 'error') return renderError(status.message, () => controller.load());
  if (status.kind === 'loading') return renderLoading();

  const { state } = status;
  const value: ProfilesContextValue = {
    profiles: state.profiles,
    active: state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0],
    appearance: state.appearance,
    switchProfile: controller.switchProfile,
    addProfile: controller.addProfile,
    updateProfile: controller.updateProfile,
    deleteProfile: controller.deleteProfile,
    setAppearance: controller.setAppearance,
  };
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
