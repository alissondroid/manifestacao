import * as THREE from 'three';

// Efeitos de partículas: fogos de artifício (item da loja) e confete.

const GRAVITY = 7;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  /** Três foguetes sobem sobre (x, z) e explodem em cores do lado e douradas. */
  fireworks(x, z, sideColor) {
    const palette = [new THREE.Color(sideColor), new THREE.Color('#ffd54a'), new THREE.Color('#ffffff')];
    for (let i = 0; i < 3; i++) {
      const rx = x + (i - 1) * 4 + (Math.random() - 0.5) * 2;
      const rz = z + (Math.random() - 0.5) * 4;
      const top = 13 + Math.random() * 6;
      this.list.push({
        kind: 'rocket', delay: i * 0.45, t: 0, dur: 0.9, x: rx, z: rz, top, color: palette[i % palette.length], points: null,
      });
    }
  }

  burst(x, y, z, color) {
    const n = 110;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const vel = [];
    const tint = new THREE.Color();
    for (let i = 0; i < n; i++) {
      pos.set([x, y, z], i * 3);
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const sp = 4 + Math.random() * 4;
      vel.push(new THREE.Vector3(r * Math.cos(a) * sp, u * sp, r * Math.sin(a) * sp));
      tint.copy(color).lerp(new THREE.Color('#ffffff'), Math.random() * 0.35);
      col.set([tint.r, tint.g, tint.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.55, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    this.list.push({ kind: 'burst', t: 0, dur: 2.2, points, vel });
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
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([e.x, 1.5, e.z]), 3));
          e.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.6, color: '#ffe9a6', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
          e.points.frustumCulled = false;
          this.scene.add(e.points);
        }
        const k = Math.min(1, (e.t - e.delay) / e.dur);
        e.points.geometry.attributes.position.setY(0, 1.5 + (e.top - 1.5) * (1 - (1 - k) * (1 - k)));
        e.points.geometry.attributes.position.needsUpdate = true;
        if (k >= 1) {
          this.burst(e.x, e.top, e.z, e.color);
          this.dispose(e);
          this.list.splice(i, 1);
        }
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
    if (!e.points) return;
    this.scene.remove(e.points);
    e.points.geometry.dispose();
    e.points.material.dispose();
  }
}
