import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Veículos mais realistas: carrocerias com bordas arredondadas (perfil lateral extrudado com chanfro),
// vidros escuros e brilhantes, pneus com rodas de liga, faróis e lanternas que brilham, retrovisores, placas.
// Regras para não piscar (z-fighting): nenhuma face de uma peça fica no mesmo plano de outra peça que a atravessa;
// peças sobrepostas se afastam ao menos 1 cm e as "calcomanias" (vidro, faixa) ficam 2 a 4 cm para fora.
//
// Cada veículo é UM Mesh com vários materiais (grupos): 0 tinta, 1 vidro, 2 acabamento (cor por vértice), 3 roda de liga,
// 4 farol, 5 lanterna. Os materiais fixos são compartilhados; só a tinta muda com a cor.

const IDX = {
  paint: 0, glass: 1, trim: 2, rim: 3, head: 4, tail: 5,
};
const N_MAT = 6;

const glassMat = new THREE.MeshPhysicalMaterial({
  color: '#0d1822', roughness: 0.06, metalness: 0.15, envMapIntensity: 2.4, clearcoat: 1, clearcoatRoughness: 0.03,
});
const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.15 });
const rimMat = new THREE.MeshStandardMaterial({ color: '#c4c9cf', roughness: 0.25, metalness: 0.92 });
const headMat = new THREE.MeshStandardMaterial({
  color: '#fff6df', emissive: '#ffefc2', emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.1,
});
const tailMat = new THREE.MeshStandardMaterial({
  color: '#7a0d0d', emissive: '#ff2418', emissiveIntensity: 0.65, roughness: 0.3,
});

const paintCache = new Map();
/** Tinta com verniz: metálica e brilhante, compartilhada entre veículos da mesma cor. */
export function paintMaterial(color, { metalness = 0.55, roughness = 0.32 } = {}) {
  const key = `${color}|${metalness}|${roughness}`;
  if (!paintCache.has(key)) {
    paintCache.set(key, new THREE.MeshPhysicalMaterial({
      color, metalness, roughness, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.15,
    }));
  }
  return paintCache.get(key);
}

// ---------- construção ----------

/** Todas as peças precisam dos mesmos atributos para serem fundidas: posição, normal, uv e cor. */
function prepared(geo, color = '#ffffff') {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

const m4 = new THREE.Matrix4();
const place = (geo, [x, y, z], rot = [0, 0, 0]) => {
  geo.applyMatrix4(m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1)));
  return geo;
};

/** Caixa de cantos arredondados centrada em `pos`. */
const rbox = (w, h, d, r, pos, color, rot) => place(prepared(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), color), pos, rot);
const cyl = (rt, rb, h, seg, pos, color, rot) => place(prepared(new THREE.CylinderGeometry(rt, rb, h, seg), color), pos, rot);

/** Polígono com os cantos arredondados (raio `r`), como Shape. Pontos: [z, y]. */
function roundedShape(pts, r) {
  const n = pts.length;
  const s = new THREE.Shape();
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const corner = (i) => {
    const p = pts[i];
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const rr = p[2] ?? r;
    return {
      p, inP: lerp(p, a, Math.min(rr, len(p, a) / 2) / len(p, a)), outP: lerp(p, b, Math.min(rr, len(p, b) / 2) / len(p, b)),
    };
  };
  s.moveTo(...corner(0).outP);
  for (let k = 1; k <= n; k += 1) {
    const c = corner(k % n);
    s.lineTo(...c.inP);
    s.quadraticCurveTo(c.p[0], c.p[1], ...c.outP);
  }
  return s;
}

/**
 * Perfil lateral (z para a frente, y para cima) extrudado na largura `width`, com as bordas chanfradas.
 * O chanfro aumenta o contorno em `bevel`, então o perfil dos dados já é ligeiramente menor.
 */
