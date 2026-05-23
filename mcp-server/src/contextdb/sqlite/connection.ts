import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type SqliteDatabase = InstanceType<typeof DatabaseSync>;

const dbConnections = new Map<string, SqliteDatabase>();
let transactionCounter = 0;

export function getConnection(dbPath: string): SqliteDatabase {
  const cached = dbConnections.get(dbPath);
  if (cached) return cached;

  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  dbConnections.set(dbPath, db);
  return db;
}

export function closeConnection(dbPath: string): void {
  const cached = dbConnections.get(dbPath);
  if (!cached) return;
  try {
    cached.close();
  } finally {
    dbConnections.delete(dbPath);
  }
}

export function closeSqliteSidecar(dbPath: string): void {
  closeConnection(dbPath);
}

export function runTransaction(db: SqliteDatabase, fn: () => void): void {
  transactionCounter += 1;
  const savepoint = `aios_tx_${transactionCounter}`;
  db.exec(`SAVEPOINT ${savepoint};`);
  try {
    fn();
    db.exec(`RELEASE ${savepoint};`);
  } catch (error) {
    try {
      db.exec(`ROLLBACK TO ${savepoint};`);
    } finally {
      db.exec(`RELEASE ${savepoint};`);
    }
    throw error;
  }
}
