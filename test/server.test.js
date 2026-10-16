import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, connect, sleep } from './helpers.js';

let srv;
test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.stop(); });

test('GET /healthz responde ok', async () => {
  const r = await fetch(`${srv.url}/healthz`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ok, true);
});

test('convidados com o mesmo apelido recebem apelidos diferentes', async () => {
  const a = await connect(srv.port);
  const b = await connect(srv.port);
  a.send({ t: 'join', nick: 'Maria', side: 0, look: {} });
  await a.waitFor((m) => m.t === 'welcome');
  b.send({ t: 'join', nick: 'maria', side: 1, look: {} });
  await b.waitFor((m) => m.t === 'welcome');
  // o 2º jogador aparece para o 1º com apelido diferente
  const sync = await a.waitFor((m) => m.t === 'sync' && m.add.length > 0);
  assert.notEqual(sync.add[0].nick.toLowerCase(), 'maria');
  a.close(); b.close();
});

test('apelido que imita o sistema vira Visitante', async () => {
  const a = await connect(srv.port);
  const b = await connect(srv.port);
  a.send({ t: 'join', nick: 'Observador', side: 0, look: {} });
  await a.waitFor((m) => m.t === 'welcome');
  b.send({ t: 'join', nick: 'Sistema', side: 0, look: {} });
  await b.waitFor((m) => m.t === 'welcome');
  const sync = await a.waitFor((m) => m.t === 'sync' && m.add.some((p) => p.nick.startsWith('Visitante')));
  assert.ok(sync);
  a.close(); b.close();
});

test('movimento legítimo é aceito e velocidade falsificada é recusada', async () => {
  const c = await connect(srv.port);
  c.send({ t: 'join', nick: 'Corredor', side: 0, look: {} });
  const w = await c.waitFor((m) => m.t === 'welcome');
  let { x } = w;
  const z = w.z;
  // andando a ~5 m/s: nenhuma correção
  for (let i = 0; i < 20; i += 1) { x = Math.max(-18, Math.min(18, x + (i % 2 ? -0.25 : 0.25))); c.send({ t: 'move', x, z, ry: 0, a: 1 }); await sleep(50); }
  assert.equal(c.msgs.filter((m) => m.t === 'fix').length, 0, 'andar normal não deve gerar correção');
  // tentando 30 m/s com mensagens frequentes
  let zz = z;
  for (let i = 0; i < 40; i += 1) { zz += 1.5; c.send({ t: 'move', x, z: zz, ry: 0, a: 1 }); await sleep(50); }
  assert.ok(c.msgs.filter((m) => m.t === 'fix').length > 10, 'velocidade falsificada deveria ser corrigida');
  c.close();
});

test('SIGTERM encerra o servidor com limpeza', async () => {
  const other = await (await import('./helpers.js')).startServer();
  const code = await other.stop();
  assert.ok(code === 0 || code === null || code === undefined);
});

test('denúncia: o servidor registra e responde ao denunciante', async () => {
  const bad = await connect(srv.port);
  bad.send({ t: 'join', nick: 'Mal', side: 0, look: {} });
  const wb = await bad.waitFor((m) => m.t === 'welcome');
  const reporters = [];
  for (let i = 0; i < 3; i += 1) {
    const c = await connect(srv.port);
    c.send({ t: 'join', nick: `Denunciante${i}`, side: 1, look: {} });
    await c.waitFor((m) => m.t === 'welcome');
    reporters.push(c);
  }
  reporters[0].send({ t: 'report', id: wb.id });
  const first = await reporters[0].waitFor((m) => m.t === 'notice');
  assert.match(first.text, /Denúncia enviada/);
  // denunciar a si mesmo é ignorado (sem aviso); repetir é recusado
  reporters[0].send({ t: 'report', id: wb.id });
  const again = await reporters[0].waitFor((m) => m.t === 'notice' && m !== first);
  assert.match(again.text, /Espere|já denunciou/);
  bad.close();
  reporters.forEach((r) => r.close());
});

