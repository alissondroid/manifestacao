import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let srv;
test.before(async () => { srv = await startServer({ TRUST_PROXY: '1' }); });
test.after(async () => { await srv.stop(); });

const json = (body, ip) => ({ method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) });
async function signup(nick, ip, ref) {
  const res = await fetch(`${srv.url}/api/auth/register`, json({
    email: `${nick}@x.com`, nick, password: 'senha-de-teste-1', terms: true, ...(ref ? { ref } : {}),
  }, ip));
  assert.equal(res.status, 201, await res.clone().text());
  return res.headers.get('set-cookie').split(';')[0];
}
const me = async (cookie) => (await fetch(`${srv.url}/api/me`, { headers: { cookie } })).json();

test('3 convidados de IPs diferentes dão 3 fogos ao anfitrião', async () => {
  const host = await signup('Anfitriao', '10.0.0.1');
  assert.equal((await me(host)).referrals.count, 0);
  await signup('Amigo1', '10.0.1.1', 'Anfitriao');
  await signup('Amigo2', '10.0.1.2', 'anfitriao');
  let m = await me(host);
  assert.equal(m.referrals.count, 2);
  assert.equal(m.inventory.fogos ?? 0, 0);
  await signup('Amigo3', '10.0.1.3', 'Anfitriao');
  m = await me(host);
  assert.equal(m.referrals.count, 3);
  assert.equal(m.inventory.fogos, 3);
});

test('mesmo IP conta uma vez só e o IP do próprio anfitrião não conta', async () => {
  const host = await signup('Esperto', '10.0.2.1');
  await signup('Clone1', '10.0.2.9', 'Esperto');
  await signup('Clone2', '10.0.2.9', 'Esperto');
  await signup('Clone3', '10.0.2.1', 'Esperto');
  assert.equal((await me(host)).referrals.count, 1);
});

test('convite inexistente ou inválido é ignorado sem travar o cadastro', async () => {
  await signup('Solto1', '10.0.3.1', 'ninguem-assim');
  await signup('Solto2', '10.0.3.2', '<script>');
  await signup('Solto3', '10.0.3.3', 'x'.repeat(200));
});

test('recompensa tem teto', async () => {
  const host = await signup('Famoso', '10.0.4.1');
  for (let i = 0; i < 18; i += 1) await signup(`Fa${i}`, `10.0.5.${i + 1}`, 'Famoso');
  const m = await me(host);
  assert.equal(m.referrals.count, 18);
  assert.equal(m.inventory.fogos, 15); // 5 prêmios de 3
});
