import * as THREE from 'three';
import { createSky, SUN_DIR } from '../sky.js';
import {
  asphaltTexture, grassTexture, concreteTexture, signTexture, canvasTexture, flagTexture, streetSignTexture,
} from '../textures.js';
import { addTrees } from '../trees.js';
import {
  rebocoTex, rodapeTex, tijoloTex, telhaTex, chapiscoTex, pedraPortuguesaTex, folhaPalmeiraTex, uvMeters, boxGeo, telhadoGeo, empenaGeo,
} from './materiais.js';
import {
  PLACES, QUEUE, SECOES, PARTIDOS, room, mesaria, cabine, queueSpot,
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
  const mat = new THREE.MeshStandardMaterial({ color, map: rebocoTex(), roughness: 0.92, side: THREE.FrontSide });
  const sujo = new THREE.MeshStandardMaterial({ color, map: rodapeTex(), roughness: 0.95, side: THREE.FrontSide });
  const cuts = [...gaps].sort((a, b) => a[0] - b[0]);
  const segs = [];
  let cur = from;
  for (const [a, b] of cuts) { if (a > cur) segs.push([cur, a, 0, h]); cur = Math.max(cur, b); }
  if (cur < to) segs.push([cur, to, 0, h]);
  for (const [a, b] of cuts) if (h > doorH) segs.push([a, b, doorH, h]);
  const rot = axis === 'x' ? (face > 0 ? 0 : Math.PI) : (face > 0 ? Math.PI / 2 : -Math.PI / 2);
  for (const [a, b, ya, yb] of segs) {
    const m = new THREE.Mesh(uvMeters(new THREE.PlaneGeometry(b - a, yb - ya), b - a, yb - ya), mat);
    const mid = (a + b) / 2;
    m.position.set(axis === 'x' ? mid : at, y0 + (ya + yb) / 2, axis === 'x' ? at : mid);
    m.rotation.y = rot;
    m.receiveShadow = true;
    parent.add(m);
    if (ya === 0) { // barra suja de poeira e respingo de chuva
      const r = new THREE.Mesh(new THREE.PlaneGeometry(b - a, 0.5), sujo);
      const off = 0.01 * face;
      r.position.set(axis === 'x' ? mid : at + off, y0 + 0.25, axis === 'x' ? at + off : mid);
      r.rotation.y = rot;
      parent.add(r);
    }
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



// ---------- peças de rua brasileiras ----------

const mulberry = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

let winTex = null;
/** Janelas de prédio: uma célula = um andar e um vão; a cor da fachada vem do material. */
const windowsTexture = () => (winTex ||= canvasTexture(64, 64, (ctx, w, h) => {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#3b4a5a'; ctx.fillRect(12, 14, 40, 30);
  ctx.fillStyle = '#9fb3c2'; ctx.fillRect(14, 16, 17, 26); ctx.fillRect(33, 16, 17, 26);
  ctx.fillStyle = '#d8d8d8'; ctx.fillRect(10, 44, 44, 4);
}));

let grafTex = null;
/** Pichação e grafite nos muros (nas cidades grandes). */
const grafiteTexture = () => (grafTex ||= canvasTexture(256, 128, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  const cols = ['#e63946', '#1d3557', '#2a9d8f', '#f4a261', '#111', '#8338ec'];
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = cols[i % cols.length]; ctx.lineWidth = 3 + (i % 3) * 2; ctx.beginPath();
    let x = Math.random() * w; let y = 30 + Math.random() * 70; ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += 8 + Math.random() * 22; y += (Math.random() - 0.5) * 40; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.fillStyle = '#111'; ctx.font = 'bold 34px sans-serif'; ctx.fillText('VOTE CONSCIENTE', 14, 112);
}, { tile: false }));

function caixaDagua(parent, x, y, z) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.75, 14), std('#2f6fc4'));
  c.position.set(x, y + 0.38, z); c.castShadow = true; parent.add(c);
  const tampa = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.08, 14), std('#2a5fa8'));
  tampa.position.set(x, y + 0.79, z); parent.add(tampa);
}

