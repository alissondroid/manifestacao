import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { SHOP } from '../shared/config.js';
import { startServer } from './helpers.js';

const KEY = 'abc_dev_chave-de-teste';
const HOOK = 'segredo-do-webhook-de-teste';
const VIP = SHOP.find((i) => i.kind === 'vip' && !i.hidden && i.price > 0);

/** AbacatePay de mentira: guarda as cobranças e deixa o teste decidir quando "pagam". */
async function fakeAbacate() {
  const charges = new Map();
  const calls = [];
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { data: null, error: 'Token inválido' });
      calls.push({ method: req.method, path: url.pathname, body: raw ? JSON.parse(raw) : null });
      if (req.method === 'POST' && url.pathname === '/v1/pixQrCode/create') {
        const body = JSON.parse(raw);
        const id = `pix_char_${charges.size + 1}`;
        const charge = {
          id, amount: body.amount, status: 'PENDING', devMode: true, method: 'PIX', brCode: `00020126580014br.gov.bcb.pix${id}`, brCodeBase64: 'data:image/png;base64,iVBORw0KGgo=', expiresAt: new Date(Date.now() + body.expiresIn * 1000).toISOString(),
        };
        charges.set(id, charge);
        return send(200, { data: charge, error: null });
      }
      const charge = charges.get(url.searchParams.get('id'));
      if (!charge) return send(404, { data: null, error: 'Não encontrado' });
      if (req.method === 'GET' && url.pathname === '/v1/pixQrCode/check') return send(200, { data: { status: charge.status, expiresAt: charge.expiresAt }, error: null });
      if (req.method === 'POST' && url.pathname === '/v1/pixQrCode/simulate-payment') { charge.status = 'PAID'; return send(200, { data: charge, error: null }); }
      return send(404, { data: null, error: 'rota' });
    });
  });
  await new Promise((r) => { srv.listen(0, '127.0.0.1', r); });
  return { url: `http://127.0.0.1:${srv.address().port}`, charges, calls, close: () => new Promise((r) => { srv.close(r); }) };
}

