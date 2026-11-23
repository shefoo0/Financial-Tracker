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
  // v2 (M2): debts (loans, cards, instalment plans), their payment log and schedule changes, cheques
  `
  CREATE TABLE debts (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    fields TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE debt_payments (
    id TEXT PRIMARY KEY NOT NULL,
    debt_id TEXT NOT NULL,
    date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    kind TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE debt_overrides (
    id TEXT PRIMARY KEY NOT NULL,
    debt_id TEXT NOT NULL,
    original_date TEXT NOT NULL,
    new_date TEXT,
    new_amount INTEGER,
    skip INTEGER NOT NULL DEFAULT 0,
    UNIQUE (debt_id, original_date)
  );
  CREATE TABLE cheques (
    id TEXT PRIMARY KEY NOT NULL,
    payee TEXT NOT NULL,
    amount INTEGER NOT NULL,
    date TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    series_id TEXT,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_debt_payments_debt ON debt_payments (debt_id, date);
  CREATE INDEX idx_cheques_date ON cheques (date);
  `,
  // v3: optional monthly limit per category (fils)
  `
  ALTER TABLE categories ADD COLUMN monthly_limit INTEGER;
  `,
  // v4 (M3): statement import: finished imports, the column layout remembered per source, learned category rules
  `
  CREATE TABLE imports (
    id TEXT PRIMARY KEY NOT NULL,
    source_name TEXT NOT NULL,
    file_kind TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    row_count INTEGER NOT NULL
  );
  CREATE TABLE import_templates (
    source_name TEXT PRIMARY KEY NOT NULL,
    mapping TEXT NOT NULL,
    last_used TEXT NOT NULL
  );
  CREATE TABLE category_rules (
    id TEXT PRIMARY KEY NOT NULL,
    pattern TEXT NOT NULL UNIQUE COLLATE NOCASE,
    category_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_transactions_import ON transactions (import_id);
  `,
  // v5: balance snapshots (the balance the user set on a date), the anchors of the balance history chart
  `
  CREATE TABLE balance_snapshots (
    date TEXT PRIMARY KEY NOT NULL,
    balance INTEGER NOT NULL
  );
  `,
  // v6 (M3b): money accounts besides the main one, and the account / card of items, imports and import layouts.
  // NULL account_id is the main account and NULL card_id is "not on a card", so existing data needs no copying.
  `
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    starting_balance INTEGER NOT NULL,
    starting_balance_date TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  ALTER TABLE transactions ADD COLUMN account_id TEXT;
  ALTER TABLE transactions ADD COLUMN card_id TEXT;
  ALTER TABLE recurring_items ADD COLUMN account_id TEXT;
  ALTER TABLE recurring_items ADD COLUMN card_id TEXT;
  ALTER TABLE imports ADD COLUMN account_id TEXT;
  ALTER TABLE imports ADD COLUMN card_id TEXT;
  ALTER TABLE import_templates ADD COLUMN account_id TEXT;
  ALTER TABLE import_templates ADD COLUMN card_id TEXT;
  CREATE INDEX idx_transactions_account ON transactions (account_id);
  CREATE INDEX idx_transactions_card ON transactions (card_id);
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
