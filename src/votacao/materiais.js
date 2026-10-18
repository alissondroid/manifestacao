import * as THREE from 'three';
import { canvasTexture } from '../textures.js';

// Materiais "de verdade" para as ruas brasileiras: reboco gasto com mancha de chuva, tijolo baiano sem reboco,
// telha colonial, muro chapiscado, pedra portuguesa e folha de palmeira. Tudo desenhado em canvas.
// As texturas são claras e neutras: a cor da casa vem do material (multiplica a textura).

const rnd = (a, b) => a + Math.random() * (b - a);
const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

function noise(ctx, w, h, n, alpha, size = 2) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(rnd(60, 255));
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

/** Reboco pintado: granulado, manchas, escorrido de chuva e a barra suja perto do chão. Um tile = 3 m × 3 m. */
export const rebocoTex = () => once('reboco', () => canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#f2f0ea'; ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 9000, 0.12);
  for (let i = 0; i < 14; i++) { // manchas de umidade
    const g = ctx.createRadialGradient(rnd(0, w), rnd(0, h), 2, rnd(0, w), rnd(0, h), rnd(20, 70));
    g.addColorStop(0, 'rgba(120,110,95,0.10)'); g.addColorStop(1, 'rgba(120,110,95,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  for (let i = 0; i < 10; i++) { // escorrido de chuva
    const x = rnd(0, w); const len = rnd(30, 120);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(70,65,60,0.16)'); g.addColorStop(1, 'rgba(70,65,60,0)');
    ctx.fillStyle = g; ctx.fillRect(x, 0, rnd(2, 6), len);
  }
  ctx.strokeStyle = 'rgba(90,85,80,0.25)'; ctx.lineWidth = 1; // trincas
  for (let i = 0; i < 4; i++) { let x = rnd(0, w); let y = rnd(0, h); ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rnd(-8, 8); y += rnd(4, 12); ctx.lineTo(x, y); } ctx.stroke(); }
}));

/** Barra suja do rodapé (respingo de chuva e poeira), para usar numa faixa separada. */
export const rodapeTex = () => once('rodape', () => canvasTexture(256, 64, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(150,135,115,1)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 2500, 0.2);
}));

/** Tijolo baiano (cerâmico, furado) com argamassa escorrida: casa "em construção" de toda periferia. */
export const tijoloTex = () => once('tijolo', () => canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#b8a48c'; ctx.fillRect(0, 0, w, h);
  const bw = 64; const bh = 32;
  for (let r = 0; r < h / bh; r++) {
    for (let c = -1; c < w / bw + 1; c++) {
      const x = c * bw + (r % 2 ? bw / 2 : 0); const y = r * bh;
      ctx.fillStyle = `hsl(${rnd(14, 22)},${rnd(48, 62)}%,${rnd(40, 52)}%)`;
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      ctx.fillStyle = 'rgba(60,25,10,0.25)';
      for (let k = 0; k < 3; k++) ctx.fillRect(x + 10 + k * 17, y + 10, 9, 12); // furos aparecendo
    }
  }
  noise(ctx, w, h, 4000, 0.12);
}));

/** Telha colonial: fileiras de telhas curvas, com sombra e musgo. */
export const telhaTex = () => once('telha', () => canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  const tw = 32; const th = 40;
  for (let r = 0; r < h / th + 1; r++) {
    for (let c = 0; c < w / tw; c++) {
      const x = c * tw; const y = r * th;
      const g = ctx.createLinearGradient(x, 0, x + tw, 0);
      const l = rnd(78, 92);
      g.addColorStop(0, `hsl(0,0%,${l - 30}%)`); g.addColorStop(0.5, `hsl(0,0%,${l}%)`); g.addColorStop(1, `hsl(0,0%,${l - 34}%)`);
      ctx.fillStyle = g; ctx.fillRect(x, y, tw, th);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y + th - 5, tw, 5);
    }
  }
  for (let i = 0; i < 18; i++) { ctx.fillStyle = 'rgba(60,80,40,0.18)'; ctx.fillRect(rnd(0, w), rnd(0, h), rnd(10, 30), rnd(4, 10)); }
}));

