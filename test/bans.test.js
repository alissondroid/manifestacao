import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { db } = await import('../server/db.js');
const bans = await import('../server/bans.js');

const T0 = 1_700_000_000_000;

test('ban permanente e temporário; expira sozinho', () => {
  bans.addBan('ip:1.2.3.4', { reason: 'spam' }, T0);
  bans.addBan('u7', { minutes: 10 }, T0);
  assert.ok(bans.isBanned(['ip:1.2.3.4'], T0 + 1e12));
  assert.ok(bans.isBanned(['u7'], T0 + 5 * 60_000));
  assert.equal(bans.isBanned(['u7'], T0 + 11 * 60_000), null);
  assert.equal(bans.isBanned(['u8', 'ip:9.9.9.9'], T0), null);
});

test('isBanned confere todas as chaves da pessoa (conta ou IP)', () => {
  bans.addBan('u20', {}, T0);
  assert.ok(bans.isBanned(bans.keysOf({ ip: '5.5.5.5', userId: 20 }), T0));
  assert.equal(bans.isBanned(bans.keysOf({ ip: '5.5.5.5', userId: 21 }), T0), null);
});

test('removeBan e listBans', () => {
  const id = bans.addBan('u30', {}, Date.now());
  assert.ok(bans.listBans().some((b) => b.id === id));
  assert.equal(bans.removeBan(id), true);
  assert.equal(bans.removeBan(id), false);
  assert.ok(!bans.listBans().some((b) => b.id === id));
});

test('resolveKey: chave direta válida, apelido de conta, alvo de denúncia; recusa lixo', () => {
  db.prepare('INSERT INTO users (id, email, nick, pass_hash, created_at) VALUES (900, ?, ?, ?, ?)').run('z@z.com', 'Zulu', 'x', T0);
  db.prepare('INSERT INTO reports (at, reporter_nick, reporter_key, target_nick, target_key, context) VALUES (?, ?, ?, ?, ?, ?)')
    .run(T0, 'A', 'u1', 'convidado', 'ip:8.8.8.8', '[]');
  assert.equal(bans.resolveKey({ key: 'u12' }), 'u12');
  assert.equal(bans.resolveKey({ key: 'ip:1.2.3.4' }), 'ip:1.2.3.4');
  assert.equal(bans.resolveKey({ key: "u1'; DROP TABLE users;--" }), null);
  assert.equal(bans.resolveKey({ nick: 'Zulu' }), 'u900');
  assert.equal(bans.resolveKey({ nick: 'Convidado' }), 'ip:8.8.8.8');
  assert.equal(bans.resolveKey({ nick: 'ninguem' }), null);
});
