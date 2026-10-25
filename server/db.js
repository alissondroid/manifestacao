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

  CREATE TABLE IF NOT EXISTS reports (
    id            INTEGER PRIMARY KEY,
    at            INTEGER NOT NULL,
    reporter_nick TEXT NOT NULL,
    reporter_key  TEXT NOT NULL,
    target_nick   TEXT NOT NULL,
    target_key    TEXT NOT NULL,
    context       TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS reports_target ON reports (target_nick, at);

  CREATE TABLE IF NOT EXISTS bans (
    id     INTEGER PRIMARY KEY,
    key    TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    at     INTEGER NOT NULL,
    until  INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS bans_key ON bans (key);

  CREATE TABLE IF NOT EXISTS equipped (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot    TEXT NOT NULL,
    item_id TEXT NOT NULL,
    PRIMARY KEY (user_id, slot)
  );

  CREATE TABLE IF NOT EXISTS stats (
    day   TEXT NOT NULL,
    event TEXT NOT NULL,
    src   TEXT NOT NULL,
    n     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, event, src)
  );
`);

if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'terms_at')) {
  db.exec('ALTER TABLE users ADD COLUMN terms_at INTEGER'); // quando aceitou os Termos e a Política (LGPD: prova do consentimento)
}
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'google_sub')) {
  db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT'); // identificador da conta Google (login sem senha)
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL');

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
