import type Database from 'better-sqlite3';

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export function runMigrations(db: Database.Database): void {
  const versionRow = db.pragma('user_version', { simple: true }) as number;

  if (versionRow >= 3) {
    return;
  }

  // Check if observations table exists (migrating an existing v2 database)
  const tableCheck = db
    .prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='observations'")
    .get() as { count: number };

  if (tableCheck && tableCheck.count > 0) {
    const columns = db.pragma('table_info(observations)') as ColumnInfo[];
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has('authority_tier')) {
      db.exec(
        "ALTER TABLE observations ADD COLUMN authority_tier TEXT NOT NULL DEFAULT 'contextual' CHECK(authority_tier IN ('invariant', 'architectural', 'contextual', 'ephemeral'))"
      );
    }

    if (!columnNames.has('derived_from')) {
      db.exec("ALTER TABLE observations ADD COLUMN derived_from TEXT NOT NULL DEFAULT '[]'");
    }

    if (!columnNames.has('access_count')) {
      db.exec('ALTER TABLE observations ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0');
    }

    if (!columnNames.has('last_accessed_at')) {
      db.exec('ALTER TABLE observations ADD COLUMN last_accessed_at TEXT');
    }

    if (!columnNames.has('status')) {
      db.exec(
        "ALTER TABLE observations ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'stale', 'invalidated', 'superseded', 'decayed'))"
      );
    }

    // Auto-update superseded status if superseded is set
    try {
      db.exec("UPDATE observations SET status = 'superseded' WHERE supersedes IS NOT NULL AND status = 'active'");
    } catch {
      // Ignore if column doesn't match yet
    }
  }

  // Drop deprecated bridge tables if present
  try {
    db.exec('DROP TABLE IF EXISTS bridge_servers;');
  } catch {
    // Ignore
  }

  db.pragma('user_version = 3');
}
