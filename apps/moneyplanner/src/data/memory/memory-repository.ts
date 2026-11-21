// In-memory repository: same behaviour as SQLite. Used by tests and the web preview.
import { defaultSettings, DEFAULT_CATEGORIES } from '@/data/defaults';
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupData, type Repository } from '@/data/repository';
import type { Category, ISODate, OccurrenceOverride, RecurringItem, Settings, Transaction } from '@/types';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function byDateThenId(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function upsertById<T extends { id: string }>(list: T[], item: T): void {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
}

export function createMemoryRepository(seed?: Partial<BackupData>): Repository {
  let settings: Settings = defaultSettings();
  let categories: Category[] = clone(DEFAULT_CATEGORIES);
  let recurring: RecurringItem[] = [];
  let overrides: OccurrenceOverride[] = [];
  let transactions: Transaction[] = [];
  let initialised = false;

  function reset() {
    settings = defaultSettings();
    categories = clone(DEFAULT_CATEGORIES);
    recurring = [];
    overrides = [];
    transactions = [];
  }

  function replaceAll(d: Partial<BackupData>) {
    reset();
    if (d.settings) settings = { ...settings, ...clone(d.settings) };
    if (d.categories) categories = clone(d.categories);
    if (d.recurring) recurring = clone(d.recurring);
    if (d.overrides) overrides = clone(d.overrides);
    if (d.transactions) transactions = clone(d.transactions);
  }

  return {
    async init() {
      if (initialised) return;
      initialised = true;
      if (seed) replaceAll(seed);
    },

    async getSettings() {
      return clone(settings);
    },
    async updateSettings(patch) {
      settings = { ...settings, ...clone(patch) };
      return clone(settings);
    },

    async listCategories() {
      return clone([...categories].sort((a, b) => a.sort - b.sort || (a.id < b.id ? -1 : 1)));
    },
    async upsertCategory(category) {
      upsertById(categories, clone(category));
    },
    async removeCategory(id) {
      const used = recurring.some((r) => r.categoryId === id) || transactions.some((t) => t.categoryId === id);
      if (used) {
        categories = categories.map((c) => (c.id === id ? { ...c, archived: true } : c));
      } else {
        categories = categories.filter((c) => c.id !== id);
      }
    },

    async listRecurring() {
      return clone(recurring);
    },
    async upsertRecurring(item) {
      upsertById(recurring, clone(item));
    },
    async deleteRecurring(id) {
      recurring = recurring.filter((r) => r.id !== id);
      overrides = overrides.filter((o) => o.recurringId !== id);
    },

    async listOverrides(recurringId) {
      return clone(recurringId === undefined ? overrides : overrides.filter((o) => o.recurringId === recurringId));
    },
    async upsertOverride(o) {
      overrides = overrides.filter(
        (x) => x.id !== o.id && !(x.recurringId === o.recurringId && x.originalDate === o.originalDate),
      );
      overrides.push(clone(o));
    },
    async deleteOverride(id) {
      overrides = overrides.filter((o) => o.id !== id);
    },

    async listTransactions(range?: { from?: ISODate; to?: ISODate }) {
      const from = range?.from;
      const to = range?.to;
      return clone(
        transactions.filter((t) => (!from || t.date >= from) && (!to || t.date <= to)).sort(byDateThenId),
      );
    },
    async upsertTransaction(t) {
      upsertById(transactions, clone(t));
    },
    async deleteTransaction(id) {
      transactions = transactions.filter((t) => t.id !== id);
    },

    async exportAll() {
      return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        settings: clone(settings),
        categories: clone(categories),
        recurring: clone(recurring),
        overrides: clone(overrides),
        transactions: clone(transactions).sort(byDateThenId),
      };
    },
    async importAll(data) {
      replaceAll(data);
    },
    async deleteAll() {
      reset();
    },
  };
}
