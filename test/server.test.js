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
