import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { db } = await import('../server/db.js');
const shop = await import('../server/shop.js');
const auth = await import('../server/auth.js');
const { SHOP_BY_ID } = await import('../shared/config.js');

const newUser = (nick) => Number(db.prepare('INSERT INTO users (email, nick, pass_hash, created_at) VALUES (?, ?, ?, ?)')
  .run(`${nick}@teste.com`, nick, 'x', Date.now()).lastInsertRowid);
const buy = (userId, itemId) => shop.createOrder(userId, SHOP_BY_ID[itemId], 'simulated').id;

test('fulfill é idempotente: entregar duas vezes não duplica o item', () => {
  const u = newUser('ana');
  const order = buy(u, 'camisa-brasil');
  assert.equal(shop.fulfill(order), true);
  assert.equal(shop.fulfill(order), true); // webhook e retorno chegando juntos
  assert.equal(db.prepare('SELECT COUNT(*) n FROM owned WHERE user_id = ?').get(u).n, 1);
  assert.ok(shop.owns(u, 'camisa-brasil'));
});

test('consumível soma uma vez só e spend desconta de forma atômica', () => {
  const u = newUser('bia');
  const order = buy(u, 'fogos-5');
  shop.fulfill(order);
  shop.fulfill(order);
  assert.equal(shop.inventoryOf(u).fogos, 5);
  for (let i = 0; i < 5; i += 1) assert.equal(shop.spend(u, 'fogos'), true);
  assert.equal(shop.spend(u, 'fogos'), false);
  assert.equal(shop.inventoryOf(u).fogos ?? 0, 0);
});

test('VIP renovado soma os dias ao fim do VIP atual', () => {
  const u = newUser('caio');
  shop.fulfill(buy(u, 'vip-30'));
  const first = shop.vipUntil(u);
  assert.ok(shop.isVip(u));
  shop.fulfill(buy(u, 'vip-30'));
  const added = shop.vipUntil(u) - first;
  assert.equal(added, 30 * 86_400_000);
});

test('pagamento confirmado vale mesmo se o pedido foi marcado como falho', () => {
  const u = newUser('duda');
  const order = buy(u, 'bone');
  shop.setOrderStatus(order, 'failed');
  assert.equal(shop.fulfill(order), true);
  assert.ok(shop.owns(u, 'bone'));
});

test('canBuy: item único só uma vez, consumível sempre, pacote só enquanto faltar item', () => {
  const u = newUser('edu');
  assert.equal(shop.canBuy(u, SHOP_BY_ID['bone']), true);
  shop.fulfill(buy(u, 'bone'));
  assert.equal(shop.canBuy(u, SHOP_BY_ID['bone']), false);
  shop.fulfill(buy(u, 'fogos-5'));
  assert.equal(shop.canBuy(u, SHOP_BY_ID['fogos-5']), true);
  const kit = SHOP_BY_ID['kit-manifestante'];
  assert.equal(shop.canBuy(u, kit), true);
  shop.fulfill(buy(u, 'kit-manifestante'));
  assert.equal(shop.canBuy(u, kit), false);
});

test('equip só aceita item comprado e no slot certo', () => {
  const u = newUser('fabi');
  assert.equal(shop.equip(u, 'head', 'bone'), false); // não comprou
  shop.fulfill(buy(u, 'bone'));
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

test('deleteAccount anonimiza e apaga itens e sessões, mantendo o pedido', () => {
  const u = newUser('ivo');
  const order = buy(u, 'bone');
  shop.fulfill(order);
  const token = auth.createSession(u);
  auth.deleteAccount(u);
  assert.equal(auth.userFromToken(token), null);
  assert.equal(shop.owns(u, 'bone'), false);
  assert.ok(shop.getOrder(order));
  assert.match(db.prepare('SELECT nick FROM users WHERE id = ?').get(u).nick, /^Excluído/);
});
