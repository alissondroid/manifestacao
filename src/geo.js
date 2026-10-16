import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Funde várias peças numa geometria só, com a cor de cada peça nos vértices.
 * `parts`: [{ geo, color, pos?, rot? }]. As geometrias do three misturam malhas com e sem índice
 * (por exemplo, RoundedBoxGeometry vem sem índice), e a fusão exige todas iguais: tudo vira sem índice.
 */
export function mergeColored(parts) {
  const geos = parts.map(({
    geo, color, pos = [0, 0, 0], rot = [0, 0, 0],
  }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      new THREE.Vector3(1, 1, 1),
    ));
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  return mergeGeometries(geos, false);
}
