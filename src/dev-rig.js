// Ferramenta de desenvolvimento (não vai para o build): monta personagens animáveis a partir de GLB estáticos
// de assets-src, usando o corpo do Mixamo ch33 (terno) como molde de esqueleto.
//   /rig.html?make=renan      malha inteira em T-pose: ganha o esqueleto do ch33 ajustado às proporções dela e os
//                             pesos de pele copiados dos vértices mais próximos do ch33 deformado para caber nela
//   /rig.html?make=bolsonaro  só a cabeça: vai presa ao osso da cabeça do ch33, que perde a cabeça e o cabelo
//   /rig.html?view=<arquivo>  só mostra um GLB de public/models (para conferir)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { PropertyBinding } from 'three';

const log = document.querySelector('#log');
const say = (...a) => { log.textContent += `${a.join(' ')}\n`; };
const params = new URLSearchParams(location.search);
const sources = import.meta.glob('../assets-src/*.glb', { query: '?url', import: 'default' });
const loader = new GLTFLoader();
const loadSrc = async (name) => loader.parseAsync(await (await fetch(await sources[`../assets-src/${name}`]())).arrayBuffer(), '');
const loadModel = (file) => loader.loadAsync(`/models/${file}?t=${Date.now()}`);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#556');
scene.add(new THREE.HemisphereLight('#fff', '#444', 2.5));
const dl = new THREE.DirectionalLight('#fff', 2);
dl.position.set(2, 4, 5);
scene.add(dl);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 100);
window.__look = (p, t) => { cam.position.set(...p); cam.lookAt(...t); };
window.__look([0, 1.0, 5], [0, 0.9, 0]);
const mixers = [];
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  mixers.forEach((m) => m.update(dt));
  renderer.render(scene, cam);
});
Object.assign(window, { __scene: scene, THREE });

const v3 = () => new THREE.Vector3();
const fmt = (v) => v.toArray().map((x) => x.toFixed(3)).join(',');

function jpegTexture(tex, max = 1024) {
  const img = tex.image;
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false; // mesma orientação das texturas lidas do GLB
  t.userData.mimeType = 'image/jpeg';
  return t;
}

async function exportGlb(root, outName) {
  root.updateMatrixWorld(true);
  const glb = await new Promise((resolve, reject) => {
    new GLTFExporter().parse(root, resolve, reject, { binary: true, onlyVisible: true, animations: root.userData.animations || [] });
  });
  say('GLB:', (glb.byteLength / 1e6).toFixed(2), 'MB');
  const res = await fetch(`http://localhost:9099/save?name=${encodeURIComponent(outName)}`, { method: 'POST', body: glb });
  say('salvo:', await res.text());
}

/** Molde: ch33 com o esqueleto completo. Retorna { gltf, root (Root, escala 0.01), bones (por nome), meshes }. */
async function template() {
  const gltf = await loadModel('ch33.glb');
  gltf.scene.updateMatrixWorld(true);
  const bones = new Map();
  const meshes = [];
  let root = null;
  gltf.scene.traverse((o) => {
    if (o.isBone) bones.set(o.name, o);
    if (o.isSkinnedMesh) meshes.push(o);
    if (o.name === 'Root') root = o;
  });
  return { gltf, root: root ?? meshes[0].parent, bones, meshes };
}

// ---------- Bolsonaro: cabeça sobre o corpo de terno ----------

async function makeBolsonaro() {
  const { gltf, bones, meshes } = await template();
  const head = bones.get('mixamorigHead');
  const headPos = head.getWorldPosition(v3());
  const top = bones.get('mixamorigHeadTop_End').getWorldPosition(v3());
  say('osso da cabeça', fmt(headPos), 'topo', fmt(top));

  // tira cabelo e cílios; do corpo, tira os triângulos da cabeça (pesos no osso Head)
  for (const m of meshes) if (/Hair|Eyelashes/.test(m.name)) m.removeFromParent();
  const body = meshes.find((m) => /Body/.test(m.name));
  const headIdx = body.skeleton.bones.findIndex((b) => b.name === 'mixamorigHead');
  const topIdx = body.skeleton.bones.findIndex((b) => b.name === 'mixamorigHeadTop_End');
  const si = body.geometry.attributes.skinIndex;
  const sw = body.geometry.attributes.skinWeight;
  const headW = (i) => {
    let w = 0;
    for (let k = 0; k < 4; k++) { const b = si.getComponent(i, k); if (b === headIdx || b === topIdx) w += sw.getComponent(i, k); }
    return w;
  };
  const idx = body.geometry.index.array;
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    if (Math.max(headW(idx[t]), headW(idx[t + 1]), headW(idx[t + 2])) > 0.35) continue;
    keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  say('corpo: triângulos', idx.length / 3, '→', keep.length / 3);
  body.geometry.setIndex(keep);

  // cabeça nova, em metros, encaixada no pescoço
  const src = await loadSrc('bolsonaro-head.glb');
  src.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(src.scene);
  const size = box.getSize(v3());
  const H = Number(params.get('h') || 0.285);
  const k = H / size.y;
  const dz = Number(params.get('dz') || 0.02);
  const dy = Number(params.get('dy') || -0.075);
  const center = box.getCenter(v3());
  const place = new THREE.Matrix4().makeTranslation(headPos.x, headPos.y + dy + H / 2, headPos.z + dz)
    .multiply(new THREE.Matrix4().makeScale(k, k, k))
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  const toBody = body.matrixWorld.clone().invert();
  src.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toBody, place).multiply(o.matrixWorld));
    const n = g.attributes.position.count;
    const sIdx = new Uint16Array(n * 4);
    const sW = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { sIdx[i * 4] = headIdx; sW[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(sIdx, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sW, 4));
    const mat = o.material.clone();
    if (mat.map) mat.map = jpegTexture(mat.map);
    mat.roughness = 0.75;
    mat.metalness = 0;
    const sm = new THREE.SkinnedMesh(g, mat);
    sm.name = `Bolsonaro_${o.material.name || 'Head'}`;
    body.parent.add(sm);
    sm.bind(body.skeleton, body.bindMatrix);
  });
  return gltf.scene;
}

// ---------- Renan Santos: malha em T-pose ganha esqueleto e pesos ----------

