import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOP } from '../shared/config.js';
import { startServer, connect, sleep } from './helpers.js';

const VIP = SHOP.find((i) => i.kind === 'vip');

async function setup(env = {}) {
  const srv = await startServer(env);
  let n = 0;
  const account = async (side = 0) => {
    n += 1;
    const res = await fetch(`${srv.url}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `p${n}@x.com`, nick: `Jog${n}`, password: 'senha-de-teste-1', terms: true }),
    });
    const cookie = res.headers.get('set-cookie').split(';')[0];
    const api = (path, body) => fetch(`${srv.url}${path}`, {
      method: body ? 'POST' : 'GET', headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    const buy = async (itemId, sd = side) => {
      const co = await (await api('/api/shop/checkout', { item: itemId, side: sd })).json();
      if (!co.order) return co;
      await api('/api/shop/simulate', { order: co.order, result: 'paid' });
      return co;
    };
    return { cookie, api, buy, nick: `Jog${n}`, side };
  };
  return { srv, account };
}
const join = async (srv, who, side = 0) => {
  const c = await connect(srv.port, who ? { cookie: who.cookie } : undefined);
  c.send({ t: 'join', nick: 'Visitante', side, look: {} });
  const w = await c.waitFor((m) => m.t === 'welcome' || m.t === 'denied');
  return { c, w };
};

test('GET /api/ranking é público e traz os quatro grupos', async () => {
  const { srv } = await setup();
  try {
    const r = await (await fetch(`${srv.url}/api/ranking?period=week`)).json();
    assert.equal(r.period, 'week');
    assert.equal(r.sides.length, 4);
    assert.equal(r.leader, null);
    assert.ok(r.until > r.since);
    assert.equal((await (await fetch(`${srv.url}/api/ranking?period=lixo`)).json()).period, 'week'); // período inválido cai na semana
  } finally { await srv.stop(); }
});

test('a compra vai para o grupo informado no checkout e aparece no ranking com o apoiador', async () => {
  const { srv, account } = await setup();
  try {
    const ana = await account(1);
    await ana.buy('coroa', 1);
    await ana.buy('fogos-5', 1);
    const r = await (await ana.api('/api/ranking?period=all')).json();
    assert.equal(r.leader, 1);
    assert.equal(r.sides[0].side, 1);
    assert.equal(r.sides[0].total, 500 + 300);
    assert.equal(r.top[1][0].nick, ana.nick);
    assert.equal(r.mine, 800);
    // grupo inválido não conta
    await ana.buy('oculos', 9);
    assert.equal((await (await ana.api('/api/ranking?period=all')).json()).sides.reduce((s, x) => s + x.total, 0), 800);
  } finally { await srv.stop(); }
});

test('item exclusivo VIP: 403 sem VIP, liberado depois de ser Apoiador VIP', async () => {
  const { srv, account } = await setup();
  try {
    const bia = await account();
    const locked = await bia.api('/api/shop/checkout', { item: 'asas', side: 0 });
    assert.equal(locked.status, 403);
    assert.match((await locked.json()).error, /VIP/);
    assert.equal((await (await bia.api('/api/me')).json()).vip, false);
    await bia.buy(VIP.id);
    assert.equal((await (await bia.api('/api/me')).json()).vip, true);
    assert.equal((await bia.api('/api/shop/checkout', { item: 'asas', side: 0 })).status, 200);
  } finally { await srv.stop(); }
});

test('reações exclusivas: o servidor só repassa as premium para quem é VIP', async () => {
  const { srv, account } = await setup();
  try {
    const vip = await account();
    await vip.buy(VIP.id);
    const free = await account();
    const a = await join(srv, vip);
    const b = await join(srv, free);
    const watcher = await join(srv, null);
    // grátis tenta a reação premium (🔥, índice 2): recebe aviso e ninguém vê
    b.c.send({ t: 'react', e: 2 });
    const notice = await b.c.waitFor((m) => m.t === 'notice' && /VIP/.test(m.text));
    assert.ok(notice);
    await sleep(300);
    assert.ok(!watcher.c.msgs.some((m) => m.t === 'react' && m.e === 2));
    // grátis usa uma reação livre (👍, índice 0): todos veem
    b.c.send({ t: 'react', e: 0 });
    await watcher.c.waitFor((m) => m.t === 'react' && m.e === 0);
    // VIP usa a premium: todos veem
    a.c.send({ t: 'react', e: 2 });
    await watcher.c.waitFor((m) => m.t === 'react' && m.e === 2);
    [a, b, watcher].forEach((x) => x.c.close());
  } finally { await srv.stop(); }
});

test('vaga garantida: com a avenida cheia, só o VIP ainda entra', async () => {
  const { srv, account } = await setup({ MAX_PLAYERS: '2' });
  try {
    const vip = await account();
    await vip.buy(VIP.id);
    const g1 = await join(srv, null);
    const g2 = await join(srv, null);
    assert.equal(g1.w.t, 'welcome');
    assert.equal(g2.w.t, 'welcome');
    const g3 = await join(srv, null);
    assert.equal(g3.w.t, 'denied');
    assert.match(g3.w.reason, /cheia/i);
    const v = await join(srv, vip);
    assert.equal(v.w.t, 'welcome');
    [g1, g2, g3, v].forEach((x) => x.c.close());
  } finally { await srv.stop(); }
});

test('toda compra paga avisa a avenida inteira com o grupo e quem lidera a semana', async () => {
  const { srv, account } = await setup();
  try {
    const watcher = await join(srv, null);
    const cadu = await account(2);
    await cadu.buy('coroa', 2);
    const m = await watcher.c.waitFor((x) => x.t === 'purchase');
    assert.equal(m.nick, cadu.nick);
    assert.equal(m.side, 2);
    assert.ok(m.item && m.icon);
    assert.equal(m.leader, 2);
    assert.equal(m.newLeader, true);
    // segunda compra do mesmo grupo: continua líder, sem "assumiu a liderança"
    await cadu.buy('oculos', 2);
    const second = await watcher.c.waitFor((x) => x.t === 'purchase' && x.item !== m.item);
    assert.equal(second.newLeader, false);
    watcher.c.close();
  } finally { await srv.stop(); }
});
