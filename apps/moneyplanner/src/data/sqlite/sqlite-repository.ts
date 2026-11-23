import * as SQLite from 'expo-sqlite';

import { defaultSettings, DEFAULT_CATEGORIES } from '@/data/defaults';
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupData, type Repository } from '@/data/repository';
import { keepDeviceLocal, settingsFromStored } from '@/data/settingsSchema';
import type {
  Account,
  Category,
  BalanceSnapshot,
  CategoryRuleRecord,
  Cheque,
  Debt,
  DebtOverride,
  DebtPayment,
  ImportRecord,
  ImportTemplate,
  OccurrenceOverride,
  RecurringItem,
  Settings,
  Transaction,
} from '@/types';
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
  monthlyLimit: r.monthly_limit ?? null,
});

/** account_id / card_id as optional fields: absent when NULL, so items from before accounts read exactly as before. */
const links = (r: Row) => ({ ...(r.account_id != null ? { accountId: r.account_id as string } : {}), ...(r.card_id != null ? { cardId: r.card_id as string } : {}) });

const toAccount = (r: Row): Account => ({
  id: r.id,
  name: r.name,
  type: r.type,
  startingBalance: r.starting_balance,
  startingBalanceDate: r.starting_balance_date,
  archived: r.archived === 1,
  sort: r.sort,
  createdAt: r.created_at,
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
  ...links(r),
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
  ...links(r),
});

/** Debt columns; everything else (type-specific fields and the note) lives in the `fields` JSON. */
const DEBT_COLUMNS = ['id', 'type', 'name', 'archived', 'createdAt'];

const toDebt = (r: Row): Debt => {
  let fields: Row = {};
  try {
    fields = JSON.parse(r.fields);
  } catch {
    // a corrupt value leaves only the base columns
  }
  return { ...fields, id: r.id, type: r.type, name: r.name, archived: r.archived === 1, createdAt: r.created_at } as Debt;
};

const toDebtPayment = (r: Row): DebtPayment => ({
  id: r.id,
  debtId: r.debt_id,
  date: r.date,
  amount: r.amount,
  kind: r.kind,
  note: r.note ?? '',
});

const toDebtOverride = (r: Row): DebtOverride => ({
  id: r.id,
  debtId: r.debt_id,
  originalDate: r.original_date,
  newDate: r.new_date ?? null,
  newAmount: r.new_amount ?? null,
  skip: r.skip === 1,
});

const toCheque = (r: Row): Cheque => ({
  id: r.id,
  payee: r.payee,
  amount: r.amount,
  date: r.date,
  purpose: r.purpose ?? '',
  status: r.status,
  seriesId: r.series_id ?? null,
  note: r.note ?? '',
});

const toImport = (r: Row): ImportRecord => ({
  id: r.id,
  sourceName: r.source_name,
  fileKind: r.file_kind,
  importedAt: r.imported_at,
  rowCount: r.row_count,
  ...links(r),
});

const toTemplate = (r: Row): ImportTemplate => {
  let mapping: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(r.mapping);
    if (parsed && typeof parsed === 'object') mapping = parsed;
  } catch {
    // a corrupt layout is ignored: the next import guesses the columns again
  }
  return { sourceName: r.source_name, mapping, lastUsed: r.last_used, ...links(r) };
};

const toRule = (r: Row): CategoryRuleRecord => ({ id: r.id, pattern: r.pattern, categoryId: r.category_id, createdAt: r.created_at });

const toSnapshot = (r: Row): BalanceSnapshot => ({ date: r.date, balance: r.balance });

const writeSnapshot = (w: Writer, s: BalanceSnapshot) =>
  w.runAsync('INSERT INTO balance_snapshots (date, balance) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET balance = excluded.balance', [s.date, s.balance]);

const writeImport = (w: Writer, i: ImportRecord) =>
  w.runAsync(
    `INSERT INTO imports (id, source_name, file_kind, imported_at, row_count, account_id, card_id) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET source_name = excluded.source_name, file_kind = excluded.file_kind,
       imported_at = excluded.imported_at, row_count = excluded.row_count, account_id = excluded.account_id, card_id = excluded.card_id`,
    [i.id, i.sourceName, i.fileKind, i.importedAt, i.rowCount, i.accountId ?? null, i.cardId ?? null],
  );

const writeTemplate = (w: Writer, t: ImportTemplate) =>
  w.runAsync(
    `INSERT INTO import_templates (source_name, mapping, last_used, account_id, card_id) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source_name) DO UPDATE SET mapping = excluded.mapping, last_used = excluded.last_used,
       account_id = excluded.account_id, card_id = excluded.card_id`,
    [t.sourceName, JSON.stringify(t.mapping), t.lastUsed, t.accountId ?? null, t.cardId ?? null],
  );

