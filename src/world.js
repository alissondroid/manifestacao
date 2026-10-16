import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { WORLD } from '../shared/config.js';
import { createSky, SUN_DIR } from './sky.js';
import { snapShadowFocus } from './shadow.js';
import { mergeColored } from './geo.js';
import { createCrowd } from './crowd.js';
import { addTrees } from './trees.js';
import { addVendors } from './props.js';
import { addScenery } from './scenery.js';
import {
  asphaltTexture, busLaneTexture, concreteTexture, grassTexture,
  facadeTexture, shopfrontTexture, bikeSymbolTexture, roadTextTexture, streetTotemTexture, bannerTexture, streetSignTexture, posterTexture,
  asphaltNormal, LedTicker, archBannerTexture, sidewalkTexture, sidewalkNormal, tactileAlertTexture,
} from './textures.js';
import { SIDES, RACE } from '../shared/config.js';
import {
  carMesh, busMesh, soundTruckMesh, CAR_TYPES,
} from './vehicles.js';

// Avenida Paulista (versão estilizada): pista com faixas de ônibus, calçada de mosaico,
// prédios com térreo comercial, o MASP, o Parque Trianon, carros de som e uma multidão.

const ROAD = 12; // meia largura da pista (ciclovia no meio, três faixas e a de ônibus em cada sentido)
const WALK = 19.5; // calçada vai de 12 a 19,5
const BUS = ROAD - 2.7; // borda da faixa de ônibus
const HALF_LEN = 190; // comprimento do mundo visível
const LEN = HALF_LEN * 2;
const SKY_COLOR = '#bcd6ec';

function mulberry32(seed) {
  let a = seed;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });

function setShadow(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export { carMesh };

// ---------- Mundo ----------

export function createWorld(scene, renderer) {
  const rng = mulberry32(2026);
  const rr = (a, b) => a + rng() * (b - a);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const m4 = new THREE.Matrix4();
  const avoid = []; // caixas ocupadas por veículos, para a multidão desviar

  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, 90, 330);
  createSky(scene, renderer, rng);

  // luz: sol com sombras que acompanham o jogador + céu/rebote
  const hemi = new THREE.HemisphereLight('#e3edf8', '#8a806c', 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d4', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 10; sc.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  // ---------- chão ----------
  const grass = setShadow(new THREE.Mesh(
    new THREE.PlaneGeometry(900, LEN + 400),
    std({ map: grassTexture([150, (LEN + 400) / 6]), color: '#8aa37a' }),
  ), false, true);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.04;
  scene.add(grass);

  const road = setShadow(new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD * 2, LEN),
    std({
      map: asphaltTexture([ROAD * 2 / 6, LEN / 6]), normalMap: asphaltNormal([ROAD * 2 / 6, LEN / 6]), normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.92,
    }),
  ), false, true);
  road.rotation.x = -Math.PI / 2;
  scene.add(road);

  const flat = (w, l, mat, x, y, z = 0) => {
    const m = setShadow(new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat), false, true);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  };
  const paint = (color) => std({ color, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
  const white = paint('#e8e8e2');
  const yellow = paint('#e8b81c');

  // cruzamentos: duas faixas de pedestres com a grade amarela ("box") entre elas
  const crossings = [-72, -18, 62, 128];
  const nearCrossing = (z, m) => crossings.some((c) => Math.abs(z - c) < m);

  // ciclovia vermelha no canteiro central, com bordas brancas, eixo amarelo e meio-fio separador
  const CYCLE = 1.5; // meia largura da ciclovia
  const cycleMat = std({ map: busLaneTexture([CYCLE * 2 / 6, LEN / 6]), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 });
  flat(CYCLE * 2, LEN, cycleMat, 0, 0.005);
  for (const sd of [-1, 1]) {
    flat(0.12, LEN, white, sd * (CYCLE - 0.12), 0.009); // borda da ciclovia
    flat(0.14, LEN, white, sd * BUS, 0.008); // faixa da direita (ônibus)
  }
  const cycleDash = [];
  for (let z = -HALF_LEN + 2; z < HALF_LEN; z += 4) if (!nearCrossing(z, 9.5)) cycleDash.push(z);
  const cycleDashMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.012, 1.1), yellow, cycleDash.length);
  cycleDash.forEach((z, i) => cycleDashMesh.setMatrixAt(i, m4.makeTranslation(0, 0.011, z)));
  scene.add(cycleDashMesh);
  // meio-fio separador da ciclovia (interrompido nos cruzamentos)
  const seps = [];
  for (let z = -HALF_LEN; z < HALF_LEN; z += 2) if (!nearCrossing(z, 9.5)) seps.push(z);
  const sepMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.12, 1.8), std({ color: '#d4d1c8' }), seps.length * 2);
  seps.forEach((z, i) => {
    sepMesh.setMatrixAt(i * 2, m4.makeTranslation(-(CYCLE + 0.2), 0.06, z + 1));
    sepMesh.setMatrixAt(i * 2 + 1, m4.makeTranslation(CYCLE + 0.2, 0.06, z + 1));
  });
  setShadow(sepMesh, false, true);
  scene.add(sepMesh);
  // símbolos pintados: bicicleta e seta na ciclovia, "ÔNIBUS" na faixa da direita
  const decal = (tex, w, l) => new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
  const bikeMat = decal(bikeSymbolTexture());
  const busTextMat = decal(roadTextTexture('ÔNIBUS'));
  for (let z = -HALF_LEN + 14; z < HALF_LEN; z += 28) {
    if (nearCrossing(z, 12)) continue;
    const bike = flat(1.3, 1.3, bikeMat, 0, 0.013, z);
    bike.rotation.z = (z / 28) % 2 ? 0 : Math.PI;
    for (const sd of [-1, 1]) {
      const bus = flat(2.4, 1.2, busTextMat, sd * (ROAD - 1.35), 0.012, z + 7);
      bus.rotation.z = sd > 0 ? Math.PI : 0; // lido por quem vem em cada sentido
    }
  }

  const dashes = [];
  for (let z = -HALF_LEN + 3; z < HALF_LEN; z += 9) if (!nearCrossing(z, 11)) dashes.push(z);
  const laneW = (BUS - CYCLE - 0.35) / 3;
  const dashX = [1, 2].map((k) => CYCLE + 0.35 + k * laneW);
  const dashMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.012, 3.6), white, dashes.length * 4);
  dashes.forEach((z, i) => dashX.forEach((x, k) => {
    dashMesh.setMatrixAt(i * 4 + k * 2, m4.makeTranslation(-x, 0.01, z));
    dashMesh.setMatrixAt(i * 4 + k * 2 + 1, m4.makeTranslation(x, 0.01, z));
  }));
  scene.add(dashMesh);

  const STRIPES = Math.round(ROAD * 2 - 1);
  const zebra = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.012, 3.2), white, crossings.length * STRIPES * 2);
  const gridLines = [];
  crossings.forEach((z, ci) => {
    for (const [k, dz] of [[0, -7.4], [1, 7.4]]) {
      for (let i = 0; i < STRIPES; i++) zebra.setMatrixAt((ci * 2 + k) * STRIPES + i, m4.makeTranslation(-ROAD + 1 + i, 0.011, z + dz));
    }
    for (const [sz, sx] of [[-9.6, -1], [9.6, 1]]) flat(ROAD - CYCLE - 0.4, 0.35, white, sx * (ROAD + CYCLE) / 2, 0.011, z + sz);
    // grade amarela entre as faixas
    for (let gz = -5.4; gz <= 5.41; gz += 1.8) gridLines.push([0, z + gz, ROAD * 2 - 0.6, 0.12]);
    for (let gx = -ROAD + 0.6; gx <= ROAD - 0.59; gx += 1.8) gridLines.push([gx, z, 0.12, 10.8]);
  });
  scene.add(zebra);
  const grid = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.012, 1), yellow, gridLines.length);
  gridLines.forEach(([x, z, sx, sz], i) => grid.setMatrixAt(i, m4.makeScale(sx, 1, sz).setPosition(x, 0.012, z)));
  scene.add(grid);

  // calçadas no estilo da Paulista: meio-fio e faixa de granito, faixa de serviço, faixa podotátil, tira de pedra
  // portuguesa e placas de concreto (a textura cobre os 7,5 m do meio-fio aos prédios; no lado esquerdo ela é espelhada)
  const walkMap = sidewalkTexture();
  const walkNormal = sidewalkNormal();
  const walkMat = (mirror) => {
    const map = mirror ? walkMap.clone() : walkMap;
    const normalMap = mirror ? walkNormal.clone() : walkNormal;
    for (const t of [map, normalMap]) {
      t.repeat.set(mirror ? -1 : 1, LEN / 4);
      t.offset.set(mirror ? 1 : 0, 0);
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
    }
    return std({ map, normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.85 });
  };
  const curbMat = std({ color: '#b9b6ae' });
  for (const s of [-1, 1]) {
    const walk = new THREE.Mesh(
      new THREE.BoxGeometry(WALK - ROAD, 0.16, LEN),
      [curbMat, curbMat, walkMat(s < 0), curbMat, curbMat, curbMat],
    );
    walk.position.set(s * (ROAD + (WALK - ROAD) / 2), 0.08, 0);
    setShadow(walk, false, true);
    scene.add(walk);
  }
  // sarjeta de concreto junto ao meio-fio e faixa de ônibus pintada (terracota), como nas avenidas de São Paulo
  const gutterMat = std({ color: '#9b9a95', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
  const busLaneMat = std({ map: busLaneTexture([2.3 / 6, LEN / 6], '#a3463a'), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 });
  for (const s of [-1, 1]) {
    flat(0.4, LEN, gutterMat, s * (ROAD - 0.2), 0.0065);
    flat(ROAD - BUS - 0.4, LEN, busLaneMat, s * (BUS + (ROAD - BUS - 0.4) / 2), 0.0058);
  }
  // pisos táteis de alerta (vermelhos) nas rampas das esquinas, na saída de cada faixa de pedestres
  const alertMat = std({ map: tactileAlertTexture(), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
  alertMat.map.repeat.set(1.2 / 0.8, 3.2 / 0.8);
  for (const c of crossings) for (const dz of [-7.4, 7.4]) for (const s of [-1, 1]) {
    const pad = flat(1.2, 3.2, alertMat, s * (ROAD + 0.75), 0.1625, c + dz);
    pad.receiveShadow = true;
  }

  // ---------- árvores de rua: tipuanas, sibipirunas e alguns ipês floridos ----------
  const treeSpots = [];
  for (const sd of [-1, 1]) for (let z = -HALF_LEN + 8; z < HALF_LEN; z += 11.5) treeSpots.push([sd * (ROAD + 1.7), z + rr(-1.5, 1.5)]);
  addTrees(scene, rng, treeSpots, { scaleMin: 0.95, scaleMax: 1.25, mix: { tipuana: 0.55, sibipiruna: 0.33, ipe: 0.12 } });
  // grades de ferro ao redor das árvores (canteiro quadrado) e balizadores ao longo do meio-fio
  const grateGeo = mergeColored([
    { geo: B(0.96, 0.02, 0.96), color: '#3b2e22', pos: [0, 0.01, 0] }, // terra
    { geo: B(1.24, 0.045, 0.08), color: '#2b2d31', pos: [0, 0.0225, 0.58] },
    { geo: B(1.24, 0.045, 0.08), color: '#2b2d31', pos: [0, 0.0225, -0.58] },
    { geo: B(0.08, 0.045, 1.08), color: '#2b2d31', pos: [0.58, 0.0225, 0] },
    { geo: B(0.08, 0.045, 1.08), color: '#2b2d31', pos: [-0.58, 0.0225, 0] },
    ...[-0.3, 0.3].map((x) => ({ geo: B(0.04, 0.03, 1.0), color: '#3a3d42', pos: [x, 0.03, 0] })),
    ...[-0.3, 0.3].map((z) => ({ geo: B(1.0, 0.03, 0.04), color: '#3a3d42', pos: [0, 0.03, z] })),
  ]);
  const grates = new THREE.InstancedMesh(grateGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.6 }), treeSpots.length);
  treeSpots.forEach(([x, z], i) => grates.setMatrixAt(i, m4.makeTranslation(x, 0.16, z)));
  setShadow(grates, false, true);
  scene.add(grates);
  const bollardSpots = [];
  for (const s of [-1, 1]) for (let z = -HALF_LEN + 5; z < HALF_LEN; z += 6.5) if (!nearCrossing(z, 11)) bollardSpots.push([s * (ROAD + 0.45), z]);
  const bollards = new THREE.InstancedMesh(mergeColored([
    { geo: new THREE.CylinderGeometry(0.058, 0.068, 0.78, 14), color: '#1d1f23', pos: [0, 0.39, 0] },
    { geo: new THREE.CylinderGeometry(0.0645, 0.0645, 0.06, 14), color: '#d8dadc', pos: [0, 0.62, 0] }, // faixa refletiva
    { geo: new THREE.SphereGeometry(0.058, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), color: '#1d1f23', pos: [0, 0.78, 0] },
  ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 }), bollardSpots.length);
  bollardSpots.forEach(([x, z], i) => bollards.setMatrixAt(i, m4.makeTranslation(x, 0.16, z)));
  setShadow(bollards);
  scene.add(bollards);

  // ---------- postes, semáforos, pontos de ônibus, banca ----------
  const lampSpots = [];
  for (const s of [-1, 1]) for (let z = -HALF_LEN + 12; z < HALF_LEN; z += 24) lampSpots.push([s * (ROAD + 0.6), z]);
  const rb = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, r);
  const poleGeo = mergeColored([
    { geo: new THREE.CylinderGeometry(0.2, 0.24, 0.18, 14), color: '#3a3d43', pos: [0, 0.09, 0] }, // base
    { geo: new THREE.CylinderGeometry(0.055, 0.1, 8, 14), color: '#5a5f67', pos: [0, 4.0, 0] }, // fuste cônico
    { geo: new THREE.CylinderGeometry(0.075, 0.075, 0.1, 12), color: '#3a3d43', pos: [0, 0.6, 0] }, // anel
    { geo: B(0.07, 0.07, 2.35), color: '#5a5f67', pos: [0, 8.02, 1.12], rot: [-0.05, 0, 0] }, // braço
    { geo: B(0.05, 0.05, 1.5), color: '#5a5f67', pos: [0, 7.52, 0.62], rot: [0.55, 0, 0] }, // escora
    { geo: rb(0.82, 0.16, 0.4, 0.07), color: '#3a3d43', pos: [0, 8.12, 2.2] }, // luminária
  ]);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }), lampSpots.length);
  const lamps = new THREE.InstancedMesh(B(0.62, 0.04, 0.28), new THREE.MeshBasicMaterial({ color: '#fff4cf' }), lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    const flip = x > 0 ? -1 : 1;
    poles.setMatrixAt(i, m4.makeScale(1, 1, flip).setPosition(x, 0.16, z));
    lamps.setMatrixAt(i, m4.makeTranslation(x, 8.18, z + flip * 2.2)); // lente: logo abaixo da luminária
  });
  setShadow(poles);
  scene.add(poles, lamps);

  for (const z of crossings) for (const s of [-1, 1]) { // semáforos
    const g = new THREE.Group();
    g.add(setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.6, 8).translate(0, 1.8, 0), std({ color: '#2a2d33', metalness: 0.4 }))));
    const head = setShadow(new THREE.Mesh(B(0.35, 1.0, 0.3), std({ color: '#16181c' })));
    head.position.set(0, 3.7, 0);
    g.add(head);
    ['#d92b2b', '#4a3b0a', '#0a3d1a'].forEach((c, i) => {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), new THREE.MeshBasicMaterial({ color: i === 0 ? c : '#222' }));
      l.position.set(0, 3.95 - i * 0.28, 0.16);
      g.add(l);
    });
    g.position.set(s * (ROAD + 0.4), 0.16, z + s * 10.4);
    g.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(g);
  }

  // ---------- canteiro central: postes altos, totens de esquina, gradis e semáforos ----------
  const tallSpots = [];
  for (let z = -HALF_LEN + 20; z < HALF_LEN; z += 46) if (!nearCrossing(z, 12)) tallSpots.push(z);
  const tallGeo = mergeColored([
    { geo: new THREE.CylinderGeometry(0.13, 0.22, 19, 10).translate(0, 9.5, 0), color: '#5d6268' },
    { geo: B(5.2, 0.16, 0.16), color: '#5d6268', pos: [0, 18.2, 0] },
    { geo: B(3.4, 0.12, 0.12), color: '#5d6268', pos: [0, 16.4, 0] },
    ...[-2.5, -1.2, 1.2, 2.5].map((x) => ({ geo: B(0.55, 0.16, 0.36), color: '#3c3f44', pos: [x, 18.0, 0] })),
    { geo: B(0.4, 0.5, 0.4), color: '#3c3f44', pos: [0, 2.4, 0] }, // caixa de comando
  ]);
  const tall = new THREE.InstancedMesh(tallGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5 }), tallSpots.length);
  tallSpots.forEach((z, i) => tall.setMatrixAt(i, m4.makeRotationY(i % 2 ? 0 : Math.PI / 2).setPosition((i % 2 ? 1 : -1) * (CYCLE + 0.2), 0.12, z)));
  setShadow(tall);
  scene.add(tall);
  tallSpots.forEach((z, i) => avoid.push({ x: (i % 2 ? 1 : -1) * (CYCLE + 0.2), z, hx: 0.4, hz: 0.4 }));

  const STREETS = ['Av. Brig. Luís Antônio', 'R. Augusta', 'Al. Campinas', 'R. da Consolação', 'R. Pamplona', 'Al. Rocha Azevedo', 'Av. Brasil', 'R. Haddock Lobo'];
  const railGeo = mergeColored([
    { geo: B(0.05, 0.05, 5), color: '#202226', pos: [0, 1.0, 0] },
    { geo: B(0.05, 0.05, 5), color: '#202226', pos: [0, 0.5, 0] },
    ...[-2.45, -1.2, 0, 1.2, 2.45].map((z) => ({ geo: B(0.06, 1.02, 0.06), color: '#202226', pos: [0.0, 0.51, z] })),
  ]);
  const rails = new THREE.InstancedMesh(railGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.6 }), crossings.length * 4);
  const coneSpots = [];
  crossings.forEach((z, ci) => {
    // totem preto na ponta do canteiro, com o nome da próxima rua dos dois lados
    for (const [k, dz] of [[0, -11.2], [1, 11.2]]) {
      const name = STREETS[(ci * 2 + k) % STREETS.length];
      const mat = std({ map: streetTotemTexture(name), roughness: 0.6 });
      const side = std({ color: '#1b1c1e', roughness: 0.6 });
      const totem = setShadow(new THREE.Mesh(B(0.55, 7.2, 0.55), [side, side, side, side, mat, mat]));
      totem.position.set(0, 0.12 + 3.6, z + dz);
      scene.add(totem);
      avoid.push({ x: 0, z: z + dz, hx: 0.5, hz: 0.5 });
      // gradis acompanhando a ciclovia na chegada ao cruzamento
      for (const sd of [-1, 1]) rails.setMatrixAt(ci * 4 + k * 2 + (sd > 0 ? 1 : 0), m4.makeTranslation(sd * (CYCLE + 0.2), 0.12, z + dz * 1.33));
      coneSpots.push([-(CYCLE + 0.55), z + dz * 0.95], [CYCLE + 0.55, z + dz * 0.95]);
    }
    // semáforo preto no canteiro
    for (const sd of [-1, 1]) {
      const g = new THREE.Group();
      g.add(setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 4.2, 8).translate(0, 2.1, 0), std({ color: '#1d1e21', metalness: 0.4 }))));
      const head = setShadow(new THREE.Mesh(B(0.32, 0.95, 0.28), std({ color: '#121315' })));
      head.position.set(0, 4.3, 0);
      g.add(head);
      ['#2a0b0b', '#3a300a', '#22d36a'].forEach((c, i) => {
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12), new THREE.MeshBasicMaterial({ color: c }));
        l.position.set(0, 4.55 - i * 0.26, 0.15);
        g.add(l);
      });
      g.position.set(sd * (CYCLE + 0.25), 0.12, z + sd * 10.6);
      g.rotation.y = sd > 0 ? 0 : Math.PI;
      scene.add(g);
    }
  });
  setShadow(rails);
  scene.add(rails);

  // cones laranja: fechamento de domingo ao longo do canteiro e alguns soltos nas faixas
  for (let z = -60; z < 60; z += 7) if (!nearCrossing(z, 12)) coneSpots.push([(z / 7) % 2 ? 2.3 : -2.3, z]);
  for (let i = 0; i < 18; i++) coneSpots.push([pick([-5.4, -3.9, 3.9, 5.4]), rr(-110, 110)]);
  // cone de trânsito: base de borracha, corpo cônico liso e duas faixas refletivas 8 mm para fora do corpo
  const coneGeo = mergeColored([
    { geo: rb(0.42, 0.04, 0.42, 0.015), color: '#26282b', pos: [0, 0.02, 0] },
    { geo: new THREE.CylinderGeometry(0.035, 0.125, 0.62, 18), color: '#f2661c', pos: [0, 0.35, 0] },
    { geo: new THREE.CylinderGeometry(0.0807, 0.0953, 0.1, 18), color: '#f4f4f0', pos: [0, 0.35, 0] },
    { geo: new THREE.CylinderGeometry(0.0604, 0.072, 0.08, 18), color: '#f4f4f0', pos: [0, 0.5, 0] },
    { geo: new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), color: '#f2661c', pos: [0, 0.665, 0] },
  ]);
  const cones = new THREE.InstancedMesh(coneGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), coneSpots.length);
  coneSpots.forEach(([x, z], i) => cones.setMatrixAt(i, m4.makeTranslation(x, 0, z)));
  setShadow(cones);
  scene.add(cones);

  const shelterAd = std({ color: '#ffffff', emissive: '#a9d4ff', emissiveIntensity: 0.6 });
  for (const [x, z] of [[1, -38], [-1, 24], [1, 96], [-1, -100]].map(([sd, zz]) => [sd * (ROAD + 3.6), zz])) { // pontos de ônibus
    const g = new THREE.Group();
    const frame = std({ color: '#3f464e', metalness: 0.5, roughness: 0.4 });
    for (const [px, pz] of [[-1.6, -0.6], [1.6, -0.6], [-1.6, 0.6], [1.6, 0.6]]) {
      g.add(setShadow(new THREE.Mesh(B(0.1, 2.6, 0.1).translate(0, 1.3, 0), frame)).translateX(px).translateZ(pz));
    }
    g.add(setShadow(new THREE.Mesh(B(3.6, 0.12, 1.6), frame)).translateY(2.65));
    const back = new THREE.Mesh(B(3.2, 1.7, 0.06), std({ color: '#9fc6d8', transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.3 }));
    back.position.set(0, 1.2, x > 0 ? 0.6 : -0.6);
    g.add(back);
    const ad = new THREE.Mesh(B(1.2, 1.7, 0.1), shelterAd);
    ad.position.set(x > 0 ? 2.05 : -2.05, 1.2, 0);
    ad.rotation.y = Math.PI / 2;
    g.add(ad);
    g.add(setShadow(new THREE.Mesh(B(2.6, 0.08, 0.45).translate(0, 0.5, 0), std({ color: '#5a4630' }))));
    g.position.set(x, 0.16, z);
    g.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(g);
  }

  const banca = new THREE.Group();
  banca.add(setShadow(new THREE.Mesh(B(2.2, 2.3, 1.7).translate(0, 1.15, 0), std({ color: '#2d6e57' }))));
  banca.add(setShadow(new THREE.Mesh(B(2.8, 0.1, 2.3).translate(0, 2.4, 0.2), std({ color: '#e8b923' }))));
  banca.add(new THREE.Mesh(B(1.8, 0.9, 0.05).translate(0, 1.3, 0.88), std({ color: '#f2d9a8', emissive: '#6b5a2a', emissiveIntensity: 0.3 })));
  banca.position.set(ROAD + 4.6, 0.16, 38);
  banca.rotation.y = -Math.PI / 2;
  scene.add(banca);

  const ticker = new LedTicker();

  // ---------- prédios ----------
  const shopMat = std({ map: shopfrontTexture(), roughness: 0.5 });
  const roofMat = std({ color: '#6c6f72', roughness: 0.95 });
  const concreteTex = concreteTexture([4, 2]);
  const concreteCache = new Map();
  const concrete = (hex) => {
    if (!concreteCache.has(hex)) concreteCache.set(hex, std({ color: hex, map: concreteTex }));
    return concreteCache.get(hex);
  };
  const tints = ['#d9d2c4', '#cdd5d6', '#e1cdb4', '#c9c2b5', '#d6c4b0'];

  // Detalhes dos prédios em poucas chamadas de desenho: caixas instanciadas por categoria
  // (cornijas e lajes, brises e caixilhos, guarda-corpos de vidro, aparelhos de ar e luzes de topo).
  const details = { trim: [], metal: [], rail: [], ac: [], beacon: [] };
  const box = (cat, x, y, z, sx, sy, sz, color = '#ffffff') => details[cat].push([x, y, z, sx, sy, sz, color]);
  const FLOOR = 3.6;

  // torre treliçada: quatro pernas afinando, anéis e diagonais em faixas vermelhas e brancas
  const latticeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 });
  let towers = 0;
  function latticeTower(h) {
    const parts = [];
    const beam = (a, b, t, color) => {
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      const geo = B(t, len, t).translate(0, len / 2, 0);
      geo.applyMatrix4(new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()), new THREE.Vector3(1, 1, 1)));
      parts.push({ geo, color });
    };
    const half = (y) => 1.8 - 1.45 * (y / h);
    const band = (y) => (Math.floor((y / h) * 7) % 2 ? '#f2f2ee' : '#d3261c');
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const step = 3;
    for (let y = 0; y < h - 0.1; y += step) {
      const y2 = Math.min(h, y + step);
      const c = band(y + step / 2);
      for (let k = 0; k < 4; k++) {
        const [ax, az] = corners[k];
        const [bx, bz] = corners[(k + 1) % 4];
        const a0 = new THREE.Vector3(ax * half(y), y, az * half(y));
        const a1 = new THREE.Vector3(ax * half(y2), y2, az * half(y2));
        const b0 = new THREE.Vector3(bx * half(y), y, bz * half(y));
        const b1 = new THREE.Vector3(bx * half(y2), y2, bz * half(y2));
        beam(a0, a1, 0.16, c); // perna
        beam(a1, b1, 0.08, c); // anel
        beam(a0, b1, 0.05, c); // diagonais
        beam(b0, a1, 0.05, c);
      }
    }
    // mastro no topo
    parts.push({ geo: new THREE.CylinderGeometry(0.08, 0.14, 8, 6).translate(0, h + 4, 0), color: '#d3261c' });
    const geo = mergeColored(parts);
    geo.userData.height = h + 8;
    return geo;
  }

  function addBuilding(side, zc, w, opts = {}) {
    const d = rr(22, 30);
    const podH = rr(5.5, 7.5);
    const frontX = WALK + 0.6;
    const cx = side * (frontX + d / 2);
    const faceIdx = side > 0 ? 1 : 0; // face voltada para a pista: -x no leste, +x no oeste
    const podMats = Array.from({ length: 6 }, () => concrete(pick(tints)));
    const shop = shopMat.clone();
    shop.map = shopMat.map.clone();
    shop.map.needsUpdate = true;
    shop.map.repeat.set(w / 12, 1);
    podMats[faceIdx] = shop;
    podMats[2] = roofMat;
    const podium = setShadow(new THREE.Mesh(B(d, podH, w), podMats));
    podium.position.set(cx, podH / 2 + 0.01, zc);
    scene.add(podium);
    // marquise sobre a calçada e platibanda do embasamento
    box('trim', side * (frontX - 1.25), 3.9, zc, 2.5, 0.22, w - 1.2, '#d9d5cc');
    box('metal', side * (frontX - 2.48), 3.82, zc, 0.06, 0.32, w - 1.2, '#3a3f45');
    box('trim', cx, podH + 0.25, zc, d + 0.3, 0.5, w + 0.3, '#c9c4ba');

    const kind = opts.kind || pick(['glass', 'glass', 'office', 'office', 'apartment', 'stripes', 'classic', 'brise']);
    const tint = kind === 'stripes' ? pick(['#d98b8b', '#c96262', '#8f9aa6', '#c9a07a'])
      : kind === 'office' || kind === 'brise' ? pick(['#cfc6b3', '#bdb5a6', '#d6d0c4', '#aaa59b']) : pick(tints);
    const H = Math.round((opts.height || rr(26, 96)) / FLOOR) * FLOOR;
    const tw = w - 3;
    const td = d - 6;
    const tex = facadeTexture(kind === 'brise' ? 'office' : kind, tint);
    const face = (u, h) => {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(u / 8, h / 7.2);
      return std({
        map: t, roughness: kind === 'glass' ? 0.22 : 0.85, metalness: kind === 'glass' ? 0.4 : 0, envMapIntensity: kind === 'glass' ? 1.3 : 0.4,
      });
    };
    // torre em um ou dois blocos (o de cima recuado)
    const tiers = [];
    if (H > 48 && rng() < 0.55) {
      const h1 = Math.round((H * rr(0.55, 0.72)) / 7.2) * 7.2;
      tiers.push({ y0: podH, h: h1, td, tw });
      tiers.push({ y0: podH + h1, h: H - h1, td: td - 4, tw: tw - 4 });
    } else tiers.push({ y0: podH, h: H, td, tw });

    const tx = cx + side * 3;
    const trimColor = kind === 'glass' ? '#4b5560' : kind === 'apartment' || kind === 'stripes' ? '#e6e2da' : kind === 'office' || kind === 'brise' ? tint : '#efe9dd';
    for (const t of tiers) {
      const mD = face(t.td, t.h);
      const mW = face(t.tw, t.h);
      const tower = setShadow(new THREE.Mesh(B(t.td, t.h, t.tw), [mD, mD, roofMat, roofMat, mW, mW]));
      tower.position.set(tx, t.y0 + t.h / 2, zc);
      scene.add(tower);
      const floors = Math.round(t.h / FLOOR);
      const top = t.y0 + t.h;
      if (kind === 'glass') {
        // brises verticais a cada 4 m nas quatro faces e coroamento escuro
        for (let zz = -t.tw / 2 + 4; zz < t.tw / 2 - 0.5; zz += 4) {
          for (const sx of [-1, 1]) box('metal', tx + sx * (t.td / 2 + 0.22), t.y0 + t.h / 2, zc + zz, 0.44, t.h, 0.16, '#2b343b');
        }
        for (let xx = -t.td / 2 + 4; xx < t.td / 2 - 0.5; xx += 4) {
          for (const sz of [-1, 1]) box('metal', tx + xx, t.y0 + t.h / 2, zc + sz * (t.tw / 2 + 0.22), 0.16, t.h, 0.44, '#2b343b');
        }
        for (let f = 2; f < floors; f += 2) box('metal', tx, t.y0 + f * FLOOR - 0.2, zc, t.td + 0.5, 0.18, t.tw + 0.5, '#36414a');
        box('trim', tx, top + 1.1, zc, t.td + 0.12, 2.2, t.tw + 0.12, '#2f3a44');
      } else if (kind === 'apartment') {
        // varandas corridas: laje saliente com guarda-corpo de vidro em cada andar
        for (let f = 1; f < floors; f++) {
          const y = t.y0 + f * FLOOR;
          box('trim', tx, y - 0.08, zc, t.td + 2.4, 0.16, t.tw + 2.4, '#e4e1da');
          box('rail', tx + (t.td / 2 + 1.17), y + 0.5, zc, 0.04, 1.0, t.tw + 2.4);
          box('rail', tx - (t.td / 2 + 1.17), y + 0.5, zc, 0.04, 1.0, t.tw + 2.4);
          box('rail', tx, y + 0.5, zc + (t.tw / 2 + 1.17), t.td + 2.4, 1.0, 0.04);
          box('rail', tx, y + 0.5, zc - (t.tw / 2 + 1.17), t.td + 2.4, 1.0, 0.04);
        }
        box('trim', tx, top + 0.6, zc, t.td + 0.4, 1.2, t.tw + 0.4, trimColor);
      } else if (kind === 'brise') {
        // brises horizontais cor de terracota em todos os andares
        for (let f = 0; f < floors; f++) box('trim', tx, t.y0 + f * FLOOR + 1.25, zc, t.td + 1.1, 0.75, t.tw + 1.1, '#9a5634');
        box('trim', tx, top + 0.6, zc, t.td + 1.3, 1.2, t.tw + 1.3, trimColor);
      } else if (kind === 'office' || kind === 'stripes') {
        // concreto aparente: pilares salientes nas quinas e platibanda alta
        for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) box('trim', tx + sx * t.td / 2, t.y0 + t.h / 2, zc + sz * t.tw / 2, 0.9, t.h, 0.9, trimColor);
        box('trim', tx, top + 1.2, zc, t.td + 0.5, 2.4, t.tw + 0.5, trimColor);
      } else {
        // clássico: frisos a cada 3 andares, cornija pesada e aparelhos de ar sob as janelas
        for (let f = 3; f < floors; f += 3) box('trim', tx, t.y0 + f * FLOOR, zc, t.td + 0.3, 0.28, t.tw + 0.3, trimColor);
        box('trim', tx, top + 0.45, zc, t.td + 1.1, 0.9, t.tw + 1.1, trimColor);
        box('trim', tx, t.y0 + 0.6, zc, t.td + 0.25, 1.2, t.tw + 0.25, '#b8b1a4');
        for (let f = 1; f < floors; f++) {
          for (let zz = -t.tw / 2 + 2; zz < t.tw / 2; zz += 4) {
            if (rng() < 0.22) box('ac', tx - side * (t.td / 2 + 0.25), t.y0 + f * FLOOR + 0.55, zc + zz, 0.5, 0.45, 0.75);
          }
        }
      }
    }

    // cobertura: casa de máquinas, caixa d'água, condensadores e antena com luz vermelha
    const last = tiers[tiers.length - 1];
    const roofY = last.y0 + last.h;
    const rx = tx;
    const roof = setShadow(new THREE.Mesh(B(last.td * 0.4, 2.4, last.tw * 0.35), roofMat));
    roof.position.set(rx, roofY + 1.2, zc);
    scene.add(roof);
    box('trim', rx - last.td * 0.12, roofY + 3.0, zc + last.tw * 0.05, last.td * 0.16, 1.2, last.tw * 0.2, '#8d9092');
    const units = 2 + Math.floor(rng() * 5);
    for (let i = 0; i < units; i++) {
      box('ac', rx + rr(-last.td * 0.4, last.td * 0.4), roofY + 0.5, zc + rr(-last.tw * 0.4, last.tw * 0.4), 1.4, 1.0, 1.1);
    }
    if (roofY > 70 && towers < 5 && rng() < 0.6) {
      // torre de TV treliçada vermelha e branca, marca do horizonte da Paulista
      towers += 1;
      const lt = setShadow(new THREE.Mesh(latticeTower(rr(28, 44)), latticeMat), true, false);
      lt.position.set(rx, roofY + 2.4, zc);
      scene.add(lt);
      box('beacon', rx, roofY + 2.4 + lt.geometry.userData.height + 0.4, zc, 0.5, 0.5, 0.5);
    } else if (rng() < 0.6) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 14, 6).translate(0, 7, 0), std({ color: '#888' }));
      ant.position.set(rx, roofY + 2.4, zc);
      scene.add(ant);
      box('beacon', rx, roofY + 16.5, zc, 0.35, 0.35, 0.35);
    }

    if (opts.led) { // painel de LED na fachada voltada à avenida
      const t0 = tiers[0];
      const led = new THREE.Mesh(new THREE.PlaneGeometry(t0.tw * 0.8, t0.tw * 0.45), new THREE.MeshBasicMaterial({ map: ticker.texture, toneMapped: false }));
      led.position.set(tx - side * (t0.td / 2 + 0.6), podH + 17, zc);
      led.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      scene.add(led);
    }
  }

  for (const side of [-1, 1]) {
    let z = -HALF_LEN;
    while (z < HALF_LEN) {
      const w = rr(20, 34);
      const zc = z + w / 2;
      const reserved = zc > -70 && zc < 20; // MASP (oeste) e Parque Trianon (leste)
      if (!reserved) addBuilding(side, zc, w, { led: side < 0 && Math.abs(zc - 66) < 18 });
      z += w + rr(0.5, 3);
    }
  }

  // prédios ao fundo para dar profundidade ao horizonte
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? 1 : -1;
    const w = rr(24, 40);
    const H = rr(70, 150);
    const tex = facadeTexture('glass');
    const mk = (u) => {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(u / 8, H / 7.2);
      return std({ map: t, roughness: 0.25, metalness: 0.4, envMapIntensity: 1.2 });
    };
    const mat = mk(w);
    const b = new THREE.Mesh(B(w, H, w), mat);
    b.position.set(side * rr(58, 130), H / 2, rr(-HALF_LEN, HALF_LEN));
    scene.add(b);
    box('trim', b.position.x, H + 1, b.position.z, w + 0.2, 2, w + 0.2, '#3a444d');
    if (rng() < 0.5) box('beacon', b.position.x, H + 2.3, b.position.z, 0.5, 0.5, 0.5);
  }

  // instancia todos os detalhes dos prédios
  const detailMats = {
    trim: std({ color: '#ffffff', map: concreteTex, roughness: 0.9 }),
    metal: std({ color: '#ffffff', roughness: 0.4, metalness: 0.6 }),
    rail: std({ color: '#5d7a8c', roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.45, depthWrite: false }),
    ac: std({ color: '#d4d6d6', roughness: 0.6, metalness: 0.3 }),
    beacon: new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false }),
  };
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const dc = new THREE.Color();
  for (const [cat, list] of Object.entries(details)) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(unitBox, detailMats[cat], list.length);
    list.forEach(([x, y, z, sx, sy, sz, color], i) => {
      im.setMatrixAt(i, m4.makeScale(sx, sy, sz).setPosition(x, y, z));
      im.setColorAt(i, dc.set(color));
    });
    im.castShadow = cat !== 'rail' && cat !== 'beacon';
    im.receiveShadow = cat !== 'beacon';
    im.computeBoundingSphere();
    scene.add(im);
  }

  // ---------- Parque Trianon (leste, em frente ao MASP) ----------
  const parkGrass = std({ map: grassTexture([14, 14]), color: '#7c9b64' });
  const park = setShadow(new THREE.Mesh(new THREE.PlaneGeometry(60, 86), parkGrass), false, true);
  park.rotation.x = -Math.PI / 2;
  park.position.set(WALK + 31, 0.01, -25);
  scene.add(park);
  const parkTrees = [];
  for (let i = 0; i < 70; i++) parkTrees.push([rr(WALK + 3, WALK + 56), rr(-66, 16)]);
  addTrees(scene, rng, parkTrees, { scaleMin: 1.3, scaleMax: 2.0, mix: { tipuana: 0.35, sibipiruna: 0.5, ipe: 0.15 } });
  const fence = new THREE.InstancedMesh(B(0.08, 1.7, 0.08).translate(0, 0.85, 0), std({ color: '#222', metalness: 0.5 }), 40);
  for (let i = 0; i < 40; i++) fence.setMatrixAt(i, m4.makeTranslation(WALK + 0.8, 0.16, -66 + i * 2.1));
  scene.add(fence);

  // ---------- MASP (oeste): vão livre de 74 m sob a caixa suspensa ----------
  const MX = -(WALK + 16);
  const MZ = -26;
  const maspRed = std({ color: '#c42a1f', roughness: 0.65 });
  const plaza = setShadow(new THREE.Mesh(new THREE.PlaneGeometry(31, 78), std({ map: concreteTexture([8, 20], '#bdb8ae') })), false, true);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(MX, 0.02, MZ);
  scene.add(plaza);
  const maspBox = (w, h, d, x, y, z, mat = maspRed) => {
    const m = setShadow(new THREE.Mesh(B(w, h, d), mat));
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  };
  for (const px of [-13.5, 13.5]) {
    for (const pz of [-36, 36]) maspBox(2.6, 13.5, 2.6, MX + px, 6.75, MZ + pz);
    maspBox(2.6, 3, 74, MX + px, 15, MZ); // vigas longitudinais
  }
  for (const pz of [-36, 36]) maspBox(27.5, 3, 2.6, MX, 15, MZ + pz); // vigas transversais
  maspBox(24.4, 0.7, 70, MX, 14, MZ, std({ color: '#cfcac0' })); // laje
  const glassKind = facadeTexture('glass');
  const gx = glassKind.clone(); gx.needsUpdate = true; gx.repeat.set(70 / 8, 8.5 / 7.2);
  const gz = glassKind.clone(); gz.needsUpdate = true; gz.repeat.set(24.4 / 8, 8.5 / 7.2);
  const glass = (t) => std({ map: t, roughness: 0.15, metalness: 0.5, envMapIntensity: 1.4 });
  maspBox(24.4, 8.5, 70, MX, 9.3, MZ, [glass(gx), glass(gx), roofMat, roofMat, glass(gz), glass(gz)]);
  const maspConcrete = std({ map: concreteTexture([10, 1], '#8d8b86'), roughness: 0.9 });
  maspBox(24.8, 1.1, 70.4, MX, 13.4, MZ, maspConcrete); // laje de cobertura em concreto
  maspBox(24.8, 0.9, 70.4, MX, 5.2, MZ, maspConcrete); // laje de piso em concreto

  // ---------- veículos ----------
  const addVehicle = (mesh, x, z, ry, hx, hz) => {
    mesh.position.set(x, 0.0, z);
    mesh.rotation.y = ry;
    scene.add(mesh);
    avoid.push({ x, z, hx, hz });
  };
  [[1, -118, 0], [-1, -52, Math.PI], [1, 22, 0], [-1, 84, Math.PI], [1, 150, 0]].map(([sd, z, ry]) => [sd * (ROAD - 1.35), z, ry]).forEach(([x, z, ry], i) => {
    addVehicle(busMesh(['#1d4e9e', '#c8312a', '#1e8a47'][i % 3]), x, z, ry, 1.5, 6.2);
  });
  const carColors = ['#ececec', '#1c1c1e', '#b9b9bd', '#a8201a', '#2a4f8f', '#d9d9d2', '#4c4f55'];
  for (let i = 0; i < 12; i++) {
    const lane = pick([-1, 1]) * (CYCLE + 0.35 + laneW * (0.5 + Math.floor(rng() * 3)));
    const z = rr(-HALF_LEN + 10, HALF_LEN - 10);
    if (avoid.some((a) => Math.abs(a.z - z) < a.hz + 4 && Math.abs(a.x - lane) < 3.5)) continue;
    addVehicle(carMesh(pick(carColors), '', CAR_TYPES[i % CAR_TYPES.length]), lane, z, lane > 0 ? 0 : Math.PI, 1.1, 2.4);
  }
  const truckBanner = (side) => new THREE.MeshStandardMaterial({ map: bannerTexture(side), side: THREE.DoubleSide, roughness: 0.8 });
  addVehicle(soundTruckMesh('#8f1019', truckBanner(0)), 5.2, -30, 0, 3.1, 8);
  addVehicle(soundTruckMesh('#0e6a30', truckBanner(1)), -5.2, 44, Math.PI, 3.1, 8);

  // ---------- mobiliário urbano ----------
  const steel = new THREE.MeshStandardMaterial({ color: '#8b9096', metalness: 0.7, roughness: 0.35 });

  // grades de contenção ao redor dos carros de som
  const panelGeo = mergeColored([
    { geo: B(0.05, 1.1, 0.05), color: '#8b9096', pos: [-0.95, 0.55, 0] },
    { geo: B(0.05, 1.1, 0.05), color: '#8b9096', pos: [0.95, 0.55, 0] },
    { geo: B(2.0, 0.04, 0.04), color: '#8b9096', pos: [0, 1.05, 0] },
    { geo: B(2.0, 0.04, 0.04), color: '#8b9096', pos: [0, 0.65, 0] },
    { geo: B(2.0, 0.04, 0.04), color: '#8b9096', pos: [0, 0.25, 0] },
    { geo: B(0.3, 0.08, 0.5), color: '#6b7076', pos: [-0.95, 0.04, 0] },
    { geo: B(0.3, 0.08, 0.5), color: '#6b7076', pos: [0.95, 0.04, 0] },
  ]);
  const panels = [];
  for (const [tx, tz] of [[2.1, -30], [-2.1, 44]]) {
    for (const sx of [-1, 1]) for (let dz = -7; dz <= 7; dz += 2) panels.push([tx + sx * 2.7, tz + dz, Math.PI / 2]);
    for (const dx of [-1.9, 0, 1.9]) panels.push([tx + dx, tz - 8.3, 0], [tx + dx, tz + 8.3, 0]);
  }
  const barriers = new THREE.InstancedMesh(panelGeo, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.7, roughness: 0.35 }), panels.length);
  panels.forEach(([x, z, ry], i) => barriers.setMatrixAt(i, m4.makeRotationY(ry).setPosition(x, 0, z)));
  setShadow(barriers);
  scene.add(barriers);

  // lixeiras, bueiros e placas de rua
  const binSpots = [];
  for (const sd of [-1, 1]) for (let z = -HALF_LEN + 20; z < HALF_LEN; z += 31) binSpots.push([sd * (ROAD + 4.8), z]);
  const bins = new THREE.InstancedMesh(
    mergeColored([
      { geo: new THREE.CylinderGeometry(0.27, 0.24, 0.88, 18), color: '#35634a', pos: [0, 0.44, 0] }, // corpo levemente cônico
      { geo: new THREE.CylinderGeometry(0.285, 0.285, 0.06, 18), color: '#2b2f33', pos: [0, 0.78, 0] }, // cinta
      { geo: new THREE.CylinderGeometry(0.29, 0.29, 0.05, 18), color: '#222529', pos: [0, 0.905, 0] }, // tampa
      { geo: new THREE.SphereGeometry(0.265, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1), color: '#222529', pos: [0, 0.93, 0] }, // cúpula
      { geo: B(0.26, 0.1, 0.03), color: '#0e1012', pos: [0, 0.74, 0.28] }, // abertura
      { geo: new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14), color: '#1e2124', pos: [0, 0.01, 0] }, // base
    ]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }), binSpots.length,
  );
  binSpots.forEach(([x, z], i) => bins.setMatrixAt(i, m4.makeTranslation(x, 0.16, z)));
  setShadow(bins);
  scene.add(bins);

  const manholes = new THREE.InstancedMesh(new THREE.CircleGeometry(0.42, 16).rotateX(-Math.PI / 2), std({ color: '#2a2b2d', metalness: 0.3, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3 }), 16);
  for (let i = 0; i < 16; i++) manholes.setMatrixAt(i, m4.makeTranslation(rr(-5, 5), 0.006, -HALF_LEN + 12 + i * 23));
  scene.add(manholes);

  const signMat = std({ map: streetSignTexture(), roughness: 0.4, metalness: 0.2 });
  const signGeo = new THREE.PlaneGeometry(1.0, 0.25);
  const posterMats = SIDES.map((sd) => std({ map: posterTexture(sd.id), roughness: 0.95 }));
  const posterGeo = new THREE.PlaneGeometry(0.42, 0.63);
  lampSpots.forEach(([x, z], i) => {
    const toward = x > 0 ? -1 : 1; // lado voltado para a pista
    if (i % 3 === 0) { // placa "Av. Paulista", legível dos dois lados
      for (const f of [-1, 1]) {
        const sign = new THREE.Mesh(signGeo, signMat);
        sign.position.set(x, 3.26, z + 0.12 * f);
        sign.rotation.y = f > 0 ? 0 : Math.PI;
        scene.add(sign);
      }
    } else if (i % 2 === 1) { // lambe-lambe colado no poste
      const poster = new THREE.Mesh(posterGeo, posterMats[Math.floor(rng() * SIDES.length)]);
      poster.position.set(x + toward * 0.11, 1.71 + rr(-0.1, 0.1), z);
      poster.rotation.y = toward > 0 ? Math.PI / 2 : -Math.PI / 2;
      poster.rotation.z = rr(-0.06, 0.06);
      scene.add(poster);
    }
  });

  // ---------- pórticos da corrida ----------
  for (const [z, text, color] of [[RACE.startZ, 'LARGADA', '#1d4e9e'], [RACE.finishZ, 'CHEGADA', '#b91c1c']]) {
    const g = new THREE.Group();
    const post = std({ color: '#e5e5e5', roughness: 0.5, metalness: 0.3 });
    for (const x of [-(ROAD - 0.4), ROAD - 0.4]) {
      const p = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 6, 10).translate(0, 3, 0), post));
      p.position.x = x;
      g.add(p);
      avoid.push({ x, z, hx: 0.5, hz: 0.5 });
    }
    const beam = setShadow(new THREE.Mesh(B(17.6, 0.25, 0.25), post));
    beam.position.y = 6;
    g.add(beam);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(16, 1.6), std({ map: archBannerTexture(text, color), side: THREE.DoubleSide, roughness: 0.8 }));
    banner.position.y = 5.0;
    g.add(banner);
    const line = flat(ROAD * 2 - 0.4, 0.5, white, 0, 0.012, z);
    line.position.z = z;
    g.position.z = z;
    scene.add(g);
  }

  // ---------- barracas: churrasquinho de picanha e feira de abóbora ----------
  const V = ROAD + 4;
  const vendors = addVendors(scene, rng, [
    [V, -22, 'picanha'], [-V, 8, 'picanha'], [V, 52, 'picanha'], [-V, -60, 'picanha'],
    [V, 118, 'picanha'], [-V, 150, 'picanha'], [-V, 38, 'abobora'], [V, -88, 'abobora'], [-V, 124, 'abobora'],
  ]);
  avoid.push(...vendors.avoid);

  // ---------- faixas, bandeirinhas, balões e marcadores do Domínio ----------
  const scenery = addScenery(scene, rng, { ROAD, WALK }, avoid);

  // ---------- multidão ----------
  // o centro (0, 0) fica livre: é onde o avatar aparece no lobby e perto de onde os jogadores entram
  const crowd = createCrowd(scene, rng, [...avoid, { x: 0, z: 0, hx: 3.4, hz: 3.4 }]);

  // ---------- atualização ----------
  const snap = 96 / 2048;
  const focus = new THREE.Vector3();
  function update(time, fx = 0, fz = 0, cars = []) {
    crowd.update(time, fx, fz, cars);
    ticker.update(time);
    vendors.update(time);
    scenery.update(time);
    // a câmera de sombra acompanha o jogador, ancorada na grade de texels da luz (src/shadow.js) para a sombra não tremer
    snapShadowFocus(focus, fx, fz, SUN_DIR, snap);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(SUN_DIR, 120);
  }

  function setShadows(on) {
    sun.castShadow = on;
    renderer.shadowMap.needsUpdate = true;
  }

  return {
    update, setShadows, crowd, ticker, bounds: WORLD, obstacles: avoid, setZones: scenery.setZones,
  };
}