async function setup(env = {}) {
  const abacate = await fakeAbacate();
  const srv = await startServer({
    ABACATEPAY_API_KEY: KEY, ABACATEPAY_URL: abacate.url, ABACATEPAY_WEBHOOK_SECRET: HOOK, STRIPE_SECRET_KEY: '', ...env,
  });
  const reg = await fetch(`${srv.url}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'pix@example.com', nick: 'Pagador', password: 'senha-do-pagador-1', terms: true }),
  });
  const cookie = reg.headers.get('set-cookie').split(';')[0];
  const api = (path, body, method = body ? 'POST' : 'GET') => fetch(`${srv.url}${path}`, {
    method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  const checkout = async () => (await api('/api/shop/checkout', { item: VIP.id })).json();
  const stop = async () => { await srv.stop(); await abacate.close(); };
  return { srv, abacate, api, checkout, stop };
}

test('checkout cria a cobrança Pix no valor do item e leva para a página do QR', async () => {
  const t = await setup();
  try {
    assert.equal((await (await t.api('/api/me')).json()).shop.provider, 'abacatepay');
    const { url, order } = await t.checkout();
    assert.match(url, new RegExp(`/pagar/pix\\?order=${order}$`));
    const create = t.abacate.calls.find((c) => c.path === '/v1/pixQrCode/create');
    assert.equal(create.body.amount, VIP.price);
    assert.ok(create.body.expiresIn >= 600);
    assert.ok(String(create.body.description).length <= 140);

    const page = await t.api(new URL(url).pathname + new URL(url).search);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /pix_char_1/); // copia e cola
    assert.match(html, /data:image\/png;base64,iVBORw0KGgo=/); // QR code
    assert.match(html, /\/api\/shop\/confirm/); // a página consulta sozinha
  } finally { await t.stop(); }
});

test('a página do Pix exige estar logado e ser dono do pedido', async () => {
  const t = await setup();
  try {
    const { url } = await t.checkout();
    const anon = await fetch(`${t.srv.url}${new URL(url).pathname}${new URL(url).search}`);
    assert.equal(anon.status, 401);
  } finally { await t.stop(); }
});

test('só entrega o item quando o AbacatePay confirma o pagamento; clicar de novo reaproveita o mesmo Pix', async () => {
  const t = await setup();
  try {
    const first = await t.checkout();
    const again = await t.checkout();
    assert.equal(again.order, first.order);
    assert.equal(t.abacate.calls.filter((c) => c.path === '/v1/pixQrCode/create').length, 1);

    assert.equal((await (await t.api(`/api/shop/confirm?order=${first.order}`)).json()).status, 'pending');
    assert.ok(!(await (await t.api('/api/me')).json()).vipUntil || (await (await t.api('/api/me')).json()).vipUntil < Date.now());

    t.abacate.charges.get('pix_char_1').status = 'PAID';
    const done = await (await t.api(`/api/shop/confirm?order=${first.order}`)).json();
    assert.equal(done.status, 'paid');
    assert.ok(done.vipUntil > Date.now());
  } finally { await t.stop(); }
});

test('Pix vencido ou cancelado marca o pedido como expirado e permite gerar outro', async () => {
  const t = await setup();
  try {
    const first = await t.checkout();
    t.abacate.charges.get('pix_char_1').status = 'EXPIRED';
    assert.equal((await (await t.api(`/api/shop/confirm?order=${first.order}`)).json()).status, 'expired');
    const next = await t.checkout();
    assert.notEqual(next.order, first.order);
  } finally { await t.stop(); }
});

test('webhook: exige o segredo e confere o pagamento na API, sem confiar no corpo', async () => {
  const t = await setup();
  try {
    await t.checkout();
    const hook = (secret, body) => fetch(`${t.srv.url}/api/abacatepay/webhook${secret ? `?webhookSecret=${secret}` : ''}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const payload = { event: 'billing.paid', devMode: true, data: { pixQrCode: { id: 'pix_char_1', status: 'PAID', amount: VIP.price } } };

    assert.equal((await hook('', payload)).status, 401);
    assert.equal((await hook('errado', payload)).status, 401);

    // corpo diz PAID, mas a API diz PENDING: nada é entregue
    assert.equal((await hook(HOOK, payload)).status, 200);
    const me1 = await (await t.api('/api/me')).json();
    assert.ok(!me1.vipUntil || me1.vipUntil < Date.now());

    t.abacate.charges.get('pix_char_1').status = 'PAID';
    assert.equal((await hook(HOOK, payload)).status, 200);
    const me2 = await (await t.api('/api/me')).json();
    assert.ok(me2.vipUntil > Date.now());
  } finally { await t.stop(); }
});

test('webhook sem segredo configurado fica desligado', async () => {
  const t = await setup({ ABACATEPAY_WEBHOOK_SECRET: '' });
  try {
    const res = await fetch(`${t.srv.url}/api/abacatepay/webhook?webhookSecret=x`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 503);
  } finally { await t.stop(); }
});

test('modo dev: o botão de simular pagamento marca o Pix como pago', async () => {
  const t = await setup();
  try {
    const { order } = await t.checkout();
    assert.equal((await t.api('/api/shop/simulate-pix', { order })).status, 200);
    assert.equal(t.abacate.charges.get('pix_char_1').status, 'PAID');
    assert.equal((await (await t.api(`/api/shop/confirm?order=${order}`)).json()).status, 'paid');
  } finally { await t.stop(); }
});

test('AbacatePay fora do ar: o pedido falha com mensagem e não fica preso', async () => {
  const t = await setup();
  try {
    await t.abacate.close();
    const res = await t.api('/api/shop/checkout', { item: VIP.id });
    assert.equal(res.status, 502);
  } finally { await t.srv.stop(); }
});
