import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { db } = await import('../server/db.js');
const { equip, equippedMap } = await import('../server/items.js');
const C = await import('../shared/config.js');

const { SHOP, SHOP_BY_ID, SLOTS, DESIGN } = C;
let uid = 0;
const user = () => {
  uid += 1;
  db.prepare('INSERT INTO users (email, nick, pass_hash, created_at) VALUES (?, ?, ?, ?)').run(`c${uid}@x.com`, `Cat${uid}`, 'x', Date.now());
  return uid;
};

test('catálogo coerente: ícone, nome, slot e desenhos apontam para coisas que existem', () => {
  for (const i of SHOP) {
    assert.ok(i.icon, `${i.id}: sem ícone`);
    assert.ok(i.name, `${i.id}: sem nome`);
    assert.ok(SLOTS.includes(i.slot), `${i.id}: slot ${i.slot} inválido`);
  }
  for (const [kind, id] of Object.entries(DESIGN.items)) assert.ok(SHOP_BY_ID[id], `design ${kind} -> ${id}`);
  assert.equal(new Set(SHOP.map((i) => i.id)).size, SHOP.length, 'ids repetidos');
});

test('todo item do catálogo pode ser equipado no seu slot, de graça', () => {
  const u = user();
  for (const item of SHOP) {
    assert.equal(equip(u, item.slot, item.id), true, `${item.id}: não equipou`);
    assert.equal(equippedMap(u)[item.slot], item.id);
  }
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
