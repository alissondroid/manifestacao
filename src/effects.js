import * as THREE from 'three';
import {
  BURST_STYLE, burstShape, pickShow, particleBrightness, particleTint,
} from './fireworks-math.js';

// Efeitos de partículas: fogos de artifício (item da loja) e confete.

const GRAVITY = 7;

// Ponto redondo com brilho suave (o ponto padrão do Three é um quadrado).
let glowTexture = null;
function glow() {
  if (!glowTexture) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glowTexture = new THREE.CanvasTexture(c);
  }
  return glowTexture;
}

// Cor RGBA por ponto (o alfa é o brilho). Mistura normal, não aditiva: a cena é de dia e o aditivo some no céu claro.
const glowPoints = (positions, colors, size) => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size, map: glow(), vertexColors: true, transparent: true, depthWrite: false, fog: false,
  }));
  pts.frustumCulled = false;
  return pts;
};

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.density = 1; // 0.35..1: menos partículas em máquinas lentas
    this.onLaunch = null; // (x, z) quando um foguete sai: o jogo toca o assobio
    this.onBurst = null; // (x, y, z, tipo) quando estoura: o jogo toca o estouro
  }

  /** Salva de três foguetes sobre (x, z): cada um com rastro de faíscas e um estouro de tipo diferente. */
  fireworks(x, z, sideColor) {
    const palette = [new THREE.Color(sideColor), new THREE.Color('#ffd54a'), new THREE.Color('#ff6fae'), new THREE.Color('#6fd0ff'), new THREE.Color('#ffffff')];
    const show = pickShow(3);
    const order = [0, 1, 2].sort(() => Math.random() - 0.5);
    for (let i = 0; i < 3; i += 1) {
      const rx = x + (i - 1) * 5 + (Math.random() - 0.5) * 3;
      const rz = z + (Math.random() - 0.5) * 5;
      const type = show[i];
      const cap = 36;
      this.list.push({
        kind: 'rocket',
        delay: i * 0.5 + Math.random() * 0.15,
        t: 0,
        dur: 1.0 + Math.random() * 0.35,
        x: rx,
        z: rz,
        top: 14 + Math.random() * 8,
        type,
        color: type === 'willow' ? new THREE.Color('#ffcf6a') : palette[order[i] % palette.length],
        wobble: Math.random() * 6,
        cap,
        age: new Float32Array(cap).fill(9),
        next: 1,
        points: null,
        launched: false,
      });
    }
  }

  /** Estouro de `type` em (x, y, z): esfera, anel, salgueiro dourado ou palmeira, com rastro, clarão e cintilar. */
  burst(x, y, z, color, type = 'peony') {
    const style = BURST_STYLE[type] ?? BURST_STYLE.peony;
    const n = Math.max(24, Math.round(style.count * this.density));
    const dirs = burstShape(type, n);
    const spread = type === 'ring' ? 11 : 12.5;
    const pos = new Float32Array(n * 3);
    const vel = [];
    const phase = new Float32Array(n);
    const lifeK = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      pos.set([x, y, z], i * 3);
      const d = dirs[i];
      const sp = spread * d.speed * (type === 'willow' ? 0.9 : 1);
      vel.push(new THREE.Vector3(d.x * sp, d.y * sp, d.z * sp));
      phase[i] = Math.random() * 100;
      lifeK[i] = 0.75 + Math.random() * 0.25;
    }
    const main = glowPoints(pos, new Float32Array(n * 4), style.size * 2.1);
    // rastro: fantasmas das últimas posições, cada vez mais fracos
    const trails = style.trails;
    const hist = new Float32Array(trails * n * 3);
    for (let g = 0; g < trails; g += 1) for (let i = 0; i < n; i += 1) hist.set([x, y, z], (g * n + i) * 3);
    const ghosts = glowPoints(hist, new Float32Array(trails * n * 4), style.size * 1.5);
    this.scene.add(ghosts);
    this.scene.add(main);

    // clarão do estouro: brilho grande que apaga rápido
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow(), color, transparent: true, depthWrite: false, fog: false, opacity: 1,
    }));
    flash.position.set(x, y, z);
    flash.scale.setScalar(2);
    this.scene.add(flash);
    this.list.push({ kind: 'flash', t: 0, dur: 0.45, sprite: flash });
    this.list.push({
      kind: 'fw', t: 0, dur: style.life, style, points: main, ghosts, n, vel, phase, lifeK, base: [color.r, color.g, color.b], hist, histClock: 0, trails,
    });
    this.onBurst?.(x, y, z, type);
  }

  /** Faíscas de impacto num golpe (kind: punch, kick, baton, car, tomato). */
  hit(x, y, z, kind = 'punch') {
    const n = kind === 'car' ? 34 : 18;
    const tone = { punch: '#ffe08a', kick: '#ffd0a0', baton: '#ff9a3c', car: '#ffffff', tomato: '#e53935' }[kind] ?? '#ffffff';
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const vel = [];
    const c = new THREE.Color(tone);
    for (let i = 0; i < n; i++) {
      pos.set([x, y, z], i * 3);
      col.set([c.r, c.g, c.b], i * 3);
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 0.6;
      const sp = 2.5 + Math.random() * (kind === 'car' ? 5 : 3.5);
      vel.push(new THREE.Vector3(Math.cos(a) * sp, u * sp, Math.sin(a) * sp));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: kind === 'car' ? 0.32 : 0.24, vertexColors: true, transparent: true, depthWrite: false, blending: kind === 'tomato' ? THREE.NormalBlending : THREE.AdditiveBlending, fog: false,
    }));
    points.frustumCulled = false;
    this.scene.add(points);
    this.list.push({ kind: 'burst', t: 0, dur: 0.45, points, vel });
  }

  confetti(x, z) {
    const n = 70;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const vel = [];
    const colors = ['#d7192b', '#169b45', '#f2c20f', '#2f5fbf', '#ffffff'].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      pos.set([x + (Math.random() - 0.5) * 6, 8 + Math.random() * 3, z + (Math.random() - 0.5) * 6], i * 3);
      const c = colors[i % colors.length];
      col.set([c.r, c.g, c.b], i * 3);
      vel.push(new THREE.Vector3((Math.random() - 0.5) * 2, -1 - Math.random(), (Math.random() - 0.5) * 2));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, depthWrite: false, fog: false }));
    points.frustumCulled = false;
    this.scene.add(points);
    this.list.push({ kind: 'confetti', t: 0, dur: 5, points, vel });
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.t += dt;
      if (e.kind === 'rocket') {
        if (e.t < e.delay) continue;
        if (!e.points) {
          const pos = new Float32Array(e.cap * 3);
          for (let j = 0; j < e.cap; j += 1) pos.set([e.x, 1.2, e.z], j * 3);
          e.points = glowPoints(pos, new Float32Array(e.cap * 4), 1.0);
          this.scene.add(e.points);
        }
        if (!e.launched) { e.launched = true; this.onLaunch?.(e.x, e.z); }
        const k = Math.min(1, (e.t - e.delay) / e.dur);
        const rise = 1 - (1 - k) * (1 - k);
        const hy = 1.2 + (e.top - 1.2) * rise;
        const hx = e.x + Math.sin(e.t * 9 + e.wobble) * 0.18 * (1 - k);
        const attr = e.points.geometry.attributes.position;
        const col = e.points.geometry.attributes.color;
        // cabeça brilhante + faíscas que ficam para trás, caem e apagam
        attr.setXYZ(0, hx, hy, e.z);
        col.setXYZW(0, 1, 0.93, 0.7, 1);
        for (let n = 0; n < 2; n += 1) {
          const slot = e.next;
          e.next = e.next >= e.cap - 1 ? 1 : e.next + 1;
          attr.setXYZ(slot, hx + (Math.random() - 0.5) * 0.25, hy - Math.random() * 0.4, e.z + (Math.random() - 0.5) * 0.25);
          e.age[slot] = 0;
        }
        for (let j = 1; j < e.cap; j += 1) {
          e.age[j] += dt;
          const life = 0.55;
          const f = Math.max(0, 1 - e.age[j] / life);
          attr.setY(j, attr.getY(j) - dt * (1.5 + (1 - f) * 2));
          col.setXYZW(j, 1, 0.55 + 0.35 * f, 0.15 + 0.2 * f * f, f * 0.9);
        }
        attr.needsUpdate = true;
        col.needsUpdate = true;
        if (k >= 1) {
          this.burst(e.x, e.top, e.z, e.color, e.type);
          this.dispose(e);
          this.list.splice(i, 1);
        }
      } else if (e.kind === 'flash') {
        const k = e.t / e.dur;
        e.sprite.scale.setScalar(2 + k * 16);
        e.sprite.material.opacity = 0.75 * Math.max(0, (1 - k) ** 2);
        if (k >= 1) {
          this.scene.remove(e.sprite);
          e.sprite.material.dispose();
          this.list.splice(i, 1);
        }
      } else if (e.kind === 'fw') {
        const { style, n, vel, phase, lifeK } = e;
        const attr = e.points.geometry.attributes.position;
        const col = e.points.geometry.attributes.color;
        const drag = Math.exp(-style.drag * dt);
        // guarda a posição anterior a cada ~35 ms para o rastro
        e.histClock += dt;
        const shift = e.histClock >= 0.035;
        if (shift) {
          e.histClock = 0;
          for (let g = e.trails - 1; g > 0; g -= 1) e.hist.copyWithin(g * n * 3, (g - 1) * n * 3, g * n * 3);
          e.hist.set(attr.array.subarray(0, n * 3), 0);
        }
        const gAttr = e.ghosts.geometry.attributes.position;
        const gCol = e.ghosts.geometry.attributes.color;
        const k = e.t / e.dur;
        for (let j = 0; j < n; j += 1) {
          const v = vel[j];
          v.y -= style.gravity * dt;
          v.multiplyScalar(drag);
          attr.setXYZ(j, attr.getX(j) + v.x * dt, Math.max(0.05, attr.getY(j) + v.y * dt), attr.getZ(j) + v.z * dt);
          const kj = e.t / (e.dur * lifeK[j]);
          const b = particleBrightness(kj, phase[j], 0.55);
          const [r, g, bl] = particleTint(kj, e.base);
          col.setXYZW(j, r, g, bl, b);
          for (let t = 0; t < e.trails; t += 1) {
            const idx = t * n + j;
            gAttr.setXYZ(idx, e.hist[idx * 3], e.hist[idx * 3 + 1], e.hist[idx * 3 + 2]);
            const fade = b * 0.55 / (t + 1) ** 1.3;
            gCol.setXYZW(idx, r, g, bl, fade);
          }
        }
        attr.needsUpdate = true;
        col.needsUpdate = true;
        gAttr.needsUpdate = true;
        gCol.needsUpdate = true;
        if (k >= 1) { this.dispose(e); this.list.splice(i, 1); }
      } else {
        const attr = e.points.geometry.attributes.position;
        const k = e.t / e.dur;
        for (let j = 0; j < e.vel.length; j++) {
          const v = e.vel[j];
          if (e.kind === 'burst') { v.y -= GRAVITY * dt; v.multiplyScalar(1 - dt * 0.9); } else { v.x += Math.sin(e.t * 3 + j) * dt * 2; }
          attr.setXYZ(j, attr.getX(j) + v.x * dt, Math.max(0.05, attr.getY(j) + v.y * dt), attr.getZ(j) + v.z * dt);
        }
        attr.needsUpdate = true;
        e.points.material.opacity = e.kind === 'burst' ? Math.max(0, 1 - k * k) : Math.min(1, (1 - k) * 3);
        if (k >= 1) { this.dispose(e); this.list.splice(i, 1); }
      }
    }
  }

  dispose(e) {
    for (const pts of [e.points, e.ghosts]) {
      if (!pts) continue;
      this.scene.remove(pts);
      pts.geometry.dispose();
      pts.material.dispose();
    }
  }
}
