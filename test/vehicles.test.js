import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { carMesh, busMesh, soundTruckMesh, CAR_TYPES } from '../src/vehicles.js';

const box = (mesh) => new THREE.Box3().setFromObject(mesh);
const size = (b) => b.getSize(new THREE.Vector3());

test('cada tipo de carro tem proporções de carro de verdade e apoia as rodas no chão', () => {
  for (const type of CAR_TYPES) {
    const b = box(carMesh('#a8201a', '', type));
    const s = size(b);
    assert.ok(s.z > 3.9 && s.z < 5.0, `${type}: comprimento ${s.z.toFixed(2)}`);
    assert.ok(s.x > 1.6 && s.x < 2.3, `${type}: largura ${s.x.toFixed(2)}`);
    assert.ok(s.y > 1.4 && s.y < 1.95, `${type}: altura ${s.y.toFixed(2)}`);
    assert.ok(Math.abs(b.min.y) < 0.02, `${type}: rodas devem tocar o chão (min y = ${b.min.y.toFixed(3)})`);
  }
});

test('o ônibus e o carro de som têm o tamanho esperado', () => {
  const bus = size(box(busMesh('#1d4e9e')));
  assert.ok(bus.z > 11 && bus.z < 12.5 && bus.x > 2.4 && bus.x < 3.1 && bus.y > 3.2 && bus.y < 3.8, `ônibus ${bus.x.toFixed(2)}×${bus.y.toFixed(2)}×${bus.z.toFixed(2)}`);
  const truck = size(box(soundTruckMesh('#8f1019', new THREE.MeshBasicMaterial())));
  assert.ok(truck.z > 9 && truck.z < 11 && truck.x < 3.2, `carro de som ${truck.x.toFixed(2)}×${truck.y.toFixed(2)}×${truck.z.toFixed(2)}`);
});

test('malha única com um material por grupo, sem NaN e sem geometria vazia', () => {
  for (const mesh of [carMesh('#fff', '', 'sedan'), carMesh('#fff', 'carro-som', 'suv'), carMesh('#fff', 'carro-dourado', 'hatch'), busMesh('#c8312a')]) {
    const g = mesh.geometry;
    assert.ok(Array.isArray(mesh.material) && mesh.material.length === 6);
    assert.equal(g.groups.length, 6);
    assert.ok(g.groups.every((grp) => grp.count > 0));
    assert.ok(g.groups.every((grp, i) => grp.materialIndex === i));
    for (const v of g.attributes.position.array) assert.ok(Number.isFinite(v));
  }
});

test('carros da mesma cor compartilham a tinta; cores diferentes não', () => {
  assert.equal(carMesh('#123456').material[0], carMesh('#123456', '', 'suv').material[0]);
  assert.notEqual(carMesh('#123456').material[0], carMesh('#654321').material[0]);
});

test('o carro dourado ignora a cor pedida e fica metálico', () => {
  const m = carMesh('#000000', 'carro-dourado').material[0];
  assert.equal(m.color.getHexString(), 'd4af37');
  assert.ok(m.metalness > 0.8);
});