function profile(pts, width, { bevel = 0.07, radius = 0.14, color } = {}) {
  const depth = Math.max(0.01, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(roundedShape(pts, radius), {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 5,
  });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2); // x do perfil vira z (frente); a extrusão vira x (largura)
  return prepared(g, color);
}

/** Cada tipo: contorno da carroceria até a linha da cintura, estufa (vidros), teto e rodas. */
const CARS = {
  sedan: {
    width: 1.8,
    body: [[-2.2, 0.3], [-2.28, 0.62], [-2.2, 0.94], [-1.2, 0.97], [1.15, 0.97], [2.0, 0.86], [2.26, 0.62], [2.2, 0.3]],
    glass: [[-1.3, 0.95, 0.1], [-0.78, 1.43, 0.14], [0.45, 1.43, 0.14], [1.18, 0.95, 0.1]],
    roof: [[-0.86, 1.38, 0.05], [-0.74, 1.47, 0.05], [0.5, 1.47, 0.05], [0.62, 1.38, 0.05]],
    nose: 2.27, tail: -2.27, headY: 0.74, tailY: 0.8, wheelR: 0.34, wheelZ: [-1.4, 1.38],
  },
  hatch: {
    width: 1.74,
    body: [[-1.92, 0.3], [-2.0, 0.62], [-1.94, 1.0], [-1.0, 1.02], [1.0, 1.02], [1.78, 0.9], [2.02, 0.64], [1.96, 0.3]],
    glass: [[-1.85, 1.0, 0.08], [-1.5, 1.5, 0.14], [0.42, 1.5, 0.14], [1.08, 1.0, 0.1]],
    roof: [[-1.62, 1.45, 0.05], [-1.5, 1.54, 0.05], [0.48, 1.54, 0.05], [0.6, 1.45, 0.05]],
    nose: 2.03, tail: -2.0, headY: 0.76, tailY: 0.86, wheelR: 0.33, wheelZ: [-1.22, 1.3],
  },
  suv: {
    width: 1.92,
    body: [[-2.1, 0.34], [-2.18, 0.72], [-2.12, 1.14], [-1.0, 1.17], [1.1, 1.17], [1.88, 1.04], [2.18, 0.74], [2.12, 0.34]],
    glass: [[-2.05, 1.14, 0.08], [-1.95, 1.78, 0.14], [0.55, 1.78, 0.14], [1.18, 1.14, 0.1]],
    roof: [[-2.0, 1.72, 0.05], [-1.9, 1.82, 0.05], [0.6, 1.82, 0.05], [0.72, 1.72, 0.05]],
    nose: 2.19, tail: -2.19, headY: 0.86, tailY: 0.92, wheelR: 0.39, wheelZ: [-1.38, 1.4],
  },
};

const geometryCache = new Map();

