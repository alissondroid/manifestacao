import crypto from 'node:crypto';

// Provedores:
//  - "stripe":     Stripe Checkout hospedado (cartão e Pix, conforme o Dashboard). Só chaves de TESTE
//                  (sk_test_/rk_test_), a menos que ALLOW_LIVE_PAYMENTS=1.
//  - "simulated":  checkout local de mentira para desenvolver sem chave nenhuma.

const KEY = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const isTestKey = /^(sk|rk)_test_/.test(KEY);
const isLiveKey = /^(sk|rk)_live_/.test(KEY);

if (KEY && !isTestKey && !(isLiveKey && process.env.ALLOW_LIVE_PAYMENTS === '1')) {
  console.warn('[pagamentos] STRIPE_SECRET_KEY ignorada: use uma chave de TESTE (sk_test_…). Usando o provedor simulado.');
}

export const PROVIDER = isTestKey || (isLiveKey && process.env.ALLOW_LIVE_PAYMENTS === '1') ? 'stripe' : 'simulated';
export const WEBHOOK_CONFIGURED = !!WEBHOOK_SECRET;
// O checkout simulado entrega itens sem cobrar: só em desenvolvimento (ou com ALLOW_SIMULATED=1).
export const PAYMENTS_ENABLED = PROVIDER === 'stripe' || process.env.NODE_ENV !== 'production' || process.env.ALLOW_SIMULATED === '1';
if (!PAYMENTS_ENABLED) console.warn('[pagamentos] produção sem chave Stripe: a loja fica desativada (defina STRIPE_SECRET_KEY).');

// ---------- Stripe (REST, sem SDK) ----------

function encodeForm(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function stripe(path, { method = 'GET', params } = {}) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${KEY}`,
      ...(params ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? encodeForm(params) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${body.error?.message || 'erro desconhecido'}`);
  return body;
}

/**
 * Cria a sessão de pagamento. Sem `payment_method_types`: o Stripe mostra os métodos
 * ativos no Dashboard (cartão e Pix para BRL), via dynamic payment methods.
 */
export async function createCheckout({ order, item, baseUrl }) {
  if (PROVIDER === 'simulated') {
    return { url: `${baseUrl}/pagar/simulado?order=${order.id}`, ref: `sim_${order.id}` };
  }
  const session = await stripe('/checkout/sessions', {
    method: 'POST',
    params: {
      mode: 'payment',
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][currency]': 'brl',
      'line_items[0][price_data][unit_amount]': item.price,
      'line_items[0][price_data][product_data][name]': item.name,
      client_reference_id: order.id,
      'metadata[order_id]': order.id,
      'metadata[item_id]': item.id,
      success_url: `${baseUrl}/?pago=${order.id}`,
      cancel_url: `${baseUrl}/?pago_cancelado=${order.id}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    },
  });
  return { url: session.url, ref: session.id };
}

/** Consulta o Stripe (usado ao voltar do checkout, caso o webhook ainda não tenha chegado). */
export async function fetchStatus(ref) {
  if (PROVIDER !== 'stripe') return { paid: false, expired: false };
  const s = await stripe(`/checkout/sessions/${encodeURIComponent(ref)}`);
  return { paid: s.payment_status === 'paid', expired: s.status === 'expired' };
}

/**
 * Valida o cabeçalho Stripe-Signature (esquema v1: HMAC-SHA256 de `${t}.${corpo}`).
 * Retorna o evento ou null.
 */
export function verifyWebhook(rawBody, header, secret = WEBHOOK_SECRET, toleranceSec = 300) {
  if (!secret || !header) return null;
  const parts = String(header).split(',').map((p) => p.split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length) return null;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return null;

  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody.toString('utf8')}`).digest();
  const ok = sigs.some((s) => {
    const given = Buffer.from(s, 'hex');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!ok) return null;
  try { return JSON.parse(rawBody.toString('utf8')); } catch { return null; }
}
