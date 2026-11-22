// The storage contract. Owned by the lead. Implementations:
//   src/data/sqlite/sqlite-repository.ts  (on the phone)
//   src/data/memory/memory-repository.ts  (tests and the web preview)
import type {
  CategoryRuleRecord,
  Category,
  Cheque,
  Debt,
  DebtOverride,
  DebtPayment,
  ImportRecord,
  ImportTemplate,
  ISODate,
  OccurrenceOverride,
  RecurringItem,
  Settings,
  Transaction,
} from '@/types';

export const BACKUP_FORMAT = 'moneyplanner-backup';
/** 2 adds debts, debt payments, debt overrides and cheques. Version 1 files still restore (those lists empty). */
export const BACKUP_VERSION = 2;

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
  debts: Debt[];
  debtPayments: DebtPayment[];
  debtOverrides: DebtOverride[];
  cheques: Cheque[];
  /** Statement import (milestone 3). Optional: backups made before it restore fine (these lists stay empty). */
  imports?: ImportRecord[];
  importTemplates?: ImportTemplate[];
  categoryRules?: CategoryRuleRecord[];
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
  /** Saves many transactions in one transaction (an import saves its rows all or nothing). */
  upsertTransactions(list: Transaction[]): Promise<void>;

  /** Archived debts included; screens filter. */
  listDebts(): Promise<Debt[]>;
  upsertDebt(debt: Debt): Promise<void>;
  /** Also deletes the debt's payments and overrides, and unlinks plans that point at a deleted card. */
  deleteDebt(id: string): Promise<void>;
  /** Sorted by date, then id. */
  listDebtPayments(debtId?: string): Promise<DebtPayment[]>;
  upsertDebtPayment(payment: DebtPayment): Promise<void>;
  deleteDebtPayment(id: string): Promise<void>;
  listDebtOverrides(debtId?: string): Promise<DebtOverride[]>;
  /** One override per (debtId, originalDate): upserting replaces it. */
  upsertDebtOverride(override: DebtOverride): Promise<void>;
  deleteDebtOverride(id: string): Promise<void>;

  /** Sorted by date, then id. */
  listCheques(): Promise<Cheque[]>;
  /** Saves one or more cheques in one transaction (the series helper saves several). */
  upsertCheques(cheques: Cheque[]): Promise<void>;
  deleteCheque(id: string): Promise<void>;

  /** Finished imports, oldest first. */
  listImports(): Promise<ImportRecord[]>;
  addImport(record: ImportRecord): Promise<void>;
  getImportTemplate(sourceName: string): Promise<ImportTemplate | null>;
  /** One template per source name: saving replaces it. */
  saveImportTemplate(template: ImportTemplate): Promise<void>;
  /** Oldest first. */
  listCategoryRules(): Promise<CategoryRuleRecord[]>;
  /** One rule per pattern (case-insensitive): saving a pattern again replaces the old rule. */
  upsertCategoryRule(rule: CategoryRuleRecord): Promise<void>;
  deleteCategoryRule(id: string): Promise<void>;

  exportAll(): Promise<BackupData>;
  /** Replaces ALL data with the backup, in one transaction (all or nothing). */
  importAll(data: BackupData): Promise<void>;
  /** Removes all data and restores defaults (onboarded = false). */
  deleteAll(): Promise<void>;
  /** Waits for queued writes, then closes the database. Used when switching or
   * deleting a profile. The repository must not be used afterwards. */
  close(): Promise<void>;
}
