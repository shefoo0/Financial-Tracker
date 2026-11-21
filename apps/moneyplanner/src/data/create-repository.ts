import type { Repository } from '@/data/repository';
import { createSqliteRepository } from '@/data/sqlite/sqlite-repository';

/** On the phone: SQLite. (The web preview uses create-repository.web.ts.) */
export function createRepository(): Repository {
  return createSqliteRepository();
}
