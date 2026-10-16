import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { db } = await import('../server/db.js');
const { createOrder, fulfill } = await import('../server/shop.js');
const { weekStart, weekEnd, rankingFor } = await import('../server/ranking.js');
const { SHOP_BY_ID } = await import('../shared/config.js');

const BRT = 3 * 3600_000;
let uid = 0;
function user(nick) {
  uid += 1;
  db.prepare('INSERT INTO users (email, nick, pass_hash, created_at) VALUES (?, ?, ?, ?)').run(`u${uid}@x.com`, nick, 'x', Date.now());
  return uid;
}
/** Pedido pago do `item` por `userId`, creditado ao grupo `side`, pago em `at`. */
function paid(userId, itemId, side, at = Date.now()) {
  const { id } = createOrder(userId, SHOP_BY_ID[itemId], 'simulated', side);
  fulfill(id);
  db.prepare('UPDATE orders SET paid_at = ? WHERE id = ?').run(at, id);
  return id;
}

test('a semana começa na segunda 00:00 de Brasília e termina sete dias depois', () => {
  // quarta-feira 14/10/2026 15:30 em Brasília = 18:30 UTC
  const wed = Date.UTC(2026, 9, 14, 18, 30);
  const start = weekStart(wed);
  assert.equal(new Date(start - BRT).getUTCDay(), 1); // segunda no relógio de Brasília
  assert.equal(new Date(start - BRT).getUTCHours(), 0);
  assert.equal(new Date(start - BRT).getUTCDate(), 12);
  assert.equal(weekEnd(wed) - start, 7 * 86_400_000);
  // domingo 23:59 ainda é a mesma semana; segunda 00:00 já é a próxima
  assert.equal(weekStart(Date.UTC(2026, 9, 19, 2, 59)), start);
  assert.equal(weekStart(Date.UTC(2026, 9, 19, 3, 0)), start + 7 * 86_400_000);
});

test('sem compras: os quatro grupos aparecem zerados e não há líder', () => {
  const r = rankingFor('all');
  assert.equal(r.sides.length, 4);
  assert.ok(r.sides.every((s) => s.total === 0 && s.buyers === 0 && s.orders === 0));
  assert.equal(r.leader, null);
});

test('soma só pedidos pagos, por grupo, e ordena do maior para o menor', () => {
  const ana = user('Ana');
  const beto = user('Beto');
  const cida = user('Cida');
  paid(ana, 'vip-30', 0); // 990
  paid(ana, 'fogos-5', 0); // 300
  paid(beto, 'gestos-pack', 1); // 400
  paid(cida, 'bone', 2); // 300
  createOrder(beto, SHOP_BY_ID['kit-festa'], 'simulated', 1); // pendente: não conta
  const r = rankingFor('all');
  assert.deepEqual(r.sides.map((s) => [s.side, s.total]), [[0, 1290], [1, 400], [2, 300], [3, 0]]);
  assert.deepEqual(r.sides.map((s) => s.rank), [1, 2, 3, 4]);
  assert.equal(r.sides[0].buyers, 1);
  assert.equal(r.sides[0].orders, 2);
  assert.equal(r.leader, 0);
});

test('pedido sem grupo não entra no ranking', () => {
  const dan = user('Dan');
  const before = rankingFor('all').sides.reduce((s, x) => s + x.total, 0);
  paid(dan, 'bone', null);
  assert.equal(rankingFor('all').sides.reduce((s, x) => s + x.total, 0), before);
});

test('a aba da semana ignora compras de semanas anteriores', () => {
  const eli = user('Eli');
  const now = Date.UTC(2026, 9, 14, 18, 30);
  paid(eli, 'coroa', 3, weekStart(now) - 60_000); // domingo anterior
  paid(eli, 'oculos', 3, weekStart(now) + 60_000); // segunda desta semana
  const week = rankingFor('week', now).sides.find((s) => s.side === 3);
  assert.equal(week.total, 200);
  const all = rankingFor('all', now).sides.find((s) => s.side === 3);
  assert.equal(all.total, 700);
});

test('maiores apoiadores: por grupo, do maior ao menor, e quem excluiu a conta não aparece', () => {
  const f1 = user('Fabi');
  const f2 = user('Gui');
  const f3 = user('Excluído77');
  paid(f1, 'coroa', 1);
  paid(f2, 'asas', 1);
  paid(f3, 'capa', 1);
  const r = rankingFor('all');
  const top = r.top[1];
  assert.ok(top.length <= 5);
  assert.deepEqual(top.map((t) => t.nick).slice(0, 2), ['Gui', 'Fabi']);
  assert.ok(!top.some((t) => /^Excluído/.test(t.nick)));
  // o dinheiro de quem excluiu a conta continua somando no grupo
  assert.ok(r.sides.find((s) => s.side === 1).total >= 400 + 500 + 600 + 500);
});

test('mine: quanto o próprio usuário apoiou no período', () => {
  const hana = user('Hana');
  paid(hana, 'coroa', 2);
  paid(hana, 'oculos', 2);
  assert.equal(rankingFor('all', Date.now(), hana).mine, 700);
  assert.equal(rankingFor('all', Date.now(), 999999).mine, 0);
});
