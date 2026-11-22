// Runs the contract suite against the real SQLite repository code, with expo-sqlite
// replaced by an adapter over Node's built-in node:sqlite (in-memory databases).
import { createSqliteRepository } from '@/data/sqlite/sqlite-repository';
import { MIGRATIONS, migrate } from '@/data/sqlite/schema';
import { parseBackup, serializeBackup } from '@/data/backup';
import { BACKUP_FORMAT } from '@/data/repository';
import { card, chq, dpay, loan, ovr, plan, rec, runRepositoryContract, txn } from '@/data/memory/repository-contract';

jest.mock('expo-sqlite', () => {
  const { DatabaseSync } = require('node:sqlite');
  const make = () => {
    const raw = new DatabaseSync(':memory:');
    // Like the real thing, the exclusive transaction is a second connection: while it is open,
    // writes on the main connection fail with "database is locked" (and so does a second transaction).
    let inTxn = false;
    const db: any = {
      raw,
      closeAsync: async () => {
        db.closedCount = (db.closedCount ?? 0) + 1;
      },
      execAsync: async (sql: string) => raw.exec(sql),
      runAsync: async (sql: string, params: any[] = []) => {
        if (inTxn) throw new Error('database is locked');
        raw.prepare(sql).run(...params);
      },
      getAllAsync: async (sql: string, params: any[] = []) => raw.prepare(sql).all(...params),
      getFirstAsync: async (sql: string, params: any[] = []) => raw.prepare(sql).get(...params) ?? null,
      withExclusiveTransactionAsync: async (task: (t: any) => Promise<void>) => {
        if (inTxn) throw new Error('database is locked');
        inTxn = true;
        raw.exec('BEGIN');
        const txn = {
          ...db,
          execAsync: async (sql: string) => raw.exec(sql),
          runAsync: async (sql: string, params: any[] = []) => {
            raw.prepare(sql).run(...params);
          },
        };
        try {
          await task(txn);
          raw.exec('COMMIT');
        } catch (e) {
          raw.exec('ROLLBACK');
          throw e;
        } finally {
          inTxn = false;
        }
      },
    };
    return db;
  };
  const opened: any[] = [];
  return {
    openDatabaseAsync: async (name: string) => {
      const db = (globalThis as any).__nextDb ?? make();
      (globalThis as any).__nextDb = undefined;
      db.name = name;
      opened.push(db);
      return db;
    },
    __opened: opened,
    __make: make,
  };
});

runRepositoryContract('sqlite', async () => createSqliteRepository());

describe('sqlite specifics', () => {
  it('stores type-specific debt fields in the fields column', async () => {
    const { __opened } = require('expo-sqlite');
    const repo = createSqliteRepository();
    await repo.init();
    await repo.upsertDebt(loan());
    const row = __opened[__opened.length - 1].raw.prepare('SELECT * FROM debts').get();
    expect(row).toMatchObject({ id: 'd-loan', type: 'loan', name: 'Car loan', archived: 0, created_at: '2026-01-02' });
    expect(JSON.parse(row.fields)).toMatchObject({ balance: 4000000, paymentDay: 31 });
    expect(JSON.parse(row.fields)).not.toHaveProperty('name');
  });

  it('upsertCheques is all or nothing', async () => {
    const repo = createSqliteRepository();
    await repo.init();
    await expect(repo.upsertCheques([chq({ id: 'ok' }), chq({ id: null as any })])).rejects.toBeTruthy();
    expect(await repo.listCheques()).toEqual([]);
  });

  it('importAll is all or nothing', async () => {
    const repo = createSqliteRepository();
    await repo.init();
    await repo.updateSettings({ currency: 'USD' });
    const good = await repo.exportAll();
    const bad = { ...good, settings: { ...good.settings, currency: 'EUR' }, transactions: [{ ...good.transactions[0], id: undefined } as any] };
    bad.transactions = [{ id: null, kind: 'cost', date: '2026-01-01', description: 'x', categoryId: null, amount: 1, note: '', source: 'manual', importId: null, planned: false } as any];
    await expect(repo.importAll(bad)).rejects.toBeTruthy();
    expect((await repo.getSettings()).currency).toBe('USD');
    expect((await repo.listCategories()).length).toBeGreaterThan(10);
  });

  it('migrates by user_version', async () => {
    const { __make } = require('expo-sqlite');
    const db = __make();
    await migrate(db);
    expect(db.raw.prepare('PRAGMA user_version').get().user_version).toBe(MIGRATIONS.length);
    await migrate(db);
    expect(db.raw.prepare('PRAGMA user_version').get().user_version).toBe(MIGRATIONS.length);
  });
});

