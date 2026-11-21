import { createSqliteProfileStore } from '@/data/profiles/sqlite-profile-store';
import type { ProfileStore } from '@/data/profiles/types';

/** On the phone: SQLite, one database per profile. (The web preview uses create-repository.web.ts.) */
export function createProfileStore(): ProfileStore {
  return createSqliteProfileStore();
}
