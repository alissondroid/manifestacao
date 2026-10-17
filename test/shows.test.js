import test from 'node:test';
import assert from 'node:assert/strict';
import { showAt, SHOWS } from '../server/shows.js';
import { startServer, connect } from './helpers.js';

const brt = (h, m) => Date.UTC(2026, 9, 17, h + 3, m); // horário de Brasília (UTC-3)

test('showAt: avisa 5 e 1 minuto antes e começa na hora marcada', () => {
  const cfg = { ...SHOWS, times: ['20:00'] };
  assert.deepEqual(showAt(brt(19, 55), cfg), { warn: 5 });
  assert.deepEqual(showAt(brt(19, 59), cfg), { warn: 1 });
  assert.deepEqual(showAt(brt(20, 0), cfg), { start: true });
  assert.equal(showAt(brt(20, 1), cfg), null);
  assert.equal(showAt(brt(13, 30), cfg), null);
});

test('showAt: aviso que cruza a meia-noite e vários horários', () => {
  const cfg = { ...SHOWS, times: ['00:02', '12:00'] };
  assert.deepEqual(showAt(brt(23, 57), cfg), { warn: 5 });
  assert.deepEqual(showAt(brt(0, 2), cfg), { start: true });
  assert.deepEqual(showAt(brt(12, 0), cfg), { start: true });
});

test('admin dispara o show: todos recebem aviso e fogos', async () => {
  const TOKEN = 'token-de-teste-com-mais-de-16-caracteres';
  const srv = await startServer({ ADMIN_TOKEN: TOKEN, SHOW_TIMES: '' });
  try {
    const a = await connect(srv.port);
    a.send({ t: 'join', nick: 'Torcedor', side: 0, look: {} });
    await a.waitFor((m) => m.t === 'welcome');
    const bad = await fetch(`${srv.url}/api/admin/show`, { method: 'POST' });
    assert.equal(bad.status, 401);
    const ok = await fetch(`${srv.url}/api/admin/show`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(ok.status, 200);
    await a.waitFor((m) => m.t === 'notice' && /fogos/i.test(m.text));
    const fx = await a.waitFor((m) => m.t === 'fx' && m.k === 'fogos', 5000);
    assert.equal(typeof fx.x, 'number');
    a.close();
  } finally { await srv.stop(); }
});
