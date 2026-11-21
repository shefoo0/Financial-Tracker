// The storage contract. Owned by the lead. Implementations:
//   src/data/sqlite/sqlite-repository.ts  (on the phone)
//   src/data/memory/memory-repository.ts  (tests and the web preview)
import type { Category, ISODate, OccurrenceOverride, RecurringItem, Settings, Transaction } from '@/types';

export const BACKUP_FORMAT = 'moneyplanner-backup';
export const BACKUP_VERSION = 1;

/** Everything the user has entered. Written to and read from backup files. */
export interface BackupData {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  settings: Settings;
  categories: Category[];
  recurring: RecurringItem[];
  overrides: OccurrenceOverride[];
  transactions: Transaction[];
}

export interface Repository {
  /** Creates tables and default rows if needed. Safe to call more than once. */
  init(): Promise<void>;

  getSettings(): Promise<Settings>;
  /** Merges the patch into the stored settings and returns the result. */
  updateSettings(patch: Partial<Settings>): Promise<Settings>;

  listCategories(): Promise<Category[]>;
  upsertCategory(category: Category): Promise<void>;
  /** Archives a category in use (so old items keep their label); deletes it otherwise. */
  removeCategory(id: string): Promise<void>;

  listRecurring(): Promise<RecurringItem[]>;
  upsertRecurring(item: RecurringItem): Promise<void>;
  /** Also deletes the item's overrides. */
  deleteRecurring(id: string): Promise<void>;

  listOverrides(recurringId?: string): Promise<OccurrenceOverride[]>;
  /** One override per (recurringId, originalDate): upserting replaces it. */
  upsertOverride(override: OccurrenceOverride): Promise<void>;
  deleteOverride(id: string): Promise<void>;

  /** Inclusive date range; both ends optional. Sorted by date, then id. */
  listTransactions(range?: { from?: ISODate; to?: ISODate }): Promise<Transaction[]>;
  upsertTransaction(t: Transaction): Promise<void>;
  deleteTransaction(id: string): Promise<void>;

  exportAll(): Promise<BackupData>;
  /** Replaces ALL data with the backup, in one transaction (all or nothing). */
  importAll(data: BackupData): Promise<void>;
  /** Removes all data and restores defaults (onboarded = false). */
  deleteAll(): Promise<void>;
  /** Waits for queued writes, then closes the database. Used when switching or
   * deleting a profile. The repository must not be used afterwards. */
  close(): Promise<void>;
}
