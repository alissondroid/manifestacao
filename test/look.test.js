import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, connect } from './helpers.js';
import { SIGN_PRESETS } from '../shared/config.js';

let srv;
test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.stop(); });

async function pair(look) {
  const a = await connect(srv.port);
  const b = await connect(srv.port);
  a.send({ t: 'join', nick: 'Dono', side: 0, look });
  await a.waitFor((m) => m.t === 'welcome');
  b.send({ t: 'join', nick: 'Vendo', side: 1, look: {} });
  await b.waitFor((m) => m.t === 'welcome');
  return { a, b };
}

test('texto livre no cartaz é descartado; só frases prontas passam', async () => {
  const { a, b } = await pair({ flag: 3, sign: 'Texto que eu inventei' });
  const sync = await b.waitFor((m) => m.t === 'sync' && m.add.some((p) => p.nick === 'Dono'));
  assert.equal(sync.add.find((p) => p.nick === 'Dono').look.sign, '');
  a.close(); b.close();

  const ok = await pair({ flag: 3, sign: SIGN_PRESETS[0] });
  const s2 = await ok.b.waitFor((m) => m.t === 'sync' && m.add.some((p) => p.nick === 'Dono'));
  assert.equal(s2.add.find((p) => p.nick === 'Dono').look.sign, SIGN_PRESETS[0]);
  ok.a.close(); ok.b.close();
});

test('setlook troca o visual em jogo, revalida e avisa quem vê', async () => {
  const { a, b } = await pair({ flag: 0 });
  await b.waitFor((m) => m.t === 'sync' && m.add.some((p) => p.nick === 'Dono'));
  a.send({ t: 'setlook', look: { flag: 3, sign: 'livre demais', body: 999, shirt: 2 } });
  const msg = await b.waitFor((m) => m.t === 'look' && m.look.flag === 3);
  assert.equal(msg.look.sign, '');
  assert.ok(msg.look.body <= 1);
  assert.equal(msg.look.shirt, 2);
  a.close(); b.close();
});
