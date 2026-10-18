import * as THREE from 'three';
import { createSky, SUN_DIR } from '../sky.js';
import {
  asphaltTexture, grassTexture, concreteTexture, signTexture, canvasTexture,
} from '../textures.js';
import {
  PLACES, QUEUE, SECOES, room, mesaria, cabine, queueSpot,
} from '../../shared/votacao.js';

// Cenário do simulador de votação: casa, rua, escola (pátio, fila, corredor, quatro seções).
// As paredes são planos de um lado só: de fora para dentro dá para ver o interior (câmera em terceira pessoa).

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const box = (w, h, d, color, x, y, z, parent) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? std(color) : color);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
};

/** Parede reta de um lado só. axis 'x': corre ao longo de x em z = at; 'z': ao longo de z em x = at. */
function wall(parent, {
  axis, at, from, to, h = 3, face = 1, color = '#e9e2d0', gaps = [], doorH = 2.3, y0 = 0,
}) {
  const mat = std(color, { side: THREE.FrontSide });
  const cuts = [...gaps].sort((a, b) => a[0] - b[0]);
  const segs = [];
  let cur = from;
  for (const [a, b] of cuts) { if (a > cur) segs.push([cur, a, 0, h]); cur = Math.max(cur, b); }
  if (cur < to) segs.push([cur, to, 0, h]);
  for (const [a, b] of cuts) if (h > doorH) segs.push([a, b, doorH, h]);
  const rot = axis === 'x' ? (face > 0 ? 0 : Math.PI) : (face > 0 ? Math.PI / 2 : -Math.PI / 2);
  for (const [a, b, ya, yb] of segs) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b - a, yb - ya), mat);
    const mid = (a + b) / 2;
    m.position.set(axis === 'x' ? mid : at, y0 + (ya + yb) / 2, axis === 'x' ? at : mid);
    m.rotation.y = rot;
    m.receiveShadow = true;
    parent.add(m);
  }
}

function floor(parent, x0, x1, z0, z1, mat, y = 0.01) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const tiled = (base, line, repeat) => canvasTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = line; ctx.lineWidth = 3; ctx.strokeRect(0, 0, w, h);
}, { repeat });

const woodTexture = (repeat) => canvasTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#a77a4d'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#9a6f45' : '#b0834f'; ctx.fillRect(0, i * 16, w, 15); }
}, { repeat });

function labelPlane(parent, text, w, h, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: signTexture(text), roughness: 0.8 }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}

function tree(parent, x, z, s = 1) {
  const g = new THREE.Group();
  box(0.3 * s, 2 * s, 0.3 * s, '#6b4a2b', 0, 1 * s, 0, g);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(1.4 * s, 10, 8), std('#3f8a3c'));
  crown.position.y = 3 * s; crown.castShadow = true;
  g.add(crown);
  g.position.set(x, 0, z);
  parent.add(g);
}

function house(parent, x, z, w, d, color, roof) {
  const g = new THREE.Group();
  box(w, 3, d, color, 0, 1.5, 0, g);
  box(w + 0.4, 0.3, d + 0.4, roof, 0, 3.15, 0, g);
  const rf = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 1.6, 4), std(roof));
  rf.position.y = 4; rf.rotation.y = Math.PI / 4; rf.castShadow = true;
  g.add(rf);
  box(1, 2, 0.1, '#5b3a22', 0, 1, x > 0 ? -d / 2 - 0.05 : d / 2 + 0.05, g);
  g.position.set(x, 0, z);
  parent.add(g);
}

