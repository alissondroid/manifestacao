import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

const TOKEN = 'token-de-teste-com-mais-de-16-caracteres';
let srv;
test.before(async () => { srv = await startServer({ ADMIN_TOKEN: TOKEN }); });
test.after(async () => { await srv.stop(); });

const track = (body) => fetch(`${srv.url}/api/track`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const stats = () => fetch(`${srv.url}/api/admin/stats`, { headers: { authorization: `Bearer ${TOKEN}` } });

test('track: aceita só eventos conhecidos e limpa a origem', async () => {
  assert.equal((await track({ event: 'visit', src: 'tiktok' })).status, 204);
  assert.equal((await track({ event: 'visit', src: 'tiktok' })).status, 204);
  assert.equal((await track({ event: 'enter', src: 'TikTok' })).status, 204);
  assert.equal((await track({ event: 'share', src: '<script>x</script>' })).status, 204);
  assert.equal((await track({ event: 'hack', src: 'x' })).status, 400);
  assert.equal((await track({ src: 'x' })).status, 400);
});

test('stats: só admin; soma por evento e origem', async () => {
  assert.equal((await fetch(`${srv.url}/api/admin/stats`)).status, 401);
  const r = await stats();
  assert.equal(r.status, 200);
  const { total, days } = await r.json();
  assert.equal(total.visit['tiktok'], 2);
  assert.equal(total.enter['tiktok'], 1);
  assert.equal(Object.keys(total.share).length, 1);
  assert.ok(Object.keys(total.share)[0].match(/^[a-z0-9_-]+$/));
  assert.equal(days.length, 1);
});

test('track: não aceita JSON gigante nem dados extras guardados', async () => {
  const r = await track({ event: 'visit', src: 'a'.repeat(500) });
  assert.equal(r.status, 204);
  const { total } = await (await stats()).json();
  for (const src of Object.keys(total.visit)) assert.ok(src.length <= 24);
});