/** Pontos de referência de um corpo em T-pose (em metros). */
function landmarks(points) {
  const box = new THREE.Box3().setFromPoints(points);
  const H = box.max.y - box.min.y;
  const span = Math.max(-box.min.x, box.max.x);
  const armPts = points.filter((p) => Math.abs(p.x) > span * 0.75);
  const armY = armPts.reduce((a, p) => a + p.y, 0) / armPts.length;
  const chest = points.filter((p) => p.y > armY - 0.22 * H && p.y < armY - 0.1 * H && Math.abs(p.x) < span * 0.45);
  const torso = Math.max(...chest.map((p) => Math.abs(p.x)));
  const zMin = Math.min(...chest.map((p) => p.z));
  const zMax = Math.max(...chest.map((p) => p.z));
  // entreperna: ponto mais baixo do tronco no meio (x ≈ 0)
  const mid = points.filter((p) => Math.abs(p.x) < 0.012 && p.y < armY - 0.2 * H);
  const crotch = Math.min(...mid.map((p) => p.y));
  return { H, span, armY, torso, zc: (zMin + zMax) / 2, depth: zMax - zMin, crotch, minY: box.min.y };
}

function warpFn(a, b) {
  const lin = (x, x0, x1, y0, y1) => y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  return (p) => {
    const y = p.y - a.minY;
    const yy = y < a.crotch - a.minY ? lin(y, 0, a.crotch - a.minY, 0, b.crotch - b.minY)
      : y < a.armY - a.minY ? lin(y, a.crotch - a.minY, a.armY - a.minY, b.crotch - b.minY, b.armY - b.minY)
        : lin(y, a.armY - a.minY, a.H, b.armY - b.minY, b.H);
    const ax = Math.abs(p.x);
    const xx = ax < a.torso ? ax * (b.torso / a.torso) : b.torso + (ax - a.torso) * ((b.span - b.torso) / (a.span - a.torso));
    return new THREE.Vector3(Math.sign(p.x) * xx, yy + b.minY, b.zc + (p.z - a.zc) * (b.depth / a.depth));
  };
}

async function makeRenan() {
  const { gltf, root, bones, meshes } = await template();
  const src = await loadSrc('renan.glb');
  src.scene.updateMatrixWorld(true);
  const srcMesh = [];
  src.scene.traverse((o) => { if (o.isMesh) srcMesh.push(o); });
  const rm = srcMesh[0];
  const rg = rm.geometry.clone().applyMatrix4(rm.matrixWorld);
  // escala para 1,74 m, pés no chão, centrado
  const rbox = new THREE.Box3().setFromBufferAttribute(rg.attributes.position);
  const kk = 1.74 / (rbox.max.y - rbox.min.y);
  const rc = rbox.getCenter(v3());
  rg.applyMatrix4(new THREE.Matrix4().makeScale(kk, kk, kk).multiply(new THREE.Matrix4().makeTranslation(-rc.x, -rbox.min.y, -rc.z)));
  const rp = rg.attributes.position;
  const rPts = Array.from({ length: rp.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(rp, i));

  // vértices do molde (pose de repouso = pose de ligação), com seus pesos em nomes de osso
  const tPts = [];
  const tW = [];
  for (const m of meshes) {
    if (/Hair|Eyelashes/.test(m.name)) continue;
    const p = m.geometry.attributes.position;
    const si = m.geometry.attributes.skinIndex;
    const sw = m.geometry.attributes.skinWeight;
    for (let i = 0; i < p.count; i++) {
      tPts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
      const w = [];
      for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > 0) w.push([m.skeleton.bones[si.getComponent(i, k)].name, sw.getComponent(i, k)]);
      tW.push(w);
    }
  }
  const A = landmarks(tPts);
  const Bm = landmarks(rPts);
  // malhas geradas por IA costumam ter as pernas grudadas no alto: o entreperna vem da proporção do molde
  Bm.crotch = Bm.minY + (A.crotch - A.minY) * (Bm.H / A.H);
  say('molde', JSON.stringify(A, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
  say('renan', JSON.stringify(Bm, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
  const warp = warpFn(A, Bm);
  const wPts = tPts.map(warp);

  // grade espacial para achar vizinhos
  const cell = 0.04;
  const grid = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  wPts.forEach((p, i) => {
    const kx = Math.floor(p.x / cell); const ky = Math.floor(p.y / cell); const kz = Math.floor(p.z / cell);
    const kk2 = key(kx, ky, kz);
    if (!grid.has(kk2)) grid.set(kk2, []);
    grid.get(kk2).push(i);
  });
  const boneList = [...bones.values()];
  const boneIndex = new Map(boneList.map((b, i) => [b.name, i]));
  const n = rPts.length;
  const sIdx = new Uint16Array(n * 4);
  const sW = new Float32Array(n * 4);
  let far = 0;
  for (let i = 0; i < n; i++) {
    const p = rPts[i];
    const cx = Math.floor(p.x / cell); const cy = Math.floor(p.y / cell); const cz = Math.floor(p.z / cell);
    let best = [];
    for (let r = 1; r <= 6 && best.length < 6; r++) {
      best = [];
      for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) {
        const list = grid.get(key(x, y, z));
        if (list) for (const j of list) best.push([p.distanceToSquared(wPts[j]), j]);
      }
    }
    if (!best.length) far += 1;
    best.sort((a, b) => a[0] - b[0]);
    const acc = new Map();
    for (const [d2, j] of best.slice(0, 6)) {
      const inv = 1 / (Math.sqrt(d2) + 0.004);
      for (const [name, w] of tW[j]) acc.set(name, (acc.get(name) || 0) + w * inv);
    }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((a, e) => a + e[1], 0) || 1;
    top.forEach(([name, w], k) => { sIdx[i * 4 + k] = boneIndex.get(name); sW[i * 4 + k] = w / sum; });
  }
  say('vértices', n, 'sem vizinho:', far);

  // esqueleto: mesma rotação de repouso do molde, juntas levadas para as proporções do Renan
  const targets = new Map(boneList.map((b) => [b, warp(b.getWorldPosition(v3()))]));
  const ordered = [];
  root.traverse((o) => { if (o.isBone) ordered.push(o); });
  for (const b of ordered) {
    b.parent.updateMatrixWorld(true);
    b.position.copy(b.parent.worldToLocal(targets.get(b).clone()));
    b.updateMatrixWorld(true);
  }
  for (const m of meshes) m.removeFromParent();

  // malha no espaço do Root
  root.updateMatrixWorld(true);
  rg.applyMatrix4(root.matrixWorld.clone().invert());
  rg.setAttribute('skinIndex', new THREE.BufferAttribute(sIdx, 4));
  rg.setAttribute('skinWeight', new THREE.BufferAttribute(sW, 4));
  rg.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ name: 'Renan', map: rm.material.map ? jpegTexture(rm.material.map) : null, roughness: 0.8, metalness: 0 });
  const sm = new THREE.SkinnedMesh(rg, mat);
  sm.name = 'Renan_Body';
  root.add(sm);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneList);
  sm.bind(skeleton, sm.matrixWorld);
  return gltf.scene;
}

