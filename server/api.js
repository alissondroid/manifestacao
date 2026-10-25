import { db } from './db.js';
import {
  hashPassword, verifyPassword, needsRehash, burnPasswordTime, createSession, destroySession,
  userFromRequest, tokenFromRequest, sessionCookie, clearCookie, rateLimit, deleteAccount,
  validEmail, validNick, validPassword, suggestNick,
} from './auth.js';
import { GOOGLE_CLIENT_ID, verifyGoogleToken } from './google.js';
import { equippedMap, equip, designsOf, saveDesign } from './items.js';
import { filterText } from './moderation.js';
import { clientIp } from './ip.js';
import { isReservedNick } from './rules.js';
import {
  addBan, removeBan, listBans, resolveKey,
} from './bans.js';
import crypto from 'node:crypto';
import {
  SHOP, SLOTS, DESIGN,
} from '../shared/config.js';

// Atrás de proxy (Vite em dev, Caddy em produção) o endereço público vem em X-Forwarded-*. Em produção só vale com
// TRUST_PROXY=1: sem isso qualquer cliente poderia forjar esses cabeçalhos.
const TRUST_FWD = process.env.TRUST_PROXY === '1' || process.env.NODE_ENV !== 'production';
const fwd = (req, name) => (TRUST_FWD ? req.headers[name] : undefined);
const isHttps = (req) => fwd(req, 'x-forwarded-proto') === 'https' || (process.env.PUBLIC_URL || '').startsWith('https');
const publicHost = (req) => fwd(req, 'x-forwarded-host') || req.headers.host;

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const onData = (c) => {
      size += c.length;
      if (size > limit) {
        chunks.length = 0;
        req.off('data', onData); // para de guardar; quem responde 413 fecha a conexão
        reject(Object.assign(new Error('Corpo grande demais'), { status: 413 }));
        return;
      }
      chunks.push(c);
    };
    req.on('data', onData);
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
    throw Object.assign(new Error('Content-Type deve ser application/json'), { status: 415 });
  }
  try { return JSON.parse((await readBody(req)).toString('utf8')) || {}; } catch (e) {
    throw Object.assign(new Error(e.status ? e.message : 'JSON inválido'), { status: e.status || 400 });
  }
}

// Defesa contra CSRF: o cookie é SameSite=Lax e exigimos JSON; aqui conferimos também a origem.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === publicHost(req); } catch { return false; }
}

const TRACK_EVENTS = ['visit', 'new', 'enter', 'share'];
const brDay = (at = Date.now()) => new Date(at - 3 * 3600_000).toISOString().slice(0, 10);
function recordEvent(event, rawSrc) {
  if (!TRACK_EVENTS.includes(event)) return false;
  let src = String(rawSrc ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'direto';
  const day = brDay();
  const known = db.prepare('SELECT 1 FROM stats WHERE day = ? AND src = ? LIMIT 1').get(day, src);
  if (!known && db.prepare('SELECT COUNT(DISTINCT src) c FROM stats WHERE day = ?').get(day).c >= 100) src = 'outros'; // quem inventa origens não incha o banco
  db.prepare('INSERT INTO stats (day, event, src, n) VALUES (?, ?, ?, 1) ON CONFLICT (day, event, src) DO UPDATE SET n = n + 1').run(day, event, src);
  return true;
}
function statsSummary(days) {
  const since = brDay(Date.now() - (Math.min(365, Math.max(1, days)) - 1) * 86_400_000);
  const rows = db.prepare('SELECT day, event, src, n FROM stats WHERE day >= ? ORDER BY day DESC').all(since);
  const total = {};
  const byDay = {};
  for (const r of rows) {
    ((total[r.event] ??= {})[r.src] = (total[r.event][r.src] || 0) + r.n);
    ((byDay[r.day] ??= {})[r.event] = (byDay[r.day][r.event] || 0) + r.n);
  }
  for (const e of TRACK_EVENTS) total[e] ??= {};
  return { total, days: Object.entries(byDay).map(([day, events]) => ({ day, ...events })) };
}

// Administração: só existe com ADMIN_TOKEN (16+ caracteres) definido; autenticada por `Authorization: Bearer <token>`.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const ADMIN_ENABLED = ADMIN_TOKEN.length >= 16;
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
const isAdmin = (req) => {
  const given = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1] ?? '';
  return crypto.timingSafeEqual(sha(given), sha(ADMIN_TOKEN));
};

