import * as SQLite from 'expo-sqlite';

import { defaultSettings, DEFAULT_CATEGORIES } from '@/data/defaults';
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupData, type Repository } from '@/data/repository';
import type { Category, OccurrenceOverride, RecurringItem, Settings, Transaction } from '@/types';
import { DB_NAME, migrate } from './schema';

/** The part of a database/transaction connection used for writes. */
type Writer = Pick<SQLite.SQLiteDatabase, 'runAsync'>;

type Row = Record<string, any>;

const bool = (v: boolean) => (v ? 1 : 0);

const toCategory = (r: Row): Category => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  sort: r.sort,
  archived: r.archived === 1,
});

const toRecurring = (r: Row): RecurringItem => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  categoryId: r.category_id ?? null,
  amount: r.amount,
  schedule: JSON.parse(r.schedule),
  startDate: r.start_date,
  endDate: r.end_date ?? null,
  count: r.count ?? null,
  note: r.note ?? '',
});

const toOverride = (r: Row): OccurrenceOverride => ({
  id: r.id,
  recurringId: r.recurring_id,
  originalDate: r.original_date,
  skip: r.skip === 1,
  newDate: r.new_date ?? null,
  newAmount: r.new_amount ?? null,
  paid: r.paid === 1,
});

const toTransaction = (r: Row): Transaction => ({
  id: r.id,
  kind: r.kind,
  date: r.date,
  description: r.description,
  categoryId: r.category_id ?? null,
  amount: r.amount,
  note: r.note ?? '',
  source: r.source,
  importId: r.import_id ?? null,
  planned: r.planned === 1,
});

const writeCategory = (w: Writer, c: Category) =>
  w.runAsync(
    `INSERT INTO categories (id, name, kind, sort, archived) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, sort = excluded.sort, archived = excluded.archived`,
    [c.id, c.name, c.kind, c.sort, bool(c.archived)],
  );

const writeRecurring = (w: Writer, r: RecurringItem) =>
  w.runAsync(
    `INSERT INTO recurring_items
      (id, kind, name, category_id, amount, schedule, start_date, end_date, count, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = excluded.name, category_id = excluded.category_id,
       amount = excluded.amount, schedule = excluded.schedule, start_date = excluded.start_date,
       end_date = excluded.end_date, count = excluded.count, note = excluded.note`,
    [r.id, r.kind, r.name, r.categoryId, r.amount, JSON.stringify(r.schedule), r.startDate, r.endDate, r.count, r.note],
  );

async function writeOverride(w: Writer, o: OccurrenceOverride) {
  // Unique (recurring_id, original_date): drop any other row for the same occurrence first.
  await w.runAsync('DELETE FROM occurrence_overrides WHERE recurring_id = ? AND original_date = ? AND id <> ?', [
    o.recurringId,
    o.originalDate,
    o.id,
  ]);
  await w.runAsync(
    `INSERT INTO occurrence_overrides
      (id, recurring_id, original_date, skip, new_date, new_amount, paid) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET recurring_id = excluded.recurring_id, original_date = excluded.original_date,
       skip = excluded.skip, new_date = excluded.new_date, new_amount = excluded.new_amount, paid = excluded.paid`,
    [o.id, o.recurringId, o.originalDate, bool(o.skip), o.newDate, o.newAmount, bool(o.paid)],
  );
}

const writeTransaction = (w: Writer, t: Transaction) =>
  w.runAsync(
    `INSERT INTO transactions
      (id, kind, date, description, category_id, amount, note, source, import_id, planned)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, date = excluded.date, description = excluded.description,
       category_id = excluded.category_id, amount = excluded.amount, note = excluded.note, source = excluded.source,
       import_id = excluded.import_id, planned = excluded.planned`,
    [t.id, t.kind, t.date, t.description, t.categoryId, t.amount, t.note, t.source, t.importId, bool(t.planned)],
  );

async function writeSettings(w: Writer, s: Partial<Settings>) {
  for (const [key, value] of Object.entries(s)) {
    if (value === undefined) continue;
    await w.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
      key,
      JSON.stringify(value),
    ]);
  }
}

/** Removes every row from every data table. */
async function clearAll(w: Writer) {
  for (const table of ['settings', 'categories', 'recurring_items', 'occurrence_overrides', 'transactions']) {
    await w.runAsync(`DELETE FROM ${table}`);
  }
}

async function writeDefaults(w: Writer) {
  await writeSettings(w, defaultSettings());
  for (const c of DEFAULT_CATEGORIES) await writeCategory(w, c);
}

/** Runs a task in an exclusive transaction. That uses its own connection, so it needs its own busy timeout. */
function transaction(db: SQLite.SQLiteDatabase, task: (txn: SQLite.SQLiteDatabase) => Promise<void>) {
  return db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync('PRAGMA busy_timeout = 5000;');
    await task(txn);
  });
}

const CLOSED = 'This database is closed.';

