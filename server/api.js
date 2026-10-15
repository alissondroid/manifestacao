import { db } from './db.js';
import {
  hashPassword, verifyPassword, burnPasswordTime, createSession, destroySession,
  userFromRequest, tokenFromRequest, sessionCookie, clearCookie, rateLimit, deleteAccount,
  validEmail, validNick, validPassword,
} from './auth.js';
import {
  ownedIds, equippedMap, owns, createOrder, pendingOrder, inventoryOf, vipUntil, hasPremiumEmotes, canBuy, getOrder, setOrderRef, setOrderStatus, fulfill, equip, designsOf, saveDesign,
} from './shop.js';
import { filterText } from './moderation.js';
import { clientIp } from './ip.js';
import {
  PROVIDER, PAYMENTS_ENABLED, WEBHOOK_CONFIGURED, createCheckout, fetchStatus, verifyWebhook,
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

const accountPayload = (user) => (user
  ? {
    user: { nick: user.nick, email: user.email },
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

    const user = userFromRequest(req);
    const secure = isHttps(req);

    if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(req)) {
      return json(res, 403, { error: 'Origem não permitida' }), true;
    }

    // ---------- Conta ----------

    if (method === 'GET' && pathname === '/api/me') {
      return json(res, 200, { ...accountPayload(user), shop: publicShop() }), true;
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

    if (method === 'POST' && pathname === '/api/auth/logout') {
      destroySession(tokenFromRequest(req));
      return json(res, 200, { ok: true }, { 'set-cookie': clearCookie({ secure }) }), true;
    }

    // Exclusão da conta (LGPD): anonimiza o usuário e apaga itens, desenhos e sessões; os pedidos ficam (obrigação fiscal).
    if (method === 'POST' && pathname === '/api/auth/delete') {
      if (!user) return json(res, 401, { error: 'Entre na sua conta.' }), true;
      if (!rateLimit(`delete:${user.id}`, 5, 10 * 60_000)) return json(res, 429, { error: 'Muitas tentativas. Aguarde um pouco.' }), true;
      const body = await readJson(req);
      const row = db.prepare('SELECT pass_hash FROM users WHERE id = ?').get(user.id);
      if (typeof body.password !== 'string' || !row || !(await verifyPassword(body.password, row.pass_hash))) {
        return json(res, 403, { error: 'Senha incorreta.' }), true;
      }
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
        const { url: checkoutUrl, ref } = await createCheckout({ order, item, baseUrl: baseUrl(req) });
        setOrderRef(order.id, ref, checkoutUrl);
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

      if (order.status === 'pending' && order.provider === 'stripe' && order.provider_ref) {
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