const accountPayload = (user) => (user
  ? {
    user: { nick: user.nick, email: user.email, google: !!db.prepare('SELECT google_sub FROM users WHERE id = ?').get(user.id)?.google_sub },
    equipped: equippedMap(user.id),
    custom: designsOf(user.id),
  }
  : { user: null, equipped: {}, custom: {} });

/**
 * Trata rotas /api/*. Retorna true se tratou a requisição.
 * hooks.onEquip(userId) avisa o jogo para atualizar o visual de quem está online.
 */
export async function handleApi(req, res, hooks = {}) {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  if (!pathname.startsWith('/api/')) return false;

  try {
    const method = req.method;

    if (pathname.startsWith('/api/admin/')) {
      if (!ADMIN_ENABLED) return json(res, 404, { error: 'Não encontrado' }), true;
      if (!rateLimit(`admin:${clientIp(req)}`, 60, 10 * 60_000)) return json(res, 429, { error: 'Muitas tentativas.' }), true;
      if (!isAdmin(req)) return json(res, 401, { error: 'Não autorizado.' }), true;
      if (method === 'GET' && pathname === '/api/admin/reports') {
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
        const rows = db.prepare('SELECT id, at, target_nick, target_key, reporter_nick, reporter_key, context FROM reports ORDER BY id DESC LIMIT ?').all(limit);
        return json(res, 200, { reports: rows.map((r) => ({ ...r, context: JSON.parse(r.context) })) }), true;
      }
      if (method === 'GET' && pathname === '/api/admin/bans') return json(res, 200, { bans: listBans() }), true;
      if (method === 'POST' && pathname === '/api/admin/ban') {
        const body = await readJson(req);
        const key = resolveKey(body);
        if (!key) return json(res, 400, { error: 'Informe key (u12 ou ip:1.2.3.4) ou o apelido de alguém conhecido.' }), true;
        const minutes = Math.max(0, Math.min(525_600, Number(body.minutes) || 0));
        const id = addBan(key, { minutes, reason: body.reason });
        hooks.onBan?.(key);
        return json(res, 200, { id, key, minutes }), true;
      }
      if (method === 'POST' && pathname === '/api/admin/unban') {
        const body = await readJson(req);
        return json(res, 200, { removed: removeBan(Number(body.id)) }), true;
      }
      if (method === 'POST' && pathname === '/api/admin/show') return hooks.onShow?.(), json(res, 200, { ok: true }), true;
      if (method === 'GET' && pathname === '/api/admin/stats') return json(res, 200, statsSummary(Number(url.searchParams.get('days')) || 30)), true;
      return json(res, 404, { error: 'Não encontrado' }), true;
    }

    const user = userFromRequest(req);
    const secure = isHttps(req);

    if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(req)) {
      return json(res, 403, { error: 'Origem não permitida' }), true;
    }

    // ---------- Conta ----------

    // Métricas de divulgação sem cookie e sem dado pessoal: só contadores por dia, evento e origem (?src=).
    if (method === 'POST' && pathname === '/api/track') {
      if (!rateLimit(`track:${clientIp(req)}`, 60, 10 * 60_000)) return res.writeHead(204).end(), true;
      const body = await readJson(req);
      if (!recordEvent(body.event, body.src)) return json(res, 400, { error: 'Evento inválido' }), true;
      return res.writeHead(204).end(), true;
    }

    if (method === 'GET' && pathname === '/api/me') {
      return json(res, 200, { ...accountPayload(user), items: SHOP, googleClientId: GOOGLE_CLIENT_ID || null }), true;
    }

    if (method === 'POST' && pathname === '/api/auth/register') {
      if (!rateLimit(`reg:${clientIp(req)}`, 10, 10 * 60_000)) return json(res, 429, { error: 'Muitas tentativas. Aguarde um pouco.' }), true;
      const body = await readJson(req);
      const email = String(body.email ?? '').trim();
      const nick = String(body.nick ?? '').trim();
      const password = body.password;
      if (body.terms !== true) return json(res, 400, { error: 'Aceite os Termos de uso e a Política de privacidade para criar a conta.' }), true;
      if (!validEmail(email)) return json(res, 400, { error: 'E-mail inválido.' }), true;
      if (isReservedNick(nick)) return json(res, 400, { error: 'Esse apelido é reservado. Escolha outro.' }), true;
      if (!validNick(nick)) return json(res, 400, { error: 'Apelido: 3 a 16 caracteres (letras, números, espaço, _ . -).' }), true;
      if (!validPassword(password)) return json(res, 400, { error: 'A senha precisa ter pelo menos 8 caracteres.' }), true;
      if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return json(res, 409, { error: 'Esse e-mail já tem conta.' }), true;
      if (db.prepare('SELECT 1 FROM users WHERE nick = ?').get(nick)) return json(res, 409, { error: 'Esse apelido já está em uso.' }), true;

      const passHash = await hashPassword(password);
      let id;
      try {
        id = Number(db.prepare('INSERT INTO users (email, nick, pass_hash, created_at, terms_at) VALUES (?, ?, ?, ?, ?)')
          .run(email, nick, passHash, Date.now(), Date.now()).lastInsertRowid);
      } catch {
        return json(res, 409, { error: 'E-mail ou apelido já em uso.' }), true; // corrida entre duas contas
      }
      const token = createSession(id);
      return json(res, 201, accountPayload({ id, nick, email }), { 'set-cookie': sessionCookie(token, { secure }) }), true;
    }

    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await readJson(req);
      const email = String(body.email ?? '').trim().toLowerCase();
      if (!rateLimit(`login:${clientIp(req)}`, 15, 10 * 60_000) || !rateLimit(`login-email:${email}`, 8, 10 * 60_000)) {
        return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' }), true;
      }
      const row = typeof body.password === 'string' && validEmail(email)
        ? db.prepare('SELECT id, nick, email, pass_hash FROM users WHERE email = ?').get(email)
        : null;
      const ok = row ? await verifyPassword(body.password, row.pass_hash) : (await burnPasswordTime(String(body.password ?? '')), false);
      if (!ok) return json(res, 401, { error: 'E-mail ou senha incorretos.' }), true;
      if (needsRehash(row.pass_hash)) { // senha no formato antigo: regrava com os parâmetros atuais (a senha acabou de ser confirmada)
        db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(await hashPassword(body.password), row.id);
      }
      const token = createSession(row.id);
      return json(res, 200, accountPayload(row), { 'set-cookie': sessionCookie(token, { secure }) }), true;
    }

    // Login com Google: entra, vincula a conta de e-mail ou cria uma nova (pedindo apelido e aceite dos Termos).
    if (method === 'POST' && pathname === '/api/auth/google') {
      if (!GOOGLE_CLIENT_ID) return json(res, 404, { error: 'Não encontrado' }), true;
      if (!rateLimit(`google:${clientIp(req)}`, 30, 10 * 60_000)) return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' }), true;
      const body = await readJson(req);
      let g;
      try {
        g = await verifyGoogleToken(body.credential);
      } catch (err) {
        console.warn('[google]', err.message);
        return json(res, 401, { error: 'Não foi possível confirmar o login com o Google. Tente de novo.' }), true;
      }
      const cookie = (id) => ({ 'set-cookie': sessionCookie(createSession(id), { secure }) });

      const known = db.prepare('SELECT id, nick, email FROM users WHERE google_sub = ?').get(g.sub);
      if (known) return json(res, 200, accountPayload(known), cookie(known.id)), true;

      // Já existe conta com esse e-mail (que o Google confirmou): vincula. A senha antiga e as sessões
      // caem, porque o e-mail do cadastro por senha nunca foi confirmado e podia ser de outra pessoa.
      const byEmail = db.prepare('SELECT id, nick, email FROM users WHERE email = ?').get(g.email);
      if (byEmail) {
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare("UPDATE users SET google_sub = ?, pass_hash = '' WHERE id = ?").run(g.sub, byEmail.id);
          db.prepare('DELETE FROM sessions WHERE user_id = ?').run(byEmail.id);
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
        return json(res, 200, { ...accountPayload(byEmail), linked: true }, cookie(byEmail.id)), true;
      }

      const nick = String(body.nick ?? '').trim();
      if (!nick) return json(res, 200, { needsProfile: true, email: g.email, suggestedNick: suggestNick(g.name, g.email) }), true;
      if (body.terms !== true) return json(res, 400, { error: 'Aceite os Termos de uso e a Política de privacidade para criar a conta.' }), true;
      if (isReservedNick(nick)) return json(res, 400, { error: 'Esse apelido é reservado. Escolha outro.' }), true;
      if (!validNick(nick)) return json(res, 400, { error: 'Apelido: 3 a 16 caracteres (letras, números, espaço, _ . -).' }), true;
      if (db.prepare('SELECT 1 FROM users WHERE nick = ?').get(nick)) return json(res, 409, { error: 'Esse apelido já está em uso.' }), true;
      let id;
      try {
        id = Number(db.prepare("INSERT INTO users (email, nick, pass_hash, google_sub, created_at, terms_at) VALUES (?, ?, '', ?, ?, ?)")
          .run(g.email, nick, g.sub, Date.now(), Date.now()).lastInsertRowid);
      } catch {
        return json(res, 409, { error: 'E-mail ou apelido já em uso.' }), true;
      }
      return json(res, 201, accountPayload({ id, nick, email: g.email }), cookie(id)), true;
    }

    if (method === 'POST' && pathname === '/api/auth/logout') {
      destroySession(tokenFromRequest(req));
      return json(res, 200, { ok: true }, { 'set-cookie': clearCookie({ secure }) }), true;
    }

    // Exclusão da conta (LGPD): anonimiza o usuário e apaga itens, desenhos e sessões; os pedidos ficam (obrigação fiscal).
    if (method === 'POST' && pathname === '/api/auth/delete') {
      if (!user) return json(res, 401, { error: 'Entre na sua conta.' }), true;
      if (!rateLimit(`delete:${user.id}`, 5, 10 * 60_000)) return json(res, 429, { error: 'Muitas tentativas. Aguarde um pouco.' }), true;
      const body = await readJson(req);
      const row = db.prepare('SELECT pass_hash, google_sub FROM users WHERE id = ?').get(user.id);
      // Conta do Google não tem senha: a confirmação é digitar EXCLUIR.
      const confirmed = row?.google_sub && !row.pass_hash
        ? body.confirm === 'EXCLUIR'
        : typeof body.password === 'string' && row && await verifyPassword(body.password, row.pass_hash);
      if (!confirmed) return json(res, 403, { error: row?.google_sub && !row.pass_hash ? 'Digite EXCLUIR para confirmar.' : 'Senha incorreta.' }), true;
      deleteAccount(user.id);
      hooks.onDelete?.(user.id);
      return json(res, 200, { ok: true }, { 'set-cookie': clearCookie({ secure }) }), true;
    }

    if (method === 'GET' && pathname === '/api/race/top') {
      return json(res, 200, { top: db.prepare('SELECT nick, side, time_ms FROM race_times ORDER BY time_ms ASC LIMIT 10').all() }), true;
    }

    if (pathname.startsWith('/api/items/') && !user) return json(res, 401, { error: 'Entre na sua conta para trocar o visual.' }), true;

    if (method === 'POST' && pathname === '/api/items/design') {
      const body = await readJson(req);
      const kind = typeof body.kind === 'string' && Object.hasOwn(DESIGN.items, body.kind) ? body.kind : null;
      if (!kind) return json(res, 400, { error: 'Pedido inválido.' }), true;
      const design = saveDesign(user.id, kind, body.design, filterText);
      if (!design) return json(res, 400, { error: 'Desenho inválido.' }), true;
      hooks.onEquip?.(user.id);
      return json(res, 200, accountPayload(user)), true;
    }

    if (method === 'POST' && pathname === '/api/items/equip') {
      const body = await readJson(req);
      const slot = body.slot;
      const itemId = body.item ?? null;
      if (!SLOTS.includes(slot) || (itemId !== null && typeof itemId !== 'string')) {
        return json(res, 400, { error: 'Pedido inválido.' }), true;
      }
      if (!equip(user.id, slot, itemId)) return json(res, 403, { error: 'Você não pode equipar esse item.' }), true;
      hooks.onEquip?.(user.id);
      return json(res, 200, accountPayload(user)), true;
    }

    return json(res, 404, { error: 'Não encontrado' }), true;
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error('[api]', err);
    if (status === 413) { res.setHeader('connection', 'close'); res.once('finish', () => req.destroy()); } // corpo grande: responde e derruba a conexão
    return json(res, status, { error: status === 500 ? 'Erro interno.' : err.message }), true;
  }
}
