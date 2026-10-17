import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { db } = await import('../server/db.js');
const { createOrder, fulfill, owns, inventoryOf, vipUntil, canBuy, equip, equippedMap } = await import('../server/shop.js');
const C = await import('../shared/config.js');

const { SHOP, SHOP_BY_ID, SLOTS, CONSUMABLES, DESIGN } = C;
let uid = 0;
const user = () => {
  uid += 1;
  db.prepare('INSERT INTO users (email, nick, pass_hash, created_at) VALUES (?, ?, ?, ?)').run(`c${uid}@x.com`, `Cat${uid}`, 'x', Date.now());
  return uid;
};
const pay = (userId, item) => { const { id } = createOrder(userId, item, 'simulated', 0); return fulfill(id); };
const sellable = SHOP.filter((i) => !i.hidden && i.price > 0);

test('catálogo coerente: preço, ícone, slot, consumíveis e desenhos apontam para coisas que existem', () => {
  for (const i of SHOP) {
    assert.ok(i.icon, `${i.id}: sem ícone`);
    assert.ok(i.name, `${i.id}: sem nome`);
    if (!i.hidden) assert.ok(Number.isInteger(i.price) && i.price > 0, `${i.id}: preço inválido`);
    if (!i.kind) assert.ok(SLOTS.includes(i.slot), `${i.id}: slot ${i.slot} inválido`);
    for (const k of Object.keys(i.give ?? {})) assert.ok(CONSUMABLES[k], `${i.id}: consumível ${k} desconhecido`);
    for (const id of i.contains ?? []) assert.ok(SHOP_BY_ID[id], `${i.id}: contém ${id}, que não existe`);
  }
  for (const [kind, id] of Object.entries(DESIGN.items)) assert.ok(SHOP_BY_ID[id], `design ${kind} -> ${id}`);
  assert.equal(new Set(SHOP.map((i) => i.id)).size, SHOP.length, 'ids repetidos');
});

test('o desconto que a descrição de cada pacote promete é o desconto real (±1 ponto)', () => {
  for (const i of SHOP.filter((x) => x.kind === 'bundle')) {
    const sum = i.contains.reduce((s, id) => s + SHOP_BY_ID[id].price, 0);
    const real = Math.round((1 - i.price / sum) * 100);
    const claim = Number(/(\d+)% mais barato/.exec(i.desc)?.[1]);
    assert.ok(claim, `${i.id}: a descrição não diz o desconto`);
    assert.ok(Math.abs(real - claim) <= 1, `${i.id}: descrição diz ${claim}%, o desconto real é ${real}%`);
  }
});

test('todo item à venda é entregue ao ser pago, do jeito do seu tipo', () => {
  for (const item of sellable) {
    const u = user();
    assert.ok(pay(u, item), `${item.id}: não entregou`);
    if (item.kind === 'vip') {
      assert.ok(vipUntil(u) > Date.now() + (item.days - 1) * 86_400_000, `${item.id}: VIP não ativou`);
      for (const [k, q] of Object.entries(item.give ?? {})) assert.equal(inventoryOf(u)[k], q, `${item.id}: brinde ${k}`);
    } else if (item.kind === 'consumable') {
      for (const [k, q] of Object.entries(item.give)) assert.equal(inventoryOf(u)[k], q, `${item.id}: ${k}`);
    } else if (item.kind === 'bundle') {
      for (const id of item.contains) assert.ok(owns(u, id), `${item.id}: faltou ${id}`);
    } else if (item.kind === 'donation') {
      assert.ok(owns(u, item.grant), `${item.id}: faltou o selo`);
    } else {
      assert.ok(owns(u, item.id), `${item.id}: não ficou na conta`);
    }
  }
});

test('todo cosmético comprado pode ser equipado no seu slot', () => {
  const u = user();
  for (const item of sellable.filter((i) => !i.kind)) {
    pay(u, item);
    equip(u, item.slot, item.id);
    assert.equal(equippedMap(u)[item.slot], item.id, `${item.id}: não equipou`);
  }
});

test('itens exclusivos VIP: só podem ser comprados com o VIP ativo; depois de comprados são da conta', () => {
  const exclusive = SHOP.filter((i) => i.vip);
  assert.ok(exclusive.length >= 4, 'esperava pelo menos 4 itens exclusivos');
  assert.ok(exclusive.every((i) => !i.kind || i.kind === 'bundle'), 'exclusivo VIP é cosmético ou pacote, nunca VIP/doação/consumível');
  const u = user();
  for (const i of exclusive) assert.equal(canBuy(u, i), false, `${i.id}: comprável sem VIP`);
  pay(u, SHOP.find((i) => i.kind === 'vip'));
  for (const i of exclusive) assert.equal(canBuy(u, i), true, `${i.id}: não comprável com VIP`);
  pay(u, SHOP_BY_ID.asas);
  db.prepare('UPDATE users SET vip_until = 0 WHERE id = ?').run(u); // o VIP vence
  assert.ok(owns(u, 'asas'), 'o item continua da conta depois que o VIP vence');
});

test('VIP e reações: as reações exclusivas existem e sobram reações grátis', () => {
  assert.ok(C.PREMIUM.reactions.length >= 2);
  assert.ok(C.PREMIUM.reactions.every((i) => i >= 0 && i < C.REACTIONS.length));
  assert.ok(C.REACTIONS.length - C.PREMIUM.reactions.length >= 4, 'reações grátis demais poucas');
});

test('cada lado tem um apelido único para o link de convite', async () => {
  const { SIDES, SIDE_SLUGS } = await import('../shared/config.js');
  assert.equal(SIDE_SLUGS.length, SIDES.length);
  assert.equal(new Set(SIDE_SLUGS).size, SIDES.length);
  for (const s of SIDE_SLUGS) assert.match(s, /^[a-z-]+$/);
});

test('multidão: mais figurantes nos níveis bons e menos quando a qualidade cai', () => {
  const { counts } = C.CROWD;
  assert.equal(counts.length, 4);
  assert.ok(counts[0] > 110, 'mais que os 110 de antes');
  for (let i = 1; i < counts.length; i += 1) assert.ok(counts[i] < counts[i - 1]);
});

test('figurantes especiais: vendedores, policiais e reportagem existem e em número razoável', () => {
  const { NPCS } = C;
  for (const k of ['water', 'policePairs', 'pressTeams']) assert.ok(NPCS[k] >= 1 && NPCS[k] <= 12, k);
});