async function writeRule(w: Writer, r: CategoryRuleRecord) {
  // The pattern is unique (ignoring case): another row with the same pattern is replaced.
  await w.runAsync('DELETE FROM category_rules WHERE pattern = ? COLLATE NOCASE AND id <> ?', [r.pattern, r.id]);
  await w.runAsync(
    `INSERT INTO category_rules (id, pattern, category_id, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET pattern = excluded.pattern, category_id = excluded.category_id, created_at = excluded.created_at`,
    [r.id, r.pattern, r.categoryId, r.createdAt],
  );
}

const writeCategory = (w: Writer, c: Category) =>
  w.runAsync(
    `INSERT INTO categories (id, name, kind, sort, archived, monthly_limit) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, sort = excluded.sort, archived = excluded.archived,
       monthly_limit = excluded.monthly_limit`,
    [c.id, c.name, c.kind, c.sort, bool(c.archived), c.monthlyLimit ?? null],
  );

const writeRecurring = (w: Writer, r: RecurringItem) =>
  w.runAsync(
    `INSERT INTO recurring_items
      (id, kind, name, category_id, amount, schedule, start_date, end_date, count, note, account_id, card_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = excluded.name, category_id = excluded.category_id,
       amount = excluded.amount, schedule = excluded.schedule, start_date = excluded.start_date,
       end_date = excluded.end_date, count = excluded.count, note = excluded.note,
       account_id = excluded.account_id, card_id = excluded.card_id`,
    [r.id, r.kind, r.name, r.categoryId, r.amount, JSON.stringify(r.schedule), r.startDate, r.endDate, r.count, r.note, r.accountId ?? null, r.cardId ?? null],
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
      (id, kind, date, description, category_id, amount, note, source, import_id, planned, account_id, card_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, date = excluded.date, description = excluded.description,
       category_id = excluded.category_id, amount = excluded.amount, note = excluded.note, source = excluded.source,
       import_id = excluded.import_id, planned = excluded.planned, account_id = excluded.account_id, card_id = excluded.card_id`,
    [t.id, t.kind, t.date, t.description, t.categoryId, t.amount, t.note, t.source, t.importId, bool(t.planned), t.accountId ?? null, t.cardId ?? null],
  );

const writeDebt = (w: Writer, d: Debt) => {
  const fields: Row = {};
  for (const [k, v] of Object.entries(d)) if (!DEBT_COLUMNS.includes(k)) fields[k] = v;
  return w.runAsync(
    `INSERT INTO debts (id, type, name, fields, archived, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET type = excluded.type, name = excluded.name, fields = excluded.fields,
       archived = excluded.archived, created_at = excluded.created_at`,
    [d.id, d.type, d.name, JSON.stringify(fields), bool(d.archived), d.createdAt],
  );
};

const writeDebtPayment = (w: Writer, p: DebtPayment) =>
  w.runAsync(
    `INSERT INTO debt_payments (id, debt_id, date, amount, kind, note) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET debt_id = excluded.debt_id, date = excluded.date, amount = excluded.amount,
       kind = excluded.kind, note = excluded.note`,
    [p.id, p.debtId, p.date, p.amount, p.kind, p.note],
  );

async function writeDebtOverride(w: Writer, o: DebtOverride) {
  // Unique (debt_id, original_date): drop any other row for the same payment first.
  await w.runAsync('DELETE FROM debt_overrides WHERE debt_id = ? AND original_date = ? AND id <> ?', [
    o.debtId,
    o.originalDate,
    o.id,
  ]);
  await w.runAsync(
    `INSERT INTO debt_overrides (id, debt_id, original_date, new_date, new_amount, skip) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET debt_id = excluded.debt_id, original_date = excluded.original_date,
       new_date = excluded.new_date, new_amount = excluded.new_amount, skip = excluded.skip`,
    [o.id, o.debtId, o.originalDate, o.newDate, o.newAmount, bool(o.skip)],
  );
}

const writeCheque = (w: Writer, c: Cheque) =>
  w.runAsync(
    `INSERT INTO cheques (id, payee, amount, date, purpose, status, series_id, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET payee = excluded.payee, amount = excluded.amount, date = excluded.date,
       purpose = excluded.purpose, status = excluded.status, series_id = excluded.series_id, note = excluded.note`,
    [c.id, c.payee, c.amount, c.date, c.purpose, c.status, c.seriesId, c.note],
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
const writeAccount = (w: Writer, a: Account) =>
  w.runAsync(
    `INSERT INTO accounts (id, name, type, starting_balance, starting_balance_date, archived, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, starting_balance = excluded.starting_balance,
       starting_balance_date = excluded.starting_balance_date, archived = excluded.archived, sort = excluded.sort, created_at = excluded.created_at`,
    [a.id, a.name, a.type, a.startingBalance, a.startingBalanceDate, bool(a.archived), a.sort, a.createdAt],
  );

async function clearAll(w: Writer) {
  for (const table of ['settings', 'categories', 'recurring_items', 'occurrence_overrides', 'transactions', 'debts', 'debt_payments', 'debt_overrides', 'cheques', 'imports', 'import_templates', 'category_rules', 'balance_snapshots', 'accounts']) {
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
    const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
    const stored: Row = {};
    for (const r of rows) {
      try {
        stored[r.key] = JSON.parse(r.value);
      } catch {
        // ignore a corrupt value and fall back to the default
      }
    }
    return settingsFromStored(stored);
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

  const readDebts = async (db: SQLite.SQLiteDatabase) =>
    (await db.getAllAsync<Row>('SELECT * FROM debts ORDER BY rowid')).map(toDebt);
  const readDebtPayments = async (db: SQLite.SQLiteDatabase, debtId?: string) =>
    (debtId === undefined
      ? await db.getAllAsync<Row>('SELECT * FROM debt_payments ORDER BY date, id')
      : await db.getAllAsync<Row>('SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY date, id', [debtId])
    ).map(toDebtPayment);
  const readDebtOverrides = async (db: SQLite.SQLiteDatabase, debtId?: string) =>
    (debtId === undefined
      ? await db.getAllAsync<Row>('SELECT * FROM debt_overrides ORDER BY rowid')
      : await db.getAllAsync<Row>('SELECT * FROM debt_overrides WHERE debt_id = ? ORDER BY rowid', [debtId])
    ).map(toDebtOverride);
  const readAccounts = async (db: SQLite.SQLiteDatabase) =>
    (await db.getAllAsync<Row>('SELECT * FROM accounts ORDER BY sort, id')).map(toAccount);
  const readCheques = async (db: SQLite.SQLiteDatabase) =>
    (await db.getAllAsync<Row>('SELECT * FROM cheques ORDER BY date, id')).map(toCheque);

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

    async listAccounts() {
      return readAccounts(await getDb());
    },
    async upsertAccount(account) {
      await write((db) => writeAccount(db, account));
    },
    removeAccount: (id) =>
      write(async (db) => {
        const used = await db.getFirstAsync<{ n: number }>(
          `SELECT (SELECT COUNT(*) FROM recurring_items WHERE account_id = ?)
                + (SELECT COUNT(*) FROM transactions WHERE account_id = ?) AS n`,
          [id, id],
        );
        if (used && used.n > 0) await db.runAsync('UPDATE accounts SET archived = 1 WHERE id = ?', [id]);
        else await db.runAsync('DELETE FROM accounts WHERE id = ?', [id]);
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
    async upsertTransactions(list) {
      await write((db) =>
        transaction(db, async (txn) => {
          for (const t of list) await writeTransaction(txn, t);
        }),
      );
    },

    async listDebts() {
      return readDebts(await getDb());
    },
    async upsertDebt(d) {
      await write((db) => writeDebt(db, d));
    },
    async deleteDebt(id) {
      await write((db) =>
        transaction(db, async (txn) => {
          await txn.runAsync('DELETE FROM debt_payments WHERE debt_id = ?', [id]);
          await txn.runAsync('DELETE FROM debt_overrides WHERE debt_id = ?', [id]);
          await txn.runAsync('DELETE FROM debts WHERE id = ?', [id]);
          // Plans that sat on this card keep existing, but without the link.
          for (const plan of (await readDebts(txn)).filter((d) => d.type === 'plan' && d.cardId === id)) {
            await writeDebt(txn, { ...plan, cardId: null } as Debt);
          }
        }),
      );
    },
    async listDebtPayments(debtId) {
      return readDebtPayments(await getDb(), debtId);
    },
    async upsertDebtPayment(p) {
      await write((db) => writeDebtPayment(db, p));
    },
    async deleteDebtPayment(id) {
      await write((db) => db.runAsync('DELETE FROM debt_payments WHERE id = ?', [id]));
    },
    async listDebtOverrides(debtId) {
      return readDebtOverrides(await getDb(), debtId);
    },
    async upsertDebtOverride(o) {
      await write((db) => transaction(db, (txn) => writeDebtOverride(txn, o)));
    },
    async deleteDebtOverride(id) {
      await write((db) => db.runAsync('DELETE FROM debt_overrides WHERE id = ?', [id]));
    },

    async listCheques() {
      return readCheques(await getDb());
    },
    async upsertCheques(cheques) {
      await write((db) =>
        transaction(db, async (txn) => {
          for (const c of cheques) await writeCheque(txn, c);
        }),
      );
    },
    async deleteCheque(id) {
      await write((db) => db.runAsync('DELETE FROM cheques WHERE id = ?', [id]));
    },

    async saveImportBatch({ transactions, debtPayments = [], importRecord, template }) {
      await write((db) =>
        transaction(db, async (txn) => {
          for (const t of transactions) await writeTransaction(txn, t);
          for (const p of debtPayments) await writeDebtPayment(txn, p);
          await writeImport(txn, importRecord);
          if (template) await writeTemplate(txn, template);
        }),
      );
    },
    async listImports() {
      return (await (await getDb()).getAllAsync<Row>('SELECT * FROM imports ORDER BY imported_at, id')).map(toImport);
    },
    async addImport(record) {
      await write((db) => writeImport(db, record));
    },
    async getImportTemplate(sourceName) {
      const row = await (await getDb()).getFirstAsync<Row>('SELECT * FROM import_templates WHERE source_name = ?', [sourceName]);
      return row ? toTemplate(row) : null;
    },
    async saveImportTemplate(template) {
      await write((db) => writeTemplate(db, template));
    },
    async listCategoryRules() {
      return (await (await getDb()).getAllAsync<Row>('SELECT * FROM category_rules ORDER BY created_at, id')).map(toRule);
    },
    async upsertCategoryRule(rule) {
      await write((db) => transaction(db, (txn) => writeRule(txn, rule)));
    },
    async listBalanceSnapshots() {
      return (await (await getDb()).getAllAsync<Row>('SELECT * FROM balance_snapshots ORDER BY date')).map(toSnapshot);
    },
    async upsertBalanceSnapshot(s) {
      await write((db) => writeSnapshot(db, s));
    },
    async deleteCategoryRule(id) {
      await write((db) => db.runAsync('DELETE FROM category_rules WHERE id = ?', [id]));
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
        debts: await readDebts(db),
        debtPayments: await readDebtPayments(db),
        debtOverrides: await readDebtOverrides(db),
        cheques: await readCheques(db),
        imports: (await db.getAllAsync<Row>('SELECT * FROM imports ORDER BY imported_at, id')).map(toImport),
        importTemplates: (await db.getAllAsync<Row>('SELECT * FROM import_templates ORDER BY source_name')).map(toTemplate),
        categoryRules: (await db.getAllAsync<Row>('SELECT * FROM category_rules ORDER BY created_at, id')).map(toRule),
        balanceSnapshots: (await db.getAllAsync<Row>('SELECT * FROM balance_snapshots ORDER BY date')).map(toSnapshot),
        accounts: await readAccounts(db),
      };
    },
    async importAll(data) {
      await write((db) =>
        transaction(db, async (txn) => {
          // The lock belongs to this phone (its PIN is in secure storage), so a backup never changes it.
          const current = await readSettings(txn);
          await clearAll(txn);
          await writeSettings(txn, keepDeviceLocal(settingsFromStored(data.settings), current));
          for (const c of data.categories) await writeCategory(txn, c);
          for (const r of data.recurring) await writeRecurring(txn, r);
          for (const o of data.overrides) await writeOverride(txn, o);
          for (const t of data.transactions) await writeTransaction(txn, t);
          // Version 1 backups have no debts or cheques.
          for (const d of data.debts ?? []) await writeDebt(txn, d);
          for (const p of data.debtPayments ?? []) await writeDebtPayment(txn, p);
          for (const o of data.debtOverrides ?? []) await writeDebtOverride(txn, o);
          for (const c of data.cheques ?? []) await writeCheque(txn, c);
          // Backups made before statement import have no import lists.
          for (const i of data.imports ?? []) await writeImport(txn, i);
          for (const t of data.importTemplates ?? []) await writeTemplate(txn, t);
          for (const r of data.categoryRules ?? []) await writeRule(txn, r);
          for (const s of data.balanceSnapshots ?? []) await writeSnapshot(txn, s);
          // Backups made before money accounts have only the main account.
          for (const a of data.accounts ?? []) await writeAccount(txn, a);
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
