import * as THREE from 'three';
import { SIDES, SKINS, MODELS, WORLD } from '../shared/config.js';
import { createCharacter } from './models.js';
import { grayMap, aimBone, HEIGHT_SCALE } from './avatar.js';
import { flagTexture } from './textures.js';
import { picanhaSkewerGeometry, propMaterial } from './props.js';
import {
  ageCharacter, createReadingGlasses, createCane, poseElderly, updateCane,
} from './aging.js';
import { attachToBone } from './avatar.js';

// Multidão de figurantes com os mesmos modelos humanos dos jogadores (um esqueleto animado
// por pessoa). Cada lado se concentra em um ponto da avenida e usa suas cores de camisa.

const BASE_SKIN = new THREE.Color('#f3d2b8');
const SHIRT_BY_SIDE = [
  ['#d7192b', '#d7192b', '#f4f4f2', '#8f1019', '#1f2933'],
  ['#f2c20f', '#f2c20f', '#1e8a47', '#f4f4f2', '#2f5fbf'],
  ['#111111', '#111111', '#1f1f22', '#b3121b'],
  ['#f4f4f2', '#f2c20f', '#2f5fbf', '#e86aa6', '#16a34a', '#d7d7d2'],
];
const PANTS_COLORS = ['#35507a', '#20252b', '#b9a37c', '#4b6b9c', '#2c3a52', '#6b6f75'];
const SIDE_WEIGHTS = [0.38, 0.38, 0.08, 0.16];
const CLUSTERS = [
  { x: 2.1, z: -42, side: 0, sx: 6, sz: 6 }, // em frente ao carro de som (que fica em z = -30)
  { x: -2.1, z: 56, side: 1, sx: 6, sz: 6 },
  { x: 9, z: -8, side: 3, sx: 4, sz: 6 },
  { x: -9, z: 100, side: 2, sx: 4, sz: 6 },
  { x: 6, z: -96, side: 3, sx: 4, sz: 6 },
  { x: -8, z: -60, side: 0, sx: 4, sz: 6 },
  { x: 8, z: 80, side: 1, sx: 4, sz: 6 },
];
const HIDE_FAR = ['Wolf3D_Teeth', 'EyeLeft', 'EyeRight']; // detalhes que não se veem de longe

