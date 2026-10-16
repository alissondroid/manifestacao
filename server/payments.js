import crypto from 'node:crypto';

// Provedores:
//  - "abacatepay": Pix direto (QR Code e copia e cola) pela AbacatePay. Tem prioridade sobre o Stripe: com a chave
//                  ABACATEPAY_API_KEY a loja vende SÓ por Pix.
//  - "stripe":     Stripe Checkout hospedado (cartão e Pix, conforme o Dashboard). Só chaves de TESTE
//                  (sk_test_/rk_test_), a menos que ALLOW_LIVE_PAYMENTS=1.
//  - "simulated":  checkout local de mentira para desenvolver sem chave nenhuma.

const KEY = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const ABACATE_KEY = (process.env.ABACATEPAY_API_KEY || '').trim();
// Só fora de produção dá para apontar a API para outro lugar (testes com servidor de mentira).
const ABACATE_URL = (process.env.NODE_ENV !== 'production' && process.env.ABACATEPAY_URL) || 'https://api.abacatepay.com';
export const ABACATE_WEBHOOK_SECRET = process.env.ABACATEPAY_WEBHOOK_SECRET || '';
const PIX_TTL_S = 30 * 60;
const isTestKey = /^(sk|rk)_test_/.test(KEY);
const isLiveKey = /^(sk|rk)_live_/.test(KEY);

if (!ABACATE_KEY && KEY && !isTestKey && !(isLiveKey && process.env.ALLOW_LIVE_PAYMENTS === '1')) {
  console.warn('[pagamentos] STRIPE_SECRET_KEY ignorada: use uma chave de TESTE (sk_test_…). Usando o provedor simulado.');
}

export const PROVIDER = ABACATE_KEY ? 'abacatepay'
  : isTestKey || (isLiveKey && process.env.ALLOW_LIVE_PAYMENTS === '1') ? 'stripe' : 'simulated';
export const WEBHOOK_CONFIGURED = !!WEBHOOK_SECRET;
// O checkout simulado entrega itens sem cobrar: só em desenvolvimento (ou com ALLOW_SIMULATED=1).
export const PAYMENTS_ENABLED = PROVIDER !== 'simulated' || process.env.NODE_ENV !== 'production' || process.env.ALLOW_SIMULATED === '1';
if (!PAYMENTS_ENABLED) console.warn('[pagamentos] produção sem chave Stripe: a loja fica desativada (defina ABACATEPAY_API_KEY).');

// ---------- AbacatePay (REST, Pix) ----------

async function abacate(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${ABACATE_URL}/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${ABACATE_KEY}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(`AbacatePay ${res.status}: ${typeof json.error === 'string' ? json.error : json.error?.message || 'erro desconhecido'}`);
  return json.data;
}

/** Cria a cobrança Pix. Guarda o QR e o copia e cola para a nossa página de pagamento. */
async function createPix({ order, item, baseUrl }) {
  const charge = await abacate('/pixQrCode/create', {
    method: 'POST',
    body: {
      amount: item.price,
      expiresIn: PIX_TTL_S,
      description: `Avenida Online: ${item.name}`.slice(0, 140),
      metadata: { externalId: order.id },
    },
  });
  if (!charge?.id || !charge.brCode) throw new Error('AbacatePay: resposta sem QR Code');
  return {
    url: `${baseUrl}/pagar/pix?order=${order.id}`,
    ref: charge.id,
    data: {
      brCode: String(charge.brCode),
      qr: String(charge.brCodeBase64 || ''),
      expiresAt: charge.expiresAt || new Date(Date.now() + PIX_TTL_S * 1000).toISOString(),
      devMode: charge.devMode === true,
    },
  };
}

/** Só em chave de desenvolvimento: a AbacatePay marca o Pix como pago sem dinheiro. */
export const simulatePix = (ref) => abacate(`/pixQrCode/simulate-payment?id=${encodeURIComponent(ref)}`, { method: 'POST', body: { metadata: {} } });

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
  if (PROVIDER === 'abacatepay') return createPix({ order, item, baseUrl });
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

/** Consulta o provedor (ao voltar do checkout, na página do Pix e a cada webhook: é a fonte da verdade). */
export async function fetchStatus(ref) {
  if (PROVIDER === 'abacatepay') {
    const { status } = await abacate(`/pixQrCode/check?id=${encodeURIComponent(ref)}`);
    return { paid: status === 'PAID', expired: status === 'EXPIRED' || status === 'CANCELLED' };
  }
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
