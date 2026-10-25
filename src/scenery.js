import * as THREE from 'three';
import { SIDES, ZONES, ZONE } from '../shared/config.js';

// Decoração viva da avenida: faixas e bandeirinhas atravessando a pista, balões nas calçadas e os
// marcadores dos trechos do Domínio (coluna de luz, listras no chão e nome flutuando).

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });

function bannerCanvas(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = fg;
  ctx.fillRect(0, 0, c.width, 8);
  ctx.fillRect(0, c.height - 8, c.width, 8);
  ctx.font = '800 70px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function labelSprite(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(8,12,10,0.7)';
  ctx.beginPath();
  ctx.roundRect(8, 16, 496, 96, 40);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '800 56px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), 256, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(13, 3.25, 1);
  return s;
}

/**
 * `dims`: { ROAD, WALK }. `avoid`: caixas que a multidão evita e o jogador não atravessa.
 */
export function addScenery(scene, rng, { ROAD, WALK }, avoid) {
  const m4 = new THREE.Matrix4();
  const color = new THREE.Color();

  // ---------- faixas e bandeirinhas ----------
  const SPANS = [
    [-96, 'DOMINGO NA PAULISTA', '#14532d', '#fde047'],
    [-45, 'A VOZ DAS RUAS', '#7f1d1d', '#ffffff'],
    [12, 'ELEIÇÕES 2026 · VOTE CONSCIENTE', '#1e3a8a', '#fde047'],
    [90, 'AVENIDA ABERTA PARA AS PESSOAS', '#134e4a', '#ffffff'],
    [160, 'BEM-VINDO À PAULISTA', '#581c87', '#fde047'],
  ];
  const poleMat = std({ color: '#c9ccd1', metalness: 0.5, roughness: 0.4 });
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 10, 10).translate(0, 5, 0);
  const width = (ROAD + 0.6) * 2;
  const bunting = [];
  for (const [z, text, bg, fg] of SPANS) {
    for (const sx of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(sx * (ROAD + 0.6), 0.16, z);
      pole.castShadow = true;
      scene.add(pole);
      avoid.push({ x: sx * (ROAD + 0.6), z, hx: 0.3, hz: 0.3 });
    }
    const tex = bannerCanvas(text, bg, fg);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 8), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 }));
    plane.position.set(0, 8.6, z);
    plane.rotation.x = 0.04;
    scene.add(plane);
    for (const dz of [-3.2, 3.2]) bunting.push([z + dz]);
  }
  // bandeirinhas: triângulos ao longo de uma curva (catenária) entre os dois postes
  const perLine = 28;
  const triGeo = new THREE.BufferGeometry();
  triGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.28, 0, 0, 0.28, 0, 0, 0, -0.55, 0]), 3));
  triGeo.computeVertexNormals();
  const flags = new THREE.InstancedMesh(triGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), bunting.length * perLine);
  const palette = [...SIDES.map((s) => s.color), '#f2c20f', '#ffffff', '#2f5fbf'];
  let n = 0;
  for (const [z] of bunting) {
    for (let i = 0; i < perLine; i++) {
      const u = (i + 0.5) / perLine;
      const x = (u - 0.5) * width;
      const y = 7.3 - 1.3 * (1 - (2 * u - 1) ** 2) * -1 - 1.3; // arco suave: mais baixo no meio
      m4.makeTranslation(x, y, z);
      flags.setMatrixAt(n, m4);
      flags.setColorAt(n, color.set(palette[(i + Math.floor(z)) % palette.length] ?? '#fff'));
      n += 1;
    }
  }
  flags.instanceColor.needsUpdate = true;
  scene.add(flags);

  // ---------- balões (balançam com o vento) ----------
  const BALLOON_SPOTS = [[-15.5, -86], [15.8, -66], [-16, -34], [16, -4], [-15, 28], [16.2, 50], [-16, 76], [15.5, 104], [-15.8, 140], [16, 172]];
  const per = 7;
  const balloons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 14, 10).scale(1, 1.2, 1), std({ roughness: 0.3, metalness: 0.1 }), BALLOON_SPOTS.length * per);
  const meta = [];
  const stringPos = new Float32Array(BALLOON_SPOTS.length * per * 6);
  BALLOON_SPOTS.forEach(([x, z], si) => {
    for (let i = 0; i < per; i++) {
      const idx = si * per + i;
      meta.push({
        x, z, ax: (rng() - 0.5) * 1.1, az: (rng() - 0.5) * 1.1, h: 3.2 + rng() * 2.4, ph: rng() * 6.28, sp: 0.6 + rng() * 0.6,
      });
      balloons.setColorAt(idx, color.set(palette[(si + i) % palette.length]));
    }
    avoid.push({ x, z, hx: 0.3, hz: 0.3 });
  });
  balloons.instanceColor.needsUpdate = true;
  balloons.castShadow = false;
  scene.add(balloons);
  const stringGeo = new THREE.BufferGeometry();
  stringGeo.setAttribute('position', new THREE.BufferAttribute(stringPos, 3));
  const strings = new THREE.LineSegments(stringGeo, new THREE.LineBasicMaterial({ color: '#e5e5e5', transparent: true, opacity: 0.7 }));
  strings.frustumCulled = false;
  scene.add(strings);
  // peso no chão
  for (const [x, z] of BALLOON_SPOTS) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.3, 10), std({ color: '#3a3a3a' }));
    w.position.set(x, 0.3, z);
    scene.add(w);
  }

  // ---------- marcadores dos trechos do Domínio ----------
  const zoneViews = ZONES.map((zn) => {
    const g = new THREE.Group();
    g.position.set(0, 0, zn.z);
    const beamMat = new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 46, 20, 1, true), beamMat);
    beam.position.y = 23;
    const stripeMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    [-1, 1].forEach((sd) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ROAD * 2, 0.6).rotateX(-Math.PI / 2), stripeMat);
      m.position.set(0, 0.04, sd * ZONE.radius);
      g.add(m);
    });
    const label = labelSprite(zn.name);
    label.position.set(0, 17, 0);
    g.add(beam, label);
    scene.add(g);
    return { beamMat, stripeMat, label, beam };
  });

  function setZones(zones) {
    zones.forEach(([owner, prog], i) => {
      const v = zoneViews[i];
      if (!v) return;
      const c = owner >= 0 ? SIDES[owner].color : '#ffffff';
      v.beamMat.color.set(c);
      v.stripeMat.color.set(c);
      v.beamMat.opacity = owner >= 0 ? 0.14 + 0.2 * (prog / 100) : 0.1;
      v.stripeMat.opacity = owner >= 0 ? 0.3 + 0.3 * (prog / 100) : 0.18;
    });
  }

  function update(time) {
    for (let i = 0; i < meta.length; i++) {
      const b = meta[i];
      const sway = Math.sin(time * b.sp + b.ph);
      const x = b.x + b.ax + sway * 0.18;
      const z = b.z + b.az + Math.cos(time * b.sp * 0.8 + b.ph) * 0.18;
      const y = b.h + Math.sin(time * 0.9 + b.ph) * 0.1;
      m4.makeTranslation(x, y, z);
      balloons.setMatrixAt(i, m4);
      stringPos.set([b.x, 0.45, b.z, x, y - 0.4, z], i * 6);
    }
    balloons.instanceMatrix.needsUpdate = true;
    stringGeo.attributes.position.needsUpdate = true;
    for (const v of zoneViews) v.beamMat.opacity += Math.sin(time * 2) * 0.0008;
  }

  return { setZones, update };
}
