import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { SHOP } from '../shared/config.js';
import { startServer } from './helpers.js';

const KEY = 'abc_dev_chave-de-teste';
const HOOK = 'segredo-do-webhook-de-teste';
const VIP = SHOP.find((i) => i.kind === 'vip' && !i.hidden && i.price > 0);

/** AbacatePay de mentira: guarda as cobranças e deixa o teste decidir quando "pagam". */
async function fakeAbacate(version = 1) {
  const charges = new Map();
  const calls = [];
  const fake = { qrOverride: undefined, denyCheck: false };
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { data: null, error: 'Token inválido' });
      const v = url.pathname.startsWith('/v2/') ? 2 : 1;
      if (v !== version) return send(401, { data: null, success: false, error: 'API key version mismatch' });
      calls.push({ method: req.method, path: url.pathname, body: raw ? JSON.parse(raw) : null });
      const ok = (data) => send(200, v === 2 ? { data, success: true, error: null } : { data, error: null });
      const base = v === 1 ? '/v1/pixQrCode' : '/v2/transparents';
      if (req.method === 'POST' && url.pathname === `${base}/create`) {
        const body = v === 2 ? JSON.parse(raw).data : JSON.parse(raw);
        const id = `pix_char_${charges.size + 1}`;
        const charge = {
          id, amount: body.amount, status: 'PENDING', devMode: true, method: 'PIX', brCode: `00020126580014br.gov.bcb.pix${id}`, brCodeBase64: fake.qrOverride ?? 'data:image/png;base64,iVBORw0KGgo=', expiresAt: new Date(Date.now() + body.expiresIn * 1000).toISOString(),
        };
        charges.set(id, charge);
        return ok(charge);
      }
      const charge = charges.get(url.searchParams.get('id'));
      if (!charge) return send(404, { data: null, error: 'Não encontrado' });
      if (fake.denyCheck && url.pathname === `${base}/check`) return send(401, { data: null, success: false, error: 'Insufficient permissions' });
      if (req.method === 'GET' && url.pathname === `${base}/check`) return ok({ status: charge.status, expiresAt: charge.expiresAt });
      if (req.method === 'POST' && url.pathname === `${base}/simulate-payment`) { charge.status = 'PAID'; return ok(charge); }
      return send(404, { data: null, error: 'rota' });
    });
  });
  await new Promise((r) => { srv.listen(0, '127.0.0.1', r); });
  return { url: `http://127.0.0.1:${srv.address().port}`, charges, calls, set qrOverride(v) { fake.qrOverride = v; }, set denyCheck(v) { fake.denyCheck = v; }, close: () => new Promise((r) => { srv.close(r); }) };
}

