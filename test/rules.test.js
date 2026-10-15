import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEED_SLACK } from '../shared/config.js';
import {
  cleanText, isReservedNick, uniqueNick, spendMoveBudget,
} from '../server/rules.js';

test('cleanText remove controles e < >, junta espaços e corta no limite', () => {
  assert.equal(cleanText('  oi\u0000 <b>você</b>\n\n tudo  bem  ', 50), 'oi bvocê/b tudo bem');
  assert.equal(cleanText('abcdef', 3), 'abc');
  assert.equal(cleanText(null, 5), '');
});

test('isReservedNick bloqueia nomes que imitam o sistema', () => {
  assert.ok(isReservedNick('Sistema'));
  assert.ok(isReservedNick(' ADMIN '));
  assert.ok(!isReservedNick('Maria'));
});

test('uniqueNick evita repetir apelido online (sem diferenciar maiúsculas)', () => {
  assert.equal(uniqueNick('Ana', ['Bia'], 16), 'Ana');
  assert.equal(uniqueNick('Ana', ['ana'], 16), 'Ana2');
  assert.equal(uniqueNick('Ana', ['Ana', 'Ana2'], 16), 'Ana3');
  const long = 'x'.repeat(16);
  const out = uniqueNick(long, [long], 16);
  assert.equal(out.length, 16);
  assert.ok(out.endsWith('2'));
});

test('spendMoveBudget aceita velocidade normal e barra velocidade acima do limite', () => {
  const limit = 9;
  const mk = () => ({ budget: limit * 0.6, budgetAt: 0 });
  // andar a 8 m/s a 20 mensagens por segundo, durante 5 s
  const p = mk();
  let now = 0;
  for (let i = 0; i < 100; i += 1) {
    now += 50;
    assert.ok(spendMoveBudget(p, now, limit, 8 * 0.05), 'movimento legítimo foi recusado');
  }
  // mais que o dobro da velocidade: só passa o que cabe no orçamento (≈ limite × tolerância)
  const h = mk();
  now = 0;
  let accepted = 0;
  for (let i = 0; i < 100; i += 1) {
    now += 50;
    if (spendMoveBudget(h, now, limit, 20 * 0.05)) accepted += 20 * 0.05;
  }
  assert.ok(accepted / 5 < limit * SPEED_SLACK + 1.5, `velocidade efetiva ${(accepted / 5).toFixed(1)} m/s`);
  assert.ok(accepted / 5 > limit, 'não deveria barrar abaixo do limite');
});

test('spendMoveBudget: muitas mensagens pequenas não burlam o limite', () => {
  const p = { budget: 0, budgetAt: 0 };
  let now = 0;
  let moved = 0;
  for (let i = 0; i < 4000; i += 1) { // 40 mensagens por segundo durante 100 s, tentando andar 0,6 m cada (24 m/s)
    now += 25;
    if (spendMoveBudget(p, now, 9, 0.6)) moved += 0.6;
  }
  const speed = moved / 100;
  assert.ok(speed <= 9 * 1.25 + 0.2, `velocidade efetiva ${speed.toFixed(1)} m/s acima do permitido`);
});