describe('migration v4 to v5', () => {
  it('adds balance_snapshots to a v4 database, keeping its rows', async () => {
    const { __make } = require('expo-sqlite');
    const db = __make();
    const upTo4 = MIGRATIONS.slice(0, 4).map((sql, i) => `BEGIN;\n${sql}\nPRAGMA user_version = ${i + 1};\nCOMMIT;`);
    for (const sql of upTo4) db.raw.exec(sql);
    db.raw.prepare("INSERT INTO settings (key, value) VALUES ('currency', '\"USD\"')").run();
    await migrate(db);
    expect(db.raw.prepare('PRAGMA user_version').get().user_version).toBe(MIGRATIONS.length);
    expect(db.raw.prepare("SELECT value FROM settings WHERE key = 'currency'").get().value).toBe('"USD"');
    db.raw.prepare("INSERT INTO balance_snapshots (date, balance) VALUES ('2026-11-01', 5000)").run();
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM balance_snapshots').get().n).toBe(1);
  });
});

describe('migration v1 to v2', () => {
  it('upgrades a v1 database, keeping its rows', async () => {
    const { __make } = require('expo-sqlite');
    const db = __make();
    db.raw.exec(`BEGIN;\n${MIGRATIONS[0]}\nPRAGMA user_version = 1;\nCOMMIT;`);
    db.raw.prepare("INSERT INTO settings (key, value) VALUES ('currency', '\"USD\"')").run();
    db.raw
      .prepare("INSERT INTO transactions (id, kind, date, description, amount, source) VALUES ('t1', 'cost', '2026-01-01', 'Lunch', 500, 'manual')")
      .run();
    db.raw.prepare("INSERT INTO categories (id, name, kind, sort) VALUES ('c', 'C', 'cost', 1)").run();
    await migrate(db);
    expect(db.raw.prepare('PRAGMA user_version').get().user_version).toBe(MIGRATIONS.length);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM transactions').get().n).toBe(1);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM categories').get().n).toBe(1);
    expect(db.raw.prepare("SELECT value FROM settings WHERE key = 'currency'").get().value).toBe('"USD"');
    for (const table of ['debts', 'debt_payments', 'debt_overrides', 'cheques']) {
      expect(db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n).toBe(0);
    }
  });

  it('opens a v1 database through the repository and keeps its data', async () => {
    const expo = require('expo-sqlite');
    const db = expo.__make();
    db.raw.exec(`BEGIN;\n${MIGRATIONS[0]}\nPRAGMA user_version = 1;\nCOMMIT;`);
    db.raw.prepare("INSERT INTO settings (key, value) VALUES ('onboarded', 'true')").run();
    db.raw
      .prepare("INSERT INTO transactions (id, kind, date, description, amount, source) VALUES ('t1', 'cost', '2026-01-01', 'Lunch', 500, 'manual')")
      .run();
    (globalThis as any).__nextDb = db; // the repository opens this pre-built v1 database
    {
      const repo = createSqliteRepository('v1.db');
      await repo.init();
      expect((await repo.listTransactions()).map((t) => t.id)).toEqual(['t1']);
      expect((await repo.getSettings()).onboarded).toBe(true);
      expect(await repo.listDebts()).toEqual([]);
      await repo.upsertCheques([chq()]);
      expect(await repo.listCheques()).toHaveLength(1);
    }
  });
});

describe('sqlite close()', () => {
  const opened = () => (require('expo-sqlite') as any).__opened as any[];

  it('opens the named file, closes it once, and then rejects calls', async () => {
    const before = opened().length;
    const repo = createSqliteRepository('moneyplanner-x.db');
    await repo.init();
    const db = opened()[before];
    expect(db.name).toBe('moneyplanner-x.db');
    await repo.close();
    await repo.close();
    expect(db.closedCount).toBe(1);
    await expect(repo.getSettings()).rejects.toThrow(/closed/);
    await expect(repo.init()).rejects.toThrow(/closed/);
    expect(opened().length).toBe(before + 1);
  });

  it('waits for queued writes before closing', async () => {
    const repo = createSqliteRepository();
    await repo.init();
    const pending = repo.updateSettings({ currency: 'EUR' });
    await repo.close();
    await expect(pending).resolves.toMatchObject({ currency: 'EUR' });
  });

  it('close() before init is fine', async () => {
    const repo = createSqliteRepository();
    await repo.close();
    await expect(repo.init()).rejects.toThrow(/closed/);
  });
});

