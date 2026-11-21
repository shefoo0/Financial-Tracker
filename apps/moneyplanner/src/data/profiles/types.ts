// Profiles on one phone. Owned by the lead. Each profile is a separate set of
// data (its own plan, one-time items, categories and settings) in its own
// database, so profiles can never see or change each other's data. The device
// remembers the profiles, which one is open, and the appearance setting.
//
// Implementations: src/data/profiles/sqlite-profile-store.ts (on the phone) and
// src/data/profiles/memory-profile-store.ts (tests and the web preview).
import type { Repository } from '@/data/repository';

/** System follows the phone's setting; Light and Dark override it. */
export type Appearance = 'system' | 'light' | 'dark';

export const PROFILE_NAME_MAX = 24;
export const MAX_PROFILES = 6;

export interface Profile {
  id: string;
  /** 1-24 characters, trimmed. Shown on the switcher and in the greeting. */
  name: string;
  /** Index into `Palette` (src/constants/theme.ts) for the avatar. */
  color: number;
  /** ISO timestamp. Profiles are listed oldest first. */
  createdAt: string;
  /** SQLite file name of the profile's data. The first profile keeps the
   * original 'moneyplanner.db', so data from before profiles existed is kept. */
  dbName: string;
}

export interface DeviceState {
  /** Always at least one. */
  profiles: Profile[];
  activeProfileId: string;
  appearance: Appearance;
}

export interface ProfileStore {
  /** Loads the device state. On first run creates profile "Me" (dbName
   * 'moneyplanner.db', colour 0), makes it active, appearance 'system'.
   * Safe to call more than once. */
  init(): Promise<DeviceState>;
  /** Adds a profile with a new, unique dbName ('moneyplanner-<id>.db'). Throws
   * if the name is empty or longer than PROFILE_NAME_MAX after trimming, or if
   * there are already MAX_PROFILES. Does NOT make it active. */
  addProfile(name: string, color: number): Promise<Profile>;
  /** Same name rules as addProfile. */
  updateProfile(id: string, patch: { name?: string; color?: number }): Promise<Profile>;
  /** Removes the profile and deletes its database file. Throws for the last
   * remaining profile or for the active one (switch first). The repository for
   * it must already be closed. */
  deleteProfile(id: string): Promise<void>;
  setActiveProfile(id: string): Promise<void>;
  setAppearance(appearance: Appearance): Promise<void>;
  /** A new, not yet initialised repository for the profile's data. */
  openRepository(profile: Profile): Repository;
}
