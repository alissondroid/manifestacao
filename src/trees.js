import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture } from './textures.js';

// Árvores com tronco, galhos e copa feita de cartões de folhagem (textura com transparência).
// As normais da copa apontam para fora do centro de cada tufo, o que dá volume à luz;
// tufos de dentro e de baixo ficam mais escuros (oclusão falsa nas cores dos vértices).
// A cor de cada árvore vem da cor da instância: verdes variados e ipês amarelos e roxos.

let leafTex = null;
function leafTexture() {
  if (leafTex) return leafTex;
  leafTex = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const blobs = Array.from({ length: 7 }, () => [w * (0.2 + Math.random() * 0.6), h * (0.2 + Math.random() * 0.6), w * (0.14 + Math.random() * 0.12)]);
    blobs.push([w / 2, h / 2, w * 0.28]);
    // galhinhos
    ctx.strokeStyle = 'rgba(70,55,40,0.9)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2, h * 0.95);
      ctx.quadraticCurveTo(w * (0.3 + Math.random() * 0.4), h * 0.6, w * (0.15 + Math.random() * 0.7), h * (0.15 + Math.random() * 0.4));
      ctx.stroke();
    }
    for (let i = 0; i < 2600; i++) {
      const [bx, by, br] = blobs[Math.floor(Math.random() * blobs.length)];
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * br;
      const x = bx + Math.cos(a) * d;
      const y = by + Math.sin(a) * d;
      const edge = d / br;
      const l = Math.round(150 + Math.random() * 105 - edge * 40);
      ctx.fillStyle = `rgb(${l - 8},${l},${l - 22})`;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.random() * Math.PI * 2);
      ctx.beginPath();
      ctx.ellipse(0, 0, 9 + Math.random() * 7, 4 + Math.random() * 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; // nervura
      ctx.fillRect(-8, -0.5, 16, 1);
      ctx.restore();
    }
  }, { tile: false });
  return leafTex;
}

function colorize(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Galho cilíndrico de `a` até `b`. */
function limb(a, b, r0, r1, color) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r1, r0, len, 7, 1).translate(0, len / 2, 0);
  geo.applyMatrix4(new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()), new THREE.Vector3(1, 1, 1)));
  return colorize(geo, color);
}

/**
 * Monta uma espécie. `spec.tufts`: [x, y, z, raio] dos tufos de folhagem (unidade = 1 árvore de escala 1).
 * Retorna { trunk, crown } (geometrias).
 */
function buildSpecies(spec, rng) {
  const bark = spec.bark || '#5a4a3c';
  const trunkTop = new THREE.Vector3(0, spec.trunkH, 0);
  const parts = [limb(new THREE.Vector3(0, 0, 0), trunkTop, spec.trunkR, spec.trunkR * 0.6, bark)];
  const crown = [];
  const quad = new THREE.PlaneGeometry(1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  for (const [tx, ty, tz, tr] of spec.tufts) {
    const c = new THREE.Vector3(tx, ty, tz);
    parts.push(limb(trunkTop, c.clone().multiplyScalar(0.85).setY(ty - tr * 0.4), spec.trunkR * 0.55, spec.trunkR * 0.22, bark));
    const n = Math.round(spec.density * tr * tr);
    for (let i = 0; i < n; i++) {
      // ponto no elipsoide do tufo, mais denso perto da superfície
      const dir = new THREE.Vector3(rng() * 2 - 1, (rng() * 2 - 1) * 0.8, rng() * 2 - 1).normalize();
      const r = tr * (0.35 + 0.65 * Math.sqrt(rng()));
      const pos = c.clone().add(new THREE.Vector3(dir.x * r, dir.y * r * spec.flat, dir.z * r));
      const size = tr * (0.9 + rng() * 0.6);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI));
      const card = quad.clone().applyMatrix4(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(size, size, size)));
      // normal para fora do tufo, puxada para cima (luz do céu)
      const nrm = new THREE.Vector3().subVectors(pos, c).normalize().addScaledVector(up, 0.45).normalize();
      // escurece por dentro e por baixo
      const depth = r / tr;
      const shade = THREE.MathUtils.clamp(0.45 + 0.4 * depth + 0.25 * ((pos.y - (ty - tr)) / (2 * tr)), 0.35, 1.05);
      const geoCard = card.toNonIndexed();
      const cnt = geoCard.attributes.position.count;
      const normals = new Float32Array(cnt * 3);
      const colors = new Float32Array(cnt * 3);
      for (let k = 0; k < cnt; k++) {
        normals.set([nrm.x, nrm.y, nrm.z], k * 3);
        colors.set([shade, shade, shade], k * 3);
      }
      geoCard.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geoCard.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      // verso: mesmo cartão com a ordem dos vértices invertida (mesma normal para fora)
      const back = geoCard.clone();
      const bp = back.attributes.position;
      const buv = back.attributes.uv;
      for (let t = 0; t < cnt; t += 3) {
        for (const attr of [bp, buv]) {
          const tmp = [attr.getX(t + 1), attr.getY(t + 1), attr.itemSize > 2 ? attr.getZ(t + 1) : 0];
          attr.setXY(t + 1, attr.getX(t + 2), attr.getY(t + 2));
          if (attr.itemSize > 2) attr.setZ(t + 1, attr.getZ(t + 2));
          attr.setXY(t + 2, tmp[0], tmp[1]);
          if (attr.itemSize > 2) attr.setZ(t + 2, tmp[2]);
        }
      }
      crown.push(geoCard, back);
    }
  }
  const trunk = mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g; }), false);
  return { trunk, crown: mergeGeometries(crown, false) };
}