/** Casa térrea ou sobrado, com muro, portão de grade e caixa d'água na laje. `dir`: para onde a frente olha (+1 = +x). */
function casa(parent, rng, x, z, cidade, dir) {
  const g = new THREE.Group();
  const w = 7; const d = 7 + rng() * 2;
  const floors = rng() < 0.45 ? 2 : 1;
  const h = floors * 2.9;
  const cor = cidade.casas[Math.floor(rng() * cidade.casas.length)];
  const semReboco = floors === 2 && rng() < 0.35; // o andar de cima "ainda vai rebocar"
  const corpo = new THREE.Mesh(boxGeo(w, floors === 2 && semReboco ? 2.9 : h, d), new THREE.MeshStandardMaterial({ color: cor, map: rebocoTex(), roughness: 0.92 }));
  corpo.position.y = (floors === 2 && semReboco ? 2.9 : h) / 2; corpo.castShadow = true; corpo.receiveShadow = true; g.add(corpo);
  if (semReboco) {
    const cima = new THREE.Mesh(boxGeo(w, 2.9, d, 1.6), new THREE.MeshStandardMaterial({ map: tijoloTex(), roughness: 0.95 }));
    cima.position.y = 2.9 + 1.45; cima.castShadow = true; g.add(cima);
    for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) box(0.25, 3.3, 0.25, '#9a968e', px, 2.9 + 1.65, pz, g); // pilares e ferro de espera
  }
  const laje = semReboco || rng() < 0.5;
  if (laje) { box(w + 0.2, 0.2, d + 0.2, '#bdb6aa', 0, h + 0.1, 0, g); caixaDagua(g, -w / 4, h + 0.2, d / 4); } else {
    const telha = new THREE.MeshStandardMaterial({ color: cidade.telhado, map: telhaTex(), roughness: 0.85, side: THREE.DoubleSide });
    const roof = new THREE.Mesh(telhadoGeo(d, w, 1.9), telha);
    roof.rotation.y = Math.PI / 2; roof.position.y = h; roof.castShadow = true; g.add(roof);
    const emp = new THREE.MeshStandardMaterial({ color: cor, map: rebocoTex(), roughness: 0.92, side: THREE.DoubleSide });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(empenaGeo(d, 1.9), emp); e.position.set(s * w / 2, h, 0); e.rotation.y = Math.PI / 2; g.add(e); }
  }
  // porta, janelas com grade
  const fx = (dir > 0 ? 1 : -1) * (w / 2 + 0.03);
  const front = (gx, gy, gz, gw, gh, color) => box(0.05, gh, gw, color, fx, gy, gz, g);
  front(0, 1.05, -1.6, 1, 2.1, '#5b3a22');
  for (let f = 0; f < floors; f++) {
    front(0, 1.6 + f * 2.9, 1.2, 1.4, 1.1, '#9fc3d6');
    for (let b = -2; b <= 2; b++) front(0, 1.6 + f * 2.9, 1.2 + b * 0.28, 0.04, 1.15, '#2b2b2b'); // grade
  }
  // muro e portão de grade na frente do lote
  const mx = (dir > 0 ? 1 : -1) * (w / 2 + 2.2);
  const muro = new THREE.MeshStandardMaterial({ color: cidade.muro, map: rng() < 0.5 ? chapiscoTex() : rebocoTex(), roughness: 0.95 });
  for (const [mz, md] of [[-d / 4 - 0.6, d + 1], [d / 2, 1.2]]) {
    const m = new THREE.Mesh(boxGeo(0.2, 1.7, md, 2), muro);
    m.position.set(mx, 0.85, mz); m.castShadow = true; m.receiveShadow = true; g.add(m);
    box(0.3, 0.08, md, '#c9c3b6', mx, 1.74, mz, g); // pingadeira
  }
  for (let b = 0; b < 9; b++) box(0.05, 1.8, 0.05, '#2f3d34', mx, 0.9, d / 4 - 1.1 + b * 0.22, g); // portão
  g.position.set(x, 0, z);
  parent.add(g);
}

/** Prédio de vários andares com janelas, caixa d'água e antena. */
function predio(parent, x, z, w, d, floors, cor) {
  const tex = windowsTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(Math.max(1, Math.round(w / 3)), floors);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, floors * 3, d), new THREE.MeshStandardMaterial({ color: cor, map: tex, roughness: 0.85 }));
  m.position.set(x, floors * 1.5, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  box(w * 0.3, 1.4, d * 0.3, '#b9b4aa', x, floors * 3 + 0.7, z, parent);
  caixaDagua(parent, x + w * 0.25, floors * 3, z - d * 0.2);
}

function poste(parent, x, z) {
  box(0.22, 8, 0.22, '#9b9a95', x, 4, z, parent);
  box(1.6, 0.12, 0.12, '#9b9a95', x, 7.6, z, parent);
  box(0.12, 0.6, 0.12, '#6b6f75', x + (x > 0 ? -0.9 : 0.9), 7.4, z, parent); // braço da luminária
  return [x, z];
}

/** Fios entre os postes, com barriga: a cena mais brasileira que existe. */
function fios(parent, postes) {
  const mat = new THREE.LineBasicMaterial({ color: '#1b1b1b' });
  for (let i = 1; i < postes.length; i++) {
    const [ax, az] = postes[i - 1]; const [bx, bz] = postes[i];
    for (const [dy, dx, sag] of [[7.55, -0.6, 0.6], [7.55, 0.6, 0.7], [7.0, 0, 0.9], [6.6, 0.3, 1.1]]) {
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        pts.push(new THREE.Vector3(ax + (bx - ax) * t + dx, dy - Math.sin(Math.PI * t) * sag, az + (bz - az) * t));
      }
      parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
  }
}

function orelhao(parent, x, z, ry) {
  const g = new THREE.Group();
  box(0.1, 1.9, 0.1, '#7a7a7a', 0, 0.95, 0, g);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), std('#f08a24', { side: THREE.DoubleSide }));
  shell.position.y = 1.55; shell.rotation.x = -0.35; shell.castShadow = true; g.add(shell);
  box(0.25, 0.35, 0.12, '#cfcfcf', 0, 1.45, 0.18, g);
  g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
}

function moto(parent, x, z, ry, cor) {
  const g = new THREE.Group();
  for (const zz of [-0.65, 0.65]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 16).rotateY(Math.PI / 2), std('#151515'));
    w.position.set(0, 0.32, zz); g.add(w);
  }
  box(0.3, 0.35, 1.2, cor, 0, 0.62, 0, g);
  box(0.28, 0.12, 0.6, '#151515', 0, 0.85, -0.2, g);
  box(0.6, 0.05, 0.05, '#555', 0, 1.0, 0.55, g);
  g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
}