// ---------- golpes: o atacante sabe por que errou ----------
async function duel({ attackerPvp, victimPvp, facing = 0 }) {
  const a = await connect(srv.port);
  const v = await connect(srv.port);
  a.send({ t: 'join', nick: 'Atacante', side: 0, look: {} });
  const wa = await a.waitFor((m) => m.t === 'welcome');
  v.send({ t: 'join', nick: 'Vitima', side: 1, look: {} });
  const wv = await v.waitFor((m) => m.t === 'welcome');
  if (attackerPvp) a.send({ t: 'pvp', on: true });
  if (victimPvp) v.send({ t: 'pvp', on: true });
  await sleep(300);
  // o atacante anda até 1,2 m atrás da vítima, olhando para +z (ou para o outro lado, em `facing`)
  let { x, z } = wa;
  const gx = wv.x;
  const gz = wv.z - 1.2;
  while (Math.hypot(gx - x, gz - z) > 0.05) {
    const d = Math.hypot(gx - x, gz - z);
    const s = Math.min(d, 0.4);
    x += ((gx - x) / d) * s;
    z += ((gz - z) / d) * s;
    a.send({ t: 'move', x, z, ry: 0, a: 1 });
    await sleep(100);
  }
  if (facing !== 0) { a.send({ t: 'move', x, z, ry: facing, a: 0 }); await sleep(150); }
  await sleep(300);
  a.send({ t: 'attack', kind: 'punch' });
  await sleep(500);
  const out = { notices: a.msgs.filter((m) => m.t === 'notice').map((m) => m.text), hit: v.msgs.some((m) => m.t === 'hitby') };
  a.close(); v.close();
  return out;
}

test('golpe com PvP nos dois e de frente: acerta e não manda aviso de erro', async () => {
  const r = await duel({ attackerPvp: true, victimPvp: true });
  assert.equal(r.hit, true);
  assert.deepEqual(r.notices, []);
});

test('golpe sem PvP no atacante: avisa para ligar o PvP', async () => {
  const r = await duel({ attackerPvp: false, victimPvp: true });
  assert.equal(r.hit, false);
  assert.ok(r.notices.some((t) => /PvP/.test(t)), JSON.stringify(r.notices));
});

test('golpe em jogador sem PvP: diz quem não ligou', async () => {
  const r = await duel({ attackerPvp: true, victimPvp: false });
  assert.equal(r.hit, false);
  assert.ok(r.notices.some((t) => /Vitima/.test(t) && /PvP/.test(t)), JSON.stringify(r.notices));
});

test('golpe de costas para o alvo: pede para ficar de frente', async () => {
  const r = await duel({ attackerPvp: true, victimPvp: true, facing: Math.PI });
  assert.equal(r.hit, false);
  assert.ok(r.notices.some((t) => /frente/i.test(t)), JSON.stringify(r.notices));
});

test('conexão que some sem avisar (rede cai) é removida em até 2 batimentos', async () => {
  const { default: net } = await import('node:net');
  const { WebSocket } = await import('ws');
  const fast = await (await import('./helpers.js')).startServer({ HEARTBEAT_MS: '300' });
  let hole = false;
  const socks = [];
  const proxy = net.createServer((c) => {
    const u = net.connect(fast.port, '127.0.0.1');
    socks.push(c, u);
    c.on('data', (d) => { if (!hole) u.write(d); });
    u.on('data', (d) => { if (!hole) c.write(d); });
    c.on('close', () => u.destroy()); u.on('close', () => c.destroy());
    c.on('error', () => {}); u.on('error', () => {});
  });
  await new Promise((r) => { proxy.listen(0, r); });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${proxy.address().port}/ws`);
    const msgs = [];
    ws.on('message', (r) => msgs.push(JSON.parse(r)));
    await new Promise((r) => { ws.on('open', r); });
    ws.send(JSON.stringify({ t: 'join', nick: 'Sumido', side: 0, look: {} }));
    while (!msgs.find((m) => m.t === 'welcome')) await sleep(30);
    const players = async () => (await (await fetch(`${fast.url}/healthz`)).json()).players;
    assert.equal(await players(), 1);
    hole = true; // a rede some: nada passa, nenhum fechamento chega ao servidor
    const t0 = Date.now();
    while (Date.now() - t0 < 3000 && (await players()) !== 0) await sleep(50);
    const took = Date.now() - t0;
    assert.equal(await players(), 0, 'o jogador sumido deveria ter sido removido');
    assert.ok(took < 1500, `demorou ${took} ms para remover (esperado < 2 batimentos de 300 ms + folga)`);
    ws.terminate();
  } finally {
    socks.forEach((s) => s.destroy());
    proxy.close();
    await fast.stop();
  }
});