export function createVotacaoWorld(scene, renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  createSky(scene, renderer);
  scene.fog = new THREE.Fog('#cfe3f2', 90, 360);

  scene.add(new THREE.HemisphereLight('#cfe6ff', '#8a7a5a', 0.9));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 120;
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  const root = new THREE.Group();
  scene.add(root);
  const P = PLACES;

  // chão: grama em volta, rua de asfalto, calçadas, pátio da escola
  const grass = grassTexture([60, 90]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 320), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 50); ground.receiveShadow = true;
  root.add(ground);
  const road = floor(root, -P.streetX, P.streetX, P.house.z1 - 0.4, P.gateZ, new THREE.MeshStandardMaterial({ map: asphaltTexture([2, 14]), roughness: 0.95 }), 0.02);
  road.material.map.repeat.set(1.5, 14);
  for (const s of [-1, 1]) {
    floor(root, s > 0 ? P.streetX : -P.streetX - 2.2, s > 0 ? P.streetX + 2.2 : -P.streetX, P.house.z1 - 0.4, P.gateZ, new THREE.MeshStandardMaterial({ map: concreteTexture([1, 22]), roughness: 0.95 }), 0.03);
  }
  for (let z = P.house.z1 + 1; z < P.gateZ - 2; z += 5) box(0.16, 0.01, 2.2, '#f2f2f0', 0, 0.035, z, root); // faixa central
  floor(root, P.yard.x0, P.yard.x1, P.yard.z0, P.corridor.z1 - 2.2, new THREE.MeshStandardMaterial({ map: concreteTexture([10, 12], '#b5b2aa'), roughness: 0.95 }), 0.02);

  // ---------- casa do eleitor ----------
  const H = P.house;
  floor(root, H.x0, H.x1, H.z0, H.z1, new THREE.MeshStandardMaterial({ map: woodTexture([3, 3]), roughness: 0.8 }), 0.03);
  const doorGap = [[-0.9, 0.9]];
  wall(root, { axis: 'x', at: H.z0, from: H.x0, to: H.x1, h: 2.8, face: 1, color: '#f0e6d2' });
  wall(root, { axis: 'z', at: H.x0, from: H.z0, to: H.z1, h: 2.8, face: 1, color: '#e9dfc9' });
  wall(root, { axis: 'z', at: H.x1, from: H.z0, to: H.z1, h: 2.8, face: -1, color: '#e9dfc9' });
  wall(root, { axis: 'x', at: H.z1, from: H.x0, to: H.x1, h: 2.8, face: -1, color: '#f0e6d2', gaps: doorGap });
  wall(root, { axis: 'x', at: H.z1 + 0.02, from: H.x0, to: H.x1, h: 2.8, face: 1, color: '#c9b79a', gaps: doorGap }); // lado da rua
  box(2.1, 0.6, 0.9, '#7a8fb5', 2.2, 0.3, H.z0 + 0.7, root); // cama
  box(2.1, 0.12, 0.7, '#f4f1ea', 2.2, 0.66, H.z0 + 0.5, root);
  box(1.4, 0.8, 0.8, '#7b5a3a', P.mesa.x, 0.4, P.mesa.z - 0.5, root); // a mesa
  box(0.34, 0.012, 0.24, '#f5f0e0', P.mesa.x - 0.3, 0.83, P.mesa.z - 0.5, root); // documento
  box(0.3, 0.012, 0.2, '#2c6cb0', P.mesa.x + 0.05, 0.83, P.mesa.z - 0.5, root); // título
  box(0.2, 0.012, 0.28, '#fff6a8', P.mesa.x + 0.4, 0.83, P.mesa.z - 0.5, root); // colinha
  box(1.8, 0.7, 0.8, '#b36a4a', -0.6, 0.35, H.z0 + 0.7, root); // sofá
  box(2.4, 0.015, 1.4, '#c85a54', 0, 0.045, H.z1 - 1.2, root); // tapete
  box(1.8, 0.012, 0.9, '#4d5a3f', 0, 0.04, H.z1 + 1.1, root); // capacho

  // ---------- rua: casas, árvores, postes ----------
  const colors = ['#d9b38c', '#9fc3d6', '#e5c46a', '#cf8b7a', '#a9c79a', '#d8d0c0'];
  for (let i = 0, z = 6; z < P.gateZ - 8; i += 1, z += 11 + (i % 3)) {
    house(root, -15, z, 8, 7, colors[i % colors.length], '#8a4b36');
    house(root, 15, z + 3, 8, 7, colors[(i + 2) % colors.length], '#7a3f35');
    tree(root, -8.5, z + 5, 0.9 + (i % 3) * 0.12);
    tree(root, 8.5, z - 1, 0.9 + ((i + 1) % 3) * 0.12);
    if (i % 2 === 0) { // poste
      box(0.18, 6, 0.18, '#6b6f75', -P.streetX + 0.2, 3, z + 2, root);
      box(0.9, 0.12, 0.12, '#6b6f75', -P.streetX + 0.6, 6, z + 2, root);
    }
  }
  // carros estacionados
  [[-5.6, 18, '#c0392b'], [5.7, 33, '#2c3e50'], [-5.6, 42, '#e0b300']].forEach(([x, z, c]) => {
    box(1.8, 0.8, 4, c, x, 0.55, z, root); box(1.6, 0.6, 2, '#bcd4e6', x, 1.2, z - 0.2, root);
  });
  // panfleteiro (a conversa é só um aviso: boca de urna é crime)
  box(0.04, 1.5, 0.04, '#8b8b8b', P.panfleteiro.x + 0.6, 0.75, P.panfleteiro.z + 0.2, root);
  labelPlane(root, 'SANTINHO?', 0.9, 0.55, P.panfleteiro.x + 0.6, 1.7, P.panfleteiro.z + 0.2, Math.PI);

  // ---------- portão e muro da escola ----------
  const wallColor = '#ece6d3';
  const gz = P.yard.z0;
  const gate = [[-P.gateX, P.gateX]];
  wall(root, { axis: 'x', at: gz, from: P.yard.x0 - 1, to: P.yard.x1 + 1, h: 3, face: -1, color: wallColor, gaps: gate, doorH: 2.6 });
  wall(root, { axis: 'z', at: P.yard.x0 - 1, from: gz, to: P.corridor.z1, h: 3, face: -1, color: wallColor });
  wall(root, { axis: 'z', at: P.yard.x1 + 1, from: gz, to: P.corridor.z1, h: 3, face: 1, color: wallColor });
  box(0.5, 3.4, 0.5, '#d4cdb8', -P.gateX - 0.3, 1.7, gz, root); box(0.5, 3.4, 0.5, '#d4cdb8', P.gateX + 0.3, 1.7, gz, root);
  box(P.gateX * 2 + 1.1, 0.7, 0.5, '#3b6f4a', 0, 3.3, gz, root);
  labelPlane(root, 'ESCOLA MUNICIPAL ESPERANÇA', 4.6, 0.62, 0, 3.3, gz - 0.28, Math.PI);
  labelPlane(root, 'LOCAL DE VOTAÇÃO', 3.4, 0.5, 0, 3.3, gz + 0.28, 0);
  labelPlane(root, 'SIMULADOR EDUCATIVO · NÃO OFICIAL', 5, 0.55, 0, 2.7, gz - 0.28, Math.PI);

  // pátio: árvores, bandeira, cartaz da fila
  tree(root, -9, 66, 1.1); tree(root, 9, 70, 1.1); tree(root, -9, 82, 1.1); tree(root, 9, 84, 1.1);
  box(0.12, 7, 0.12, '#c9c9c9', 8, 3.5, 62, root);
  labelPlane(root, 'FILA PARA O VOTO', 2.2, 1.4, P.filaEntrada.x, 1.9, P.filaEntrada.z - 3, Math.PI);
  box(0.1, 1.9, 0.1, '#444', P.filaEntrada.x, 0.95, P.filaEntrada.z - 3.05, root);
  // cordões da fila
  const rope = std('#c43d3d');
  for (const s of [-1, 1]) {
    for (let i = 0; i < QUEUE.slots; i += 1) {
      const z = queueSpot(i).z;
      box(0.08, 0.95, 0.08, '#555a60', s * 0.95, 0.48, z, root);
      if (i > 0) box(0.03, 0.03, QUEUE.step, rope, s * 0.95, 0.9, z + QUEUE.step / 2, root);
    }
  }

  // ---------- prédio da escola ----------
  const B = { x0: -14, x1: 14 };
  const zf = 89;
  const zb = P.roomZ1 + 0.6;
  floor(root, B.x0, B.x1, zf, zb, new THREE.MeshStandardMaterial({ map: tiled('#d9d4c4', '#b9b3a2', [14, 9]), roughness: 0.7 }), 0.03);
  wall(root, { axis: 'x', at: zf, from: B.x0, to: B.x1, h: 4.4, face: -1, color: '#f1e3b0', gaps: [[P.buildingDoor.x0, P.buildingDoor.x1]], doorH: 2.6 });
  wall(root, { axis: 'x', at: zf + 0.05, from: B.x0, to: B.x1, h: 4.4, face: 1, color: '#e8dca4', gaps: [[P.buildingDoor.x0, P.buildingDoor.x1]], doorH: 2.6 });
  wall(root, { axis: 'z', at: B.x0, from: zf, to: zb, h: 4.4, face: 1, color: '#efe7cc' });
  wall(root, { axis: 'z', at: B.x1, from: zf, to: zb, h: 4.4, face: -1, color: '#efe7cc' });
  wall(root, { axis: 'x', at: zb, from: B.x0, to: B.x1, h: 4.4, face: -1, color: '#efe7cc' });
  box(B.x1 - B.x0 + 1, 0.5, 1, '#8a4b36', 0, 4.65, zf + 0.2, root);
  labelPlane(root, 'ESCOLA MUNICIPAL ESPERANÇA', 6, 0.8, 0, 3.7, zf - 0.04, Math.PI);
  labelPlane(root, 'ENTRADA · VOTAÇÃO', 3, 0.5, 0, 2.9, zf - 0.05, Math.PI);
  // janelas da fachada
  for (const x of [-9, -5, 5, 9]) box(2, 1.2, 0.05, '#7fb4d4', x, 2.2, zf - 0.04, root);
  // corredor e salas
  const gaps = P.roomX.map((x) => [x - 0.9, x + 0.9]);
  wall(root, { axis: 'x', at: P.roomZ0, from: B.x0, to: B.x1, h: 3.2, face: -1, color: '#f4efe0', gaps });
  const roomFloor = new THREE.MeshStandardMaterial({ map: tiled('#c9d8c4', '#a9b9a4', [3, 4]), roughness: 0.7 });
  P.roomX.forEach((rx, i) => {
    const r = room(i);
    floor(root, r.x0, r.x1, r.z0, r.z1, roomFloor, 0.05);
    wall(root, { axis: 'z', at: r.x0 + 0.02, from: r.z0, to: r.z1, h: 3.2, face: 1, color: '#f4efe0' });
    wall(root, { axis: 'z', at: r.x1 - 0.02, from: r.z0, to: r.z1, h: 3.2, face: -1, color: '#f4efe0' });
    wall(root, { axis: 'x', at: r.z1, from: r.x0, to: r.x1, h: 3.2, face: -1, color: '#f4efe0' });
    labelPlane(root, `SEÇÃO ${SECOES[i]}`, 1.9, 1.05, rx, 2.7, P.roomZ0 - 0.05, Math.PI);
    labelPlane(root, `SEÇÃO ${SECOES[i]}`, 1.9, 1.05, rx, 2.7, P.roomZ0 + 0.05, 0);
    // mesa dos mesários, leitor biométrico e terminal
    const m = mesaria(i);
    box(3.4, 0.85, 0.9, '#f4f4f2', m.x, 0.43, m.z, root);
    box(0.5, 0.35, 0.4, '#30343b', m.x - 0.8, 1.02, m.z, root); // terminal do mesário
    box(0.18, 0.05, 0.22, '#1f5fbf', m.x + 0.3, 0.88, m.z - 0.15, root); // leitor de digital
    box(0.5, 0.01, 0.35, '#fff', m.x + 1.0, 0.86, m.z - 0.1, root); // caderno de votação
    labelPlane(root, 'DOCUMENTO COM FOTO · BIOMETRIA', 2, 0.5, m.x, 1.6, m.z + 0.5, 0);
    // cabine de votação com a urna
    const c = cabine(i);
    const cx = c.x; const cz = c.z + 0.9;
    box(1.4, 1.9, 0.06, '#5a6e86', cx, 0.95, cz + 0.45, root);
    box(0.06, 1.9, 0.9, '#5a6e86', cx - 0.7, 0.95, cz, root);
    box(0.06, 1.9, 0.9, '#5a6e86', cx + 0.7, 0.95, cz, root);
    box(1.3, 0.05, 0.8, '#d9d4c4', cx, 1.0, cz, root); // bancada
    box(0.6, 0.18, 0.4, '#3a3d42', cx, 1.12, cz, root); // urna
    box(0.34, 0.24, 0.02, '#a9d7a0', cx, 1.28, cz - 0.12, root); // visor
    box(1.4, 0.55, 0.04, '#b0b8c4', cx, 1.62, cz - 0.45, root); // aba da cabine (cortina)
    labelPlane(root, 'VOTE AQUI', 0.9, 0.5, cx, 2.1, cz - 0.46, Math.PI);
  });
  labelPlane(root, 'SALAS DE VOTAÇÃO · SEÇÕES 0101 A 0104', 6, 0.6, 0, 3, P.corridor.z0 + 0.1, 0);

  // ---------- guia do próximo passo: pilar luminoso ----------
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 6, 14, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.35, depthWrite: false }));
  pillar.position.y = 3;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.08, 8, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd23f' }));
  ring.position.y = 0.1;
  beacon.add(pillar, ring);
  beacon.visible = false;
  scene.add(beacon);

  return {
    setBeacon(pos) {
      beacon.visible = !!pos;
      if (pos) beacon.position.set(pos.x, 0, pos.z);
    },
    update(time, px, pz) {
      ring.scale.setScalar(1 + Math.sin(time * 4) * 0.12);
      sun.position.set(px + SUN_DIR.x * 50, SUN_DIR.y * 50, pz + SUN_DIR.z * 50);
      sun.target.position.set(px, 0, pz);
    },
  };
}
