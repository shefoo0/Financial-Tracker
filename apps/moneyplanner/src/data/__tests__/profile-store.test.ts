// Contract suite for both profile stores. SQLite runs on node:sqlite files kept by name,
// so a second store instance sees what the first one saved.
import { createMemoryProfileStore } from '@/data/profiles/memory-profile-store';
import { createSqliteProfileStore } from '@/data/profiles/sqlite-profile-store';
import { MAX_PROFILES, PROFILE_NAME_MAX, type ProfileStore } from '@/data/profiles/types';

jest.mock('expo-sqlite', () => {
  const { DatabaseSync } = require('node:sqlite');
  const files = new Map<string, any>();
  const deleted: string[] = [];
  const wrap = (raw: any): any => ({
    execAsync: async (sql: string) => raw.exec(sql),
    runAsync: async (sql: string, params: any[] = []) => raw.prepare(sql).run(...params),
    getAllAsync: async (sql: string, params: any[] = []) => raw.prepare(sql).all(...params),
    getFirstAsync: async (sql: string, params: any[] = []) => raw.prepare(sql).get(...params) ?? null,
    closeAsync: async () => {},
    withExclusiveTransactionAsync: async (task: (t: any) => Promise<void>) => {
      raw.exec('BEGIN');
      try {
        await task(wrap(raw));
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  });
  return {
    openDatabaseAsync: async (name: string) => {
      if (!files.has(name)) files.set(name, new DatabaseSync(':memory:'));
      return wrap(files.get(name));
    },
    deleteDatabaseAsync: async (name: string) => {
      if (name.endsWith('-wal') || name.endsWith('-shm')) throw new Error('Database does not exist');
      deleted.push(name);
      files.delete(name);
    },
    __files: files,
    __deleted: deleted,
    __reset: () => {
      files.clear();
      deleted.length = 0;
    },
  };
});

const sqliteMock = () => require('expo-sqlite') as any;

type Make = () => ProfileStore;

function runStoreContract(label: string, make: Make, restart: (s: ProfileStore) => ProfileStore) {
  describe(`${label} profile store`, () => {
    beforeEach(() => sqliteMock().__reset());

    it('first run creates Me on the original database', async () => {
      const state = await make().init();
      expect(state.profiles).toHaveLength(1);
      expect(state.profiles[0]).toMatchObject({ name: 'Me', color: 0, dbName: 'moneyplanner.db' });
      expect(state.activeProfileId).toBe(state.profiles[0].id);
      expect(state.appearance).toBe('system');
    });

    it('init is safe to repeat', async () => {
      const store = make();
      const a = await store.init();
      const b = await store.init();
      expect(b).toEqual(a);
    });

    it('adds profiles with trimmed names, unique db names, not active', async () => {
      const store = make();
      const first = await store.init();
      const p = await store.addProfile('  Sam  ', 2);
      expect(p).toMatchObject({ name: 'Sam', color: 2 });
      expect(p.dbName).toBe(`moneyplanner-${p.id}.db`);
      const q = await store.addProfile('Sam', 1);
      expect(q.dbName).not.toBe(p.dbName);
      const state = await store.init();
      expect(state.profiles.map((x) => x.name)).toEqual(['Me', 'Sam', 'Sam']);
      expect(state.activeProfileId).toBe(first.activeProfileId);
    });

    it('validates names and colours', async () => {
      const store = make();
      await store.init();
      await expect(store.addProfile('   ', 0)).rejects.toThrow();
      await expect(store.addProfile('x'.repeat(PROFILE_NAME_MAX + 1), 0)).rejects.toThrow();
      await expect(store.addProfile('x'.repeat(PROFILE_NAME_MAX), 0)).resolves.toBeTruthy();
      await expect(store.addProfile('A', -1)).rejects.toThrow();
      await expect(store.addProfile('A', 1.5)).rejects.toThrow();
      expect((await store.init()).profiles).toHaveLength(2);
    });

    it('allows at most MAX_PROFILES', async () => {
      const store = make();
      await store.init();
      for (let i = 1; i < MAX_PROFILES; i++) await store.addProfile(`P${i}`, i);
      await expect(store.addProfile('Extra', 0)).rejects.toThrow();
      expect((await store.init()).profiles).toHaveLength(MAX_PROFILES);
    });

    it('updates name and colour with the same rules', async () => {
      const store = make();
      const { profiles } = await store.init();
      const id = profiles[0].id;
      expect(await store.updateProfile(id, { name: ' Alex ' })).toMatchObject({ name: 'Alex', color: 0 });
      expect(await store.updateProfile(id, { color: 3 })).toMatchObject({ name: 'Alex', color: 3 });
      await expect(store.updateProfile(id, { name: '' })).rejects.toThrow();
      await expect(store.updateProfile(id, { color: -2 })).rejects.toThrow();
      await expect(store.updateProfile('nope', { name: 'A' })).rejects.toThrow();
      expect((await store.init()).profiles[0]).toMatchObject({ name: 'Alex', color: 3, dbName: 'moneyplanner.db' });
    });

    it('delete works for any profile; unknown ids throw', async () => {
      const store = make();
      const { profiles } = await store.init();
      const p = await store.addProfile('Sam', 1);
      await expect(store.deleteProfile('nope')).rejects.toThrow();
      await store.deleteProfile(profiles[0].id); // the active one: the next profile opens
      const after = await store.init();
      expect(after.profiles.map((x) => x.name)).toEqual(['Sam']);
      expect(after.activeProfileId).toBe(p.id);
    });

    it('deleting the last profile creates a fresh "Me" in a new file and makes it active', async () => {
      const store = make();
      const { profiles } = await store.init();
      await store.deleteProfile(profiles[0].id);
      const after = await store.init();
      expect(after.profiles).toHaveLength(1);
      expect(after.profiles[0]).toMatchObject({ name: 'Me', color: 0 });
      expect(after.profiles[0].id).not.toBe(profiles[0].id);
      expect(after.profiles[0].dbName).not.toBe('moneyplanner.db');
      expect(after.activeProfileId).toBe(after.profiles[0].id);
    });

    it('setActiveProfile and setAppearance persist; unknown ids throw', async () => {
      const store = make();
      await store.init();
      const p = await store.addProfile('Sam', 1);
      await store.setActiveProfile(p.id);
      await store.setAppearance('dark');
      await expect(store.setActiveProfile('nope')).rejects.toThrow();
      await expect(store.setAppearance('purple' as any)).rejects.toThrow();
      const again = await restart(store).init();
      expect(again.activeProfileId).toBe(p.id);
      expect(again.appearance).toBe('dark');
      expect(again.profiles).toHaveLength(2);
    });

    it('serialises overlapping writes', async () => {
      const store = make();
      await store.init();
      await Promise.all([store.addProfile('A', 0), store.addProfile('B', 1), store.addProfile('C', 2)]);
      expect((await store.init()).profiles.map((x) => x.name)).toEqual(['Me', 'A', 'B', 'C']);
    });

    it('openRepository returns a working, separate repository per profile', async () => {
      const store = make();
      const { profiles } = await store.init();
      const sam = await store.addProfile('Sam', 1);
      const a = store.openRepository(profiles[0]);
      const b = store.openRepository(sam);
      await a.init();
      await b.init();
      await a.updateSettings({ currency: 'EUR' });
      expect((await b.getSettings()).currency).not.toBe('EUR');
      await a.close();
      await b.close();
    });
  });
}

runStoreContract(
  'sqlite',
  () => createSqliteProfileStore(),
  () => createSqliteProfileStore(),
);
// The memory store keeps its state in the instance, so "restart" is the same instance.
runStoreContract(
  'memory',
  () => createMemoryProfileStore(),
  (s) => s,
);

describe('sqlite profile store specifics', () => {
  beforeEach(() => sqliteMock().__reset());

  it('deletes the profile database file', async () => {
    const store = createSqliteProfileStore();
    await store.init();
    const p = await store.addProfile('Sam', 1);
    await store.deleteProfile(p.id);
    expect(sqliteMock().__deleted).toContain(p.dbName);
  });

  it('openRepository opens the profile file', async () => {
    const store = createSqliteProfileStore();
    const { profiles } = await store.init();
    const sam = await store.addProfile('Sam', 1);
    await store.openRepository(sam).init();
    await store.openRepository(profiles[0]).init();
    expect([...sqliteMock().__files.keys()]).toEqual(
      expect.arrayContaining(['moneyplanner-profiles.db', sam.dbName, 'moneyplanner.db']),
    );
  });

  it('falls back to the first profile when the active one is missing, and saves it', async () => {
    const store = createSqliteProfileStore();
    const { profiles } = await store.init();
    const raw = sqliteMock().__files.get('moneyplanner-profiles.db');
    raw.prepare("UPDATE kv SET value = 'gone' WHERE key = 'activeProfileId'").run();
    const again = await createSqliteProfileStore().init();
    expect(again.activeProfileId).toBe(profiles[0].id);
    expect(raw.prepare("SELECT value FROM kv WHERE key = 'activeProfileId'").get().value).toBe(profiles[0].id);
  });
});

describe('memory profile store specifics', () => {
  it('keeps one repository per profile and seeds the first', async () => {
    const store = createMemoryProfileStore({ seed: { settings: { currency: 'USD' } as any } });
    const { profiles } = await store.init();
    const repo = store.openRepository(profiles[0]);
    expect(store.repositoryFor(profiles[0].id)).toBe(repo);
    expect(store.openRepository(profiles[0])).toBe(repo);
    await repo.init();
    expect((await repo.getSettings()).currency).toBe('USD');
    const sam = await store.addProfile('Sam', 1);
    expect(store.repositoryFor(sam.id)).toBeUndefined();
    const other = store.openRepository(sam);
    await other.init();
    expect((await other.getSettings()).currency).not.toBe('USD');
    await store.deleteProfile(sam.id);
    expect(store.repositoryFor(sam.id)).toBeUndefined();
  });
});
