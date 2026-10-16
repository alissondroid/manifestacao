import crypto from 'node:crypto';
import { db } from './db.js';
import { ACCOUNT } from '../shared/config.js';

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const COOKIE = 'sid';

// ---------- Senhas (scrypt) ----------

const scrypt = (password, salt) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)));
});

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [saltHex, keyHex] = String(stored).split(':');
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'));
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// Hash falso para igualar o tempo de resposta quando o e-mail não existe.
let dummyHash;
export async function burnPasswordTime(password) {
  dummyHash ??= await hashPassword('dummy-password');
  await verifyPassword(password, dummyHash);
}

// ---------- Sessões ----------

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), userId, Date.now() + SESSION_MS);
  return token;
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

/** Exclui os dados pessoais da conta. O usuário vira "Excluído<id>" (os pedidos pagos são mantidos por obrigação fiscal). */
export function deleteAccount(userId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const old = db.prepare('SELECT nick FROM users WHERE id = ?').get(userId);
    if (old) db.prepare('DELETE FROM race_times WHERE nick = ?').run(old.nick); // recordes públicos com o apelido da conta
    for (const table of ['sessions', 'owned', 'equipped', 'designs', 'inventory']) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
    }
    db.prepare("UPDATE users SET email = ?, nick = ?, pass_hash = '', google_sub = NULL, vip_until = 0, terms_at = NULL WHERE id = ?")
      .run(`excluido-${userId}@invalid.local`, `Excluído${userId}`, userId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function userFromToken(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.nick, u.email, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(sha256(token));
  if (!row || row.expires_at < Date.now()) return null;
  return { id: row.id, nick: row.nick, email: row.email };
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const raw = part.slice(i + 1).trim();
    let value = raw;
    try { value = decodeURIComponent(raw); } catch { /* cookie malformado: usa como veio */ }
    out[part.slice(0, i).trim()] = value;
  }
  return out;
}

export const tokenFromRequest = (req) => parseCookies(req.headers.cookie)[COOKIE];
export const userFromRequest = (req) => userFromToken(tokenFromRequest(req));

export function sessionCookie(token, { secure }) {
  const attrs = [`${COOKIE}=${token}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${SESSION_MS / 1000}`];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export const clearCookie = ({ secure }) => `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;

// ---------- Limite de tentativas (em memória) ----------

const hits = new Map();

/** Retorna true se ainda há cota. */
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, list] of hits) if (!list.some((t) => now - t < 3600_000)) hits.delete(k);
}, 600_000).unref();

// ---------- Validação ----------

export const validEmail = (e) => typeof e === 'string' && e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
export const validNick = (n) => typeof n === 'string'
  && n.length >= ACCOUNT.nickMin && n.length <= ACCOUNT.nickMax
  && /^[\p{L}\p{N}_.\- ]+$/u.test(n) && n === n.trim();
export const validPassword = (p) => typeof p === 'string' && p.length >= ACCOUNT.passwordMin && p.length <= 200;

export const nickTaken = (nick) => !!db.prepare('SELECT 1 FROM users WHERE nick = ?').get(nick);

/** Sugere um apelido válido e livre a partir do nome ou do e-mail da conta Google. */
export function suggestNick(name, email) {
  const clean = (t) => String(t ?? '').normalize('NFC').replace(/[^\p{L}\p{N}_.\- ]/gu, '').trim().slice(0, ACCOUNT.nickMax - 3).trim();
  let base = clean(name) || clean(String(email ?? '').split('@')[0]);
  if (base.length < ACCOUNT.nickMin) base = 'Jogador';
  if (validNick(base) && !nickTaken(base)) return base;
  for (let i = 0; i < 50; i += 1) {
    const n = `${base}${Math.floor(100 + Math.random() * 900)}`;
    if (validNick(n) && !nickTaken(n)) return n;
  }
  return `Jogador${Date.now() % 100000}`;
}
