import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeColored } from '../src/geo.js';

test('mergeColored funde peças com e sem índice (caixa arredondada, cilindro, esfera, caixa)', () => {
  const g = mergeColored([
    { geo: new RoundedBoxGeometry(0.4, 0.04, 0.4, 2, 0.015), color: '#26282b', pos: [0, 0.02, 0] },
    { geo: new THREE.CylinderGeometry(0.035, 0.125, 0.62, 18), color: '#f2661c', pos: [0, 0.35, 0] },
    { geo: new THREE.SphereGeometry(0.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), color: '#222529', pos: [0, 0.9, 0] },
    { geo: new THREE.BoxGeometry(0.1, 0.1, 0.1), color: '#ffffff', pos: [0.3, 0.05, 0], rot: [0, 0.5, 0] },
  ]);
  assert.ok(g, 'a fusão não pode devolver null');
  assert.equal(g.index, null);
  assert.ok(g.attributes.color && g.attributes.position && g.attributes.normal);
  assert.equal(g.attributes.color.count, g.attributes.position.count);
});

test('mergeColored guarda a cor de cada peça nos vértices', () => {
  const g = mergeColored([
    { geo: new THREE.BoxGeometry(1, 1, 1), color: '#ff0000' },
    { geo: new THREE.BoxGeometry(1, 1, 1), color: '#0000ff', pos: [5, 0, 0] },
  ]);
  const col = g.attributes.color;
  const first = [col.getX(0), col.getY(0), col.getZ(0)];
  const last = [col.getX(col.count - 1), col.getY(col.count - 1), col.getZ(col.count - 1)];
  assert.ok(first[0] > 0.9 && first[2] < 0.1);
  assert.ok(last[2] > 0.9 && last[0] < 0.1);
});

test('mergeColored não altera a geometria original', () => {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const before = box.attributes.position.array.slice();
  mergeColored([{ geo: box, color: '#fff', pos: [3, 3, 3] }]);
  assert.deepEqual([...box.attributes.position.array], [...before]);
  assert.equal(box.attributes.color, undefined);
});