// ---------- Lula: malha em pose "A" (braços a ~45°) e de costas ----------

const ARM = /(Arm|ForeArm|Hand)/;
const sideOf = (name) => (/Left/.test(name) ? 1 : /Right/.test(name) ? -1 : 0);
const isArmBone = (name) => ARM.test(name) && !/Shoulder/.test(name);

/** Pesos por vizinhos mais próximos: `pts` recebem os pesos de `tPts` (com `tW` em nomes de osso). */
function transferWeights(pts, tPts, tW, boneIndex, cell = 0.04, nrm = null, tNrm = null, allowed = null) {
  const grid = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  tPts.forEach((p, i) => {
    if (allowed && !allowed(i)) return;
    const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  const n = pts.length;
  const sIdx = new Uint16Array(n * 4);
  const sW = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const cx = Math.floor(p.x / cell); const cy = Math.floor(p.y / cell); const cz = Math.floor(p.z / cell);
    let best = [];
    for (let r = 1; r <= 8 && best.length < 6; r++) {
      best = [];
      for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) {
        const list = grid.get(key(x, y, z));
        if (list) {
          for (const j of list) {
            // com normais: superfícies viradas para lados opostos (dentro do braço x lateral do tronco) ficam "longe"
            const pen = nrm ? 0.08 * (1 - nrm[i].dot(tNrm[j])) : 0;
            const d = Math.sqrt(p.distanceToSquared(tPts[j])) + pen;
            best.push([d * d, j]);
          }
        }
      }
    }
    best.sort((a, b) => a[0] - b[0]);
    const acc = new Map();
    for (const [d2, j] of best.slice(0, 6)) {
      const inv = 1 / (Math.sqrt(d2) + 0.004);
      for (const [name, w] of tW[j]) acc.set(name, (acc.get(name) || 0) + w * inv);
    }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((a, e) => a + e[1], 0) || 1;
    top.forEach(([name, w], k) => { sIdx[i * 4 + k] = boneIndex.get(name); sW[i * 4 + k] = w / sum; });
  }
  return { sIdx, sW };
}

/**
 * Suaviza os pesos pela topologia da malha (vizinhos por aresta e vértices duplicados nas costuras de UV),
 * tirando o ruído da transferência por vizinho mais próximo (mangas dobrando, buracos na lapela).
 */
function smoothWeights(geos, sIdx, sW, iters = 5) {
  const n = sIdx.length / 4;
  const nb = Array.from({ length: n }, () => new Set());
  const same = new Map(); // costuras e peças sobrepostas (paletó/camisa): vértices na mesma posição (±3 mm) viram vizinhos
  let off = 0;
  for (const geo of geos) {
    const idx = geo.index ? geo.index.array : null;
    const cnt = geo.attributes.position.count;
    if (idx) {
      for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [idx[t] + off, idx[t + 1] + off, idx[t + 2] + off];
        nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b);
      }
    }
    const pos = geo.attributes.position;
    for (let i = 0; i < cnt; i++) {
      const k = `${Math.round(pos.getX(i) / 0.003)},${Math.round(pos.getY(i) / 0.003)},${Math.round(pos.getZ(i) / 0.003)}`;
      if (!same.has(k)) same.set(k, []);
      for (const j of same.get(k)) { nb[i + off].add(j); nb[j].add(i + off); }
      same.get(k).push(i + off);
    }
    off += cnt;
  }
  let maps = Array.from({ length: n }, (_, i) => {
    const m = new Map();
    for (let k = 0; k < 4; k++) if (sW[i * 4 + k] > 0) m.set(sIdx[i * 4 + k], sW[i * 4 + k]);
    return m;
  });
  for (let it = 0; it < iters; it++) {
    const next = maps.map((own, i) => {
      const acc = new Map();
      for (const [b, w] of own) acc.set(b, (acc.get(b) || 0) + w * 0.5);
      const deg = nb[i].size || 1;
      for (const j of nb[i]) for (const [b, w] of maps[j]) acc.set(b, (acc.get(b) || 0) + (w * 0.5) / deg);
      const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = top.reduce((a, e) => a + e[1], 0) || 1;
      return new Map(top.map(([b, w]) => [b, w / sum]));
    });
    maps = next;
  }
  sIdx.fill(0); sW.fill(0);
  maps.forEach((m, i) => { let k = 0; for (const [b, w] of m) { sIdx[i * 4 + k] = b; sW[i * 4 + k] = w; k++; } });
}

/** Gira um osso no mundo (em volta de `axis`, ângulo `a`), mantendo o pai. */
function rotateWorld(bone, axis, a) {
  const wq = bone.getWorldQuaternion(new THREE.Quaternion());
  const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  wq.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, a));
  bone.quaternion.copy(pq.invert().multiply(wq));
  bone.updateMatrixWorld(true);
}

