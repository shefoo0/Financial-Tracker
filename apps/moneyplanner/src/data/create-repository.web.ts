import { createMemoryRepository } from '@/data/memory/memory-repository';
import type { Repository } from '@/data/repository';

/**
 * The web build is only used for store screenshots and quick previews, so it
 * keeps data in memory (nothing is saved).
 */
export function createRepository(): Repository {
  return createMemoryRepository();
}
