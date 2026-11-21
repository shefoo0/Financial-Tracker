import { createMemoryProfileStore } from '@/data/profiles/memory-profile-store';
import type { ProfileStore } from '@/data/profiles/types';

/**
 * The web build is only used for store screenshots and quick previews, so it
 * keeps data in memory (nothing is saved).
 */
export function createProfileStore(): ProfileStore {
  return createMemoryProfileStore();
}