async function makeLula() {
  const { gltf, root, bones, meshes } = await template();
  const H = Number(params.get('h') || 1.7);
  // fonte: vira de frente (+Z), escala e pés no chão
  const src = await loadSrc('lula.glb');
  src.scene.updateMatrixWorld(true);
  const parts = [];
  src.scene.traverse((o) => { if (o.isMesh) parts.push({ geo: o.geometry.clone().applyMatrix4(o.matrixWorld), mat: o.material, name: o.name }); });
  const all = new THREE.Box3();
  parts.forEach((p) => all.union(new THREE.Box3().setFromBufferAttribute(p.geo.attributes.position)));
  const k = H / (all.max.y - all.min.y);
  const c = all.getCenter(v3());
  const fix = new THREE.Matrix4().makeRotationY(Math.PI).multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -all.min.y, -c.z));
  parts.forEach((p) => p.geo.applyMatrix4(fix));
  const lPts = parts.flatMap((p) => Array.from({ length: p.geo.attributes.position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p.geo.attributes.position, i)));

  // medidas (cintura, sem os braços) e pontas das mãos
  const waist = (pts, h) => {
    const all = pts.filter((p) => p.y > 0.58 * h && p.y < 0.64 * h && Math.abs(p.x) < 0.5);
    // largura do tronco: até o primeiro vão vazio da silhueta (1 cm), que separa o tronco da manga quando o braço está baixo
    const bins = new Array(50).fill(0);
    for (const p of all) bins[Math.min(49, Math.floor(Math.abs(p.x) / 0.01))] += 1;
    let cut = 49;
    for (let i = 5; i < 50; i++) if (bins[i] === 0) { cut = i; break; }
    const band = all.filter((p) => Math.abs(p.x) < cut * 0.01);
    const half = Math.max(...band.map((p) => Math.abs(p.x)));
    const z0 = Math.min(...band.map((p) => p.z)); const z1 = Math.max(...band.map((p) => p.z));
    return { half, zc: (z0 + z1) / 2, depth: z1 - z0 };
  };
  const tipOf = (pts, s) => pts.reduce((a, p) => (s * p.x > s * a.x ? p : a), pts[0]);

  // molde: guarda a T-pose dos braços, mede e inclina os braços até a pose do Lula
  const tAll = [];
  meshes.forEach((m) => { if (!/Hair|Eyelashes/.test(m.name)) tAll.push(m); });
  const tPoints = () => {
    const pts = []; const ws = []; const arm = []; const nrms = [];
    gltf.scene.updateMatrixWorld(true);
    for (const m of tAll) {
      const p = m.geometry.attributes.position;
      const si = m.geometry.attributes.skinIndex;
      const sw = m.geometry.attributes.skinWeight;
      const nr = m.geometry.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        const vn = v.clone().addScaledVector(new THREE.Vector3().fromBufferAttribute(nr, i), 0.5);
        m.applyBoneTransform(i, v);
        m.applyBoneTransform(i, vn);
        v.applyMatrix4(m.matrixWorld);
        vn.applyMatrix4(m.matrixWorld);
        nrms.push(vn.sub(v).normalize());
        pts.push(v);
        const w = []; let armW = 0; let side = 0;
        for (let q = 0; q < 4; q++) {
          const wt = sw.getComponent(i, q);
          if (wt <= 0) continue;
          const name = m.skeleton.bones[si.getComponent(i, q)].name;
          w.push([name, wt]);
          if (isArmBone(name)) { armW += wt; side = sideOf(name); }
        }
        ws.push(w);
        arm.push(armW > 0.15 ? side : 0);
      }
    }
    return { pts, ws, arm, nrms };
  };
  const tH = 1.76;
  const armBones = { 1: bones.get('mixamorigLeftArm'), [-1]: bones.get('mixamorigRightArm') };
  const tRest = { 1: armBones[1].quaternion.clone(), [-1]: armBones[-1].quaternion.clone() };
  let T = tPoints();
  const wt = waist(T.pts, tH);
  const wl = waist(lPts, H);
  say('cintura Lula', JSON.stringify(wl, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)), 'molde', JSON.stringify(wt, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
  const tCrotch = 0.786;
  const bodyWarp = (p) => {
    const lin = (x, x0, x1, y0, y1) => y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    const cr = tCrotch * (H / tH);
    const y = p.y < tCrotch ? lin(p.y, 0, tCrotch, 0, cr) : lin(p.y, tCrotch, tH, cr, H);
    return new THREE.Vector3(p.x * (wl.half / wt.half), y, wl.zc + (p.z - wt.zc) * (wl.depth / wt.depth));
  };
  const Z = new THREE.Vector3(0, 0, 1);
  const tips = {};
  for (const s of [1, -1]) {
    const S0 = armBones[s].getWorldPosition(v3());
    const Sl = bodyWarp(S0);
    const tipL = tipOf(lPts, s);
    const tipT = tipOf(T.pts.filter((_, i) => T.arm[i] === s), s);
    const angL = Math.atan2(Sl.y - tipL.y, s * (tipL.x - Sl.x)); // abaixo da horizontal
    const angT = Math.atan2(S0.y - tipT.y, s * (tipT.x - S0.x));
    rotateWorld(armBones[s], Z, -s * (angL - angT));
    say('braço', s > 0 ? 'esq' : 'dir', 'Lula', (angL * 57.3).toFixed(1), '° molde', (angT * 57.3).toFixed(1), '°');
    tips[s] = { Sl, tipL };
  }
  T = tPoints(); // molde já na pose do Lula
  {
    let off = 0;
    for (const m of tAll) {
      const n = m.geometry.attributes.position.count;
      const arms = T.arm.slice(off, off + n).filter((a) => a !== 0).length;
      const names = new Set(m.skeleton.bones.map((b) => b.name.replace('mixamorig', '')));
      say('  molde', m.name, 'vértices', n, 'no braço', arms, 'ossos:', [...names].filter((x) => /Arm|Hand|Shoulder/.test(x)).join(','));
      off += n;
    }
  }
  // mapa do braço: leva ombro→ponta da mão do molde para ombro→ponta da mão do Lula
  const armMap = {};
  for (const s of [1, -1]) {
    const S0 = armBones[s].getWorldPosition(v3());
    const tipT = tipOf(T.pts.filter((_, i) => T.arm[i] === s), s);
    const dT = tipT.clone().sub(S0); const dL = tips[s].tipL.clone().sub(tips[s].Sl);
    const rot = new THREE.Quaternion().setFromUnitVectors(dT.clone().normalize(), dL.clone().normalize());
    const sc = dL.length() / dT.length();
    armMap[s] = (p) => p.clone().sub(S0).applyQuaternion(rot).multiplyScalar(sc).add(tips[s].Sl);
  }
  const warpPt = (p, side) => (side ? armMap[side](p) : bodyWarp(p));
  const wPts = T.pts.map((p, i) => warpPt(p, T.arm[i]));

  if (params.get('debug') && params.get('debug') !== 'weights') { // molde deformado (pontos) sobre a malha do Lula na pose original
    const col = (a) => (a === 1 ? [1, 0.2, 0.2] : a === -1 ? [0.2, 0.4, 1] : [0.9, 0.9, 0.2]);
    const g = new THREE.BufferGeometry().setFromPoints(wPts);
    const meshCol = [[1, 1, 1], [1, 0.5, 0], [0, 1, 1], [1, 0, 1], [0.5, 1, 0], [1, 1, 0], [0.6, 0.6, 1]];
    const byMesh = [];
    tAll.forEach((m, mi) => { for (let i = 0; i < m.geometry.attributes.position.count; i++) byMesh.push(...meshCol[mi % meshCol.length]); });
    const boneCol = T.ws.map((w) => { // cor pelo osso dominante do molde
      const name = (w.slice().sort((a, b) => b[1] - a[1])[0] || ['x'])[0];
      return /Hand/.test(name) ? [1, 1, 0.2] : /ForeArm/.test(name) ? [1, 0.55, 0.1] : /Arm/.test(name) ? [1, 0.2, 0.2] : /Shoulder/.test(name) ? [0.9, 0.2, 0.9] : /Spine|Neck|Head/.test(name) ? [0.2, 0.9, 0.3] : [0.2, 0.5, 1];
    });
    g.setAttribute('color', new THREE.Float32BufferAttribute(params.get('debug') === 'mesh' ? byMesh : params.get('debug') === 'tbones' ? boneCol.flat() : T.arm.flatMap(col), 3));
    const grp = new THREE.Group();
    grp.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.006, vertexColors: true })));
    for (const p of parts) grp.add(new THREE.Mesh(p.geo, new THREE.MeshStandardMaterial({ color: '#888', transparent: true, opacity: 0.45, depthWrite: false })));
    for (const s of [1, -1]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.02), new THREE.MeshBasicMaterial({ color: '#0f0' }));
      m.position.copy(tips[s].tipL); grp.add(m);
      const m2 = m.clone(); m2.position.copy(tips[s].Sl); grp.add(m2);
    }
    return grp;
  }
  const boneList = [...bones.values()];
  const boneIndex = new Map(boneList.map((b, i) => [b.name, i]));
  // juntas: braço pelo mapa do braço, resto pelo do corpo
  const targets = new Map(boneList.map((b) => {
    const side = isArmBone(b.name) ? sideOf(b.name) : 0;
    return [b, warpPt(b.getWorldPosition(v3()), side)];
  }));
  const ordered = [];
  root.traverse((o) => { if (o.isBone) ordered.push(o); });
  for (const b of ordered) {
    b.parent.updateMatrixWorld(true);
    b.position.copy(b.parent.worldToLocal(targets.get(b).clone()));
    b.updateMatrixWorld(true);
  }
  for (const m of meshes) m.removeFromParent();
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneList);
  const toRoot = root.matrixWorld.clone().invert();
  // Região de cada vértice do Lula: braço (perto do eixo ombro→ponta da mão) ou tronco.
  // Braço só casa com pontos do braço do molde; tronco só com pontos fora do braço (e com a raiz do ombro).
  const armAxis = {};
  for (const sd of [1, -1]) {
    const dir = tips[sd].tipL.clone().sub(tips[sd].Sl);
    armAxis[sd] = { o: tips[sd].Sl, dir: dir.clone().normalize(), len: dir.length() };
  }
  const regionOf = (p) => {
    for (const sd of [1, -1]) {
      const { o, dir, len } = armAxis[sd];
      const d = p.clone().sub(o);
      const t = d.dot(dir) / len;
      const r = d.sub(dir.clone().multiplyScalar(t * len)).length();
      // raio generoso (ombreira do paletó) e fora da silhueta do tronco; a axila fica com o tronco, como no molde
      if (t > 0.06 && t < 1.1 && r < 0.2 && Math.abs(p.x) > wl.half - 0.03) return sd;
    }
    return 0;
  };
  const tT = T.pts.map((p, i) => { // posição ao longo do braço no molde deformado (para a raiz do ombro)
    const sd = T.arm[i];
    if (!sd) return 0;
    const { o, dir, len } = armAxis[sd];
    return wPts[i].clone().sub(o).dot(dir) / len;
  });
  const allPts = parts.flatMap((p) => Array.from({ length: p.geo.attributes.position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p.geo.attributes.position, i)));
  const allNrm = parts.flatMap((p) => Array.from({ length: p.geo.attributes.normal.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p.geo.attributes.normal, i).normalize()));
  const region = allPts.map(regionOf);
  const N = allPts.length;
  const sIdxAll = new Uint16Array(N * 4);
  const sWAll = new Float32Array(N * 4);
  for (const reg of [1, -1, 0]) {
    const mine = [];
    region.forEach((r, i) => { if (r === reg) mine.push(i); });
    if (!mine.length) continue;
    const allowed = reg === 0 ? (j) => T.arm[j] === 0 || tT[j] < 0.14 : (j) => T.arm[j] === reg;
    const { sIdx, sW } = transferWeights(mine.map((i) => allPts[i]), wPts, T.ws, boneIndex, 0.04, mine.map((i) => allNrm[i]), T.nrms, allowed);
    mine.forEach((gi, k) => { for (let c = 0; c < 4; c++) { sIdxAll[gi * 4 + c] = sIdx[k * 4 + c]; sWAll[gi * 4 + c] = sW[k * 4 + c]; } });
  }
  say('vértices', N, 'braço esq', region.filter((r) => r === 1).length, 'braço dir', region.filter((r) => r === -1).length);
  smoothWeights(parts.map((p) => p.geo), sIdxAll, sWAll, Number(params.get('smooth') || 4));

  const out = [];
  let offV = 0;
  for (const p of parts) {
    const cnt = p.geo.attributes.position.count;
    const sIdx = sIdxAll.slice(offV * 4, (offV + cnt) * 4);
    const sW = sWAll.slice(offV * 4, (offV + cnt) * 4);
    if (params.get('debug') === 'weights') { // cor por osso dominante
      const col = new Float32Array(cnt * 3);
      const palette = { Arm: [1, 0.2, 0.2], ForeArm: [1, 0.6, 0.1], Hand: [1, 1, 0.2], Shoulder: [0.9, 0.2, 0.9], Spine: [0.2, 0.9, 0.3], Hips: [0.2, 0.5, 1], UpLeg: [0.3, 0.8, 1], Leg: [0.1, 0.3, 0.9], Foot: [0.6, 0.6, 0.6], Neck: [0.5, 1, 0.8], Head: [1, 1, 1] };
      for (let i = 0; i < cnt; i++) {
        const name = boneList[sIdx[i * 4]].name.replace(/^mixamorig(Left|Right)?/, '').replace(/\d+$/, '').replace(/^Hand(Thumb|Index|Middle|Ring|Pinky)$/, 'Hand');
        const key = Object.keys(palette).find((k) => name === k) || Object.keys(palette).find((k) => name.endsWith(k)) || 'Head';
        col.set(palette[key], i * 3);
      }
      p.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    offV += cnt;
    const g = p.geo.applyMatrix4(toRoot);
    g.setAttribute('skinIndex', new THREE.BufferAttribute(sIdx, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sW, 4));
    const mat = params.get('debug') === 'weights' ? new THREE.MeshBasicMaterial({ vertexColors: true }) : p.mat.clone();
    if (mat.map) mat.map = jpegTexture(mat.map, 512);
    mat.roughness = 0.8; mat.metalness = 0;
    const sm = new THREE.SkinnedMesh(g, mat);
    sm.name = `Lula_${p.mat.name}`;
    root.add(sm);
    out.push(sm);
  }
  root.updateMatrixWorld(true);
  for (const sm of out) sm.bind(skeleton, sm.matrixWorld); // ligado na pose "A"

  // A malha fica ligada na pose "A" (de pé, quase sem deformar). Para a conversão das animações,
  // grava um clipe "TPose" com os braços abertos, a mesma referência usada com a Michelle.
  const tracks = [1, -1].map((sd) => new THREE.QuaternionKeyframeTrack(`${armBones[sd].name}.quaternion`, [0], tRest[sd].toArray()));
  gltf.scene.userData.animations = [new THREE.AnimationClip('TPose', 0, tracks)];
  return gltf.scene;
}

