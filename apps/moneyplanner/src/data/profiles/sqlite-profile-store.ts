// Device state (profiles, active profile, appearance) in its own small database,
// separate from every profile's data.
import * as SQLite from 'expo-sqlite';

import { createProfileStoreCore, type ProfileBackend } from '@/data/memory/profile-store-core';
import { createSqliteRepository } from '@/data/sqlite/sqlite-repository';
import type { Appearance, DeviceState, Profile, ProfileStore } from './types';

export const PROFILES_DB_NAME = 'moneyplanner-profiles.db';

// Versioned with PRAGMA user_version. APPEND new entries, never edit old ones.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE profiles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    color INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    db_name TEXT NOT NULL
  );
  CREATE TABLE kv (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

async function migrate(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version > MIGRATIONS.length) throw new Error('This data was saved by a newer version of the app.');
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    version += 1;
    try {
      await db.execAsync(`BEGIN;\n${sql}\nPRAGMA user_version = ${version};\nCOMMIT;`);
    } catch (e) {
      await db.execAsync('ROLLBACK;').catch(() => {});
      throw e;
    }
  }
}

export function createSqliteProfileStore(): ProfileStore {
  let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
  const getDb = () => {
    if (!dbPromise) {
      dbPromise = (async () => {
        const db = await SQLite.openDatabaseAsync(PROFILES_DB_NAME);
        await db.execAsync('PRAGMA busy_timeout = 5000;');
        await migrate(db);
        return db;
      })().catch((e) => {
        dbPromise = null;
        throw e;
      });
    }
    return dbPromise;
  };

  const backend: ProfileBackend = {
    async load() {
      const db = await getDb();
      const rows = await db.getAllAsync<Record<string, any>>('SELECT * FROM profiles ORDER BY created_at, rowid');
      if (rows.length === 0) return null;
      const kv = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM kv');
      const get = (k: string) => kv.find((r) => r.key === k)?.value;
      const profiles: Profile[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        createdAt: r.created_at,
        dbName: r.db_name,
      }));
      return {
        profiles,
        activeProfileId: get('activeProfileId') ?? '',
        appearance: (get('appearance') as Appearance | undefined) ?? 'system',
      };
    },
    async save(state: DeviceState) {
      const db = await getDb();
      await db.execAsync('BEGIN;');
      try {
        await db.runAsync('DELETE FROM profiles');
        for (const p of state.profiles) {
          await db.runAsync('INSERT INTO profiles (id, name, color, created_at, db_name) VALUES (?, ?, ?, ?, ?)', [
            p.id,
            p.name,
            p.color,
            p.createdAt,
            p.dbName,
          ]);
        }
        const upsert = 'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';
        await db.runAsync(upsert, ['activeProfileId', state.activeProfileId]);
        await db.runAsync(upsert, ['appearance', state.appearance]);
        await db.execAsync('COMMIT;');
      } catch (e) {
        await db.execAsync('ROLLBACK;').catch(() => {});
        throw e;
      }
    },
    async removeData(profile: Profile) {
      // The file may never have been created (profile never opened): that is fine.
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          await SQLite.deleteDatabaseAsync(profile.dbName + suffix);
        } catch (e) {
          if (!/exist|not found|no such/i.test(String((e as Error)?.message ?? e))) throw e;
        }
      }
    },
  };

  return createProfileStoreCore(backend, (profile) => createSqliteRepository(profile.dbName));
}