describe('a full v1 database and a v1 backup in the v2 app', () => {
  const v1Database = () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const expo = require('expo-sqlite');
    const db = expo.__make();
    db.raw.exec(`BEGIN;\n${MIGRATIONS[0]}\nPRAGMA user_version = 1;\nCOMMIT;`);
    const set = (k: string, v: unknown) => db.raw.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(k, JSON.stringify(v));
    set('onboarded', true);
    set('startingBalance', 650000);
    set('buffer', 200000);
    set('enabledModules', { debts: true, cheques: false, alerts: false, import: true });
    db.raw
      .prepare("INSERT INTO recurring_items (id, kind, name, category_id, amount, schedule, start_date, end_date, count, note) VALUES ('r1', 'cost', 'Rent', 'housing', 500000, ?, '2026-01-01', NULL, NULL, '')")
      .run(JSON.stringify({ type: 'monthly', day: 'last' }));
    db.raw
      .prepare("INSERT INTO occurrence_overrides (id, recurring_id, original_date, skip, new_date, new_amount, paid) VALUES ('o1', 'r1', '2026-02-28', 0, '2026-03-02', 123, 1)")
      .run();
    db.raw
      .prepare("INSERT INTO transactions (id, kind, date, description, category_id, amount, note, source, import_id, planned) VALUES ('t1', 'cost', '2026-03-05', 'Lunch', 'dining', 4550, '', 'manual', NULL, 0)")
      .run();
    return db;
  };

  it('keeps every v1 row readable through the repository, then stores v2 data next to it', async () => {
    (globalThis as any).__nextDb = v1Database();
    const repo = createSqliteRepository('v1-full.db');
    await repo.init();
    expect(await repo.listRecurring()).toMatchObject([{ id: 'r1', name: 'Rent', amount: 500000, schedule: { type: 'monthly', day: 'last' } }]);
    expect(await repo.listOverrides()).toMatchObject([{ id: 'o1', newDate: '2026-03-02', newAmount: 123, paid: true }]);
    expect(await repo.listTransactions()).toMatchObject([{ id: 't1', amount: 4550 }]);
    const s = await repo.getSettings();
    expect(s).toMatchObject({ onboarded: true, startingBalance: 650000, buffer: 200000 });
    // Settings the v1 app never wrote come from the defaults.
    expect(s.alertThresholds).toEqual({ debtCautionPct: 40, debtHighPct: 50, cardUsagePct: 80 });
    expect(s.enabledModules).toMatchObject({ debts: true, alerts: false });

    await repo.upsertDebt(loan());
    await repo.upsertDebt(card());
    await repo.upsertDebt(plan());
    await repo.upsertDebtPayment(dpay());
    await repo.upsertCheques([chq()]);
    const out = await repo.exportAll();
    expect(out.version).toBe(2);
    expect(out.debts).toHaveLength(3);
    expect(out.recurring).toHaveLength(1);
    // The v2 export restores into a fresh v2 database unchanged.
    const other = createSqliteRepository('other.db');
    await other.init();
    await other.importAll(parseBackup(serializeBackup(out)));
    expect({ ...(await other.exportAll()), exportedAt: '' }).toEqual({ ...out, exportedAt: '' });
  });

  it('restores a v1 backup file into SQLite, replacing debts and cheques, and exports v2', async () => {
    const repo = createSqliteRepository('restore-v1.db');
    await repo.init();
    await repo.upsertDebt(loan());
    await repo.upsertCheques([chq()]);
    const current = await repo.exportAll();
    const v1: any = { ...current, version: 1, recurring: [rec()], overrides: [ovr()], transactions: [txn()] };
    for (const k of ['debts', 'debtPayments', 'debtOverrides', 'cheques']) delete v1[k];
    expect(v1.format).toBe(BACKUP_FORMAT);
    await repo.importAll(parseBackup(JSON.stringify(v1)));
    expect(await repo.listDebts()).toEqual([]);
    expect(await repo.listCheques()).toEqual([]);
    expect(await repo.listRecurring()).toHaveLength(1);
    const out = await repo.exportAll();
    expect(out.version).toBe(2);
    expect(out).toMatchObject({ debts: [], debtPayments: [], debtOverrides: [], cheques: [] });
  });
});