/** Carro popular: carroceria com capô e porta-malas mais baixos, cabine com vidros escuros, faróis e rodas com calota. */
function carro(parent, x, z, ry, cor) {
  const g = new THREE.Group();
  const lata = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.35, metalness: 0.45 });
  const vidro = new THREE.MeshStandardMaterial({ color: '#1d2a33', roughness: 0.1, metalness: 0.6 });
  const part = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; g.add(m); return m; };
  part(new THREE.BoxGeometry(1.72, 0.55, 3.9), lata, 0, 0.6, 0);
  part(new THREE.BoxGeometry(1.7, 0.12, 1.05), lata, 0, 0.92, 1.35).rotation.x = -0.08; // capô
  const cab = part(new THREE.CylinderGeometry(0.72, 0.85, 1.9, 4, 1).rotateY(Math.PI / 4), vidro, 0, 1.15, -0.25);
  cab.scale.set(1.05, 0.42, 1.0);
  part(new THREE.BoxGeometry(1.74, 0.05, 1.6), lata, 0, 1.36, -0.3); // teto
  for (const s of [-1, 1]) {
    part(new THREE.BoxGeometry(0.32, 0.14, 0.04), std('#fff6d6', { emissive: '#665a33' }), s * 0.6, 0.72, 1.96); // farol
    part(new THREE.BoxGeometry(0.3, 0.12, 0.04), std('#b3141b'), s * 0.62, 0.74, -1.96); // lanterna
  }
  part(new THREE.BoxGeometry(1.76, 0.16, 0.12), std('#2a2a2a'), 0, 0.42, 1.98); // para-choques
  part(new THREE.BoxGeometry(1.76, 0.16, 0.12), std('#2a2a2a'), 0, 0.42, -1.98);
  part(new THREE.BoxGeometry(0.5, 0.16, 0.02), std('#f4f4f0'), 0, 0.42, -2.05); // placa
  for (const [wx, wz] of [[-0.82, 1.25], [0.82, 1.25], [-0.82, -1.25], [0.82, -1.25]]) {
    part(new THREE.CylinderGeometry(0.31, 0.31, 0.22, 16).rotateZ(Math.PI / 2), std('#151515'), wx, 0.31, wz);
    part(new THREE.CylinderGeometry(0.18, 0.18, 0.23, 12).rotateZ(Math.PI / 2), std('#b9bec4', { metalness: 0.7, roughness: 0.3 }), wx, 0.31, wz);
  }
  g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
}

function onibus(parent, x, z, ry, rota) {
  const g = new THREE.Group();
  box(2.5, 2.8, 11.5, '#e8e8e2', 0, 1.7, 0, g);
  box(2.52, 0.9, 10.5, '#2c4a6b', 0, 2.2, -0.3, g);
  box(2.52, 0.35, 11.5, '#2a9d4b', 0, 0.75, 0, g); // faixa da viação
  labelPlane(g, rota, 2.2, 0.42, 0, 2.85, 5.76, 0);
  for (const wz of [-4, 3.6]) for (const wx of [-1.2, 1.2]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14).rotateZ(Math.PI / 2), std('#151515'));
    w.position.set(wx, 0.5, wz); g.add(w);
  }
  g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
}

let leafMat = null;
const palmLeafMat = () => (leafMat ||= new THREE.MeshStandardMaterial({ map: folhaPalmeiraTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }));
/** Folha arqueada: sai do topo e vai caindo. */
function palmLeafGeo(s) {
  const geo = new THREE.PlaneGeometry(1.1 * s, 4 * s, 1, 8);
  geo.rotateX(-Math.PI / 2); // deitada, comprimento em +z
  geo.translate(0, 0, 2 * s);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = p.getZ(i) / (4 * s); p.setY(i, p.getY(i) + 0.9 * s * t - 2.2 * s * t * t); }
  geo.computeVertexNormals();
  return geo;
}

/** Palmeira imperial ou coqueiro (com cocos). */
function palmeira(parent, x, z, s, coco) {
  const g = new THREE.Group();
  const h = (coco ? 7 : 9) * s;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, h, 8), std(coco ? '#8a7258' : '#b9b2a2'));
  trunk.position.y = h / 2; trunk.rotation.z = coco ? 0.12 : 0; trunk.castShadow = true; g.add(trunk);
  const top = new THREE.Vector3(coco ? Math.sin(0.12) * -h / 2 : 0, h, 0);
  const folha = palmLeafMat();
  for (let i = 0; i < 12; i++) {
    const leaf = new THREE.Mesh(palmLeafGeo(s), folha);
    leaf.position.copy(top);
    leaf.rotation.y = (i / 12) * Math.PI * 2 + (i % 2) * 0.2;
    leaf.rotation.x = -0.25 - (i % 3) * 0.18;
    leaf.castShadow = true;
    g.add(leaf);
  }
  if (coco) for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 8, 6), std('#6b4a1f')); c.position.set(top.x + Math.cos(i * 1.6) * 0.25, h - 0.25, Math.sin(i * 1.6) * 0.25); g.add(c); }
  g.position.set(x, 0, z); parent.add(g);
}

