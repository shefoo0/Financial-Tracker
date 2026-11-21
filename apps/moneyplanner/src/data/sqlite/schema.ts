// Database schema, versioned with PRAGMA user_version. To change the schema in
// a later milestone, APPEND a new entry to MIGRATIONS (never edit old ones).
export const DB_NAME = 'moneyplanner.db';

export const MIGRATIONS: string[] = [
  // v1 (M1): settings, categories, recurring items, overrides, transactions
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  CREATE TABLE categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    sort INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE recurring_items (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    category_id TEXT,
    amount INTEGER NOT NULL,
    schedule TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    count INTEGER,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE occurrence_overrides (
    id TEXT PRIMARY KEY NOT NULL,
    recurring_id TEXT NOT NULL,
    original_date TEXT NOT NULL,
    skip INTEGER NOT NULL DEFAULT 0,
    new_date TEXT,
    new_amount INTEGER,
    paid INTEGER NOT NULL DEFAULT 0,
    UNIQUE (recurring_id, original_date)
  );
  CREATE TABLE transactions (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    category_id TEXT,
    amount INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL,
    import_id TEXT,
    planned INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_transactions_date ON transactions (date);
  CREATE INDEX idx_overrides_recurring ON occurrence_overrides (recurring_id);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export interface MigratableDb {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string): Promise<T | null>;
}

/** Brings the database up to SCHEMA_VERSION. Each migration runs in its own transaction. */
export async function migrate(db: MigratableDb): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version > SCHEMA_VERSION) {
    throw new Error('This data was saved by a newer version of the app.');
  }
  while (version < SCHEMA_VERSION) {
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
