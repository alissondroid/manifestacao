import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { db } = await import('../server/db.js');
const { fileReport, recordChat, REPORT } = await import('../server/reports.js');

const T0 = 1_700_000_000_000;
const who = (n) => ({ key: `u${n}`, nick: `Jogador${n}` });

test('denúncia grava o apelido e as últimas mensagens do denunciado', () => {
  recordChat('u9', 'Chato', 'mensagem 1', T0);
  recordChat('u9', 'Chato', 'mensagem 2', T0 + 1);
  const res = fileReport(who(1), { key: 'u9', nick: 'Chato' }, T0 + 2);
  assert.equal(res.ok, true);
  assert.equal(res.mute, false);
  const row = db.prepare('SELECT * FROM reports WHERE target_nick = ?').get('chato');
  assert.deepEqual(JSON.parse(row.context), ['mensagem 1', 'mensagem 2']);
});

test('não deixa denunciar o mesmo jogador de novo, nem em rajada', () => {
  assert.equal(fileReport(who(3), who(8), T0).ok, true);
  assert.equal(fileReport(who(3), who(7), T0 + 1000).ok, false); // cooldown
  assert.equal(fileReport(who(3), who(8), T0 + REPORT.cooldownMs + 1).ok, false); // já denunciou
  assert.equal(fileReport(who(3), who(8), T0 + REPORT.sameTargetMs + 5000).ok, true); // prazo passou
});

test('três pessoas diferentes silenciam automaticamente; repetir a mesma pessoa não conta', () => {
  const target = { key: 'u50', nick: 'Spammer' };
  assert.equal(fileReport(who(11), target, T0).mute, false);
  assert.equal(fileReport(who(12), target, T0).mute, false);
  assert.equal(fileReport(who(12), target, T0 + 20_000).ok, false); // mesma pessoa
  assert.equal(fileReport(who(13), target, T0 + 20_000).mute, true);
});

test('limite de denúncias por hora', () => {
  let ok = 0;
  for (let i = 0; i < 15; i += 1) {
    if (fileReport(who(99), { key: `u${200 + i}`, nick: `Alvo${i}` }, T0 + 5_000_000 + i * (REPORT.cooldownMs + 1)).ok) ok += 1;
  }
  assert.equal(ok, REPORT.perHour);
});
