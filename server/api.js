import { db } from './db.js';
import {
  hashPassword, verifyPassword, burnPasswordTime, createSession, destroySession,
  userFromRequest, tokenFromRequest, sessionCookie, clearCookie, rateLimit, deleteAccount,
  validEmail, validNick, validPassword, suggestNick,
} from './auth.js';
import { GOOGLE_CLIENT_ID, verifyGoogleToken } from './google.js';
import {
  ownedIds, equippedMap, owns, createOrder, pendingOrder, inventoryOf, vipUntil, hasPremiumEmotes, canBuy, getOrder, orderByRef, setOrderRef, setOrderStatus, fulfill, equip, designsOf, saveDesign,
} from './shop.js';
import { filterText } from './moderation.js';
import { clientIp } from './ip.js';
import {
  addBan, removeBan, listBans, resolveKey,
} from './bans.js';
import crypto from 'node:crypto';
import {
  PROVIDER, PAYMENTS_ENABLED, WEBHOOK_CONFIGURED, ABACATE_WEBHOOK_SECRET, createCheckout, fetchStatus, simulatePix, verifyWebhook,
} from './payments.js';
import { SHOP, SHOP_BY_ID, SLOTS, DESIGN } from '../shared/config.js';

const UUID = /^[0-9a-f-]{36}$/i;

const isHttps = (req) => req.headers['x-forwarded-proto'] === 'https' || (process.env.PUBLIC_URL || '').startsWith('https');
// Atrás de proxy (Vite em dev, nginx/Cloudflare em produção) o host público vem em x-forwarded-host.
const publicHost = (req) => req.headers['x-forwarded-host'] || req.headers.host;
const baseUrl = (req) => process.env.PUBLIC_URL
  || `${req.headers['x-forwarded-proto'] || 'http'}://${publicHost(req)}`;

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Corpo grande demais'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
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
    owned: ownedIds(user.id),
    equipped: equippedMap(user.id),
    custom: designsOf(user.id),
    inventory: inventoryOf(user.id),
    vipUntil: vipUntil(user.id),
    premium: hasPremiumEmotes(user.id),
  }
  : {
    user: null, owned: [], equipped: {}, custom: {}, inventory: {}, vipUntil: 0, premium: false,
  });

const publicShop = () => ({ items: SHOP.filter((i) => !i.hidden), provider: PROVIDER });

/**
 * Trata rotas /api/* e /pagar/*. Retorna true se tratou a requisição.
 * hooks.onEquip(userId) avisa o jogo para atualizar o visual de quem está online.
 */