// Espécies comuns em São Paulo (proporções aproximadas, em metros para escala 1).
const SPECIES = {
  // tipuana: copa larga e achatada, a árvore clássica das calçadas paulistanas
  tipuana: {
    trunkH: 3.4, trunkR: 0.24, flat: 0.55, density: 7,
    tufts: [[0, 5.6, 0, 1.9], [1.9, 5.0, 0.6, 1.5], [-1.8, 5.1, -0.4, 1.5], [0.5, 5.1, -1.8, 1.4], [-0.6, 4.9, 1.8, 1.4], [0.2, 6.3, 0.3, 1.2]],
  },
  // sibipiruna: copa arredondada e cheia
  sibipiruna: {
    trunkH: 2.6, trunkR: 0.2, flat: 0.85, density: 7,
    tufts: [[0, 5.0, 0, 1.8], [1.2, 4.2, 0.4, 1.3], [-1.1, 4.3, -0.5, 1.3], [0.2, 4.1, -1.2, 1.2], [-0.3, 4.4, 1.2, 1.2]],
  },
  // ipê: tronco fino e copa mais rala (florido)
  ipe: {
    trunkH: 3.0, trunkR: 0.16, flat: 0.8, density: 6, bark: '#4d4136',
    tufts: [[0, 4.6, 0, 1.4], [1.1, 4.0, 0.3, 1.0], [-1.0, 4.1, -0.3, 1.0], [0.1, 4.0, 1.0, 0.95]],
  },
};

let built = null;
function species(rng) {
  if (!built) {
    built = {};
    for (const [name, spec] of Object.entries(SPECIES)) built[name] = buildSpecies(spec, rng);
  }
  return built;
}

const GREENS = [[0.23, 0.42, 0.42], [0.26, 0.45, 0.38], [0.29, 0.38, 0.36], [0.21, 0.4, 0.45], [0.31, 0.32, 0.34]];
const IPES = [[0.135, 0.92, 0.58], [0.87, 0.55, 0.62], [0.82, 0.45, 0.68]]; // amarelo, roxo, rosa

/**
 * Planta as árvores. `spots`: [x, z]. `mix`: probabilidades de { tipuana, sibipiruna, ipe }.
 */
export function addTrees(scene, rng, spots, { scaleMin = 1, scaleMax = 1.3, mix = { tipuana: 0.5, sibipiruna: 0.4, ipe: 0.1 } } = {}) {
  const sp = species(rng);
  const buckets = { tipuana: [], sibipiruna: [], ipe: [] };
  for (const [x, z] of spots) {
    const roll = rng();
    const name = roll < mix.tipuana ? 'tipuana' : roll < mix.tipuana + mix.sibipiruna ? 'sibipiruna' : 'ipe';
    buckets[name].push([x, z]);
  }
  const crownMat = new THREE.MeshStandardMaterial({
    map: leafTexture(), alphaTest: 0.45, vertexColors: true, roughness: 0.85, side: THREE.FrontSide,
  });
  const barkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const meshes = [];
  for (const [name, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    const trunks = new THREE.InstancedMesh(sp[name].trunk, barkMat, list.length);
    const crowns = new THREE.InstancedMesh(sp[name].crown, crownMat, list.length);
    list.forEach(([x, z], i) => {
      const k = scaleMin + rng() * (scaleMax - scaleMin);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
      m4.compose(new THREE.Vector3(x, 0.16, z), q, new THREE.Vector3(k * (0.9 + rng() * 0.2), k, k * (0.9 + rng() * 0.2)));
      trunks.setMatrixAt(i, m4);
      crowns.setMatrixAt(i, m4);
      const [h, s, l] = name === 'ipe' ? IPES[Math.floor(rng() * IPES.length)] : GREENS[Math.floor(rng() * GREENS.length)];
      crowns.setColorAt(i, col.setHSL(h + (rng() - 0.5) * 0.02, s, l + (rng() - 0.5) * 0.05));
    });
    for (const m of [trunks, crowns]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.computeBoundingSphere();
      scene.add(m);
      meshes.push(m);
    }
  }
  return meshes;
}
