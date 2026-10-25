import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { db } = await import('../server/db.js');
const shop = await import('../server/items.js');
const auth = await import('../server/auth.js');

const newUser = (nick) => Number(db.prepare('INSERT INTO users (email, nick, pass_hash, created_at) VALUES (?, ?, ?, ?)')
  .run(`${nick}@teste.com`, nick, 'x', Date.now()).lastInsertRowid);

test('equip só aceita item do catálogo e no slot certo', () => {
  const u = newUser('fabi');
  assert.equal(shop.equip(u, 'head', 'item-inexistente'), false);
  assert.equal(shop.equip(u, 'shirt', 'bone'), false); // slot errado
  assert.equal(shop.equip(u, 'head', 'bone'), true);
  assert.equal(shop.equippedMap(u).head, 'bone');
  assert.equal(shop.equip(u, 'head', null), true);
  assert.equal(shop.equippedMap(u).head, undefined);
});

test('saveDesign valida cores, símbolo e filtra o texto', () => {
  const u = newUser('gabi');
  const filter = (t) => t.replace(/feio/gi, '***');
  const d = shop.saveDesign(u, 'sign', { text: '<b>Fora feio</b>', bg: '#ff0000', fg: 'nao-e-cor', emblem: 'x' }, filter);
  assert.ok(d);
  assert.ok(!d.text.includes('<'));
  assert.ok(d.text.includes('***'));
  assert.equal(d.emblem, '');
  assert.equal(shop.saveDesign(u, 'tipo-invalido', {}, filter), null);
});

test('hash de senha: confere a certa, recusa a errada', async () => {
  const stored = await auth.hashPassword('senha-forte-123');
  assert.equal(await auth.verifyPassword('senha-forte-123', stored), true);
  assert.equal(await auth.verifyPassword('outra-senha', stored), false);
  assert.equal(await auth.verifyPassword('x', 'lixo'), false);
});

test('hash de senha usa scrypt forte (N=2^15, r=8, p=3) com formato versionado e sal próprio', async () => {
  const a = await auth.hashPassword('senha-forte-123');
  const b = await auth.hashPassword('senha-forte-123');
  assert.match(a, /^s1\$32768\$8\$3\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.notEqual(a, b, 'sal repetido');
  assert.equal(auth.needsRehash(a), false);
});

test('senha antiga (formato sal:chave, N=16384) ainda confere e é marcada para atualizar', async () => {
  const crypto = await import('node:crypto');
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync('senha-antiga-1', salt, 64, { N: 16384, r: 8, p: 1 });
  const legacy = `${salt.toString('hex')}:${key.toString('hex')}`;
  assert.equal(await auth.verifyPassword('senha-antiga-1', legacy), true);
  assert.equal(await auth.verifyPassword('errada', legacy), false);
  assert.equal(auth.needsRehash(legacy), true);
  assert.equal(auth.needsRehash(''), true);
});

test('hashes malformados ou com parâmetros absurdos são recusados sem estourar memória', async () => {
  for (const bad of ['', 'x', ':', 'a:b', 's1$1$1$1$00$00', 's1$99999999$8$3$aa$bb', 's1$32768$8$3$zz$zz', 's1$32768$8$1000$aa$bb']) {
    assert.equal(await auth.verifyPassword('qualquer', bad), false, bad);
  }
});

test('validações de e-mail, apelido e senha', () => {
  assert.ok(auth.validEmail('a@b.com'));
  assert.ok(!auth.validEmail('a@b'));
  assert.ok(!auth.validEmail('a b@c.com'));
  assert.ok(auth.validNick('Ana_1'));
  assert.ok(!auth.validNick('ab'));
  assert.ok(!auth.validNick(' Ana'));
  assert.ok(!auth.validNick('<script>'));
  assert.ok(auth.validPassword('12345678'));
  assert.ok(!auth.validPassword('1234567'));
});

test('rateLimit libera até o máximo e depois bloqueia', () => {
  for (let i = 0; i < 3; i += 1) assert.equal(auth.rateLimit('k-teste', 3, 60_000), true);
  assert.equal(auth.rateLimit('k-teste', 3, 60_000), false);
  assert.equal(auth.rateLimit('outra-chave', 3, 60_000), true);
});

test('parseCookies lê valores e ignora cookie malformado', () => {
  assert.deepEqual(auth.parseCookies('sid=abc; x=%20y; bom=1'), { sid: 'abc', x: ' y', bom: '1' });
  assert.equal(auth.parseCookies('sid=%E0%A4%A').sid, '%E0%A4%A');
});

test('sessão: cria, resolve o usuário e destrói', () => {
  const u = newUser('hugo');
  const token = auth.createSession(u);
  assert.equal(auth.userFromToken(token)?.nick, 'hugo');
  auth.destroySession(token);
  assert.equal(auth.userFromToken(token), null);
});

test('deleteAccount apaga a conta, os itens equipados e as sessões', () => {
  const u = newUser('ivo');
  shop.equip(u, 'head', 'bone');
  const token = auth.createSession(u);
  auth.deleteAccount(u);
  assert.equal(auth.userFromToken(token), null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM equipped WHERE user_id = ?').get(u).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users WHERE id = ?').get(u).n, 0);
});
