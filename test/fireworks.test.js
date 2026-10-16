import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BURST_STYLE, burstShape, pickShow, particleBrightness, particleTint, fireworkAudio, panFromOffset,
} from '../src/fireworks-math.js';

const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const len = (d) => Math.hypot(d.x, d.y, d.z);

test('cada tipo de estouro devolve n partículas com velocidade finita', () => {
  for (const type of Object.keys(BURST_STYLE)) {
    const dirs = burstShape(type, 120, seeded());
    assert.equal(dirs.length, 120, type);
    for (const d of dirs) {
      assert.ok(Number.isFinite(d.x + d.y + d.z + d.speed), type);
      assert.ok(d.speed > 0 && d.speed <= 1.2, `${type}: velocidade ${d.speed}`);
    }
  }
});

test('peônia espalha em esfera: direções unitárias e nos dois hemisférios', () => {
  const dirs = burstShape('peony', 200, seeded());
  for (const d of dirs) assert.ok(Math.abs(len(d) - 1) < 1e-6);
  assert.ok(dirs.some((d) => d.y > 0.5) && dirs.some((d) => d.y < -0.5));
});

test('anel fica num plano (sem inclinação, y = 0) e cobre a volta toda', () => {
  const dirs = burstShape('ring', 60, seeded(), 0);
  for (const d of dirs) { assert.ok(Math.abs(d.y) < 1e-9); assert.ok(Math.abs(len(d) - 1) < 1e-6); }
  assert.ok(dirs.some((d) => d.x > 0.9) && dirs.some((d) => d.x < -0.9) && dirs.some((d) => d.z > 0.9) && dirs.some((d) => d.z < -0.9));
});

test('palmeira sai em braços: poucos ângulos distintos, com velocidades variadas ao longo do braço', () => {
  const dirs = burstShape('palm', 144, seeded());
  const angles = new Set(dirs.map((d) => Math.round(Math.atan2(d.z, d.x) * 100)));
  assert.ok(angles.size >= 5 && angles.size <= 12, `${angles.size} braços`);
  assert.ok(new Set(dirs.map((d) => d.speed.toFixed(2))).size > 5);
});

test('brilho: sobe rápido, depois só cai e apaga no fim da vida', () => {
  assert.ok(particleBrightness(0, 0) < 0.35);
  assert.ok(particleBrightness(0.06, 0) > 0.9);
  let prev = particleBrightness(0.1, 0);
  for (let k = 0.15; k <= 1; k += 0.05) { const b = particleBrightness(k, 0); assert.ok(b <= prev + 1e-9, `k=${k}`); prev = b; }
  assert.equal(particleBrightness(1, 0), 0);
  assert.equal(particleBrightness(1.4, 0), 0);
});

test('cintilar só reduz o brilho (nunca passa de 1) e varia com a fase', () => {
  const vals = [0, 1, 2, 3, 4].map((p) => particleBrightness(0.3, p, 0.5));
  assert.ok(vals.every((v) => v >= 0 && v <= 1));
  assert.ok(new Set(vals.map((v) => v.toFixed(3))).size > 1);
});

test('cor: nasce quase branca, passa pela cor do estouro e esfria para brasa laranja', () => {
  const base = [0.1, 0.4, 1];
  const [r0, g0, b0] = particleTint(0, base);
  assert.ok(r0 > 0.8 && g0 > 0.8 && b0 > 0.9);
  const mid = particleTint(0.4, base);
  assert.ok(mid[2] > mid[0] + 0.3, 'no meio ainda é azul');
  const late = particleTint(0.95, base);
  assert.ok(late[0] > late[2] + 0.2, 'no fim é quente (vermelho > azul)');
});

test('áudio: longe é mais baixo, mais atrasado e mais abafado; perto é cheio', () => {
  const near = fireworkAudio(3);
  const far = fireworkAudio(120);
  assert.ok(near.gain > far.gain && near.gain <= 1);
  assert.ok(far.gain >= 0.04);
  assert.ok(far.delay > near.delay && far.delay <= 1.5);
  assert.ok(far.cutoff < near.cutoff && far.cutoff >= 700);
});

test('pan: direita é positivo, esquerda negativo, à frente e perto fica no centro', () => {
  assert.ok(panFromOffset(30, 0) > 0.5);
  assert.ok(panFromOffset(-30, 0) < -0.5);
  assert.ok(Math.abs(panFromOffset(0, -40)) < 0.05);
  assert.ok(Math.abs(panFromOffset(0.5, 0.5)) < 0.2);
  assert.ok(Math.abs(panFromOffset(1e6, 0)) <= 0.9);
});

test('show: três estouros de tipos válidos e pelo menos dois diferentes', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const show = pickShow(3, seeded(seed));
    assert.equal(show.length, 3);
    assert.ok(show.every((t) => t in BURST_STYLE));
    assert.ok(new Set(show).size >= 2, `seed ${seed}`);
  }
});
