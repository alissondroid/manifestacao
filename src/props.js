import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture } from './textures.js';

// Objetos da avenida: abóbora, picanha no espeto, barraca de churrasquinho e barraca da feira.
// Cada objeto é uma geometria só, com as cores nos vértices (um material, uma chamada de desenho).

/** Pinta todos os vértices de `geo` com `color` (ou com `fn(x, y, z) -> THREE.Color`). */
function paint(geo, color, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < pos.count; i++) {
    const col = fn ? fn(pos.getX(i), pos.getY(i), pos.getZ(i), i) : c;
    arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

const at = (geo, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => geo.applyMatrix4(new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
  new THREE.Vector3(s, s, s),
));

const merge = (parts) => mergeGeometries(parts, false);

export const propMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 });

// ---------- abóbora ----------

const PUMPKINS = [
  { base: '#e2711d', dark: '#9c4310', stem: '#5f5a2a' }, // abóbora de pescoço / laranja
  { base: '#c9541a', dark: '#7d2c0c', stem: '#5f5a2a' }, // moranga
  { base: '#3f5c2c', dark: '#24361a', stem: '#6b5a2e', speck: '#9fae6b' }, // cabotiá (verde)
];
const pumpkinCache = new Map();

/** Abóbora de raio 1 apoiada em y = 0, com gomos. `variant` 0 laranja, 1 moranga, 2 cabotiá. */
export function pumpkinGeometry(variant = 0) {
  if (pumpkinCache.has(variant)) return pumpkinCache.get(variant);
  const v = PUMPKINS[variant % PUMPKINS.length];
  const sphere = new THREE.SphereGeometry(1, 32, 18);
  const p = sphere.attributes.position;
  const ribs = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const phi = Math.atan2(z, x);
    const rib = Math.sqrt(Math.abs(Math.sin(phi * 5))); // 10 gomos: 0 no sulco, 1 no meio do gomo
    ribs[i] = rib;
    const r = 0.9 + 0.1 * rib;
    const flat = 0.72 - (variant === 2 ? 0.06 : 0);
    const dimple = Math.sign(y) * 0.17 * Math.exp(-(x * x + z * z) / 0.05); // umbigo em cima e embaixo
    p.setXYZ(i, x * r, y * flat - dimple + flat, z * r);
  }
  sphere.computeVertexNormals();
  const base = new THREE.Color(v.base);
  const dark = new THREE.Color(v.dark);
  const speck = v.speck ? new THREE.Color(v.speck) : null;
  const tmp = new THREE.Color();
  // cores pelo índice original (antes de virar não indexado)
  const idx = sphere.index.array;
  const body = sphere.toNonIndexed();
  const arr = new Float32Array(body.attributes.position.count * 3);
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    tmp.copy(dark).lerp(base, 0.35 + 0.65 * ribs[i]);
    const y = p.getY(i) / 1.44;
    tmp.multiplyScalar(0.8 + 0.25 * y); // um pouco mais escura embaixo
    if (speck && Math.sin(i * 12.9898) * 43758.5453 % 1 > 0.82) tmp.lerp(speck, 0.5);
    arr[k * 3] = tmp.r; arr[k * 3 + 1] = tmp.g; arr[k * 3 + 2] = tmp.b;
  }
  body.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  body.deleteAttribute('uv');
  const top = (0.72 - (variant === 2 ? 0.06 : 0)) * 2 - 0.17;
  const stem = at(paint(new THREE.CylinderGeometry(0.07, 0.11, 0.32, 7, 1), v.stem), 0.03, top + 0.12, 0, 0, 0, 0.25);
  const geo = merge([body, stem]);
  geo.computeBoundingSphere();
  pumpkinCache.set(variant, geo);
  return geo;
}

// ---------- picanha no espeto ----------

const C = (hex) => new THREE.Color(hex);
const FAT = C('#d9a85b');
const FAT_CUT = C('#efe0b8');
const CRUST = C('#5b2615');
const MEAT_CUT = C('#b0473a');
const MEAT_PINK = C('#c86b5a');
const GRILL = C('#2a140c');