// ---------- Aplauso: animação do Mixamo (FBX sem malha) vira GLB só com esqueleto e clipe ----------

async function makeClap() {
  const fbxs = import.meta.glob('../assets-src/*.fbx', { query: '?url', import: 'default' });
  const buf = await (await fetch(await fbxs['../assets-src/clap.fbx']())).arrayBuffer();
  const root = new FBXLoader().parse(buf, '');
  const norm = (n) => n.replace(/^mixamorig\d*:?/, 'mixamorig');
  root.traverse((o) => { if (o.isBone) o.name = norm(o.name); });
  const clip = root.animations[0];
  say('clipe', clip.name, clip.duration.toFixed(2), 's, faixas', clip.tracks.length);
  // só rotações (a translação do quadril não é usada no aplauso) e sem escala
  clip.tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion')).map((t) => {
    t.name = t.name.replace(/^([^.]+)/, (m) => norm(m));
    return t;
  });
  clip.name = 'Clap';
  root.scale.setScalar(0.01);
  const wrap = new THREE.Group();
  wrap.name = 'ClapSource';
  wrap.add(root);
  wrap.userData.animations = [clip];
  const mx = new THREE.AnimationMixer(root);
  mx.clipAction(clip).play();
  mixers.push(mx);
  // mostra o esqueleto animando
  scene.add(new THREE.SkeletonHelper(root));
  return wrap;
}