/** Santinhos jogados no chão perto da escola (proibido, mas comum). */
function santinhos(parent, rng, cx, cz, rx, rz, n) {
  const cores = [...Object.values(PARTIDOS).map((p) => p.cor), '#ffffff', '#f2c20f'];
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 0.15), new THREE.MeshStandardMaterial({ roughness: 0.9 }), n);
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler(); const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    e.set(-Math.PI / 2, 0, rng() * Math.PI * 2);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(cx + (rng() - 0.5) * rx, 0.045, cz + (rng() - 0.5) * rz), q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(cores[Math.floor(rng() * cores.length)]));
  }
  parent.add(mesh);
}

function carrinho(parent, x, z, nome, cor) {
  const g = new THREE.Group();
  box(1.4, 0.9, 0.8, '#d9d9d9', 0, 0.75, 0, g);
  for (const wx of [-0.5, 0.5]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12).rotateX(Math.PI / 2), std('#222')); w.position.set(wx, 0.2, 0.42); g.add(w); }
  box(0.04, 1.6, 0.04, '#777', 0, 1.9, 0, g);
  const umb = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.5, 10), std(cor)); umb.position.y = 2.75; g.add(umb);
  labelPlane(g, nome, 1.2, 0.5, 0, 1.0, 0.41, 0);
  g.position.set(x, 0, z); parent.add(g);
}

function lombada(parent, z) {
  for (let i = 0; i < 8; i++) box(1.2, 0.08, 0.6, i % 2 ? '#f2c20f' : '#1b1b1b', -4.2 + i * 1.2, 0.05, z, parent);
}
function faixaPedestre(parent, z) {
  for (let x = -4.2; x <= 4.2; x += 0.9) box(0.5, 0.012, 3, '#f4f4f0', x, 0.032, z, parent);
}

/** O que se vê ao longe, para cada cidade. */
function fundo(parent, rng, cidade) {
  const sides = [-1, 1];
  switch (cidade.fundo) {
    case 'skyline':
      for (let i = 0; i < 46; i++) {
        const s = sides[i % 2]; const fl = 6 + Math.floor(rng() * 22);
        predio(parent, s * (26 + rng() * 60), -20 + rng() * 170, 8 + rng() * 10, 8 + rng() * 10, fl, ['#c9c4bb', '#a7b0b7', '#d6cfc2', '#8f979e'][i % 4]);
      }
      break;
    case 'morros':
      for (const [x, z, r, h] of [[-70, 30, 45, 38], [80, 70, 55, 46], [-60, 120, 50, 42], [30, 170, 70, 60]]) {
        const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), std('#3f7d3b'));
        hill.scale.y = h / r; hill.position.set(x, -2, z); parent.add(hill);
        for (let k = 0; k < 70; k++) { // casinhas coloridas subindo o morro
          const a = rng() * Math.PI * 2; const rr = r * (0.35 + rng() * 0.6);
          const hx = x + Math.cos(a) * rr; const hz = z + Math.sin(a) * rr;
          if (Math.abs(hx) < 22 && hz < 110) continue;
          const y = h * Math.sqrt(Math.max(0, 1 - (rr / r) ** 2)) - 2;
          box(2.6, 2.4, 2.6, cidade.casas[k % cidade.casas.length], hx, y + 1, hz, parent);
        }
      }
      break;
    case 'casario':
      for (let i = 0; i < 40; i++) {
        const s = sides[i % 2]; const fl = 2 + Math.floor(rng() * 3);
        const x = s * (24 + (i % 5) * 7); const z = -10 + Math.floor(i / 10) * 40 + (i % 3) * 9;
        predio(parent, x, z, 6, 9, fl, cidade.casas[i % cidade.casas.length]);
      }
      igreja(parent, -48, 120, '#f4efe2');
      break;
    case 'coqueiros':
      for (let i = 0; i < 40; i++) palmeira(parent, sides[i % 2] * (24 + rng() * 40), -10 + rng() * 160, 1 + rng() * 0.4, true);
      { const rio = new THREE.Mesh(new THREE.PlaneGeometry(400, 30), std('#3f7fa3', { roughness: 0.3, metalness: 0.2 })); rio.rotation.x = -Math.PI / 2; rio.position.set(0, 0.02, 150); parent.add(rio); }
      for (let i = 0; i < 16; i++) predio(parent, sides[i % 2] * (40 + rng() * 30), 20 + rng() * 100, 9, 9, 3 + Math.floor(rng() * 8), cidade.casas[i % cidade.casas.length]);
      break;
    case 'serra':
      for (const [x, z, r, h] of [[-90, 180, 90, 70], [60, 200, 110, 80], [140, 120, 80, 60]]) {
        const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), std('#5d6b45'));
        m.position.set(x, h / 2 - 4, z); parent.add(m);
      }
      for (let i = 0; i < 24; i++) predio(parent, sides[i % 2] * (26 + rng() * 45), -10 + rng() * 150, 9, 9, 4 + Math.floor(rng() * 9), cidade.casas[i % cidade.casas.length]);
      break;
    default: // praca: igreja matriz, coreto e casario baixo
      igreja(parent, -34, 26, '#f6f1e6');
      {
        const coreto = new THREE.Group();
        box(5, 0.6, 5, '#e9e1cc', 0, 0.3, 0, coreto);
        for (const [cx, cz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) box(0.2, 3, 0.2, '#f4f4f0', cx, 1.8, cz, coreto);
        const tet = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.6, 8), std('#b5523b')); tet.position.y = 4; coreto.add(tet);
        coreto.position.set(28, 0, 30); parent.add(coreto);
      }
      for (let i = 0; i < 20; i++) predio(parent, sides[i % 2] * (24 + rng() * 40), -10 + rng() * 150, 8, 8, 1 + Math.floor(rng() * 2), cidade.casas[i % cidade.casas.length]);
  }
}

