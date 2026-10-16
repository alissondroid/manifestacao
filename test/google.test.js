import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { verifyGoogleToken } from '../server/google.js';
import { startServer } from './helpers.js';

const CLIENT_ID = 'meu-app.apps.googleusercontent.com';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function makeToken(claims = {}, { kid = 'k1', key = privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: '1234567890', email: 'ana@example.com', email_verified: true, name: 'Ana Souza', iat: now, exp: now + 3600, ...claims,
  };
  const data = `${b64({ alg: 'RS256', kid, typ: 'JWT' })}.${b64(body)}`;
  return `${data}.${crypto.sign('RSA-SHA256', Buffer.from(data), key).toString('base64url')}`;
}

async function certsServer() {
  const srv = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ keys: [jwk] })); });
  await new Promise((r) => { srv.listen(0, '127.0.0.1', r); });
  return { url: `http://127.0.0.1:${srv.address().port}/certs`, close: () => new Promise((r) => { srv.close(r); }) };
}

test('token válido do Google devolve sub, e-mail e nome', async () => {
  const certs = await certsServer();
  try {
    const u = await verifyGoogleToken(makeToken(), { clientId: CLIENT_ID, certsUrl: certs.url });
    assert.deepEqual(u, { sub: '1234567890', email: 'ana@example.com', name: 'Ana Souza' });
  } finally { await certs.close(); }
});

for (const [nome, token] of [
  ['audiência de outro app', () => makeToken({ aud: 'outro.apps.googleusercontent.com' })],
  ['emissor falso', () => makeToken({ iss: 'https://evil.example' })],
  ['token vencido', () => makeToken({ exp: Math.floor(Date.now() / 1000) - 600 })],
  ['e-mail não verificado', () => makeToken({ email_verified: false })],
  ['assinatura de outra chave', () => makeToken({}, { key: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey })],
  ['kid desconhecido', () => makeToken({}, { kid: 'nao-existe' })],
  ['lixo', () => 'abc.def'],
]) {
  test(`recusa token com ${nome}`, async () => {
    const certs = await certsServer();
    try {
      await assert.rejects(verifyGoogleToken(token(), { clientId: CLIENT_ID, certsUrl: certs.url }));
    } finally { await certs.close(); }
  });
}

test('POST /api/auth/google: cria conta, entra de novo, vincula conta de e-mail e exclui sem senha', async () => {
  const certs = await certsServer();
  const srv = await startServer({ GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CERTS_URL: certs.url });
  const post = (path, body, cookie) => fetch(`${srv.url}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
  });
  const cookieOf = (res) => res.headers.get('set-cookie').split(';')[0];
  try {
    assert.equal((await (await fetch(`${srv.url}/api/me`)).json()).googleClientId, CLIENT_ID);

    // primeiro acesso: pede apelido e aceite
    const first = await post('/api/auth/google', { credential: makeToken() });
    assert.equal(first.status, 200);
    const prof = await first.json();
    assert.equal(prof.needsProfile, true);
    assert.match(prof.suggestedNick, /^[\p{L}\p{N}_.\- ]{3,16}$/u);
    assert.equal((await post('/api/auth/google', { credential: makeToken(), nick: 'AnaGoogle' })).status, 400); // sem aceite dos termos

    const created = await post('/api/auth/google', { credential: makeToken(), nick: 'AnaGoogle', terms: true });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).user.nick, 'AnaGoogle');

    // volta a entrar sem pedir nada
    const again = await post('/api/auth/google', { credential: makeToken() });
    assert.equal(again.status, 200);
    const cookie = cookieOf(again);
    assert.equal((await (await fetch(`${srv.url}/api/me`, { headers: { cookie } })).json()).user.nick, 'AnaGoogle');

    // token inválido
    assert.equal((await post('/api/auth/google', { credential: makeToken({ aud: 'x' }) })).status, 401);

    // senha não funciona em conta do Google
    assert.equal((await post('/api/auth/login', { email: 'ana@example.com', password: 'qualquer-senha-1' })).status, 401);

    // exclusão sem senha: pede a palavra EXCLUIR
    assert.equal((await post('/api/auth/delete', { password: 'x' }, cookie)).status, 403);
    assert.equal((await post('/api/auth/delete', { confirm: 'EXCLUIR' }, cookie)).status, 200);
    assert.equal((await (await fetch(`${srv.url}/api/me`, { headers: { cookie } })).json()).user, null);

    // conta criada com e-mail e senha: o Google verificado vincula e invalida a senha antiga
    const reg = await post('/api/auth/register', { email: 'beto@example.com', nick: 'Beto', password: 'senha-do-beto-1', terms: true });
    assert.equal(reg.status, 201);
    const linked = await post('/api/auth/google', { credential: makeToken({ sub: '999', email: 'beto@example.com', name: 'Beto' }) });
    assert.equal(linked.status, 200);
    const lj = await linked.json();
    assert.equal(lj.user.nick, 'Beto');
    assert.equal(lj.linked, true);
    assert.equal((await post('/api/auth/login', { email: 'beto@example.com', password: 'senha-do-beto-1' })).status, 401);
    // a sessão antiga (de quem sabia a senha) também caiu
    assert.equal((await (await fetch(`${srv.url}/api/me`, { headers: { cookie: cookieOf(reg) } })).json()).user, null);
  } finally {
    await srv.stop();
    await certs.close();
  }
});

test('sem GOOGLE_CLIENT_ID o login com Google não existe', async () => {
  const srv = await startServer({ GOOGLE_CLIENT_ID: '' });
  try {
    assert.equal((await (await fetch(`${srv.url}/api/me`)).json()).googleClientId, null);
    const res = await fetch(`${srv.url}/api/auth/google`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"credential":"x"}' });
    assert.equal(res.status, 404);
  } finally { await srv.stop(); }
});