/** Peças de um carro (listas por material). `skin`: 'carro-dourado' | 'carro-som' | ''. */
function buildCar(type, skin) {
  const s = CARS[type] ?? CARS.sedan;
  const W = s.width;
  const parts = Array.from({ length: N_MAT }, () => []);
  const add = (mat, geo) => parts[IDX[mat]].push(geo);
  const gold = skin === 'carro-dourado';

  add('paint', profile(s.body, W));
  add('glass', profile(s.glass, W - 0.2, { bevel: 0.04, radius: 0.1 })); // vidros recuados 10 cm em cada lado
  add('paint', profile(s.roof, W - 0.16, { bevel: 0.03, radius: 0.05 }));

  // acabamento (cor por vértice)
  const black = '#15171a';
  const dark = '#23262b';
  add('trim', rbox(W - 0.1, 0.17, 0.14, 0.06, [0, 0.42, s.nose - 0.02], black)); // para-choque dianteiro
  add('trim', rbox(W - 0.1, 0.17, 0.14, 0.06, [0, 0.42, s.tail + 0.02], black)); // traseiro
  add('trim', rbox(W - 0.5, 0.08, 0.12, 0.03, [0, 0.31, s.nose - 0.02], black)); // spoiler inferior
  add('trim', rbox(0.95, 0.13, 0.05, 0.03, [0, s.headY - 0.02, s.nose - 0.04], dark)); // grade
  add('trim', rbox(0.5, 0.12, 0.025, 0.01, [0, 0.56, s.tail - 0.01], '#f2f2ee')); // placa traseira
  add('trim', rbox(0.5, 0.12, 0.025, 0.01, [0, 0.53, s.nose + 0.03], '#e9e6c8')); // placa dianteira
  for (const sx of [-1, 1]) {
    add('trim', rbox(0.1, 0.09, 0.17, 0.035, [sx * (W / 2 + 0.06), s.glass[0][1] + 0.1, s.glass[3][0] - 0.55], black)); // retrovisor
    add('trim', rbox(0.04, 0.45, 0.07, 0.02, [sx * (W / 2 - 0.1 + 0.03), s.glass[0][1] + 0.2, (s.glass[0][0] + s.glass[3][0]) / 2 - 0.1], black)); // coluna B
    add('head', rbox(0.46, 0.14, 0.09, 0.05, [sx * 0.64, s.headY, s.nose - 0.03]));
    add('tail', rbox(0.4, 0.13, 0.08, 0.05, [sx * 0.66, s.tailY, s.tail + 0.03]));
  }

  // rodas: pneu preto e roda de liga um pouco mais larga, para a face da roda ficar 1,5 cm à frente do pneu
  for (const x of [-1, 1]) for (const z of s.wheelZ) {
    const tireX = x * (W / 2 - 0.02);
    add('trim', cyl(s.wheelR, s.wheelR, 0.24, 22, [tireX, s.wheelR, z], '#111214', [0, 0, Math.PI / 2]));
    add('rim', cyl(s.wheelR * 0.62, s.wheelR * 0.62, 0.27, 16, [tireX, s.wheelR, z], '#ffffff', [0, 0, Math.PI / 2]));
  }

  if (gold) {
    add('trim', rbox(W + 0.04, 0.05, 0.1, 0.02, [0, 0.98, s.nose - 0.08], '#fff2a8'));
    add('trim', rbox(W - 0.4, 0.04, 0.1, 0.02, [0, 1.52, 0.4], '#fff2a8'));
  } else if (skin === 'carro-som') { // caixas de som no teto e bandeirola
    const top = s.roof[1][1] + 0.05;
    for (const x of [-0.5, 0.5]) {
      add('trim', rbox(0.7, 1.0, 0.7, 0.05, [x, top + 0.5, -0.3], '#0e0e10'));
      add('trim', cyl(0.22, 0.22, 0.08, 14, [x, top + 0.62, 0.075], '#3a3a3a', [Math.PI / 2, 0, 0]));
    }
    add('trim', rbox(0.04, 1.2, 0.04, 0.01, [0, top + 0.6, -1.6], '#d4d4d0'));
  }

  const geos = parts.map((list) => mergeGeometries(list.length ? list : [prepared(new THREE.BoxGeometry(0.001, 0.001, 0.001))], false));
  const merged = mergeGeometries(geos, true);
  merged.computeBoundingSphere();
  return merged;
}

const setShadow = (mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; };

export const CAR_TYPES = Object.keys(CARS);

/** Carro com a cor `color`. `skin`: 'carro-dourado' (dourado) ou 'carro-som' (caixas de som no teto). */
export function carMesh(color, skin = '', type = 'sedan') {
  if (skin === 'carro-dourado') color = '#d4af37';
  const key = `${type}|${skin}`;
  if (!geometryCache.has(key)) geometryCache.set(key, buildCar(type, skin));
  const paint = paintMaterial(color, skin === 'carro-dourado' ? { metalness: 0.9, roughness: 0.22 } : undefined);
  return setShadow(new THREE.Mesh(geometryCache.get(key), [paint, glassMat, trimMat, rimMat, headMat, tailMat]));
}

// ---------- ônibus ----------

