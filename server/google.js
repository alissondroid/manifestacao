import crypto from 'node:crypto';

// Login com Google (Google Identity Services). O navegador entrega um ID token (JWT RS256);
// aqui ele é verificado com as chaves públicas do Google, sem chamar nenhuma API por login.
export const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
// Só fora de produção dá para apontar as chaves para outro lugar (testes).
export const certsUrl = () => (process.env.NODE_ENV !== 'production' && process.env.GOOGLE_CERTS_URL) || CERTS_URL;

const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const SKEW_S = 60;
const KEYS_TTL_MS = 60 * 60_000;

let cache = { url: '', keys: new Map(), at: 0 };

async function loadKeys(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`chaves do Google indisponíveis (${res.status})`);
  const { keys } = await res.json();
  cache = { url, keys: new Map(keys.map((k) => [k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })])), at: Date.now() };
}

async function keyFor(kid, url) {
  const stale = cache.url !== url || Date.now() - cache.at > KEYS_TTL_MS;
  if (stale || !cache.keys.has(kid)) await loadKeys(url); // kid novo: o Google trocou as chaves
  return cache.keys.get(kid);
}

const parse = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/** Valida o ID token e devolve { sub, email, name }. Lança erro se algo não bater. */
export async function verifyGoogleToken(token, { clientId = GOOGLE_CLIENT_ID, certsUrl: url = certsUrl(), now = Date.now() } = {}) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) throw new Error('token malformado');
  const header = parse(parts[0]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('algoritmo não aceito');
  const key = await keyFor(header.kid, url);
  if (!key) throw new Error('chave desconhecida');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('assinatura inválida');
  const c = parse(parts[1]);
  if (!clientId || c.aud !== clientId) throw new Error('token de outro aplicativo');
  if (!ISSUERS.has(c.iss)) throw new Error('emissor inválido');
  if (!(c.exp > now / 1000 - SKEW_S)) throw new Error('token vencido');
  if (c.email_verified !== true && c.email_verified !== 'true') throw new Error('e-mail não verificado');
  if (!c.sub || !c.email) throw new Error('token sem identificação');
  return { sub: String(c.sub), email: String(c.email).toLowerCase(), name: String(c.name ?? '') };
}
