// Converte um corpo do Quaternius "Universal Base Characters" (FBX, esqueleto do manequim do Unreal, CC0)
// em public/models/ubc_female.glb com ossos no padrão Mixamo (mixamorigHips...), sem texturas.
// Uso: node scripts/converter-ubc.mjs assets-src/ubc-female.fbx public/models/ubc_female.glb
import fs from 'node:fs';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error('uso: node scripts/converter-ubc.mjs <entrada.fbx> <saida.glb>');

globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); this.onload?.(); }); }
};
THREE.TextureLoader.prototype.load = () => new THREE.Texture(); // as texturas não vêm no FBX

const buf = fs.readFileSync(src);
const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
root.updateMatrixWorld(true);

// ---- nomes: manequim do Unreal -> Mixamo ----
const MAP = {
  pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', Head: 'Head',
  clavicle_l: 'LeftShoulder', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand',
  clavicle_r: 'RightShoulder', upperarm_r: 'RightArm', lowerarm_r: 'RightForeArm', hand_r: 'RightHand',
  thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot', ball_l: 'LeftToeBase', ball_leaf_l: 'LeftToe_End',
  thigh_r: 'RightUpLeg', calf_r: 'RightLeg', foot_r: 'RightFoot', ball_r: 'RightToeBase', ball_leaf_r: 'RightToe_End',
};
for (const [f, M] of [['index', 'Index'], ['middle', 'Middle'], ['ring', 'Ring'], ['pinky', 'Pinky'], ['thumb', 'Thumb']]) {
  for (const [sd, S] of [['l', 'Left'], ['r', 'Right']]) {
    for (let i = 1; i <= 3; i++) MAP[`${f}_0${i}_${sd}`] = `${S}Hand${M}${i}`;
    MAP[`${f}_04_leaf_${sd}`] = `${S}Hand${M}4`;
  }
}
const mixamo = (n) => (MAP[n] ? `mixamorig${MAP[n]}` : n);

// ---- esqueleto limpo: o FBXLoader duplica cada osso (osso dentro de osso com o mesmo nome) ----
const meshes = [];
root.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
const world = new Map(); // nome -> matriz de mundo na pose de ligação
const parentName = new Map();
const order = [];
for (const m of meshes) {
  for (const b of m.skeleton.bones) {
    if (world.has(b.name)) continue;
    world.set(b.name, b.matrixWorld.clone());
    let p = b.parent;
    while (p && (p.name === b.name || !p.isBone)) p = p.parent;
    parentName.set(b.name, p?.isBone ? p.name : null);
    order.push(b.name);
  }
}
const bones = new Map(order.map((n) => [n, Object.assign(new THREE.Bone(), { name: mixamo(n) })]));
const scene = new THREE.Group();
scene.name = 'UbcFemale';
const tmp = new THREE.Matrix4();
for (const n of order) {
  const b = bones.get(n);
  const pn = parentName.get(n);
  const local = pn ? tmp.copy(world.get(pn)).invert().multiply(world.get(n)) : world.get(n).clone();
  local.decompose(b.position, b.quaternion, b.scale);
  (pn ? bones.get(pn) : scene).add(b);
}
scene.updateMatrixWorld(true);

// ---- malhas: geometria para o espaço de ligação, índices de osso para o esqueleto novo ----
const skeleton = new THREE.Skeleton(order.map((n) => bones.get(n)));
const COLORS = { MI_Eyes: '#2b1a10', MI_Hair_2: '#2a1810' };
const NAMES = { Superhero_Female: 'Body', Eyes: 'Eyes', Eyebrows: 'Eyebrows' };
for (const m of meshes) {
  let g = m.geometry;
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(name)) g.deleteAttribute(name);
  g.applyMatrix4(m.matrixWorld); // o FBX é Z-up: a rotação fica no nó pai
  const si = g.attributes.skinIndex;
  const remap = m.skeleton.bones.map((b) => order.indexOf(b.name));
  for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) si.setComponent(i, k, remap[si.getComponent(i, k)]);
  if (!g.index) g = m.geometry = mergeVertices(g);
  const mats = [].concat(m.material).map((o) => new THREE.MeshStandardMaterial({
    name: o.name, color: COLORS[o.name] ?? '#c98d62', roughness: o.name === 'MI_Eyes' ? 0.15 : 0.7, metalness: 0,
  }));
  const sk = new THREE.SkinnedMesh(g, Array.isArray(m.material) ? mats : mats[0]);
  sk.name = NAMES[m.name] ?? m.name;
  sk.bind(skeleton, new THREE.Matrix4());
  scene.add(sk);
}

// ---- cabelo simples (o pacote não traz): calota + nuca presas ao osso da cabeça ----
{
  const head = bones.get('Head');
  const hw = world.get('Head');
  const body = scene.getObjectByName('Body');
  const pts = [];
  const pos = body.geometry.attributes.position;
  const idx = body.geometry.attributes.skinIndex;
  const wgt = body.geometry.attributes.skinWeight;
  const hi = order.indexOf('Head');
  const inv = hw.clone().invert();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (idx.getComponent(i, k) === hi) w += wgt.getComponent(i, k);
    if (w > 0.6) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(inv).clone());
  }
  const box = new THREE.Box3().setFromPoints(pts);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  console.log('cabeça (espaço do osso): centro', c.toArray().map((x) => +x.toFixed(3)), 'tamanho', s.toArray().map((x) => +x.toFixed(3)));
  const eyeGeo = scene.getObjectByName('Eyes').geometry.attributes.position;
  const eyeC = new THREE.Vector3();
  for (let i = 0; i < eyeGeo.count; i++) eyeC.add(v.fromBufferAttribute(eyeGeo, i).applyMatrix4(inv));
  eyeC.divideScalar(eyeGeo.count);
  console.log('olhos (espaço do osso):', eyeC.toArray().map((x) => +x.toFixed(3)));
  const r = Math.max(s.x, s.y, s.z) * 0.5;
  // no osso da cabeça: +Y para cima, +Z para a frente. A calota é inclinada para trás para a borda ficar na testa
  const cap = new THREE.SphereGeometry(r * 1.07, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.64);
  cap.rotateX(-0.5);
  cap.translate(0, 0.004, -0.008);
  // alonga a parte de baixo para trás (corte "chanel") e estreita um pouco, para cobrir a nuca sem passar dos ombros
  const hp = cap.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const back = Math.min(1, Math.max(0, -hp.getZ(i) / (r * 0.9)));
    const below = hp.getY(i) - 0.012;
    if (below < 0 && back > 0) {
      const k = 1 + 4.2 * back * back;
      hp.setY(i, 0.012 + below * k);
      const shrink = 1 - 0.12 * Math.min(1, (k - 1) / 4);
      hp.setX(i, hp.getX(i) * shrink);
    }
  }
  cap.computeVertexNormals();
  const hair = new THREE.Mesh(
    cap.toNonIndexed(),
    new THREE.MeshStandardMaterial({ name: 'Hair', color: '#2a1810', roughness: 0.55, metalness: 0, side: THREE.DoubleSide }),
  );
  hair.name = 'Hair';
  hair.position.copy(c);
  head.add(hair);
}

const glb = await new Promise((res, rej) => new GLTFExporter().parse(scene, res, rej, { binary: true }));
fs.writeFileSync(out, Buffer.from(glb));
console.log('gravado', out, (glb.byteLength / 1024).toFixed(0), 'KB; ossos', order.length);