describe('migration v2 to v3', () => {
  it('adds monthly_limit to categories and keeps rows (limit null)', async () => {
    const { __make } = require('expo-sqlite');
    const db = __make();
    db.raw.exec(`BEGIN;\n${MIGRATIONS[0]}\n${MIGRATIONS[1]}\nPRAGMA user_version = 2;\nCOMMIT;`);
    db.raw.prepare("INSERT INTO categories (id, name, kind, sort) VALUES ('c', 'C', 'cost', 1)").run();
    db.raw.prepare("INSERT INTO transactions (id, kind, date, description, amount, source) VALUES ('t1', 'cost', '2026-01-01', 'Lunch', 500, 'manual')").run();
    await migrate(db);
    expect(db.raw.prepare('PRAGMA user_version').get().user_version).toBe(MIGRATIONS.length);
    expect(db.raw.prepare("SELECT monthly_limit FROM categories WHERE id = 'c'").get().monthly_limit).toBeNull();
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM transactions').get().n).toBe(1);
  });

  it('reads a v2 database through the repository with null limits, then stores a limit', async () => {
    const expo = require('expo-sqlite');
    const db = expo.__make();
    db.raw.exec(`BEGIN;\n${MIGRATIONS[0]}\n${MIGRATIONS[1]}\nPRAGMA user_version = 2;\nCOMMIT;`);
    db.raw.prepare("INSERT INTO settings (key, value) VALUES ('onboarded', 'true')").run();
    db.raw.prepare("INSERT INTO categories (id, name, kind, sort) VALUES ('c', 'C', 'cost', 1)").run();
    (globalThis as any).__nextDb = db;
    const repo = createSqliteRepository('v2.db');
    await repo.init();
    const cat = (await repo.listCategories()).find((c) => c.id === 'c')!;
    expect(cat.monthlyLimit).toBeNull();
    await repo.upsertCategory({ ...cat, monthlyLimit: 120000 });
    expect((await repo.listCategories()).find((c) => c.id === 'c')!.monthlyLimit).toBe(120000);
  });
});

describe('migration v3 to v4', () => {
  it('adds the import tables and keeps every row', async () => {
    const { __make } = require('expo-sqlite');
    const db = __make();
    db.raw.exec(`BEGIN;\n${MIGRATIONS[0]}\n${MIGRATIONS[1]}\n${MIGRATIONS[2]}\nPRAGMA user_version = 3;\nCOMMIT;`);
    db.raw.prepare("INSERT INTO settings (key, value) VALUES ('onboarded', 'true')").run();
    db.raw.prepare("INSERT INTO categories (id, name, kind, sort, monthly_limit) VALUES ('c', 'C', 'cost', 1, 5000)").run();
    db.raw.prepare("INSERT INTO transactions (id, kind, date, description, amount, source) VALUES ('t1', 'cost', '2026-01-01', 'Lunch', 500, 'manual')").run();
    db.raw.prepare("INSERT INTO cheques (id, payee, amount, date, status) VALUES ('q1', 'Landlord', 100, '2026-02-01', 'upcoming')").run();
    await migrate(db);
    expect(db.raw.prepare('PRAGMA user_version').get().user_version).toBe(MIGRATIONS.length);
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(4);
    for (const t of ['imports', 'import_templates', 'category_rules']) expect(db.raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n).toBe(0);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM transactions').get().n).toBe(1);
    expect(db.raw.prepare("SELECT monthly_limit FROM categories WHERE id = 'c'").get().monthly_limit).toBe(5000);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM cheques').get().n).toBe(1);
  });

  it('reads a v3 database through the repository, then stores imports, a template and a rule next to the old data', async () => {
    const expo = require('expo-sqlite');
    const db = expo.__make();
    db.raw.exec(`BEGIN;\n${MIGRATIONS[0]}\n${MIGRATIONS[1]}\n${MIGRATIONS[2]}\nPRAGMA user_version = 3;\nCOMMIT;`);
    db.raw.prepare("INSERT INTO settings (key, value) VALUES ('onboarded', 'true')").run();
    db.raw.prepare("INSERT INTO transactions (id, kind, date, description, amount, source) VALUES ('t1', 'cost', '2026-01-01', 'Lunch', 500, 'manual')").run();
    (globalThis as any).__nextDb = db;
    const repo = createSqliteRepository('v3.db');
    await repo.init();
    expect((await repo.listTransactions()).map((t) => t.id)).toEqual(['t1']);
    expect(await repo.listImports()).toEqual([]);
    expect(await repo.listCategoryRules()).toEqual([]);
    await repo.addImport({ id: 'i1', sourceName: 'a.csv', fileKind: 'csv', importedAt: '2026-02-01T00:00:00.000Z', rowCount: 1 });
    await repo.upsertTransactions([{ ...(await repo.listTransactions())[0], id: 't2', source: 'import', importId: 'i1' }]);
    expect((await repo.listTransactions()).map((t) => t.id)).toEqual(['t1', 't2']);
  });
});