async function setup(env = {}, version = 1) {
  const abacate = await fakeAbacate(version);
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

test('checkout cria a cobrança Pix no valor do item e devolve QR e copia e cola para o modal', async () => {
  const t = await setup();
  try {
    assert.equal((await (await t.api('/api/me')).json()).shop.provider, 'abacatepay');
    const { order, pix } = await t.checkout();
    assert.ok(order);
    const create = t.abacate.calls.find((c) => /\/create$/.test(c.path));
    assert.equal(create.body.amount, VIP.price);
    assert.ok(create.body.expiresIn >= 600);
    assert.ok(String(create.body.description).length <= 140);
    assert.equal(create.body.metadata.externalId, order);

    assert.equal(pix.brCode, '00020126580014br.gov.bcb.pixpix_char_1'); // copia e cola
    assert.equal(pix.qr, 'data:image/png;base64,iVBORw0KGgo='); // QR Code
    assert.equal(pix.devMode, true);
    assert.ok(Date.parse(pix.expiresAt) > Date.now());
  } finally { await t.stop(); }
});

test('QR com conteúdo estranho não vai para o cliente', async () => {
  const t = await setup();
  try {
    t.abacate.qrOverride = '"><script>alert(1)</script>';
    const { pix } = await t.checkout();
    assert.equal(pix.qr, '');
    assert.ok(pix.brCode);
  } finally { await t.stop(); }
});

test('só entrega o item quando o AbacatePay confirma o pagamento; clicar de novo reaproveita o mesmo Pix', async () => {
  const t = await setup();
  try {
    const first = await t.checkout();
    const again = await t.checkout();
    assert.equal(again.order, first.order);
    assert.equal(again.pix.brCode, first.pix.brCode); // o modal reabre com o mesmo QR
    assert.equal(t.abacate.calls.filter((c) => /\/create$/.test(c.path)).length, 1);

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

test('chave da API v2: usa /v2/transparents com o corpo { method, data } e entrega o item', async () => {
  const t = await setup({ ABACATEPAY_API_VERSION: '2' }, 2);
  try {
    const { order, pix } = await t.checkout();
    const create = t.abacate.calls.find((c) => c.path === '/v2/transparents/create');
    assert.equal(create.body.method, 'PIX');
    assert.equal(create.body.data.amount, VIP.price);
    assert.equal(create.body.data.metadata.externalId, order);
    assert.ok(pix.brCode);
    t.abacate.charges.get('pix_char_1').status = 'PAID';
    assert.equal((await (await t.api(`/api/shop/confirm?order=${order}`)).json()).status, 'paid');
  } finally { await t.stop(); }
});

test('versão errada: "API key version mismatch" faz o servidor trocar de versão sozinho', async () => {
  // o padrão é v2; a chave é da v1
  const a = await setup({}, 1);
  try {
    const { pix } = await a.checkout();
    assert.ok(pix.brCode);
    assert.ok(a.abacate.calls.every((c) => c.path.startsWith('/v1/')));
  } finally { await a.stop(); }
  // forçando v1; a chave é da v2
  const b = await setup({ ABACATEPAY_API_VERSION: '1' }, 2);
  try {
    const { pix } = await b.checkout();
    assert.ok(pix.brCode);
    assert.ok(b.abacate.calls.every((c) => c.path.startsWith('/v2/')));
  } finally { await b.stop(); }
});

test('webhook da v2 (data.transparent.id) também aponta a cobrança', async () => {
  const t = await setup({}, 2);
  try {
    await t.checkout();
    t.abacate.charges.get('pix_char_1').status = 'PAID';
    const res = await fetch(`${t.srv.url}/api/abacatepay/webhook?webhookSecret=${HOOK}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'transparent.completed', data: { transparent: { id: 'pix_char_1', status: 'PAID' } } }),
    });
    assert.equal(res.status, 200);
    assert.ok((await (await t.api('/api/me')).json()).vipUntil > Date.now());
  } finally { await t.stop(); }
});

test('chave sem permissão de leitura: o webhook com segredo e valor certos libera o item', async () => {
  const t = await setup({}, 2);
  try {
    const { order } = await t.checkout();
    t.abacate.denyCheck = true;
    const hook = (secret, data) => fetch(`${t.srv.url}/api/abacatepay/webhook?webhookSecret=${secret}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'transparent.completed', data }),
    });
    const vipAtivo = async () => (await (await t.api('/api/me')).json()).vipUntil > Date.now();

    // a consulta é negada: confirm segue pendente (sem derrubar nada)
    assert.equal((await (await t.api(`/api/shop/confirm?order=${order}`)).json()).status, 'pending');

    // payload que não diz PAID, valor errado ou cobrança desconhecida: nada é liberado
    await hook(HOOK, { transparent: { id: 'pix_char_1', status: 'PENDING', amount: VIP.price } });
    await hook(HOOK, { transparent: { id: 'pix_char_1', status: 'PAID', amount: VIP.price + 1 } });
    await hook(HOOK, { transparent: { id: 'pix_char_99', status: 'PAID', amount: VIP.price } });
    assert.equal(await vipAtivo(), false);

    // segredo errado: nem entra
    assert.equal((await hook('errado', { transparent: { id: 'pix_char_1', status: 'PAID', amount: VIP.price } })).status, 401);
    assert.equal(await vipAtivo(), false);

    // tudo certo: libera
    assert.equal((await hook(HOOK, { transparent: { id: 'pix_char_1', status: 'PAID', amount: VIP.price } })).status, 200);
    assert.equal(await vipAtivo(), true);
  } finally { await t.stop(); }
});