// ---------- Universal Animation Library (Quaternius, CC0): ossos renomeados para o padrão Mixamo ----------
// ual1 usa nomes do Rigify (DEF-upper_arm.L); ual2, os do manequim do Unreal (upperarm_l). Só ficam as
// faixas dos ossos mapeados; o manequim fica no arquivo (o corpo do Ready Player Me faz retarget por malha).

const UAL_MAPS = {
  ual1: {
    'DEF-hips': 'Hips', 'DEF-spine.001': 'Spine', 'DEF-spine.002': 'Spine1', 'DEF-spine.003': 'Spine2', 'DEF-neck': 'Neck', 'DEF-head': 'Head',
    'DEF-shoulder.L': 'LeftShoulder', 'DEF-upper_arm.L': 'LeftArm', 'DEF-forearm.L': 'LeftForeArm', 'DEF-hand.L': 'LeftHand',
    'DEF-shoulder.R': 'RightShoulder', 'DEF-upper_arm.R': 'RightArm', 'DEF-forearm.R': 'RightForeArm', 'DEF-hand.R': 'RightHand',
    'DEF-thigh.L': 'LeftUpLeg', 'DEF-shin.L': 'LeftLeg', 'DEF-foot.L': 'LeftFoot', 'DEF-toe.L': 'LeftToeBase',
    'DEF-thigh.R': 'RightUpLeg', 'DEF-shin.R': 'RightLeg', 'DEF-foot.R': 'RightFoot', 'DEF-toe.R': 'RightToeBase',
  },
  ual2: {
    pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', Head: 'Head',
    clavicle_l: 'LeftShoulder', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand',
    clavicle_r: 'RightShoulder', upperarm_r: 'RightArm', lowerarm_r: 'RightForeArm', hand_r: 'RightHand',
    thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot', ball_l: 'LeftToeBase',
    thigh_r: 'RightUpLeg', calf_r: 'RightLeg', foot_r: 'RightFoot', ball_r: 'RightToeBase',
  },
};
// dedos: f_index.01.L → LeftHandIndex1 (ual1); index_01_l → LeftHandIndex1 (ual2)
for (const [f, M] of [['index', 'Index'], ['middle', 'Middle'], ['ring', 'Ring'], ['pinky', 'Pinky'], ['thumb', 'Thumb']]) {
  for (let i = 1; i <= 3; i++) {
    for (const [sd, S] of [['L', 'Left'], ['R', 'Right']]) {
      UAL_MAPS.ual1[`DEF-${f === 'thumb' ? 'thumb' : `f_${f}`}.0${i}.${sd}`] = `${S}Hand${M}${i}`;
      UAL_MAPS.ual2[`${f}_0${i}_${sd.toLowerCase()}`] = `${S}Hand${M}${i}`;
    }
  }
}
const UAL_CLIPS = {
  ual1: {
    A_TPose: 'TPose', Idle_Loop: 'idle', Walk_Loop: 'walk', Jog_Fwd_Loop: 'jog', Sprint_Loop: 'run', Punch_Cross: 'punch', Punch_Jab: 'jab',
    Hit_Chest: 'hit', Hit_Head: 'hitHead', Sword_Attack: 'baton', Dance_Loop: 'dance2', Push_Loop: 'push', Driving_Loop: 'drive', Idle_Talking_Loop: 'talk',
  },
  ual2: {
    A_TPose: 'TPose', Melee_Hook: 'hook', Melee_Hook_Rec: 'hookRec', Hit_Knockback: 'knockback', OverhandThrow: 'throw', Sword_Regular_A: 'swing',
    Yes: 'yes', Idle_No_Loop: 'no', Idle_Rail_Call: 'call',
  },
};

async function makeUal(lib) {
  const g = await loadSrc(`${lib}.glb`);
  const map = new Map(Object.entries(UAL_MAPS[lib]).map(([k, v]) => [PropertyBinding.sanitizeNodeName(k), `mixamorig${v}`]));
  const renamed = new Map(); // nome antigo (sanitizado) -> novo
  g.scene.traverse((o) => {
    if (map.has(o.name)) { renamed.set(o.name, map.get(o.name)); o.name = map.get(o.name); }
    if (o.isMesh) { o.material = new THREE.MeshStandardMaterial({ color: '#9aa', roughness: 0.8 }); o.name = 'Mannequin'; }
  });
  const missing = [...map.keys()].filter((k) => !renamed.has(k));
  say(lib, 'ossos mapeados', renamed.size, '| sem correspondência:', missing.join(',') || '-');
  const clips = [];
  for (const c of g.animations) {
    const to = UAL_CLIPS[lib][c.name];
    if (!to) continue;
    const tracks = [];
    for (const t of c.tracks) {
      const m = t.name.match(/^([^.]+)\.(quaternion|position)$/);
      if (!m || !renamed.has(m[1])) continue;
      if (m[2] === 'position' && renamed.get(m[1]) !== 'mixamorigHips') continue; // só o quadril translada
      t.name = `${renamed.get(m[1])}.${m[2]}`;
      tracks.push(t);
    }
    clips.push(new THREE.AnimationClip(to, c.duration, tracks));
    say('  clipe', c.name, '→', to, c.duration.toFixed(2) + 's', tracks.length, 'faixas');
  }
  g.scene.userData.animations = clips;
  const mx = new THREE.AnimationMixer(g.scene);
  mx.clipAction(clips.find((c) => c.name === (params.get('clip') || 'idle')) || clips[0]).play();
  mixers.push(mx);
  g.scene.name = lib;
  return g.scene;
}