export function createCrowd(scene, rng, avoid, count = 110) {
  const rr = (a, b) => a + rng() * (b - a);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const weighted = (w) => { let r = rng(); for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; } return w.length - 1; };
  const blocked = (x, z) => avoid.some((a) => Math.abs(x - a.x) < a.hx + 0.7 && Math.abs(z - a.z) < a.hz + 0.7);

  const people = [];
  const _dir = new THREE.Vector3();
  const _hand = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  function aimArm(bones, group, k) {
    group.updateMatrixWorld(true);
    group.getWorldQuaternion(_q);
    aimBone(bones.leftArm, bones.leftForeArm, _dir.set(0.25, -0.55, 0.75).normalize().applyQuaternion(_q).clone(), k);
    aimBone(bones.leftForeArm, bones.leftHand, _dir.set(0, 0.45, 0.85).normalize().applyQuaternion(_q).clone(), k);
  }

  const flagTex = [flagTexture('brasil'), ...SIDES.map((s) => flagTexture('candidato', s.id))];
  const poleGeo = new THREE.CylinderGeometry(0.013, 0.013, 1.9, 5).translate(0, 0.65, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: '#d4d4d0', metalness: 0.3, roughness: 0.5 });
  const planeGeo = new THREE.PlaneGeometry(0.9, 0.6).translate(-0.45, 1.05, 0);
  const flagMats = flagTex.map((map) => new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: 0.85 }));

  for (let i = 0; i < count; i++) {
    let x; let z; let side;
    do {
      if (rng() < 0.85) {
        const c = pick(CLUSTERS);
        x = c.x + (rng() + rng() + rng() - 1.5) * c.sx;
        z = c.z + (rng() + rng() + rng() - 1.5) * c.sz;
        side = c.side;
      } else {
        x = rr(-WORLD.halfWidth + 0.5, WORLD.halfWidth - 0.5);
        z = rr(-112, 112);
        side = weighted(SIDE_WEIGHTS);
      }
    } while (blocked(x, z) || Math.abs(x) > WORLD.halfWidth - 0.2);

    const kind = rng() < 0.5 ? 'male' : 'female';
    const elderly = rng() < 0.2;
    // O modelo do Ready Player Me é leve (16 mil triângulos) e aceita tingir; os do Mixamo têm ~55 mil.
    // Só alguns figurantes usam os pesados.
    const heavy = rng() < 0.18;
    const pool = MODELS.male.filter((m) => m !== 'rpm');
    const c = createCharacter(kind === 'female' ? pick(MODELS.female) : (heavy ? pick(pool) : 'rpm'));
    const group = new THREE.Group();
    group.add(c.root);
    group.position.set(x, 0, z);
    const yaw = rng() * Math.PI * 2;
    group.rotation.y = yaw;
    scene.add(group);

    if (c.tintable) {
      const skin = new THREE.Color(pick(SKINS));
      const tint = new THREE.Color(skin.r / BASE_SKIN.r, skin.g / BASE_SKIN.g, skin.b / BASE_SKIN.b);
      c.mats.skinHead.color.copy(tint);
      c.mats.skinBody.color.copy(tint);
      for (const key of ['top', 'bottom']) if (c.mats[key]?.map) c.mats[key].map = grayMap(c.mats[key].map);
      c.mats.top.color.set(rng() < 0.85 ? pick(SHIRT_BY_SIDE[side]) : pick(SHIRT_BY_SIDE[3]));
      c.mats.bottom.color.set(pick(PANTS_COLORS));
      if (c.meshes.Wolf3D_Beard) c.meshes.Wolf3D_Beard.visible = rng() < 0.5;
      for (const name of HIDE_FAR) if (c.meshes[name]) c.meshes[name].visible = false;
    }
    let cane = null;
    if (elderly) {
      ageCharacter(c);
      group.updateMatrixWorld(true);
      attachToBone(createReadingGlasses(), c.bones.head, group, [0, 0.075, 0.1]);
      cane = createCane();
      group.add(cane);
    }
    c.bones.hips.scale.setScalar(pick(HEIGHT_SCALE) * rr(0.98, 1.02));
    c.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

    const mixer = new THREE.AnimationMixer(c.root);
    const walker = rng() < 0.25 && !(Math.abs(x) < 6 && Math.abs(z) < 16);
    const dancer = !walker && !elderly && rng() < 0.2;
    const clapper = !walker && !dancer && !!c.clips.clap && rng() < 0.22;
    const action = mixer.clipAction(walker ? c.clips.walk : dancer ? c.clips.dance : clapper ? c.clips.clap : c.clips.idle);
    action.timeScale = (walker ? 1 : rr(0.9, 1.1)) * (elderly ? 0.75 : 1);
    action.play();
    mixer.update(rr(0, 10));

    // bandeira: -1 nenhuma, 0 Brasil, 1 + lado
    let flag = -1;
    const roll = rng();
    if (side === 3) flag = roll < 0.3 ? 0 : roll < 0.42 ? 1 + side : -1;
    else if (side === 2) flag = roll < 0.45 ? 1 + side : -1;
    else flag = roll < 0.15 ? 0 : roll < 0.5 ? 1 + side : -1;
    let holder = null;
    if (clapper) flag = -1; // quem aplaude está de mãos livres
    if (!clapper && flag < 0 && !walker && !elderly && rng() < 0.12) { // espetinho de picanha comprado na calçada
      holder = new THREE.Group();
      const food = new THREE.Mesh(picanhaSkewerGeometry(), propMaterial);
      food.position.y = -0.07;
      food.scale.setScalar(1.15);
      holder.add(food);
      group.add(holder);
    } else if (flag >= 0 && !walker) {
      holder = new THREE.Group();
      holder.add(new THREE.Mesh(poleGeo, poleMat), new THREE.Mesh(planeGeo, flagMats[flag]));
      holder.children[1].castShadow = true;
      group.add(holder); // o braço é erguido e a haste segue a mão a cada quadro (ver update)
    }

    people.push({
      group, mixer, walker, x, z, yaw, speed: rr(0.6, 1.0) * (elderly ? 0.6 : 1), range: rr(3, 10), phase: rr(0, 6.28), holder, bones: c.bones, cane,
    });
  }

  let last = 0;
  let frame = 0;
  /** `fx, fz`: ponto de interesse (jogador/câmera). Quem está longe anima a 1/3 da taxa. */
  /** Figurante atropelado: cai e desliza na direção do carro, levanta depois de 3 s. */
  function knock(p, dx, dz, time) {
    if (p.knocked) return;
    const len = Math.hypot(dx, dz) || 1;
    p.knocked = { until: time + 3, dx: (dx / len) * 2.2, dz: (dz / len) * 2.2, lift: 0 };
    p.group.rotation.y = Math.atan2(dx, dz); // de costas para o carro…
    p.group.rotation.x = -Math.PI / 2 + 0.12; // …e deitado
    p.group.rotation.y += Math.PI;
  }

  /** `cars`: [{ x, z, vx, vz }] em movimento; quem for atingido cai. */
  function update(time, fx = 0, fz = 0, cars = []) {
    const dt = Math.min(0.1, time - last);
    last = time;
    frame += 1;
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      if (p.knocked) {
        const k = p.knocked;
        if (time < k.until) {
          const slow = Math.max(0, 1 - (time - (k.until - 3)) / 0.8); // desliza e para
          p.group.position.x += k.dx * slow * dt;
          p.group.position.z += k.dz * slow * dt;
        } else { // levanta
          p.knocked = null;
          p.group.rotation.x = 0;
          p.group.rotation.y = p.yaw;
        }
        continue;
      }
      for (const c of cars) {
        const ddx = p.group.position.x - c.x;
        const ddz = p.group.position.z - c.z;
        if (Math.abs(ddx) < 1.45 && Math.abs(ddz) < 2.6 && ddx * ddx + ddz * ddz < 4.6) { knock(p, c.vx || ddx, c.vz || ddz, time); break; }
      }
      if (p.knocked) continue;
      const far = Math.hypot(p.group.position.x - fx, p.group.position.z - fz) > 55;
      if (far && (frame + i) % 3) continue;
      p.mixer.update(far ? dt * 3 : dt);
      if (p.cane) {
        poseElderly(p.bones, p.group);
        updateCane(p.cane, p.bones.rightHand, p.group);
      }
      if (p.holder) {
        aimArm(p.bones, p.group, 1);
        p.bones.leftHand.getWorldPosition(_hand);
        p.holder.position.copy(p.group.worldToLocal(_hand));
      }
      if (p.walker) {
        const a = time * p.speed * 0.4 + p.phase;
        p.group.position.z = p.z + Math.sin(a) * p.range;
        p.group.rotation.y = Math.cos(a) >= 0 ? 0 : Math.PI;
      }
    }
  }

  return { update, people };
}