/**
 * Fatia de picanha dobrada em "C" com a capa de gordura por fora, como no espeto de churrasco.
 * O espeto passa pelas duas pontas da fatia, no eixo y.
 */
function picanhaSlice(seed) {
  const R = 0.042;
  const T = 0.034; // espessura
  const W = 0.075; // largura
  const L = R * (5 * Math.PI / 3);
  const box = new THREE.BoxGeometry(L, T, W, 20, 3, 2).toNonIndexed();
  const p = box.attributes.position;
  const n = box.attributes.normal;
  const cols = new Float32Array(p.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const cut = Math.abs(n.getZ(i)) > 0.5; // face cortada (aparece o miolo)
    const fat = y > T / 2 - 0.011;
    if (cut) tmp.copy(fat ? FAT_CUT : (y < -T / 2 + 0.006 ? CRUST : MEAT_CUT)).lerp(MEAT_PINK, fat ? 0 : 0.25 * (1 - Math.abs(y) / T));
    else if (n.getY(i) > 0.5) tmp.copy(FAT).lerp(GRILL, Math.abs(Math.sin(x * 140 + seed)) > 0.93 ? 0.85 : 0.08); // marcas da grelha
    else tmp.copy(CRUST);
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
    // dobra: x vira ângulo, y vira raio
    const th = x / R;
    const r = R + y;
    p.setXYZ(i, 0.866 * R + r * Math.cos(th), r * Math.sin(th), z);
  }
  box.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  box.deleteAttribute('uv');
  box.computeVertexNormals();
  return box;
}

let skewerGeo = null;
/** Espeto com três fatias de picanha. Cabo em y = 0, ponta em y ≈ 0.62. */
export function picanhaSkewerGeometry() {
  if (skewerGeo) return skewerGeo;
  const parts = [
    paint(new THREE.CylinderGeometry(0.016, 0.016, 0.13, 8).translate(0, 0.065, 0), '#6b4a2b'), // cabo de madeira
    paint(new THREE.CylinderGeometry(0.004, 0.005, 0.5, 6).translate(0, 0.37, 0), '#c9c9c4'), // espeto
  ];
  [0.27, 0.39, 0.51].forEach((y, k) => parts.push(at(picanhaSlice(k * 1.7), 0, y, 0, 0, k * 2.2 + 0.4, 0)));
  skewerGeo = merge(parts);
  skewerGeo.computeBoundingSphere();
  return skewerGeo;
}

// ---------- barracas ----------

function signTexture(lines, bg, fg) {
  return canvasTexture(512, 192, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 64px "Arial Black", system-ui, sans-serif';
    ctx.fillText(lines[0], w / 2, h * 0.38);
    ctx.font = '800 40px system-ui, sans-serif';
    ctx.fillText(lines[1], w / 2, h * 0.75);
  }, { tile: false });
}

/** Guarda-sol de feira com gomos alternados. */
function umbrella(a, b, radius = 1.35) {
  const ca = C(a); const cb = C(b);
  const cone = paint(new THREE.ConeGeometry(radius, 0.5, 12, 1, false).toNonIndexed(), '#fff', (x, y, z, i) => (Math.floor(i / 3) % 2 ? ca : cb));
  return merge([
    cone.translate(0, 2.35, 0),
    paint(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 6).translate(0, 1.2, 0), '#d6d6d0'),
  ]);
}

