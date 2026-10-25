import crypto from 'node:crypto';
import { db } from './db.js';
import { ACCOUNT } from '../shared/config.js';
import { isReservedNick } from './rules.js';

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const COOKIE = 'sid';

// ---------- Senhas (scrypt) ----------

// Parâmetros atuais (OWASP: N=2^15, r=8, p=3, 32 MiB). O hash guarda os próprios parâmetros ("s1$N$r$p$sal$chave"),
// então dá para endurecer de novo no futuro; hashes antigos ("sal:chave", N=2^14) continuam valendo e são regravados no login.
const SCRYPT = { N: 1 << 15, r: 8, p: 3 };
const LEGACY = { N: 1 << 14, r: 8, p: 1 };
const MAXMEM = 128 * 1024 * 1024;

const scrypt = (password, salt, { N, r, p }) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, 64, { N, r, p, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key)));
});

const HEX = (n) => new RegExp(`^[0-9a-f]{${n}}$`);

/** Lê o hash guardado; recusa formatos fora do esperado e parâmetros que poderiam estourar a memória. */
function parseHash(stored) {
  const text = String(stored);
  if (text.startsWith('s1$')) {
    const [, n, r, p, salt, key] = text.split('$');
    const N = Number(n);
    const params = { N, r: Number(r), p: Number(p) };
    const okParams = Number.isInteger(Math.log2(N)) && N >= 1 << 14 && N <= 1 << 16 && params.r === 8 && params.p >= 1 && params.p <= 4;
    if (!okParams || !HEX(32).test(salt ?? '') || !HEX(128).test(key ?? '')) return null;
    return { params, salt: Buffer.from(salt, 'hex'), key: Buffer.from(key, 'hex') };
  }
  const [salt, key] = text.split(':');
  if (!HEX(32).test(salt ?? '') || !HEX(128).test(key ?? '')) return null;
  return { params: LEGACY, salt: Buffer.from(salt, 'hex'), key: Buffer.from(key, 'hex') };
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT);
  return `s1$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export const needsRehash = (stored) => {
  const parsed = parseHash(stored);
  return !parsed || parsed.params.N !== SCRYPT.N || parsed.params.r !== SCRYPT.r || parsed.params.p !== SCRYPT.p;
};

// Hash falso para igualar o tempo de resposta quando o e-mail não existe (ou a conta não tem senha, como as do Google).
let dummyHash;
export async function burnPasswordTime(password) {
  dummyHash ??= await hashPassword('dummy-password');
  await verifyPassword(password, dummyHash);
}

export async function verifyPassword(password, stored) {
  const parsed = parseHash(stored);
  if (!parsed) { await burnPasswordTime(password); return false; }
  const key = await scrypt(password, parsed.salt, parsed.params);
  return key.length === parsed.key.length && crypto.timingSafeEqual(key, parsed.key);
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

/** Exclui a conta e os dados pessoais dela (e-mail, senha, sessões, itens e desenhos). */
export function deleteAccount(userId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const old = db.prepare('SELECT nick FROM users WHERE id = ?').get(userId);
    if (old) db.prepare('DELETE FROM race_times WHERE nick = ?').run(old.nick); // recordes públicos com o apelido da conta
    db.prepare('DELETE FROM users WHERE id = ?').run(userId); // sessões, itens equipados e desenhos saem em cascata
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
  && /^[\p{L}\p{N}_.\- ]+$/u.test(n) && n === n.trim() && !isReservedNick(n);
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
