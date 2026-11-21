// Runs the contract suite against the real SQLite repository code, with expo-sqlite
// replaced by an adapter over Node's built-in node:sqlite (in-memory databases).
import { createSqliteRepository } from '@/data/sqlite/sqlite-repository';
import { MIGRATIONS, migrate } from '@/data/sqlite/schema';
import { runRepositoryContract } from '@/data/memory/repository-contract';

jest.mock('expo-sqlite', () => {
  const { DatabaseSync } = require('node:sqlite');
  const make = () => {
    const raw = new DatabaseSync(':memory:');
    // Like the real thing, the exclusive transaction is a second connection: while it is open,
    // writes on the main connection fail with "database is locked" (and so does a second transaction).
    let inTxn = false;
    const db: any = {
      raw,
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
  return { openDatabaseAsync: async () => make(), __make: make };
});

runRepositoryContract('sqlite', async () => createSqliteRepository());

describe('sqlite specifics', () => {
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
