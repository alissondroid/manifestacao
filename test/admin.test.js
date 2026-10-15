import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startServer, connect, sleep } from './helpers.js';

const TOKEN = 'token-de-teste-com-mais-de-16-caracteres';
const admin = (srv, path, opts = {}) => fetch(`${srv.url}/api/admin/${path}`, {
  ...opts,
  headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...(opts.headers || {}) },
});

test('sem ADMIN_TOKEN a API de administração nem existe', async () => {
  const srv = await startServer({ ADMIN_TOKEN: '' });
  assert.equal((await fetch(`${srv.url}/api/admin/bans`)).status, 404);
  await srv.stop();
});

test('com ADMIN_TOKEN: exige o token certo, bane por IP derrubando e barrando, e desbane', async () => {
  const srv = await startServer({ ADMIN_TOKEN: TOKEN });
  try {
    assert.equal((await fetch(`${srv.url}/api/admin/bans`)).status, 401);
    assert.equal((await fetch(`${srv.url}/api/admin/bans`, { headers: { authorization: 'Bearer errado' } })).status, 401);

    const a = await connect(srv.port);
    a.send({ t: 'join', nick: 'Fulano', side: 0, look: {} });
    await a.waitFor((m) => m.t === 'welcome');
    const closed = new Promise((resolve) => { a.ws.once('close', (code) => resolve(code)); });

    // banir por apelido de denunciado não existe ainda: usa a chave de IP direto
    const ban = await admin(srv, 'ban', { method: 'POST', body: JSON.stringify({ key: 'ip:127.0.0.1', minutes: 5, reason: 'teste' }) });
    assert.equal(ban.status, 200);
    const { id } = await ban.json();
    assert.equal(await closed, 4003); // quem estava online foi derrubado

    // nova conexão é recusada
    const code = await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
      ws.on('close', (c) => resolve(c));
      ws.on('error', () => {});
    });
    assert.equal(code, 4003);

    const list = await (await admin(srv, 'bans')).json();
    assert.ok(list.bans.some((b) => b.id === id && b.key === 'ip:127.0.0.1'));

    assert.equal((await admin(srv, 'unban', { method: 'POST', body: JSON.stringify({ id }) })).status, 200);
    const b = await connect(srv.port);
    b.send({ t: 'join', nick: 'Fulano', side: 0, look: {} });
    await b.waitFor((m) => m.t === 'welcome');
    b.close();
  } finally { await srv.stop(); }
});

test('lista denúncias com o contexto e aceita banir pelo apelido do denunciado', async () => {
  const srv = await startServer({ ADMIN_TOKEN: TOKEN });
  try {
    const bad = await connect(srv.port);
    bad.send({ t: 'join', nick: 'Chato', side: 0, look: {} });
    const wb = await bad.waitFor((m) => m.t === 'welcome');
    bad.send({ t: 'chat', text: 'ofensa qualquer' });
    await sleep(200);
    const rep = await connect(srv.port);
    rep.send({ t: 'join', nick: 'Alvo', side: 1, look: {} });
    await rep.waitFor((m) => m.t === 'welcome');
    rep.send({ t: 'report', id: wb.id });
    await rep.waitFor((m) => m.t === 'notice' && /Denúncia enviada/.test(m.text));

    const { reports } = await (await admin(srv, 'reports')).json();
    assert.equal(reports[0].target_nick, 'chato');
    assert.deepEqual(reports[0].context, ['ofensa qualquer']);

    const ban = await admin(srv, 'ban', { method: 'POST', body: JSON.stringify({ nick: 'Chato', minutes: 1 }) });
    assert.equal(ban.status, 200);
    assert.match((await ban.json()).key, /^ip:/);
    assert.equal((await admin(srv, 'ban', { method: 'POST', body: JSON.stringify({ nick: 'desconhecido' }) })).status, 400);
    rep.close();
  } finally { await srv.stop(); }
});

test('quem entra vê as últimas mensagens do chat e /ajuda responde', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'join', nick: 'Ana', side: 0, look: {} });
    await a.waitFor((m) => m.t === 'welcome');
    a.send({ t: 'chat', text: 'oi pessoal' });
    await sleep(300);
    const b = await connect(srv.port);
    b.send({ t: 'join', nick: 'Beto', side: 1, look: {} });
    const hist = await b.waitFor((m) => m.t === 'history');
    assert.deepEqual(hist.list, [['Ana', 0, 'oi pessoal']]);
    b.send({ t: 'chat', text: '/ajuda' });
    const note = await b.waitFor((m) => m.t === 'notice' && /Comandos/.test(m.text));
    assert.ok(note);
    a.close(); b.close();
  } finally { await srv.stop(); }
});