let smokeTex = null;
function smokeTexture() {
  if (!smokeTex) {
    smokeTex = canvasTexture(64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(235,235,235,0.55)');
      g.addColorStop(1, 'rgba(235,235,235,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, { tile: false });
  }
  return smokeTex;
}

/**
 * Carrinho de churrasquinho: churrasqueira com brasa, espetos de picanha, isopor e guarda-sol.
 * Frente voltada para +z local.
 */
function churrasquinho(rng) {
  const g = new THREE.Group();
  const metal = '#2b2d30';
  const parts = [
    paint(new THREE.BoxGeometry(1.1, 0.28, 0.45).translate(0, 0.86, 0), metal), // churrasqueira
    paint(new THREE.BoxGeometry(1.16, 0.06, 0.04).translate(0, 1.02, 0.23), '#545659'), // borda (moldura)
    paint(new THREE.BoxGeometry(1.16, 0.06, 0.04).translate(0, 1.02, -0.23), '#545659'),
    paint(new THREE.BoxGeometry(0.04, 0.06, 0.5).translate(0.56, 1.02, 0), '#545659'),
    paint(new THREE.BoxGeometry(0.04, 0.06, 0.5).translate(-0.56, 1.02, 0), '#545659'),
  ];
  // grelha
  for (let i = 0; i < 9; i++) parts.push(paint(new THREE.BoxGeometry(0.008, 0.008, 0.44).translate(-0.48 + i * 0.12, 1.03, 0), '#8a8a86'));
  for (const [lx, lz] of [[-0.5, -0.18], [0.5, -0.18], [-0.5, 0.18], [0.5, 0.18]]) {
    parts.push(paint(new THREE.CylinderGeometry(0.02, 0.02, 0.74, 6).translate(lx, 0.37, lz), metal));
  }
  // espetos deitados na grelha, cabos para a frente
  const skewer = picanhaSkewerGeometry();
  for (let i = 0; i < 6; i++) parts.push(at(skewer.clone(), -0.4 + i * 0.16, 1.07, 0.36, -Math.PI / 2 + 0.03, 0, 0.1 * (rng() - 0.5)));
  // isopor com tampa azul
  parts.push(paint(new THREE.BoxGeometry(0.6, 0.42, 0.4).translate(0.95, 0.21, 0.05), '#f1f1ee'));
  parts.push(paint(new THREE.BoxGeometry(0.62, 0.06, 0.42).translate(0.95, 0.45, 0.05), '#2a62b8'));
  // mesinha com farofa e vinagrete
  parts.push(paint(new THREE.BoxGeometry(0.55, 0.04, 0.4).translate(-0.95, 0.75, 0.05), '#a7774a'));
  parts.push(paint(new THREE.BoxGeometry(0.04, 0.73, 0.04).translate(-0.95, 0.37, 0.05), '#6b4a2b'));
  parts.push(paint(new THREE.CylinderGeometry(0.09, 0.07, 0.08, 10).translate(-1.05, 0.81, 0.05), '#e8d38a'));
  parts.push(paint(new THREE.CylinderGeometry(0.09, 0.07, 0.08, 10).translate(-0.85, 0.81, 0.05), '#c0472f'));
  parts.push(at(umbrella('#e8c320', '#1d8a3c'), -0.2, 0, -0.35));
  const body = new THREE.Mesh(merge(parts), propMaterial);
  body.castShadow = true;
  g.add(body);

  const coals = new THREE.Mesh(
    new THREE.PlaneGeometry(0.98, 0.34).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#2a0d04', emissive: '#ff5a12', emissiveIntensity: 1.6, roughness: 1 }),
  );
  coals.position.set(0, 1.0, 0);
  g.add(coals);

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.375),
    new THREE.MeshStandardMaterial({ map: signTexture(['PICANHA', 'ESPETINHO R$ 15'], '#b81d1d', '#ffe082'), roughness: 0.8 }),
  );
  sign.position.set(0, 0.55, 0.231);
  g.add(sign);

  // fumaça subindo da brasa
  const smoke = [];
  const mat = new THREE.SpriteMaterial({ map: smokeTexture(), depthWrite: false, transparent: true });
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(mat.clone());
    s.userData.phase = i / 7;
    g.add(s);
    smoke.push(s);
  }
  g.userData.smoke = smoke;
  return g;
}