function igreja(parent, x, z, cor) {
  const g = new THREE.Group();
  box(12, 9, 20, cor, 0, 4.5, 0, g);
  for (const tx of [-4.5, 4.5]) { box(3, 16, 3, cor, tx, 8, 10, g); const c = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3, 4), std('#3f6e8c')); c.position.set(tx, 17.5, 10); c.rotation.y = Math.PI / 4; g.add(c); }
  box(2.2, 4, 0.2, '#6b4426', 0, 2, 10.05, g);
  const tri = new THREE.Mesh(new THREE.ConeGeometry(7.5, 3, 3), std(cor)); tri.position.set(0, 10.4, 9.6); tri.rotation.x = Math.PI / 2; tri.rotation.z = Math.PI; g.add(tri);
  g.position.set(x, 0, z); g.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; parent.add(g);
}

// ---------- montagem ----------

export function createVotacaoWorld(scene, renderer, { shadows = true, cidade } = {}) {
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  createSky(scene, renderer);
  scene.fog = new THREE.Fog('#cfe3f2', 90, 360);
  scene.add(new THREE.HemisphereLight('#cfe6ff', '#8a7a5a', 0.9));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 120;
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 6, 14, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.35, depthWrite: false }));
  pillar.position.y = 3;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.08, 8, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd23f' }));
  ring.position.y = 0.1;
  beacon.add(pillar, ring);
  beacon.visible = false;
  scene.add(beacon);

  let root = null;
  function build(c) {
    if (root) {
      scene.remove(root);
      root.traverse((o) => { o.geometry?.dispose(); });
    }
    root = new THREE.Group();
    scene.add(root);
    scene.fog.color.set(c.ceu);
    buildCity(root, c);
  }
  build(cidade);

  return {
    setCidade: build,
    setShadows(on) {
      if (renderer.shadowMap.enabled === on) return;
      renderer.shadowMap.enabled = on;
      scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    },
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

function buildCity(root, cidade) {
  const P = PLACES;
  const rng = mulberry(cidade.id.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));

  // chão: grama, rua de asfalto, calçadas, pátio da escola
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 420), new THREE.MeshStandardMaterial({ map: grassTexture([80, 90]), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 60); ground.receiveShadow = true;
  root.add(ground);
  floor(root, -P.streetX, P.streetX, P.house.z1 - 0.4, P.gateZ, new THREE.MeshStandardMaterial({ map: asphaltTexture([1.5, 14]), roughness: 0.95 }), 0.02);
  const pedra = ['rj', 'ssa', 'rec'].includes(cidade.id);
  const calcada = new THREE.MeshStandardMaterial({ map: pedra ? pedraPortuguesaTex(cidade.id === 'rj').clone() : concreteTexture([1, 22], '#b4b0a7'), roughness: 0.95 });
  if (pedra) { calcada.map.needsUpdate = true; calcada.map.repeat.set(1, 26); }
  floor(root, P.streetX, P.streetX + 2.4, P.house.z1 - 0.4, P.gateZ, calcada, 0.03);
  floor(root, -P.streetX - 2.4, -P.streetX, P.house.z1 - 0.4, P.gateZ, calcada, 0.03);
  for (let z = P.house.z1 + 1; z < P.gateZ - 2; z += 5) box(0.16, 0.01, 2.2, '#f2c20f', 0, 0.035, z, root); // faixa amarela
  for (const s of [-1, 1]) { // meio-fio
    const m = new THREE.Mesh(boxGeo(0.22, 0.16, P.gateZ - P.house.z1, 1), new THREE.MeshStandardMaterial({ color: '#c9c6bf', map: chapiscoTex(), roughness: 0.95 }));
    m.position.set(s * (P.streetX + 0.11), 0.08, (P.gateZ + P.house.z1) / 2); m.receiveShadow = true; root.add(m);
  }
  floor(root, P.yard.x0, P.yard.x1, P.yard.z0, P.corridor.z1 - 2.2, new THREE.MeshStandardMaterial({ map: concreteTexture([10, 12], '#b5b2aa'), roughness: 0.95 }), 0.02);
  faixaPedestre(root, P.gateZ - 4);
  lombada(root, 22);

  // ---------- casa do eleitor ----------
  const H = P.house;
  floor(root, H.x0, H.x1, H.z0, H.z1, new THREE.MeshStandardMaterial({ map: woodTexture([3, 3]), roughness: 0.8 }), 0.03);
  const doorGap = [[-0.9, 0.9]];
  const parede = cidade.casas[0];
  wall(root, { axis: 'x', at: H.z0, from: H.x0, to: H.x1, h: 2.8, face: 1, color: '#f0e6d2' });
  wall(root, { axis: 'z', at: H.x0, from: H.z0, to: H.z1, h: 2.8, face: 1, color: '#e9dfc9' });
  wall(root, { axis: 'z', at: H.x1, from: H.z0, to: H.z1, h: 2.8, face: -1, color: '#e9dfc9' });
  wall(root, { axis: 'x', at: H.z1, from: H.x0, to: H.x1, h: 2.8, face: -1, color: '#f0e6d2', gaps: doorGap });
  wall(root, { axis: 'x', at: H.z1 + 0.02, from: H.x0, to: H.x1, h: 2.8, face: 1, color: parede, gaps: doorGap });
  box(2.1, 0.6, 0.9, '#7a8fb5', 2.2, 0.3, H.z0 + 0.7, root); // cama
  box(2.1, 0.12, 0.7, '#f4f1ea', 2.2, 0.66, H.z0 + 0.5, root);
  box(1.4, 0.8, 0.8, '#7b5a3a', P.mesa.x, 0.4, P.mesa.z - 0.5, root); // a mesa
  box(0.34, 0.012, 0.24, '#f5f0e0', P.mesa.x - 0.3, 0.83, P.mesa.z - 0.5, root); // documento
  box(0.3, 0.012, 0.2, '#2c6cb0', P.mesa.x + 0.05, 0.83, P.mesa.z - 0.5, root); // título
  box(0.2, 0.012, 0.28, '#fff6a8', P.mesa.x + 0.4, 0.83, P.mesa.z - 0.5, root); // colinha
  box(1.8, 0.7, 0.8, '#b36a4a', -0.6, 0.35, H.z0 + 0.7, root); // sofá
  box(0.9, 0.55, 0.06, '#151515', -0.6, 1.5, H.z0 + 0.05, root); // TV
  box(2.4, 0.015, 1.4, '#c85a54', 0, 0.045, H.z1 - 1.2, root); // tapete
  box(1.8, 0.012, 0.9, '#4d5a3f', 0, 0.04, H.z1 + 1.1, root); // capacho
  // muro e portão da casa do eleitor na calçada
  box(2.8, 1.7, 0.2, cidade.muro, -2.4, 0.85, H.z1 + 2.2, root);
  box(2.8, 1.7, 0.2, cidade.muro, 2.4, 0.85, H.z1 + 2.2, root);

  // ---------- rua: casas, prédios, postes, fios ----------
  const postesE = []; const postesD = [];
  for (let i = 0, z = -2; z < P.gateZ - 6; i += 1, z += 10) {
    for (const s of [-1, 1]) {
      const x = s * 14;
      if (rng() < (cidade.andares[1] >= 6 ? 0.4 : 0.12)) {
        const fl = cidade.andares[0] + Math.floor(rng() * (cidade.andares[1] - cidade.andares[0] + 1));
        predio(root, x - s * 0.5, z + 2, 8, 8, fl, cidade.casas[Math.floor(rng() * cidade.casas.length)]);
      } else casa(root, rng, x, z + 2, cidade, -s);
    }
    (i % 2 ? postesD : postesE).push(poste(root, (i % 2 ? 1 : -1) * (P.streetX + 0.4), z + 4));
    if (i % 2 === 0) postesD.push(poste(root, P.streetX + 0.4, z + 4));
    else postesE.push(poste(root, -P.streetX - 0.4, z + 4));
  }
  postesE.sort((a, b) => a[1] - b[1]); postesD.sort((a, b) => a[1] - b[1]);
  fios(root, postesE); fios(root, postesD);
  // árvores da calçada: palmeiras/coqueiros no litoral, sibipiruna/ipê/tipuana nas outras
  if (cidade.arvore === 'palmeira' || cidade.arvore === 'coqueiro') {
    for (let z = 4; z < P.gateZ - 6; z += 13) { palmeira(root, -P.streetX - 1.6, z, 0.9, cidade.arvore === 'coqueiro'); palmeira(root, P.streetX + 1.6, z + 6, 0.9, cidade.arvore === 'coqueiro'); }
  } else {
    const spots = [];
    for (let z = 4; z < P.gateZ - 6; z += 12) { spots.push([-P.streetX - 1.5, z]); spots.push([P.streetX + 1.5, z + 6]); }
    addTrees(root, rng, spots, { mix: cidade.arvore === 'mangueira' ? { tipuana: 0.7, sibipiruna: 0.2, ipe: 0.1 } : { tipuana: 0.3, sibipiruna: 0.5, ipe: 0.2 } });
  }
  // placas de rua, orelhão, motos, carros, ônibus, carrinhos
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: streetSignTexture(cidade.rua.toUpperCase()), side: THREE.DoubleSide }));
  placa.position.set(-P.streetX - 0.6, 2.7, 2); placa.rotation.y = Math.PI / 2; root.add(placa);
  box(0.07, 2.6, 0.07, '#555', -P.streetX - 0.6, 1.3, 2, root);
  labelPlane(root, `${cidade.bairro.toUpperCase()} · ${cidade.nome.toUpperCase()} - ${cidade.uf}`, 3.4, 0.5, P.streetX + 2.3, 2.4, 9, -Math.PI / 2);
  orelhao(root, P.streetX + 1.2, 14, -Math.PI / 2);
  [[-6.1, 9, '#c0392b'], [6.0, 17, '#151515'], [-6.2, 31, '#2c3e50'], [6.1, 44, '#f1c40f']].forEach(([x, z, c], i) => moto(root, x, z, i % 2 ? 0.3 : -0.3, c));
  [[-3.6, 16, '#c0392b'], [3.6, 30, '#ecf0f1'], [-3.6, 41, '#7f8c8d'], [3.6, 7, '#2e86de']].forEach(([x, z, c]) => carro(root, x, z, 0, c));
  onibus(root, 3.4, 50, Math.PI, `${cidade.bairro.toUpperCase()} - CENTRO`);
  carrinho(root, -P.streetX - 1.4, P.gateZ - 7, 'PIPOCA', '#e63946');
  carrinho(root, P.streetX + 1.6, P.gateZ - 9, 'CHURROS', '#f4a261');
  if (cidade.fundo === 'skyline' || cidade.fundo === 'serra') { // pichação nos muros das cidades grandes
    const graf = new THREE.MeshStandardMaterial({ map: grafiteTexture(), transparent: true, roughness: 0.9 });
    for (const [x, z, ry] of [[-11.35, 30, Math.PI / 2], [11.35, 18, -Math.PI / 2]]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.4), graf); g.position.set(x, 1, z); g.rotation.y = ry; root.add(g); }
  }
  santinhos(root, rng, 0, P.gateZ - 3, 12, 7, 220);
  // panfleteiro (a conversa é só um aviso: boca de urna é crime)
  labelPlane(root, 'SANTINHO?', 0.9, 0.55, P.panfleteiro.x + 0.6, 1.7, P.panfleteiro.z + 0.2, Math.PI);
  box(0.04, 1.5, 0.04, '#8b8b8b', P.panfleteiro.x + 0.6, 0.75, P.panfleteiro.z + 0.2, root);
  fundo(root, rng, cidade);

  // ---------- portão e muro da escola pública ----------
  const gz = P.yard.z0;
  const gate = [[-P.gateX, P.gateX]];
  wall(root, { axis: 'x', at: gz, from: P.yard.x0 - 1, to: P.yard.x1 + 1, h: 2.6, face: -1, color: cidade.muro, gaps: gate, doorH: 2.4 });
  wall(root, { axis: 'z', at: P.yard.x0 - 1, from: gz, to: P.corridor.z1, h: 2.6, face: -1, color: cidade.muro });
  wall(root, { axis: 'z', at: P.yard.x1 + 1, from: gz, to: P.corridor.z1, h: 2.6, face: 1, color: cidade.muro });
  for (let x = P.yard.x0 - 1; x <= P.yard.x1 + 1; x += 0.4) if (Math.abs(x) > P.gateX + 0.4) box(0.04, 0.9, 0.04, '#2f5e3f', x, 3.05, gz, root); // grade sobre o muro
  box(0.5, 3.4, 0.5, '#d4cdb8', -P.gateX - 0.3, 1.7, gz, root); box(0.5, 3.4, 0.5, '#d4cdb8', P.gateX + 0.3, 1.7, gz, root);
  for (const s of [-1, 1]) for (let b = 0; b < 7; b++) box(0.05, 2.3, 0.05, '#2f6f45', s * (P.gateX + 0.6 + b * 0.18), 1.15, gz - 0.4, root); // folhas do portão abertas
  box(P.gateX * 2 + 1.1, 0.7, 0.5, '#2f6f45', 0, 3.3, gz, root);
  labelPlane(root, cidade.escola.toUpperCase(), 5, 0.62, 0, 3.3, gz - 0.28, Math.PI);
  labelPlane(root, 'LOCAL DE VOTAÇÃO', 3.4, 0.5, 0, 3.3, gz + 0.28, 0);
  labelPlane(root, 'SIMULADOR EDUCATIVO · NÃO OFICIAL', 4.4, 0.5, -7, 1.6, gz - 0.06, Math.PI);
  labelPlane(root, 'BOCA DE URNA É CRIME', 2.6, 0.7, 7, 1.6, gz - 0.06, Math.PI);

  // pátio: quadra, árvores, bandeira do Brasil, cartazes da fila
  floor(root, -12, -3.5, 63, 80, std('#3f7f6b'), 0.04);
  for (const [x0, x1, z0, z1] of [[-12, -3.5, 63, 63.1], [-12, -3.5, 79.9, 80], [-12, -11.9, 63, 80], [-3.6, -3.5, 63, 80], [-12, -3.5, 71.45, 71.55]]) floor(root, x0, x1, z0, z1, std('#f4f4f0'), 0.05);
  box(0.1, 3, 0.1, '#ddd', -7.75, 1.5, 63.4, root); box(0.1, 3, 0.1, '#ddd', -7.75, 1.5, 79.6, root); // traves
  addTrees(root, rng, [[9, 66], [9, 82], [-9, 84]], { mix: { tipuana: 0.4, sibipiruna: 0.3, ipe: 0.3 } });
  box(0.12, 8, 0.12, '#c9c9c9', 8, 4, 62, root);
  { const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), new THREE.MeshStandardMaterial({ map: flagTexture('brasil'), side: THREE.DoubleSide })); flag.position.set(8.95, 7.2, 62); root.add(flag); }
  box(0.6, 1, 0.5, '#d8dde0', 11.5, 0.5, 86, root); // bebedouro
  labelPlane(root, 'FILA PARA O VOTO', 2.2, 1.4, P.filaEntrada.x, 1.9, P.filaEntrada.z - 3, Math.PI);
  box(0.1, 1.9, 0.1, '#444', P.filaEntrada.x, 0.95, P.filaEntrada.z - 3.05, root);
  labelPlane(root, 'PRIORIDADE: IDOSOS, GESTANTES E PcD', 3, 0.7, 2.6, 2.2, QUEUE.frontZ - 3, Math.PI);
  box(0.08, 2, 0.08, '#444', 2.6, 1, QUEUE.frontZ - 2.95, root);
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
  box(B.x1 - B.x0 + 1, 0.5, 1, cidade.telhado, 0, 4.65, zf + 0.2, root);
  box(B.x1 - B.x0, 0.9, 0.08, '#2f6f45', 0, 0.45, zf - 0.05, root); // barrado verde das escolas públicas
  labelPlane(root, cidade.escola.toUpperCase(), 6.4, 0.8, 0, 3.7, zf - 0.04, Math.PI);
  labelPlane(root, 'ENTRADA · VOTAÇÃO', 3, 0.5, 0, 2.9, zf - 0.05, Math.PI);
  labelPlane(root, 'LEVE DOCUMENTO COM FOTO', 2.6, 0.6, -5, 1.7, zf - 0.06, Math.PI);
  for (const x of [-9, 5, 9]) box(2, 1.2, 0.05, '#7fb4d4', x, 2.2, zf - 0.04, root);
  const gaps = P.roomX.map((x) => [x - 0.9, x + 0.9]);
  wall(root, { axis: 'x', at: P.roomZ0, from: B.x0, to: B.x1, h: 3.2, face: -1, color: '#f4efe0', gaps });
  const roomFloor = new THREE.MeshStandardMaterial({ map: tiled('#c9d8c4', '#a9b9a4', [3, 4]), roughness: 0.7 });
  P.roomX.forEach((rx, i) => {
    const r = room(i);
    floor(root, r.x0, r.x1, r.z0, r.z1, roomFloor, 0.05);
    wall(root, { axis: 'z', at: r.x0 + 0.02, from: r.z0, to: r.z1, h: 3.2, face: 1, color: '#f4efe0' });
    wall(root, { axis: 'z', at: r.x1 - 0.02, from: r.z0, to: r.z1, h: 3.2, face: -1, color: '#f4efe0' });
    wall(root, { axis: 'x', at: r.z1, from: r.x0, to: r.x1, h: 3.2, face: -1, color: '#f4efe0' });
    box(3.2, 1.2, 0.05, '#2d4a35', rx, 1.9, r.z1 - 0.05, root); // quadro-negro
    for (let k = 0; k < 4; k++) box(0.5, 0.75, 0.45, '#8a6a46', rx - 2.2 + (k % 2) * 0.8, 0.38, r.z1 - 2.2 - Math.floor(k / 2) * 0.9, root); // carteiras empilhadas no canto
    labelPlane(root, `SEÇÃO ${SECOES[i]}`, 1.9, 1.05, rx, 2.7, P.roomZ0 - 0.05, Math.PI);
    labelPlane(root, `SEÇÃO ${SECOES[i]}`, 1.9, 1.05, rx, 2.7, P.roomZ0 + 0.05, 0);
    const m = mesaria(i);
    box(3.4, 0.85, 0.9, '#f4f4f2', m.x, 0.43, m.z, root);
    box(0.5, 0.35, 0.4, '#30343b', m.x - 0.8, 1.02, m.z, root); // terminal do mesário
    box(0.18, 0.05, 0.22, '#1f5fbf', m.x + 0.3, 0.88, m.z - 0.15, root); // leitor de digital
    box(0.5, 0.01, 0.35, '#fff', m.x + 1.0, 0.86, m.z - 0.1, root); // caderno de votação
    labelPlane(root, 'DOCUMENTO COM FOTO · BIOMETRIA', 2, 0.5, m.x, 1.6, m.z + 0.5, 0);
    const c = cabine(i);
    const cx = c.x; const cz = c.z + 0.9;
    box(1.4, 1.9, 0.06, '#5a6e86', cx, 0.95, cz + 0.45, root);
    box(0.06, 1.9, 0.9, '#5a6e86', cx - 0.7, 0.95, cz, root);
    box(0.06, 1.9, 0.9, '#5a6e86', cx + 0.7, 0.95, cz, root);
    box(1.3, 0.05, 0.8, '#d9d4c4', cx, 1.0, cz, root);
    box(0.6, 0.18, 0.4, '#3a3d42', cx, 1.12, cz, root); // urna
    box(0.34, 0.24, 0.02, '#a9d7a0', cx, 1.28, cz - 0.12, root);
    box(1.4, 0.55, 0.04, '#b0b8c4', cx, 1.62, cz - 0.45, root);
    labelPlane(root, 'VOTE AQUI', 0.9, 0.5, cx, 2.1, cz - 0.46, Math.PI);
    labelPlane(root, 'PROIBIDO CELULAR NA CABINE', 1.6, 0.45, cx - 2, 1.8, r.z1 - 0.06, Math.PI);
  });
  labelPlane(root, 'SALAS DE VOTAÇÃO · SEÇÕES 0101 A 0104', 6, 0.6, 0, 3, P.corridor.z0 + 0.1, 0);
}