/** Muro chapiscado (cimento áspero). */
export const chapiscoTex = () => once('chapisco', () => canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#d9d6cf'; ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 16000, 0.25, 3);
  noise(ctx, w, h, 5000, 0.35, 1);
}));

/** Pedra portuguesa: as ondas do calçadão (Rio) ou o mosaico de quadrados (outras cidades). */
export const pedraPortuguesaTex = (ondas) => once(`pedra-${ondas}`, () => canvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#efebe3'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#26231f';
  if (ondas) {
    for (let x = 0; x < w; x += 2) {
      const y1 = h * 0.25 + Math.sin((x / w) * Math.PI * 4) * h * 0.13;
      ctx.fillRect(x, y1, 2, h * 0.17);
      const y2 = h * 0.75 + Math.sin((x / w) * Math.PI * 4 + Math.PI) * h * 0.13;
      ctx.fillRect(x, y2, 2, h * 0.17);
    }
  } else {
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) if (((x + y) / 64) % 2) ctx.fillRect(x + 6, y + 6, 52, 52);
  }
  ctx.strokeStyle = 'rgba(120,110,100,0.35)'; ctx.lineWidth = 1; // as pedrinhas
  for (let y = 0; y < h; y += 9) for (let x = (y / 9) % 2 ? 4 : 0; x < w; x += 9) ctx.strokeRect(x, y, 8, 8);
}));

/** Folha de palmeira com folíolos, com transparência. */
export const folhaPalmeiraTex = () => once('folha', () => canvasTexture(128, 512, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#4a6b2f'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(w / 2, h); ctx.lineTo(w / 2, 0); ctx.stroke();
  for (let y = 10; y < h - 10; y += 7) {
    const len = (w / 2 - 4) * Math.sin((y / h) * Math.PI) + 6;
    for (const s of [-1, 1]) {
      ctx.strokeStyle = `hsl(${rnd(90, 115)},${rnd(40, 55)}%,${rnd(24, 36)}%)`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(w / 2, y); ctx.lineTo(w / 2 + s * len, y + 18); ctx.stroke();
    }
  }
}, { tile: false }));

/** Ajusta as UVs para a textura repetir a cada `metros` (as caixas e planos ficam sem esticar). */
export function uvMeters(geo, sx, sy, metros = 3) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx / metros, uv.getY(i) * sy / metros);
  uv.needsUpdate = true;
  return geo;
}

/** Caixa com UVs proporcionais por face (largura w, altura h, profundidade d). */
export function boxGeo(w, h, d, metros = 3) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // ordem das faces: +x, -x, +y, -y, +z, -z (4 vértices cada)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [a, b] = dims[f];
    for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * a / metros, uv.getY(i) * b / metros); }
  }
  uv.needsUpdate = true;
  return g;
}

/** Telhado de duas águas de verdade (duas rampas e as empenas), com telha colonial. */
export function telhadoGeo(w, d, h) {
  const geo = new THREE.BufferGeometry();
  const x = w / 2 + 0.35; const z = d / 2 + 0.35;
  const p = [
    -x, 0, -z, 0, h, -z, 0, h, z, -x, 0, -z, 0, h, z, -x, 0, z, // rampa esquerda
    x, 0, -z, x, 0, z, 0, h, z, x, 0, -z, 0, h, z, 0, h, -z, // rampa direita
  ];
  const s = Math.hypot(x, h);
  const uv = [0, 0, s, 0, s, 2 * z, 0, 0, s, 2 * z, 0, 2 * z, 0, 0, 0, 2 * z, s, 2 * z, 0, 0, s, 2 * z, s, 0].map((v) => v / 2);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}
export function empenaGeo(w, h) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, h, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w / 3, 0, w / 6, h / 3], 2));
  geo.computeVertexNormals();
  return geo;
}