/** Barraca da feira com abóboras em caixotes e na mesa. Frente voltada para +z local. */
function bancaAbobora(rng) {
  const g = new THREE.Group();
  const wood = '#9a6a3c';
  const parts = [
    paint(new THREE.BoxGeometry(2.3, 0.06, 1.0).translate(0, 0.8, 0), wood), // mesa
  ];
  for (const [lx, lz] of [[-1.05, -0.4], [1.05, -0.4], [-1.05, 0.4], [1.05, 0.4]]) {
    parts.push(paint(new THREE.BoxGeometry(0.06, 0.8, 0.06).translate(lx, 0.4, lz), '#6b4a2b'));
  }
  // toldo listrado azul e branco sobre quatro varas
  for (const [lx, lz] of [[-1.3, -0.65], [1.3, -0.65], [-1.3, 0.65], [1.3, 0.65]]) {
    parts.push(paint(new THREE.CylinderGeometry(0.025, 0.025, 2.3, 6).translate(lx, 1.15, lz), '#cfd2d4'));
  }
  const roof = new THREE.BoxGeometry(2.9, 0.04, 1.6, 12, 1, 1).toNonIndexed();
  const blue = C('#1f5fae'); const whiteC = C('#f2f2ee');
  parts.push(paint(roof, '#fff', (x) => (Math.floor((x + 1.45) / (2.9 / 12)) % 2 ? blue : whiteC)).translate(0, 2.32, 0));
  // caixotes no chão
  for (const [cx, cz] of [[-0.7, 0.75], [0.5, 0.8]]) {
    parts.push(paint(new THREE.BoxGeometry(0.62, 0.32, 0.42).translate(cx, 0.16, cz), '#c49a5e'));
    for (let k = 0; k < 3; k++) {
      const v = Math.floor(rng() * 3);
      const s = 0.12 + rng() * 0.04;
      parts.push(at(pumpkinGeometry(v).clone(), cx - 0.18 + k * 0.18, 0.3, cz + (rng() - 0.5) * 0.12, 0, rng() * 6, 0, s));
    }
  }
  // pilha na mesa e abóboras grandes no chão
  for (let k = 0; k < 9; k++) {
    const v = k % 3;
    const s = 0.11 + rng() * 0.07;
    parts.push(at(pumpkinGeometry(v).clone(), -0.95 + (k % 5) * 0.46 + (rng() - 0.5) * 0.1, 0.83 + (k >= 5 ? 0.12 : 0), (k >= 5 ? -0.05 : 0.2) + (rng() - 0.5) * 0.15, 0, rng() * 6, 0, s));
  }
  for (const [px, pz, s] of [[1.35, 0.95, 0.24], [1.0, 1.15, 0.19], [-1.35, 1.0, 0.21]]) {
    parts.push(at(pumpkinGeometry(Math.floor(rng() * 3)).clone(), px, 0, pz, 0, rng() * 6, 0, s));
  }
  const body = new THREE.Mesh(merge(parts), propMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.45),
    new THREE.MeshStandardMaterial({ map: signTexture(['ABÓBORA', 'R$ 5 O KG · FRESQUINHA'], '#f4e04d', '#1d3f8f'), roughness: 0.8 }),
  );
  sign.position.set(0, 2.0, 0.81);
  g.add(sign);
  return g;
}

/**
 * Coloca as barracas nas calçadas. `spots`: [x, z, tipo]. Retorna as caixas a evitar e o `update`.
 */
export function addVendors(scene, rng, spots) {
  const stalls = [];
  const avoid = [];
  for (const [x, z, kind] of spots) {
    const g = kind === 'picanha' ? churrasquinho(rng) : bancaAbobora(rng);
    g.position.set(x, 0.16, z);
    g.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2; // frente para a pista
    scene.add(g);
    stalls.push(g);
    avoid.push({ x, z, hx: 1.4, hz: 1.7 });
  }
  function update(time) {
    for (const g of stalls) {
      const smoke = g.userData.smoke;
      if (!smoke) continue;
      for (const s of smoke) {
        const k = (time * 0.32 + s.userData.phase) % 1;
        s.position.set(Math.sin(k * 5 + s.userData.phase * 9) * 0.15 * k, 1.05 + k * 2.4, -0.1 * k);
        s.scale.setScalar(0.3 + k * 1.3);
        s.material.opacity = 0.6 * Math.sin(k * Math.PI) * (1 - k * 0.4);
      }
    }
  }
  return { avoid, update };
}
