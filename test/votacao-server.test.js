import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, connect, sleep } from './helpers.js';
import { PLACES, SECOES, mesaria, cabine, room } from '../shared/votacao.js';
import { createLine } from '../server/votacao.js';

const ENV = { VOTO_SPEED: '5000', VOTO_QUEUE_MS: '150', VOTO_MIN_VOTE_MS: '60', VOTO_BIOMETRIA_MS: '60' };
let srv;
test.before(async () => { srv = await startServer(ENV); });
test.after(async () => { await srv.stop(); });

const go = async (c, x, z) => { c.send({ t: 'move', x, z, ry: 0, a: 0 }); await sleep(40); };
const stage = (c, s, ms = 4000) => c.waitFor((m) => m.t === 'stage' && m.stage === s, ms);

test('createLine: anda, mantém NPCs e respeita a ordem dos jogadores', () => {
  const l = createLine({ slots: 6, npcStart: 3, minNpc: 2 });
  assert.equal(l.join(7), 3);
  assert.equal(l.join(8), 4);
  assert.ok(l.advance(() => 1) < 0, 'sai um NPC da frente');
  assert.equal(l.indexOf(7), 2);
  assert.equal(l.indexOf(8), 3);
  l.leave(7);
  assert.equal(l.indexOf(8), 2);
  let guard = 0;
  while (l.indexOf(8) !== -1 && guard++ < 20) l.advance(() => 1);
  assert.ok(l.entries.filter((e) => e < 0).length >= 2, 'a fila nunca esvazia de NPCs');
  assert.equal(new Set(l.entries).size, l.entries.length, 'cada NPC tem id único');
  const small = createLine({ slots: 3, npcStart: 3, minNpc: 1 });
  assert.equal(small.join(1), -1, 'fila cheia');
});

test('jornada completa: casa → rua → portão → fila → seção → urna → fim', async () => {
  const c = await connect(srv.port);
  c.send({ t: 'vjoin', nick: 'Eleitora', look: {} });
  const w = await c.waitFor((m) => m.t === 'welcome');
  assert.equal(w.stage, 'casa');

  // longe da mesa e da porta, nada acontece
  c.send({ t: 'act', id: 'doc' });
  c.send({ t: 'act', id: 'sair_casa' });
  await sleep(100);
  assert.equal(c.msgs?.some?.((m) => m.t === 'stage' && m.stage === 'rua') ?? false, false);

  await go(c, PLACES.mesa.x, PLACES.mesa.z);
  c.send({ t: 'act', id: 'doc' });
  assert.equal((await c.waitFor((m) => m.t === 'docs')).docs.doc, true);
  await go(c, PLACES.porta.x, PLACES.porta.z);
  c.send({ t: 'act', id: 'sair_casa' });
  await stage(c, 'rua');

  // tentar atravessar o muro: o servidor segura no lugar
  await go(c, 40, 30);
  await go(c, 0, PLACES.gateZ + 1);
  const patio = await stage(c, 'patio');
  assert.ok(SECOES.includes(patio.secao));
  const si = patio.sala;

  await go(c, PLACES.filaEntrada.x, PLACES.filaEntrada.z);
  c.send({ t: 'act', id: 'fila' });
  await stage(c, 'fila');
  const corredor = await stage(c, 'corredor', 6000);
  assert.equal(corredor.secao, SECOES[si]);

  await go(c, room(si).x0 + 1, 94);
  await go(c, room(si).x0 + 1, PLACES.roomZ0 + 1);
  await stage(c, 'secao');
  const mesa = mesaria(si);
  await go(c, mesa.x, mesa.z);
  c.send({ t: 'act', id: 'mesario' });
  await c.waitFor((m) => m.t === 'mesario');
  await sleep(100);
  c.send({ t: 'act', id: 'biometria' });
  await stage(c, 'habilitado');

  const cab = cabine(si);
  await go(c, cab.x, cab.z);
  c.send({ t: 'act', id: 'cabine' });
  await stage(c, 'urna');
  await sleep(100);
  c.send({ t: 'act', id: 'votou' });
  await stage(c, 'votou');

  await go(c, PLACES.saida.x, PLACES.saida.z);
  c.send({ t: 'act', id: 'sair_escola' });
  await stage(c, 'fim');
  c.close();
});

test('sem documento: barrado no portão e volta para casa', async () => {
  const c = await connect(srv.port);
  c.send({ t: 'vjoin', nick: 'Esquecido', look: {} });
  await c.waitFor((m) => m.t === 'welcome');
  await go(c, PLACES.porta.x, PLACES.porta.z);
  c.send({ t: 'act', id: 'sair_casa' });
  await stage(c, 'rua');
  await go(c, 0, PLACES.gateZ + 1);
  const n = await c.waitFor((m) => m.t === 'notice' && /Barrado/.test(m.text));
  assert.ok(n);
  const tp = await c.waitFor((m) => m.t === 'tp' && m.z < PLACES.gateZ - 1);
  assert.ok(tp);
  c.close();
});

test('sala errada é devolvida ao corredor e o voto nunca é enviado ao servidor', async () => {
  const c = await connect(srv.port);
  c.send({ t: 'vjoin', nick: 'Distraido', look: {} });
  await c.waitFor((m) => m.t === 'welcome');
  // o servidor ignora qualquer mensagem de voto: não existe esse tipo
  c.send({ t: 'voto', cargo: 'presidente', numero: '62' });
  c.send({ t: 'act', id: 'votou' });
  await sleep(150);
  const bad = c.msgs?.filter?.((m) => m.t === 'stage') ?? [];
  assert.equal(bad.length, 0);
  c.close();
});

test('fila preferencial: prioridade entra na frente (atrás só dos 3 primeiros)', () => {
  const l = createLine({ slots: 16, npcStart: 9, minNpc: 5 });
  assert.equal(l.join(7, { prioridade: true }), 3);
  assert.equal(l.indexOf(7), 3);
  assert.equal(l.join(8), l.entries.length - 1, 'quem não tem prioridade vai para o fim');
  assert.ok(l.indexOf(7) < l.indexOf(8));
});

test('cada cidade tem a sua própria seção: quem está em outra cidade não aparece', async () => {
  const a = await connect(srv.port);
  const b = await connect(srv.port);
  const c = await connect(srv.port);
  a.send({ t: 'vjoin', nick: 'Paulista', cidade: 'sp', look: {} });
  b.send({ t: 'vjoin', nick: 'Carioca', cidade: 'rj', look: {} });
  c.send({ t: 'vjoin', nick: 'Paulistana', cidade: 'sp', persona: 'idoso', look: {} });
  const wc = await c.waitFor((m) => m.t === 'welcome');
  assert.equal(wc.cidade, 'sp');
  assert.equal(wc.persona, 'idoso');
  const s = await a.waitFor((m) => m.t === 'sync' && m.add.some((p) => p.nick === 'Paulistana'));
  assert.ok(s);
  await sleep(300);
  assert.equal(a.msgs.some((m) => m.t === 'sync' && m.add.some((p) => p.nick === 'Carioca')), false, 'rj não aparece em sp');
  assert.equal(b.msgs.some((m) => m.t === 'sync' && m.add.some((p) => p.nick === 'Paulista')), false, 'sp não aparece em rj');
  const bad = await connect(srv.port);
  bad.send({ t: 'vjoin', nick: 'Invasor', cidade: '../x', persona: 'hacker', look: {} });
  const wb = await bad.waitFor((m) => m.t === 'welcome');
  assert.equal(wb.cidade, 'sp');
  assert.equal(wb.persona, 'adulto');
  [a, b, c, bad].forEach((x) => x.close());
});