// ---------- Zsky (CC BY 4.0): chute, murro e aceno com o rig dele refeito no padrão Mixamo ----------
// O rig tem outros ossos (4 de barriga/peito, cotovelo + antebraço, pé IK solto na raiz), então não dá para só
// renomear. Aqui: monta um esqueleto novo com nomes Mixamo cuja orientação em repouso é a de um osso do original,
// amostra cada clipe a 30 quadros/s lendo a ROTAÇÃO NO MUNDO dos ossos de origem e grava a rotação local no novo
// esqueleto (mundo do pai⁻¹ · mundo do osso). Ossos compostos (Spine1, ForeArm) usam a orientação do último da dupla.

const ZSKY_BONES = [
  // [nome Mixamo, pai Mixamo, osso do original que dá a POSIÇÃO, osso do original que dá a ORIENTAÇÃO]
  ['Hips', null, 'Pelvis', 'Pelvis'],
  ['Spine', 'Hips', 'LowerBelly', 'LowerBelly'],
  ['Spine1', 'Spine', 'UpperBelly', 'LowerChest'],
  ['Spine2', 'Spine1', 'UpperChest', 'UpperChest'],
  ['Neck', 'Spine2', 'Neck', 'Neck'],
  ['Head', 'Neck', 'Head', 'Head'],
  ['LeftShoulder', 'Spine2', 'ShoulderL', 'ShoulderL'],
  ['LeftArm', 'LeftShoulder', 'UpperArmL', 'UpperArmL'],
  ['LeftForeArm', 'LeftArm', 'ElbowL', 'LowerArmL'],
  ['LeftHand', 'LeftForeArm', 'PawL', 'PawL'],
  ['RightShoulder', 'Spine2', 'ShoulderR', 'ShoulderR'],
  ['RightArm', 'RightShoulder', 'UpperArmR', 'UpperArmR'],
  ['RightForeArm', 'RightArm', 'ElbowR', 'LowerArmR'],
  ['RightHand', 'RightForeArm', 'PawR', 'PawR'],
  ['LeftUpLeg', 'Hips', 'UpperLegL', 'UpperLegL'],
  ['LeftLeg', 'LeftUpLeg', 'LowerLegL', 'LowerLegL'],
  ['LeftFoot', 'LeftLeg', '@ankleL', 'FootL'],
  ['RightUpLeg', 'Hips', 'UpperLegR', 'UpperLegR'],
  ['RightLeg', 'RightUpLeg', 'LowerLegR', 'LowerLegR'],
  ['RightFoot', 'RightLeg', '@ankleR', 'FootR'],
  // raízes dos dedos médios, só para o alinhamento das mãos
  ['LeftHandMiddle1', 'LeftHand', 'LowerMiddleFinger1L', null],
  ['RightHandMiddle1', 'RightHand', 'LowerMiddleFinger1R', null],
];
const ZSKY_CLIPS = { Kick_R: 'kick', Punch_R: 'punchR', Wave: 'wave', Iddle: 'idleZ' };