const liveryCache = new Map();
const liveryMat = (color) => {
  if (!liveryCache.has(color)) liveryCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 }));
  return liveryCache.get(color);
};

function buildBus() {
  const parts = Array.from({ length: N_MAT }, () => []);
  const add = (mat, geo) => parts[IDX[mat]].push(geo);
  const L = 11.5;
  const black = '#15171a';

  add('paint', rbox(2.5, 2.8, L, 0.3, [0, 1.8, 0], '#ffffff')); // carroceria
  // faixa de janelas e janelas: peças 4 cm para fora, sem encostar nas pontas
  add('glass', rbox(2.58, 0.98, 10.4, 0.08, [0, 2.4, 0]));
  for (let z = -4.2; z <= 4.2; z += 1.4) {
    for (const sx of [-1, 1]) {
      if (sx < 0 && z > 2.7) continue; // lado da porta: sem divisórias por cima do vidro da porta
      add('paint', rbox(0.07, 1.0, 0.09, 0.02, [sx * 1.3, 2.4, z]));
    }
  }
  // para-brisa, letreiro de destino e traseira
  add('glass', rbox(2.28, 1.12, 0.1, 0.1, [0, 2.4, L / 2 + 0.02]));
  add('head', rbox(1.5, 0.34, 0.06, 0.04, [0, 3.0, L / 2 + 0.05]));
  add('glass', rbox(2.0, 0.8, 0.1, 0.1, [0, 2.45, -L / 2 - 0.02]));
  // porta do lado direito (calçada): vidro escuro com moldura
  add('glass', rbox(0.06, 1.9, 1.5, 0.03, [-1.28, 1.75, 3.7]));
  for (const z of [2.95, 4.45, 3.7]) add('trim', rbox(0.09, 2.0, 0.06, 0.02, [-1.29, 1.75, z], black));
  add('trim', rbox(2.52, 0.3, 11.2, 0.05, [0, 0.62, 0], '#202226')); // saia inferior preta
  // para-choques, faróis, lanternas, retrovisores
  add('trim', rbox(2.56, 0.3, 0.2, 0.08, [0, 0.55, L / 2 + 0.02], black));
  add('trim', rbox(2.56, 0.3, 0.2, 0.08, [0, 0.55, -L / 2 - 0.02], black));
  for (const sx of [-1, 1]) {
    add('head', rbox(0.5, 0.26, 0.08, 0.06, [sx * 0.85, 0.95, L / 2 + 0.06]));
    add('tail', rbox(0.4, 0.5, 0.08, 0.06, [sx * 1.0, 1.4, -L / 2 - 0.06]));
    add('trim', rbox(0.14, 0.55, 0.12, 0.04, [sx * 1.43, 2.3, 4.9], black));
    add('trim', rbox(0.28, 0.04, 0.04, 0.01, [sx * 1.34, 2.3, 4.9], black));
  }
  // ar-condicionado no teto
  for (const z of [-1.8, 2.2]) add('trim', rbox(1.6, 0.24, 2.2, 0.08, [0, 3.31, z], '#c9cdd1'));
  // rodas (sem o vão da roda: o pneu sai 10 cm para fora)
  for (const x of [-1.2, 1.2]) for (const z of [-3.8, 3.4]) {
    add('trim', cyl(0.5, 0.5, 0.3, 26, [x, 0.5, z], '#111214', [0, 0, Math.PI / 2]));
    add('rim', cyl(0.3, 0.3, 0.33, 18, [x, 0.5, z], '#ffffff', [0, 0, Math.PI / 2]));
  }

  const geos = parts.map((list) => mergeGeometries(list.length ? list : [prepared(new THREE.BoxGeometry(0.001, 0.001, 0.001))], false));
  const merged = mergeGeometries(geos, true);
  merged.computeBoundingSphere();
  return merged;
}

let busGeo = null;

