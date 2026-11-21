// Profile store that keeps everything in memory: tests and the web preview.
import { createMemoryRepository } from '@/data/memory/memory-repository';
import { createProfileStoreCore, type ProfileBackend } from '@/data/memory/profile-store-core';
import type { BackupData, Repository } from '@/data/repository';
import type { DeviceState, Profile, ProfileStore } from './types';

export function createMemoryProfileStore(options?: {
  seed?: Partial<BackupData>;
}): ProfileStore & { repositoryFor(profileId: string): Repository | undefined } {
  let saved: DeviceState | null = null;
  const repos = new Map<string, Repository>();
  let seedUsed = false;

  const make = (profile: Profile): Repository => {
    // Only the first profile ever created gets the seed.
    const useSeed = !seedUsed && profile.dbName === 'moneyplanner.db';
    if (useSeed) seedUsed = true;
    const repo = createMemoryRepository(useSeed ? options?.seed : undefined);
    repos.set(profile.id, repo);
    return repo;
  };

  const backend: ProfileBackend = {
    async load() {
      return saved && { ...saved, profiles: saved.profiles.map((p) => ({ ...p })) };
    },
    async save(state) {
      saved = { ...state, profiles: state.profiles.map((p) => ({ ...p })) };
      // The first profile's repository exists as soon as the profile does, so tests can reach it.
      for (const p of state.profiles) if (!repos.has(p.id) && p.dbName === 'moneyplanner.db') make(p);
    },
    async removeData(profile) {
      repos.delete(profile.id);
    },
  };

  const core = createProfileStoreCore(backend, (profile) => repos.get(profile.id) ?? make(profile));
  return { ...core, repositoryFor: (id) => repos.get(id) };
}