async function makeZsky() {
  const g = await loadSrc('zsky.glb');
  const src = g.scene;
  src.updateMatrixWorld(true);
  const node = (n) => src.getObjectByName(n);
  const wq = (n) => node(n).getWorldQuaternion(new THREE.Quaternion());
  const wp = (n) => node(n).getWorldPosition(v3());
  const rest = {};
  for (const [, , posN, oriN] of ZSKY_BONES) {
    if (posN.startsWith('@')) continue;
    if (!node(posN)) say('FALTA osso', posN);
    if (oriN && !node(oriN)) say('FALTA osso', oriN);
  }
  // tornozelo: joelho + eixo do osso da perna × comprimento da coxa
  const ankle = (sd) => {
    const knee = wp(`LowerLeg${sd}`);
    const hip = wp(`UpperLeg${sd}`);
    const axis = v3().set(0, 1, 0).applyQuaternion(wq(`LowerLeg${sd}`));
    return knee.clone().addScaledVector(axis, knee.distanceTo(hip));
  };
  const ankles = { '@ankleL': ankle('L'), '@ankleR': ankle('R') };
  const posOf = (n) => (n.startsWith('@') ? ankles[n].clone() : wp(n));
  const hipsRest = wp('Pelvis');
  const headRest = wp('Head');

  // escala: a distância quadril→cabeça vira a do esqueleto da UAL (já em padrão Mixamo, em metros)
  const ual = await loadSrc('ual1.glb');
  ual.scene.updateMatrixWorld(true);
  const dU = ual.scene.getObjectByName('DEF-hips') ? null : null; // (os nomes ainda são os do Rigify no arquivo de origem)
  const uHips = ual.scene.getObjectByName(PropertyBinding.sanitizeNodeName('DEF-hips'));
  const uHead = ual.scene.getObjectByName(PropertyBinding.sanitizeNodeName('DEF-head'));
  const dUal = uHead.getWorldPosition(v3()).y - uHips.getWorldPosition(v3()).y;
  const k = dUal / (headRest.y - hipsRest.y);
  say('quadril→cabeça: zsky', (headRest.y - hipsRest.y).toFixed(3), 'ual', dUal.toFixed(3), '→ escala', k.toFixed(4));

  // esqueleto novo
  const root = new THREE.Group();
  root.name = 'Rig';
  const made = new Map();
  const worldQ = new Map();
  const worldP = new Map();
  for (const [name, parent, posN, oriN] of ZSKY_BONES) {
    const bone = new THREE.Bone();
    bone.name = `mixamorig${name}`;
    const P = posOf(posN).multiplyScalar(k);
    // orientação: a do osso de origem; sem ela (dedos), a do pai
    const Q = oriN ? wq(oriN) : worldQ.get(parent).clone();
    worldQ.set(name, Q);
    worldP.set(name, P);
    if (parent) {
      const pq = worldQ.get(parent);
      bone.position.copy(P.clone().sub(worldP.get(parent)).applyQuaternion(pq.clone().invert()));
      bone.quaternion.copy(pq.clone().invert().multiply(Q));
      made.get(parent).add(bone);
    } else {
      bone.position.copy(P);
      bone.quaternion.copy(Q);
      root.add(bone);
    }
    made.set(name, bone);
  }
  root.updateMatrixWorld(true);

  // clipes
  const fps = 30;
  const mixer = new THREE.AnimationMixer(src);
  const clips = [];
  const tmpQ = new THREE.Quaternion();
  for (const c of g.animations) {
    const to = ZSKY_CLIPS[c.name];
    if (!to) continue;
    const action = mixer.clipAction(c);
    action.play();
    const n = Math.max(2, Math.round(c.duration * fps) + 1);
    const times = new Float32Array(n);
    const q = {};
    for (const [name] of ZSKY_BONES) q[name] = new Float32Array(n * 4);
    const hips = new Float32Array(n * 3);
    const prev = {};
    for (let i = 0; i < n; i++) {
      const t = Math.min(c.duration, i / fps);
      times[i] = t;
      mixer.setTime(t);
      src.updateMatrixWorld(true);
      const W = {};
      for (const [name, , , oriN] of ZSKY_BONES) W[name] = oriN ? wq(oriN) : null;
      for (const [name, parent, , oriN] of ZSKY_BONES) {
        let local;
        if (!oriN) local = made.get(name).quaternion.clone(); // dedos: repouso
        else if (!parent) local = W[name];
        else {
          const pw = W[parent] || worldQ.get(parent); // pai sem origem: usa o repouso
          local = pw.clone().invert().multiply(W[name]);
        }
        // continuidade: mesmo hemisfério do quadro anterior
        if (prev[name] && prev[name].dot(local) < 0) local.set(-local.x, -local.y, -local.z, -local.w);
        prev[name] = local.clone();
        local.toArray(q[name], i * 4);
      }
      const hp = wp('Pelvis').multiplyScalar(k);
      hp.toArray(hips, i * 3);
    }
    const tracks = [];
    for (const [name, , , oriN] of ZSKY_BONES) {
      if (!oriN) continue;
      tracks.push(new THREE.QuaternionKeyframeTrack(`mixamorig${name}.quaternion`, times, q[name]));
    }
    tracks.push(new THREE.VectorKeyframeTrack('mixamorigHips.position', times, hips));
    clips.push(new THREE.AnimationClip(to, c.duration, tracks));
    action.stop();
    say('clipe', c.name, '→', to, c.duration.toFixed(2) + 's', n, 'quadros');
  }
  root.userData.animations = clips;
  // pré-visualização: o esqueleto novo (SkeletonHelper) e o primeiro clipe pedido
  const skel = new THREE.SkeletonHelper(root);
  scene.add(skel);
  const mx = new THREE.AnimationMixer(root);
  const want = params.get('clip') || 'kick';
  mx.clipAction(clips.find((c) => c.name === want) || clips[0]).play();
  mixers.push(mx);
  window.__zroot = root;
  return root;
}

async function main() {
  const make = params.get('make');
  const view = params.get('view');
  let obj;
  if (make === 'bolsonaro') obj = await makeBolsonaro();
  else if (make === 'renan') obj = await makeRenan();
  else if (make === 'lula') obj = await makeLula();
  else if (make === 'clap') obj = await makeClap();
  else if (make === 'ual1' || make === 'ual2') obj = await makeUal(make);
  else if (make === 'zsky') obj = await makeZsky();
  if (obj) {
    scene.add(obj);
    if (params.get('save')) await exportGlb(obj, `${make}.glb`);
    if (params.get('tpose') && obj.userData.animations) { const mx = new THREE.AnimationMixer(obj); mx.clipAction(obj.userData.animations[0]).play(); mx.update(0); }
  }
  const anim = params.get('anim'); // ex.: anim=wave&faces=3,4 — usa o mesmo Avatar do jogo
  if (anim) {
    const { loadModels, models } = await import('./models.js');
    const { Avatar } = await import('./avatar.js');
    window.__DEBUG_UNIT = !!params.get('dbg');
    await loadModels();
    window.__models = models;
    const faces = (params.get('faces') || '3,4').split(',').map(Number);
    const avatars = faces.map((face, i) => {
      const a = new Avatar({
        body: Number(params.get('body') || 0), age: 0, face, height: 1, skin: 1, hairStyle: 0, hair: 1, beard: 0, shirt: 0, top: 0, pants: 0, flag: Number(params.get('flag') || 0), sign: '', side: 1, equip: { head: params.get('hat') || undefined }, custom: {}, // &hat=bone|chapeu-palha
      });
      a.group.position.x = (i - (faces.length - 1) / 2) * 1.1;
      scene.add(a.group);
      return a;
    });
    window.__avatars = avatars;
    const strike = params.get('strike'); // ex.: &strike=baton — repete o golpe a cada 1,6 s
    let nextStrike = 0.5;
    renderer.setAnimationLoop(() => {
      const dt = clock.getDelta();
      if (strike && clock.elapsedTime > nextStrike) { avatars.forEach((a) => a.strikeNow(strike)); nextStrike = clock.elapsedTime + 1.6; }
      avatars.forEach((a) => a.update(dt, anim, anim === 'walk' ? 2.2 : 0));
      renderer.render(scene, cam);
    });
    window.__look([0, 1.2, 3.4], [0, 1.0, 0]);
  }
  const srcName = params.get('src'); // só mostra um GLB de assets-src, com 1,75 m de altura, ao lado do ch33
  if (srcName) {
    const g = await loadSrc(srcName);
    const box = new THREE.Box3().setFromObject(g.scene);
    const size = box.getSize(v3());
    say(srcName, 'min', fmt(box.min), 'tamanho', fmt(size));
    g.scene.traverse((o) => { if (o.isMesh) say('  malha', o.name, 'tris', (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3, 'mat', o.material.name, o.material.map ? `${o.material.map.image.width}px` : '-'); });
    const k = 1.75 / size.y;
    g.scene.scale.multiplyScalar(k);
    g.scene.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(g.scene);
    g.scene.position.set(-0.6 - (b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    scene.add(g.scene);
    const ref = await loadModel('ch33.glb');
    ref.scene.position.x = 0.6;
    scene.add(ref.scene);
  }
  if (view) {
    const g = await loadModel(view);
    g.scene.position.x = Number(params.get('x') || 0);
    scene.add(g.scene);
  }
  window.__done = true;
}
main().catch((e) => { say('ERRO', e.stack); window.__done = true; });
