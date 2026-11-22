// Runs the contract suite against the real SQLite repository code, with expo-sqlite
// replaced by an adapter over Node's built-in node:sqlite (in-memory databases).
import { createSqliteRepository } from '@/data/sqlite/sqlite-repository';
import { MIGRATIONS, migrate } from '@/data/sqlite/schema';
import { chq, loan, runRepositoryContract } from '@/data/memory/repository-contract';

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
    expect(db.raw.prepare('PRAGMA user_version').get().user_version).toBe(2);
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
