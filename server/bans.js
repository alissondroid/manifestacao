import { db } from './db.js';

// Banimentos. A chave identifica a pessoa: conta (`u12`) ou IP (`ip:1.2.3.4`), as mesmas usadas nas denúncias.
// `until` em ms (0 = permanente). Gerenciados pela API de administração (ADMIN_TOKEN).

export const keysOf = ({ ip, userId }) => [ip ? `ip:${ip}` : null, userId ? `u${userId}` : null].filter(Boolean);

export function isBanned(keys, now = Date.now()) {
  for (const key of keys) {
    const row = db.prepare('SELECT * FROM bans WHERE key = ? AND (until = 0 OR until > ?) ORDER BY id DESC LIMIT 1').get(key, now);
    if (row) return row;
  }
  return null;
}

export function addBan(key, { minutes = 0, reason = '' } = {}, now = Date.now()) {
  const until = minutes > 0 ? now + minutes * 60_000 : 0;
  return Number(db.prepare('INSERT INTO bans (key, reason, at, until) VALUES (?, ?, ?, ?)')
    .run(key, String(reason).slice(0, 200), now, until).lastInsertRowid);
}

export const removeBan = (id) => db.prepare('DELETE FROM bans WHERE id = ?').run(id).changes > 0;

export const listBans = (now = Date.now()) => db.prepare('SELECT * FROM bans WHERE until = 0 OR until > ? ORDER BY id DESC LIMIT 200').all(now);

export const VALID_KEY = /^(u\d{1,12}|ip:[0-9a-f:.]{3,45})$/i;

/** Aceita `key` direto, ou `nick`: conta com esse apelido ou, para convidados, o alvo da denúncia mais recente com esse apelido. */
export function resolveKey({ key, nick }) {
  if (typeof key === 'string' && VALID_KEY.test(key)) return key;
  if (typeof nick !== 'string' || !nick.trim()) return null;
  const user = db.prepare('SELECT id FROM users WHERE nick = ?').get(nick.trim());
  if (user) return `u${user.id}`;
  return db.prepare('SELECT target_key FROM reports WHERE target_nick = ? ORDER BY id DESC LIMIT 1').get(nick.trim().toLowerCase())?.target_key ?? null;
}
