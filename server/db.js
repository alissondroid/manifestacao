import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DB_PATH = process.env.DB_PATH || path.join(root, 'data', 'avenida.db');

if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    nick       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash  TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id           TEXT PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    item_id      TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    provider     TEXT NOT NULL,
    provider_ref TEXT,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   INTEGER NOT NULL,
    paid_at      INTEGER
  );

  CREATE TABLE IF NOT EXISTS owned (
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id  TEXT NOT NULL,
    order_id TEXT,
    PRIMARY KEY (user_id, item_id)
  );

  CREATE TABLE IF NOT EXISTS designs (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind    TEXT NOT NULL,
    json    TEXT NOT NULL,
    PRIMARY KEY (user_id, kind)
  );

  CREATE TABLE IF NOT EXISTS race_times (
    id      INTEGER PRIMARY KEY,
    nick    TEXT NOT NULL,
    side    INTEGER NOT NULL,
    time_ms INTEGER NOT NULL,
    at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS equipped (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot    TEXT NOT NULL,
    item_id TEXT NOT NULL,
    PRIMARY KEY (user_id, slot)
  );
`);

// Item retirado do catálogo (bandeira nas costas): tira de quem estava com ele equipado.
db.prepare("DELETE FROM equipped WHERE item_id = 'capa-brasil'").run();

// Limpeza de sessões vencidas.
export const purgeSessions = () => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
purgeSessions();
setInterval(purgeSessions, 60 * 60 * 1000).unref();

/** Executa `fn` numa transação. */
export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