export function createSqliteRepository(dbName: string = DB_NAME): Repository {
  let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
  let closed = false;

  async function open(): Promise<SQLite.SQLiteDatabase> {
    const db = await SQLite.openDatabaseAsync(dbName);
    await db.execAsync('PRAGMA busy_timeout = 5000;');
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await migrate(db);
    const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM settings');
    if (!row || row.n === 0) {
      await transaction(db, async (txn) => {
        await clearAll(txn);
        await writeDefaults(txn);
      });
    }
    return db;
  }

  // Every write goes through this queue, one at a time, so writes on the main connection never
  // overlap an exclusive transaction (which would fail with "database is locked").
  // A failed write rejects for its caller only; the queue carries on.
  let queue: Promise<unknown> = Promise.resolve();
  function write<T>(task: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
    if (closed) return Promise.reject(new Error(CLOSED));
    // Accepted before close(): runs even if close() is called meanwhile (close waits for the queue).
    const run = queue.then(async () => task(await openOnce()));
    queue = run.catch(() => undefined);
    return run;
  }

  const openOnce = () => {
    if (!dbPromise) {
      dbPromise = open().catch((e) => {
        dbPromise = null;
        throw e;
      });
    }
    return dbPromise;
  };
  const getDb = () => (closed ? Promise.reject(new Error(CLOSED)) : openOnce());

  async function readSettings(db: SQLite.SQLiteDatabase): Promise<Settings> {
    const base = defaultSettings();
    const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
    const stored: Row = {};
    for (const r of rows) {
      try {
        stored[r.key] = JSON.parse(r.value);
      } catch {
        // ignore a corrupt value and fall back to the default
      }
    }
    return {
      ...base,
      ...stored,
      enabledModules: { ...base.enabledModules, ...(stored.enabledModules ?? {}) },
      alertThresholds: { ...base.alertThresholds, ...(stored.alertThresholds ?? {}) },
    };
  }

  const readCategories = async (db: SQLite.SQLiteDatabase) =>
    (await db.getAllAsync<Row>('SELECT * FROM categories ORDER BY sort, id')).map(toCategory);
  const readRecurring = async (db: SQLite.SQLiteDatabase) =>
    (await db.getAllAsync<Row>('SELECT * FROM recurring_items ORDER BY rowid')).map(toRecurring);
  const readOverrides = async (db: SQLite.SQLiteDatabase, recurringId?: string) =>
    (recurringId === undefined
      ? await db.getAllAsync<Row>('SELECT * FROM occurrence_overrides ORDER BY rowid')
      : await db.getAllAsync<Row>('SELECT * FROM occurrence_overrides WHERE recurring_id = ? ORDER BY rowid', [
          recurringId,
        ])
    ).map(toOverride);
  async function readTransactions(db: SQLite.SQLiteDatabase, range?: { from?: string; to?: string }) {
    const where: string[] = [];
    const params: string[] = [];
    if (range?.from) {
      where.push('date >= ?');
      params.push(range.from);
    }
    if (range?.to) {
      where.push('date <= ?');
      params.push(range.to);
    }
    const sql = `SELECT * FROM transactions ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY date, id`;
    return (await db.getAllAsync<Row>(sql, params)).map(toTransaction);
  }

  return {
    async init() {
      await getDb();
    },
    async close() {
      if (closed) return;
      // Reject new calls first, then let queued writes finish before closing.
      const opened = dbPromise;
      closed = true;
      await queue;
      if (!opened) return;
      const db = await opened.catch(() => null);
      if (db) await db.closeAsync();
    },

    async getSettings() {
      return readSettings(await getDb());
    },
    async updateSettings(patch) {
      return write(async (db) => {
        // Inside the queue, so overlapping calls apply one after the other; only the patched keys are written.
        await transaction(db, (txn) => writeSettings(txn, patch));
        return readSettings(db);
      });
    },

    async listCategories() {
      return readCategories(await getDb());
    },
    async upsertCategory(category) {
      await write((db) => writeCategory(db, category));
    },
    removeCategory: (id) =>
      write(async (db) => {
      const used = await db.getFirstAsync<{ n: number }>(
        `SELECT (SELECT COUNT(*) FROM recurring_items WHERE category_id = ?)
              + (SELECT COUNT(*) FROM transactions WHERE category_id = ?) AS n`,
        [id, id],
      );
      if (used && used.n > 0) await db.runAsync('UPDATE categories SET archived = 1 WHERE id = ?', [id]);
      else await db.runAsync('DELETE FROM categories WHERE id = ?', [id]);
      }),

    async listRecurring() {
      return readRecurring(await getDb());
    },
    async upsertRecurring(item) {
      await write((db) => writeRecurring(db, item));
    },
    async deleteRecurring(id) {
      await write((db) =>
        transaction(db, async (txn) => {
          await txn.runAsync('DELETE FROM occurrence_overrides WHERE recurring_id = ?', [id]);
          await txn.runAsync('DELETE FROM recurring_items WHERE id = ?', [id]);
        }),
      );
    },

    async listOverrides(recurringId) {
      return readOverrides(await getDb(), recurringId);
    },
    async upsertOverride(o) {
      await write((db) => transaction(db, (txn) => writeOverride(txn, o)));
    },
    async deleteOverride(id) {
      await write((db) => db.runAsync('DELETE FROM occurrence_overrides WHERE id = ?', [id]));
    },

    async listTransactions(range) {
      return readTransactions(await getDb(), range);
    },
    async upsertTransaction(t) {
      await write((db) => writeTransaction(db, t));
    },
    async deleteTransaction(id) {
      await write((db) => db.runAsync('DELETE FROM transactions WHERE id = ?', [id]));
    },

    async exportAll(): Promise<BackupData> {
      const db = await getDb();
      return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        settings: await readSettings(db),
        categories: await readCategories(db),
        recurring: await readRecurring(db),
        overrides: await readOverrides(db),
        transactions: await readTransactions(db),
      };
    },
    async importAll(data) {
      await write((db) =>
        transaction(db, async (txn) => {
          await clearAll(txn);
          await writeSettings(txn, { ...defaultSettings(), ...data.settings });
          for (const c of data.categories) await writeCategory(txn, c);
          for (const r of data.recurring) await writeRecurring(txn, r);
          for (const o of data.overrides) await writeOverride(txn, o);
          for (const t of data.transactions) await writeTransaction(txn, t);
        }),
      );
    },
    async deleteAll() {
      await write((db) =>
        transaction(db, async (txn) => {
          await clearAll(txn);
          await writeDefaults(txn);
        }),
      );
    },
  };
}
