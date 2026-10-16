import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { snapShadowFocus } from '../src/shadow.js';

const SUN = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
const TEXEL = 96 / 2048;

/** Coordenadas de um ponto do mundo no espaço da câmera de sombra (como a luz as vê), medidas em texels. */
function texelCoords(point, focus) {
  const cam = new THREE.Object3D();
  cam.position.copy(focus).addScaledVector(SUN, 120);
  cam.lookAt(focus); // mesma convenção da câmera da DirectionalLight
  cam.updateMatrixWorld(true);
  const p = point.clone().applyMatrix4(cam.matrixWorldInverse ?? cam.matrixWorld.clone().invert());
  return [p.x / TEXEL, p.y / TEXEL];
}

test('o ponto do mundo fica sempre na mesma fração do texel enquanto o jogador anda (sombra sem tremor)', () => {
  const fixed = new THREE.Vector3(7.3, 0.4, -11.9); // um canto de carro
  const frac = (v) => v - Math.floor(v);
  const base = new THREE.Vector3();
  snapShadowFocus(base, 3.0, 4.0, SUN, TEXEL);
  const [bx, by] = texelCoords(fixed, base);
  for (let i = 1; i <= 200; i += 1) {
    const f = new THREE.Vector3();
    snapShadowFocus(f, 3.0 + i * 0.013, 4.0 - i * 0.021, SUN, TEXEL); // passos de 1 a 2 cm, muito menores que o texel
    const [x, y] = texelCoords(fixed, f);
    const dx = Math.abs(frac(x) - frac(bx));
    const dy = Math.abs(frac(y) - frac(by));
    assert.ok(Math.min(dx, 1 - dx) < 1e-3 && Math.min(dy, 1 - dy) < 1e-3, `passo ${i}: fração do texel mudou (${dx.toFixed(4)}, ${dy.toFixed(4)})`);
  }
});

test('sem a âncora no espaço da luz (só nos eixos do mundo) a fração do texel varia: é o tremor que a correção elimina', () => {
  const fixed = new THREE.Vector3(7.3, 0.4, -11.9);
  const frac = (v) => v - Math.floor(v);
  const worldSnap = (x, z) => new THREE.Vector3(Math.round(x / TEXEL) * TEXEL, 0, Math.round(z / TEXEL) * TEXEL);
  const seen = new Set();
  for (let i = 0; i < 60; i += 1) {
    const [x] = texelCoords(fixed, worldSnap(3.0 + i * 0.013, 4.0 - i * 0.021));
    seen.add(frac(x).toFixed(2));
  }
  assert.ok(seen.size > 5, 'a ancoragem antiga deveria variar a fração do texel');
});

test('o foco ancorado fica perto de onde o jogador está (no máximo um texel de diferença)', () => {
  const f = new THREE.Vector3();
  snapShadowFocus(f, 12.345, -67.89, SUN, TEXEL);
  assert.ok(Math.hypot(f.x - 12.345, f.z + 67.89) <= TEXEL * 1.5);
});
