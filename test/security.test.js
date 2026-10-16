import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { WebSocket } from 'ws';
import { SHOP } from '../shared/config.js';
import { startServer, connect, sleep } from './helpers.js';

const PROD = { NODE_ENV: 'production', PUBLIC_URL: 'https://jogo.example', TRUST_PROXY: '1' };
const json = (body) => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Requisição HTTP crua, sem normalizar o caminho (fetch limpa "../" antes de enviar). */
function raw(port, requestLine, headers = {}) {
  return new Promise((resolve, reject) => {
    const s = net.connect(port, '127.0.0.1');
    let out = '';
    s.on('data', (d) => { out += d; });
    s.on('close', () => resolve(out));
    s.on('error', reject);
    s.write(`${requestLine}\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('')}\r\n`);
    setTimeout(() => s.destroy(), 2500);
  });
}
async function register(url, n, extra = {}) {
  const res = await fetch(`${url}/api/auth/register`, {
    method: 'POST', ...json({ email: `s${n}@x.com`, nick: `Seg${n}`, password: 'senha-de-teste-1', terms: true, ...extra }),
  });
  return { res, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

test('caminhos com ../ , %2e%2e, barra invertida e NUL não saem da pasta do site', async () => {
  const srv = await startServer(PROD);
  try {
    for (const target of ['/../package.json', '/..%2f..%2fpackage.json', '/%2e%2e/%2e%2e/package.json', '/assets/..%5c..%5cpackage.json', '/%00/../package.json', '//..//..//package.json', '/..%252f..%252fpackage.json']) {
      const out = await raw(srv.port, `GET ${target} HTTP/1.1`);
      assert.ok(!out.includes('"name": "avenida-online"'), `${target} vazou o package.json`);
      assert.ok(!/^HTTP\/1\.1 200/.test(out) || !out.includes('"scripts"'), `${target} respondeu com conteúdo do projeto`);
    }
    for (const secret of ['/.env', '/data/avenida.db', '/server/index.js', '/node_modules/ws/package.json']) {
      const out = await raw(srv.port, `GET ${secret} HTTP/1.1`);
      assert.ok(!/^HTTP\/1\.1 200[\s\S]*(import |STRIPE|SQLite format)/.test(out), `${secret} acessível`);
    }
  } finally { await srv.stop(); }
});

test('cabeçalhos de segurança no HTML e sem pistas do servidor', async () => {
  const srv = await startServer(PROD);
  try {
    const res = await fetch(`${srv.url}/`);
    assert.equal(res.status, 200, 'o site não está compilado: rode "npm run build" antes dos testes');
    const h = res.headers;
    assert.match(h.get('content-security-policy'), /default-src 'self'/);
    assert.match(h.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(h.get('content-security-policy'), /object-src 'none'/);
    assert.ok(!/unsafe-eval/.test(h.get('content-security-policy')));
    assert.equal(h.get('x-frame-options'), 'DENY');
    assert.equal(h.get('x-content-type-options'), 'nosniff');
    assert.ok(h.get('strict-transport-security'));
    assert.ok(!h.get('x-powered-by'));
    assert.ok(!/node|express/i.test(h.get('server') ?? ''));
  } finally { await srv.stop(); }
});

test('cookie de sessão: HttpOnly, SameSite=Lax e Secure atrás do HTTPS', async () => {
  const srv = await startServer(PROD);
  try {
    const { res } = await register(srv.url, 1);
    const c = res.headers.get('set-cookie');
    assert.match(c, /HttpOnly/);
    assert.match(c, /SameSite=Lax/);
    assert.match(c, /Secure/);
    assert.match(c, /Path=\//);
    assert.ok(!/sid=[^;]{0,20}(;|$)/.test(c), 'token curto demais');
  } finally { await srv.stop(); }
});

test('CSRF: POST com Origin de outro site é recusado (mesmo com o cookie) e a sessão segue válida', async () => {
  const srv = await startServer(PROD);
  try {
    const { cookie } = await register(srv.url, 2);
    const fwd = { 'x-forwarded-host': 'jogo.example', 'x-forwarded-proto': 'https', cookie };
    const evil = await fetch(`${srv.url}/api/auth/logout`, { method: 'POST', ...json({}), headers: { ...json({}).headers, ...fwd, origin: 'https://evil.example' } });
    assert.equal(evil.status, 403);
    const nulo = await fetch(`${srv.url}/api/auth/logout`, { method: 'POST', headers: { ...json({}).headers, ...fwd, origin: 'null' }, body: '{}' });
    assert.equal(nulo.status, 403);
    const me = await (await fetch(`${srv.url}/api/me`, { headers: { cookie } })).json();
    assert.ok(me.user, 'a sessão não deveria ter caído');
    const ok = await fetch(`${srv.url}/api/auth/logout`, { method: 'POST', headers: { ...json({}).headers, ...fwd, origin: 'https://jogo.example' }, body: '{}' });
    assert.equal(ok.status, 200);
  } finally { await srv.stop(); }
});

test('Origin forjado com X-Forwarded-Host não vale quando o proxy não é de confiança', async () => {
  const srv = await startServer({ ...PROD, TRUST_PROXY: '' });
  try {
    const { cookie } = await register(srv.url, 3);
    const res = await fetch(`${srv.url}/api/auth/logout`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: 'https://evil.example', 'x-forwarded-host': 'evil.example' }, body: '{}',
    });
    assert.equal(res.status, 403, 'X-Forwarded-Host só pode valer com TRUST_PROXY=1');
  } finally { await srv.stop(); }
});

test('API só aceita JSON (formulário cross-site não passa) e corpo grande é recusado', async () => {
  const srv = await startServer();
  try {
    const form = await fetch(`${srv.url}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=a@b.com&password=x' });
    assert.equal(form.status, 415);
    const big = await fetch(`${srv.url}/api/auth/login`, { method: 'POST', ...json({ email: 'a@b.com', password: 'x'.repeat(40_000) }) });
    assert.equal(big.status, 413);
    assert.equal(big.headers.get('connection'), 'close'); // e o servidor encerra a conexão depois de responder
    const bad = await fetch(`${srv.url}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":' });
    assert.equal(bad.status, 400);
  } finally { await srv.stop(); }
});

test('login: erro genérico (não revela se o e-mail existe) e limite de tentativas', async () => {
  const srv = await startServer();
  try {
    await register(srv.url, 4);
    const wrong = await fetch(`${srv.url}/api/auth/login`, { method: 'POST', ...json({ email: 's4@x.com', password: 'senha-errada-123' }) });
    const unknown = await fetch(`${srv.url}/api/auth/login`, { method: 'POST', ...json({ email: 'ninguem@x.com', password: 'senha-errada-123' }) });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal((await wrong.json()).error, (await unknown.json()).error);
    let last = 0;
    for (let i = 0; i < 20; i += 1) last = (await fetch(`${srv.url}/api/auth/login`, { method: 'POST', ...json({ email: `forca${i}@x.com`, password: 'qualquer-senha-1' }) })).status;
    assert.equal(last, 429, 'força bruta por IP deveria ser barrada');
  } finally { await srv.stop(); }
});

test('sessão: depois do logout o cookie antigo não vale mais', async () => {
  const srv = await startServer();
  try {
    const { cookie } = await register(srv.url, 5);
    await fetch(`${srv.url}/api/auth/logout`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
    const me = await (await fetch(`${srv.url}/api/me`, { headers: { cookie } })).json();
    assert.equal(me.user, null);
    const forged = await (await fetch(`${srv.url}/api/me`, { headers: { cookie: 'sid=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } })).json();
    assert.equal(forged.user, null);
  } finally { await srv.stop(); }
});

test('WebSocket em produção: sem Origin ou com Origin de outro site é recusado', async () => {
  const srv = await startServer(PROD);
  try {
    const tryOpen = (origin) => new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`, origin ? { headers: { origin } } : undefined);
      ws.on('open', () => { ws.close(); resolve('aberto'); });
      ws.on('error', () => resolve('recusado'));
      ws.on('unexpected-response', () => resolve('recusado'));
    });
    assert.equal(await tryOpen(null), 'recusado');
    assert.equal(await tryOpen('https://evil.example'), 'recusado');
    assert.equal(await tryOpen('https://jogo.example'), 'aberto');
  } finally { await srv.stop(); }
});

test('WebSocket: mensagem gigante ou lixo não derruba o servidor', async () => {
  const srv = await startServer();
  try {
    const c = await connect(srv.port);
    c.ws.send('x'.repeat(10_000));
    await sleep(200);
    const d = await connect(srv.port);
    for (const junk of ['{', 'null', '[]', '"oi"', '{"t":{}}', '{"t":"move","x":"a","z":null}', '{"t":"join","look":"x","nick":{"a":1}}', '{"t":"__proto__"}', '{"t":"use","item":{"$":1}}']) d.ws.send(junk);
    await sleep(200);
    assert.equal((await fetch(`${srv.url}/healthz`)).status, 200);
    const e = await connect(srv.port);
    e.send({ t: 'join', nick: 'Ok', side: 1, look: {} });
    await e.waitFor((m) => m.t === 'welcome');
  } finally { await srv.stop(); }
});

test('loja: o preço vem do servidor (campo "price" do cliente é ignorado) e outro usuário não mexe no seu pedido', async () => {
  const srv = await startServer();
  try {
    const a = await register(srv.url, 6);
    const b = await register(srv.url, 7);
    const item = SHOP.find((i) => i.id === 'bone');
    const co = await (await fetch(`${srv.url}/api/shop/checkout`, { method: 'POST', headers: { ...json({}).headers, cookie: a.cookie }, body: JSON.stringify({ item: 'bone', side: 0, price: 1, amount: 1, amount_cents: 1 }) })).json();
    assert.ok(co.order);
    // B tenta confirmar, simular e abrir o pedido de A
    for (const [path, body] of [['/api/shop/simulate', { order: co.order, result: 'paid' }]]) {
      const r = await fetch(`${srv.url}${path}`, { method: 'POST', headers: { ...json({}).headers, cookie: b.cookie }, body: JSON.stringify(body) });
      assert.equal(r.status, 404, `${path}: B mexeu no pedido de A`);
    }
    assert.equal((await fetch(`${srv.url}/api/shop/confirm?order=${co.order}`, { headers: { cookie: b.cookie } })).status, 404);
    await fetch(`${srv.url}/api/shop/simulate`, { method: 'POST', headers: { ...json({}).headers, cookie: a.cookie }, body: JSON.stringify({ order: co.order, result: 'paid' }) });
    const rank = await (await fetch(`${srv.url}/api/ranking?period=all`)).json();
    assert.equal(rank.sides[0].total, item.price, 'o valor creditado precisa ser o preço do catálogo');
  } finally { await srv.stop(); }
});

test('pagamento duplicado: entregas simultâneas do mesmo pedido liberam o VIP uma vez só', async () => {
  const srv = await startServer();
  try {
    const a = await register(srv.url, 8);
    const vip = SHOP.find((i) => i.kind === 'vip');
    const co = await (await fetch(`${srv.url}/api/shop/checkout`, { method: 'POST', headers: { ...json({}).headers, cookie: a.cookie }, body: JSON.stringify({ item: vip.id, side: 0 }) })).json();
    const pay = () => fetch(`${srv.url}/api/shop/simulate`, { method: 'POST', headers: { ...json({}).headers, cookie: a.cookie }, body: JSON.stringify({ order: co.order, result: 'paid' }) });
    await Promise.all([pay(), pay(), pay(), pay(), pay()]);
    const me = await (await fetch(`${srv.url}/api/me`, { headers: { cookie: a.cookie } })).json();
    assert.ok(me.vipUntil < Date.now() + (vip.days + 1) * 86_400_000, 'VIP somado mais de uma vez');
    assert.ok(me.inventory.fogos <= 3, `fogos duplicados: ${me.inventory.fogos}`);
  } finally { await srv.stop(); }
});

test('apelidos que imitam contas excluídas ("Excluído123") ou o sistema não podem ser registrados', async () => {
  const srv = await startServer();
  try {
    for (const nick of ['Excluído123', 'excluído9', 'EXCLUÍDO1']) {
      const r = await register(srv.url, `n${nick.length}${Math.random().toString(36).slice(2, 6)}`, { nick });
      assert.equal(r.res.status, 400, `${nick} foi aceito`);
    }
  } finally { await srv.stop(); }
});

test('administração: sem token configurado não existe; com token, só o certo entra', async () => {
  const off = await startServer({ ADMIN_TOKEN: '' });
  try { assert.equal((await fetch(`${off.url}/api/admin/bans`)).status, 404); } finally { await off.stop(); }
  const on = await startServer({ ADMIN_TOKEN: 'token-de-teste-com-mais-de-16-caracteres' });
  try {
    assert.equal((await fetch(`${on.url}/api/admin/reports`)).status, 401);
    assert.equal((await fetch(`${on.url}/api/admin/reports`, { headers: { authorization: 'Bearer token-de-teste-com-mais-de-16-caracteres-X' } })).status, 401);
    assert.equal((await fetch(`${on.url}/api/admin/reports`, { headers: { authorization: 'Basic dG9rZW4=' } })).status, 401);
    assert.equal((await fetch(`${on.url}/api/admin/reports?token=token-de-teste-com-mais-de-16-caracteres`)).status, 401);
    assert.equal((await fetch(`${on.url}/api/admin/reports`, { headers: { authorization: 'Bearer token-de-teste-com-mais-de-16-caracteres' } })).status, 200);
  } finally { await on.stop(); }
});

test('webhooks sem credencial são recusados e a simulação de pagamento não existe em produção', async () => {
  const srv = await startServer(PROD);
  try {
    assert.ok([400, 503].includes((await fetch(`${srv.url}/api/stripe/webhook`, { method: 'POST', ...json({ type: 'checkout.session.completed' }) })).status));
    assert.ok([401, 503].includes((await fetch(`${srv.url}/api/abacatepay/webhook`, { method: 'POST', ...json({ event: 'billing.paid' }) })).status));
    const { cookie } = await register(srv.url, 9);
    const sim = await fetch(`${srv.url}/api/shop/simulate`, { method: 'POST', headers: { ...json({}).headers, cookie, 'x-forwarded-host': 'jogo.example', origin: 'https://jogo.example' }, body: JSON.stringify({ order: '00000000-0000-0000-0000-000000000000', result: 'paid' }) });
    assert.ok([404, 503].includes(sim.status));
    const co = await fetch(`${srv.url}/api/shop/checkout`, { method: 'POST', headers: { ...json({}).headers, cookie, 'x-forwarded-host': 'jogo.example', origin: 'https://jogo.example' }, body: JSON.stringify({ item: 'bone', side: 0 }) });
    assert.equal(co.status, 503, 'em produção sem chave de pagamento a loja precisa ficar desligada (nada de item grátis)');
  } finally { await srv.stop(); }
});

test('login com senha no formato antigo: confere e regrava o hash com os parâmetros atuais', async () => {
  const crypto = await import('node:crypto');
  const { DatabaseSync } = await import('node:sqlite');
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avenida-sec-'));
  const dbPath = path.join(dir, 'a.db');
  const srv = await startServer({ DB_PATH: dbPath });
  try {
    await register(srv.url, 20);
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA busy_timeout = 5000');
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync('senha-de-teste-1', salt, 64, { N: 16384, r: 8, p: 1 });
    db.prepare('UPDATE users SET pass_hash = ? WHERE email = ?').run(`${salt.toString('hex')}:${key.toString('hex')}`, 's20@x.com');
    const bad = await fetch(`${srv.url}/api/auth/login`, { method: 'POST', ...json({ email: 's20@x.com', password: 'errada-errada-1' }) });
    assert.equal(bad.status, 401);
    assert.ok(!db.prepare('SELECT pass_hash FROM users WHERE email = ?').get('s20@x.com').pass_hash.startsWith('s1$'), 'senha errada não pode regravar o hash');
    const ok = await fetch(`${srv.url}/api/auth/login`, { method: 'POST', ...json({ email: 's20@x.com', password: 'senha-de-teste-1' }) });
    assert.equal(ok.status, 200);
    assert.match(db.prepare('SELECT pass_hash FROM users WHERE email = ?').get('s20@x.com').pass_hash, /^s1\$32768\$8\$3\$/);
    const again = await fetch(`${srv.url}/api/auth/login`, { method: 'POST', ...json({ email: 's20@x.com', password: 'senha-de-teste-1' }) });
    assert.equal(again.status, 200); // e continua entrando com o hash novo
    db.close();
  } finally { await srv.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