/** Ônibus branco com a faixa lateral na cor `stripe` (a faixa é uma peça à parte, então a geometria é compartilhada). */
export function busMesh(stripe) {
  busGeo ??= buildBus();
  const mats = [paintMaterial('#f1f1ee', { metalness: 0.25, roughness: 0.4 }), glassMat, trimMat, rimMat, headMat, tailMat];
  const mesh = setShadow(new THREE.Mesh(busGeo, mats));
  const band = new THREE.Mesh(BAND_GEO, liveryMat(stripe));
  band.castShadow = false;
  mesh.add(band);
  return mesh;
}

const BAND_GEO = new RoundedBoxGeometry(2.56, 0.42, 10.9, 2, 0.06).translate(0, 1.16, 0);

// ---------- carro de som ----------

/** Caminhão com caixas de som e faixa do candidato (`bannerMaterial` vem do mundo, que tem as texturas). */
export function soundTruckMesh(color, bannerMaterial) {
  const parts = Array.from({ length: N_MAT }, () => []);
  const add = (mat, geo) => parts[IDX[mat]].push(geo);
  const black = '#15171a';
  add('trim', rbox(2.5, 1.0, 9.5, 0.12, [0, 1.0, -0.4], '#2b2d31')); // chassi
  add('paint', rbox(2.44, 1.9, 2.2, 0.2, [0, 1.95, 3.7])); // cabine, 3 cm mais estreita que o chassi
  add('glass', rbox(2.3, 0.8, 0.1, 0.08, [0, 2.45, 4.86]));
  for (const sx of [-1, 1]) {
    add('glass', rbox(0.06, 0.7, 1.4, 0.03, [sx * 1.24, 2.5, 3.55]));
    add('head', rbox(0.4, 0.2, 0.08, 0.05, [sx * 0.85, 1.4, 4.84]));
    add('trim', rbox(0.14, 0.5, 0.1, 0.04, [sx * 1.4, 2.4, 4.5], black));
  }
  add('trim', rbox(2.54, 0.3, 0.2, 0.08, [0, 0.62, 4.8], black));
  add('trim', rbox(2.54, 0.3, 0.2, 0.08, [0, 0.62, -5.12], black));
  add('trim', rbox(2.5, 0.4, 6.8, 0.06, [0, 1.7, -1.7], color)); // base da faixa (a cor do candidato)
  for (const z of [-4.4, 1.0]) for (const sx of [-1, 1]) {
    add('trim', rbox(1.0, 1.6, 0.9, 0.06, [sx * 0.9, 2.7, z], '#0e0e10')); // pilha de caixas
    add('trim', cyl(0.3, 0.3, 0.05, 18, [sx * 1.42, 2.95, z], '#3a3a3a', [0, 0, Math.PI / 2]));
    add('trim', cyl(0.18, 0.18, 0.05, 14, [sx * 1.42, 2.3, z], '#3a3a3a', [0, 0, Math.PI / 2]));
  }
  for (const x of [-1.2, 1.2]) for (const z of [-3.6, 2.4, 3.8]) {
    add('trim', cyl(0.5, 0.5, 0.3, 26, [x, 0.5, z], '#111214', [0, 0, Math.PI / 2]));
    add('rim', cyl(0.3, 0.3, 0.33, 18, [x, 0.5, z], '#ffffff', [0, 0, Math.PI / 2]));
  }
  const geos = parts.map((list) => mergeGeometries(list.length ? list : [prepared(new THREE.BoxGeometry(0.001, 0.001, 0.001))], false));
  const merged = mergeGeometries(geos, true);
  const body = setShadow(new THREE.Mesh(merged, [paintMaterial('#e8e8e4', { metalness: 0.25, roughness: 0.4 }), glassMat, trimMat, rimMat, headMat, tailMat]));
  const g = new THREE.Group();
  g.add(body);
  for (const sx of [-1, 1]) { // faixa em cada lado, 3 cm para fora da caixa
    const b = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), bannerMaterial);
    b.position.set(sx * 1.29, 1.7, -1.7);
    b.rotation.y = sx * Math.PI / 2;
    g.add(b);
  }
  return g;
}
