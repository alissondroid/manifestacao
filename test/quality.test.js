import test from 'node:test';
import assert from 'node:assert/strict';
import { createQualityMonitor, QUALITY } from '../src/quality.js';

/** Simula `seconds` de jogo a `fps` quadros por segundo. */
const run = (m, fps, seconds) => { for (let i = 0; i < fps * seconds; i += 1) m.frame(1 / fps); };

test('60 FPS estáveis: não muda de nível', () => {
  const drops = [];
  const m = createQualityMonitor({ onDrop: (l) => drops.push(l) });
  run(m, 60, 60);
  assert.deepEqual(drops, []);
  assert.equal(m.level, 0);
});

test('15 FPS: desce um nível a cada duas janelas ruins, até o mínimo', () => {
  const drops = [];
  const m = createQualityMonitor({ onDrop: (l) => drops.push(l) });
  run(m, 15, QUALITY.windowS * QUALITY.badWindows); // 2 janelas
  assert.deepEqual(drops, [1]);
  run(m, 15, 60);
  assert.deepEqual(drops, [1, 2, 3]);
  assert.equal(m.level, QUALITY.maxLevel);
});

test('uma janela ruim isolada não derruba a qualidade', () => {
  const drops = [];
  const m = createQualityMonitor({ onDrop: (l) => drops.push(l) });
  run(m, 10, QUALITY.windowS); // ruim
  run(m, 60, QUALITY.windowS); // boa: zera o contador
  run(m, 10, QUALITY.windowS); // ruim de novo, mas não seguida
  assert.deepEqual(drops, []);
});

test('quadros muito longos (aba em segundo plano) não contam', () => {
  const drops = [];
  const m = createQualityMonitor({ onDrop: (l) => drops.push(l) });
  for (let i = 0; i < 100; i += 1) m.frame(5); // 5 s por quadro
  run(m, 60, 30);
  assert.deepEqual(drops, []);
});

test('nunca passa do nível máximo e respeita o nível inicial salvo', () => {
  const drops = [];
  const m = createQualityMonitor({ level: QUALITY.maxLevel, onDrop: (l) => drops.push(l) });
  run(m, 10, 60);
  assert.deepEqual(drops, []);
  assert.equal(m.level, QUALITY.maxLevel);
});

test('definir o nível de fora zera a medição em andamento', () => {
  const drops = [];
  const m = createQualityMonitor({ onDrop: (l) => drops.push(l) });
  run(m, 10, QUALITY.windowS); // 1 janela ruim
  m.level = 0;
  run(m, 10, QUALITY.windowS); // 1 janela ruim (a anterior foi descartada)
  assert.deepEqual(drops, []);
});