export async function handleApi(req, res, hooks = {}) {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/pagar/')) return false;

  try {
    const method = req.method;

    // Webhook do Stripe: autenticado pela assinatura, não por cookie/origem.
    if (method === 'POST' && pathname === '/api/stripe/webhook') {
      if (!WEBHOOK_CONFIGURED) return json(res, 503, { error: 'Webhook não configurado' }), true;
      const raw = await readBody(req, 64 * 1024);
      const event = verifyWebhook(raw, req.headers['stripe-signature']);
      if (!event) return json(res, 400, { error: 'Assinatura inválida' }), true;
      const s = event.data?.object;
      const paidEvent = event.type === 'checkout.session.async_payment_succeeded'
        || (event.type === 'checkout.session.completed' && s?.payment_status === 'paid');
      if (paidEvent && s) {
        const order = getOrder(s.client_reference_id || s.metadata?.order_id);
        // só entrega se a sessão é a do pedido (o webhook pode chegar antes de gravarmos a referência) e o valor confere
        const sameSession = order && (order.provider_ref === s.id || !order.provider_ref);
        if (sameSession && order.provider === 'stripe' && s.amount_total === order.amount_cents && s.currency === 'brl') {
          if (!order.provider_ref) setOrderRef(order.id, s.id, null);
          if (fulfill(order.id)) hooks.onEquip?.(order.user_id);
        }
      }
      return json(res, 200, { received: true }), true;
    }

    // Webhook da AbacatePay: o segredo vai na URL (?webhookSecret=). O corpo nunca é confiado:
    // ele só diz qual cobrança olhar, e quem confirma o pagamento é a consulta à API.
    if (method === 'POST' && pathname === '/api/abacatepay/webhook') {
      if (PROVIDER !== 'abacatepay' || !ABACATE_WEBHOOK_SECRET) return json(res, 503, { error: 'Webhook não configurado' }), true;
      const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
      if (!crypto.timingSafeEqual(sha(url.searchParams.get('webhookSecret') ?? ''), sha(ABACATE_WEBHOOK_SECRET))) {
        return json(res, 401, { error: 'Não autorizado' }), true;
      }
      let payload = {};
      try { payload = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8')) || {}; } catch { /* corpo inválido: ignora */ }
      const ref = payload.data?.pixQrCode?.id ?? payload.data?.id ?? payload.id;
      const order = typeof ref === 'string' ? orderByRef('abacatepay', ref) : null;
      if (order && order.status !== 'paid') {
        try {
          const st = await fetchStatus(order.provider_ref);
          if (st.paid && fulfill(order.id)) hooks.onEquip?.(order.user_id);
          else if (st.expired) setOrderStatus(order.id, 'expired');
        } catch (err) {
          console.error('[pagamentos] webhook: falha ao consultar a AbacatePay:', err.message);
          return json(res, 502, { error: 'Tente de novo' }), true; // a AbacatePay reenvia
        }
      }
      return json(res, 200, { received: true }), true;
    }

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
      return json(res, 404, { error: 'Não encontrado' }), true;
    }

    const user = userFromRequest(req);
    const secure = isHttps(req);

    if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(req)) {
      return json(res, 403, { error: 'Origem não permitida' }), true;
    }

    // ---------- Conta ----------

    if (method === 'GET' && pathname === '/api/me') {
      return json(res, 200, { ...accountPayload(user), shop: publicShop(), googleClientId: GOOGLE_CLIENT_ID || null }), true;
    }

    if (method === 'POST' && pathname === '/api/auth/register') {
      if (!rateLimit(`reg:${clientIp(req)}`, 10, 10 * 60_000)) return json(res, 429, { error: 'Muitas tentativas. Aguarde um pouco.' }), true;
      const body = await readJson(req);
      const email = String(body.email ?? '').trim();
      const nick = String(body.nick ?? '').trim();
      const password = body.password;
      if (body.terms !== true) return json(res, 400, { error: 'Aceite os Termos de uso e a Política de privacidade para criar a conta.' }), true;
      if (!validEmail(email)) return json(res, 400, { error: 'E-mail inválido.' }), true;
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

    // ---------- Loja ----------

    if (method === 'GET' && pathname === '/api/shop') return json(res, 200, publicShop()), true;

    if (method === 'GET' && pathname === '/api/race/top') {
      return json(res, 200, { top: db.prepare('SELECT nick, side, time_ms FROM race_times ORDER BY time_ms ASC LIMIT 10').all() }), true;
    }

    if (pathname.startsWith('/api/shop/') || pathname.startsWith('/pagar/')) {
      if (!user) return json(res, 401, { error: 'Entre na sua conta para usar a loja.' }), true;
    }

    if (method === 'POST' && pathname === '/api/shop/checkout') {
      const body = await readJson(req);
      const item = SHOP_BY_ID[body.item];
      if (!item || item.hidden || item.price <= 0) return json(res, 404, { error: 'Item não encontrado.' }), true;
      if (!PAYMENTS_ENABLED) return json(res, 503, { error: 'Pagamentos indisponíveis no momento.' }), true;
      if (!canBuy(user.id, item)) return json(res, 409, { error: 'Você já tem esse item.' }), true;
      if (!rateLimit(`checkout:${user.id}`, 10, 10 * 60_000)) return json(res, 429, { error: 'Muitas tentativas. Aguarde um pouco.' }), true;

      const open = pendingOrder(user.id, item.id, PROVIDER);
      if (open) return json(res, 200, { url: open.pay_url, order: open.id }), true;
      const order = createOrder(user.id, item, PROVIDER);
      try {
        const { url: checkoutUrl, ref, data } = await createCheckout({ order, item, baseUrl: baseUrl(req) });
        setOrderRef(order.id, ref, checkoutUrl, data);
        return json(res, 200, { url: checkoutUrl, order: order.id }), true;
      } catch (err) {
        console.error('[pagamentos] falha ao criar checkout:', err.message);
        setOrderStatus(order.id, 'failed');
        return json(res, 502, { error: 'Não foi possível iniciar o pagamento agora.' }), true;
      }
    }

    if (method === 'GET' && pathname === '/api/shop/confirm') {
      const orderId = url.searchParams.get('order') || '';
      const order = UUID.test(orderId) ? getOrder(orderId) : null;
      if (!order || order.user_id !== user.id) return json(res, 404, { error: 'Pedido não encontrado.' }), true;

      if (order.status === 'pending' && order.provider !== 'simulated' && order.provider_ref) {
        try {
          const st = await fetchStatus(order.provider_ref);
          if (st.paid && fulfill(order.id)) hooks.onEquip?.(user.id);
          else if (st.expired) setOrderStatus(order.id, 'expired');
        } catch (err) {
          console.error('[pagamentos] falha ao consultar pedido:', err.message);
        }
      }
      const fresh = getOrder(order.id);
      return json(res, 200, { status: fresh.status, item: fresh.item_id, ...accountPayload(user) }), true;
    }

    if (method === 'POST' && pathname === '/api/shop/design') {
      const body = await readJson(req);
      const kind = typeof body.kind === 'string' && Object.hasOwn(DESIGN.items, body.kind) ? body.kind : null;
      if (!kind) return json(res, 400, { error: 'Pedido inválido.' }), true;
      const itemId = DESIGN.items[kind];
      if (!owns(user.id, itemId)) return json(res, 403, { error: 'Compre o item para personalizar.' }), true;
      const design = saveDesign(user.id, kind, body.design, filterText);
      if (!design) return json(res, 400, { error: 'Desenho inválido.' }), true;
      hooks.onEquip?.(user.id);
      return json(res, 200, accountPayload(user)), true;
    }

    if (method === 'POST' && pathname === '/api/shop/equip') {
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

    // ---------- Checkout simulado (só quando não há chave Stripe de teste) ----------

    // Pix (AbacatePay): página com o QR Code e o copia e cola. Ela consulta /api/shop/confirm até o pagamento cair.
    if (PROVIDER === 'abacatepay' && method === 'GET' && pathname === '/pagar/pix') {
      const orderId = url.searchParams.get('order') || '';
      const order = UUID.test(orderId) ? getOrder(orderId) : null;
      if (!order || order.user_id !== user.id || order.provider !== 'abacatepay') {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Pedido não encontrado.'), true;
      }
      if (order.status === 'paid') {
        res.writeHead(302, { location: `/?pago=${order.id}` });
        return res.end(), true;
      }
      let pix = null;
      try { pix = JSON.parse(order.pay_data || 'null'); } catch { /* sem dados */ }
      if (order.status !== 'pending' || !pix?.brCode) {
        res.writeHead(410, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Esse Pix não vale mais. Volte ao jogo e gere outro.'), true;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(pixPage(order, SHOP_BY_ID[order.item_id], pix)), true;
    }

    // Só com chave de desenvolvimento da AbacatePay: marca o Pix como pago para testar o fluxo inteiro.
    if (PROVIDER === 'abacatepay' && method === 'POST' && pathname === '/api/shop/simulate-pix') {
      const body = await readJson(req);
      const order = UUID.test(String(body.order)) ? getOrder(body.order) : null;
      let pix = null;
      try { pix = JSON.parse(order?.pay_data || 'null'); } catch { /* sem dados */ }
      if (!order || order.user_id !== user.id || order.provider !== 'abacatepay' || order.status !== 'pending') {
        return json(res, 404, { error: 'Pedido não encontrado.' }), true;
      }
      if (!pix?.devMode) return json(res, 403, { error: 'Só vale para cobranças de teste.' }), true;
      await simulatePix(order.provider_ref);
      return json(res, 200, { ok: true }), true;
    }

    if (PROVIDER === 'simulated' && PAYMENTS_ENABLED && method === 'POST' && pathname === '/api/shop/simulate') {
      const body = await readJson(req);
      const order = UUID.test(String(body.order)) ? getOrder(body.order) : null;
      if (!order || order.user_id !== user.id || order.provider !== 'simulated') {
        return json(res, 404, { error: 'Pedido não encontrado.' }), true;
      }
      if (body.result === 'paid') { if (fulfill(order.id)) hooks.onEquip?.(user.id); }
      else setOrderStatus(order.id, 'cancelled');
      return json(res, 200, { status: getOrder(order.id).status }), true;
    }

    if (PROVIDER === 'simulated' && PAYMENTS_ENABLED && method === 'GET' && pathname === '/pagar/simulado') {
      const orderId = url.searchParams.get('order') || '';
      const order = UUID.test(orderId) ? getOrder(orderId) : null;
      if (!order || order.user_id !== user.id || order.status !== 'pending') {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Pedido não encontrado ou já finalizado.'), true;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(simulatedPage(order, SHOP_BY_ID[order.item_id])), true;
    }

    return json(res, 404, { error: 'Não encontrado' }), true;
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error('[api]', err);
    return json(res, status, { error: status === 500 ? 'Erro interno.' : err.message }), true;
  }
}

const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// Página do Pix: QR Code, copia e cola, contagem regressiva e consulta automática do pagamento.
function pixPage(order, item, pix) {
  const qr = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(pix.qr) ? pix.qr
    : /^[A-Za-z0-9+/=]+$/.test(pix.qr) && pix.qr ? `data:image/png;base64,${pix.qr}` : '';
  const state = JSON.stringify({ order: order.id, expiresAt: pix.expiresAt, devMode: !!pix.devMode }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagar com Pix</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e1713;color:#f2f4ef;font:16px system-ui,sans-serif}
main{width:min(420px,94vw);background:#14211b;border:1px solid rgba(230,195,74,.3);border-radius:18px;padding:24px;display:grid;gap:14px;text-align:center}
h1{margin:0;font-size:22px}p{margin:0;color:#9aa89d}.price{font-size:26px;font-weight:800;color:#e6c34a}
.qr{background:#fff;border-radius:14px;padding:12px;width:min(260px,70vw);justify-self:center}.qr img{width:100%;display:block}
textarea{width:100%;height:76px;resize:none;background:#0b120f;color:#f2f4ef;border:1px solid rgba(190,205,190,.22);border-radius:10px;padding:10px;font:12px ui-monospace,monospace;box-sizing:border-box}
button,a.b{font:inherit;border-radius:12px;padding:13px;border:1px solid rgba(190,205,190,.22);background:transparent;color:#f2f4ef;cursor:pointer;text-decoration:none;display:block}
button.ok{background:#e6c34a;border-color:#e6c34a;color:#1c1917;font-weight:700}
#st{color:#9aa89d;font-size:14px}#st.good{color:#86efac}#st.bad{color:#fca5a5}
.tag{background:#fbbf24;color:#1c1917;font-weight:700;font-size:12px;border-radius:999px;padding:3px 10px;width:fit-content;justify-self:center}
</style></head><body><main>
${pix.devMode ? '<span class="tag">MODO DE TESTE · nenhum dinheiro é cobrado</span>' : ''}
<h1>${esc(item.name)}</h1><div class="price">${esc(brl(order.amount_cents))}</div>
${qr ? `<div class="qr"><img alt="QR Code do Pix" src="${qr}"></div>` : ''}
<p>Abra o app do seu banco, escolha Pix e leia o QR Code, ou use o copia e cola:</p>
<textarea id="code" readonly>${esc(pix.brCode)}</textarea>
<button class="ok" id="copy" type="button">Copiar código Pix</button>
<p id="st">Aguardando o pagamento…</p>
${pix.devMode ? '<button id="sim" type="button">Simular pagamento (teste)</button>' : ''}
<a class="b" href="/">Voltar ao jogo</a>
</main><script>
const S=${state};const $=id=>document.getElementById(id);let done=false;
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('code').value)}catch{$('code').select();document.execCommand('copy')}$('copy').textContent='Copiado!';setTimeout(()=>{$('copy').textContent='Copiar código Pix'},2000)};
if($('sim'))$('sim').onclick=async()=>{$('sim').disabled=true;await fetch('/api/shop/simulate-pix',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({order:S.order})})};
const say=(t,c)=>{$('st').textContent=t;$('st').className=c||''};
async function poll(){if(done)return;try{const r=await fetch('/api/shop/confirm?order='+S.order,{credentials:'same-origin'});const j=await r.json();
 if(j.status==='paid'){done=true;say('Pagamento confirmado! Voltando ao jogo…','good');location.href='/?pago='+S.order;return}
 if(j.status==='expired'||j.status==='cancelled'||j.status==='failed'){done=true;say('Esse Pix expirou. Volte ao jogo e gere outro.','bad');return}
}catch{}
 const left=Math.max(0,Math.round((Date.parse(S.expiresAt)-Date.now())/1000));
 if(left>0)say('Aguardando o pagamento… expira em '+Math.floor(left/60)+':'+String(left%60).padStart(2,'0'));
 setTimeout(poll,3000)}
poll();
</script></body></html>`;
}

// Página de pagamento de mentira, claramente identificada como teste.
function simulatedPage(order, item) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagamento de teste</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#f1f5f9;font:16px system-ui,sans-serif}
main{width:min(420px,92vw);background:#1e293b;border:1px solid #334155;border-radius:16px;padding:24px;display:grid;gap:14px}
.tag{background:#fbbf24;color:#1c1917;font-weight:700;font-size:12px;border-radius:999px;padding:3px 10px;width:fit-content}
h1{margin:0;font-size:22px}p{margin:0;color:#94a3b8}
button{font:inherit;border-radius:10px;padding:12px;border:1px solid #475569;background:#0f172a;color:#f1f5f9;cursor:pointer}
button.ok{background:#22c55e;border-color:#22c55e;color:#052e16;font-weight:700}
#msg{color:#fca5a5;min-height:1.2em}
</style></head><body><main>
<span class="tag">MODO DE TESTE · nenhum dinheiro é cobrado</span>
<h1>${item.name}</h1><p>${brl(order.amount_cents)}</p>
<button class="ok" data-r="paid">Simular Pix pago</button>
<button data-r="paid">Simular cartão aprovado</button>
<button data-r="cancel">Cancelar</button>
<p id="msg"></p>
</main><script>
document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{
  const r=await fetch('/api/shop/simulate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({order:'${order.id}',result:b.dataset.r})});
  if(!r.ok){document.getElementById('msg').textContent='Falha ao simular.';return}
  location.href=b.dataset.r==='paid'?'/?pago=${order.id}':'/?pago_cancelado=${order.id}';
});
</script></body></html>`;
}
