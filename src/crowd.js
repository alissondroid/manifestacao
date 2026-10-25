import * as THREE from 'three';
import {
  SIDES, SKINS, MODELS, WORLD, MELEE, CROWD, NPCS,
} from '../shared/config.js';
import { createCharacter } from './models.js';
import { aimBone, HEIGHT_SCALE } from './avatar.js';
import { flagTexture } from './textures.js';
import { picanhaSkewerGeometry, propMaterial } from './props.js';
import {
  ageCharacter, createReadingGlasses, createCane, poseElderly, updateCane,
} from './aging.js';
import { attachToBone } from './avatar.js';
import {
  NPC_ROLES, createCooler, createWaterSign, createPoliceCap, createBelt, createMic, createCamera,
} from './npcs.js';

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
  { x: 8.5, z: 28, side: 1, sx: 4, sz: 6 },
  { x: -8.5, z: 14, side: 0, sx: 4, sz: 6 },
  { x: -6, z: -22, side: 3, sx: 4, sz: 6 },
  { x: 7, z: -72, side: 2, sx: 4, sz: 6 },
  { x: -7, z: 76, side: 3, sx: 4, sz: 6 },
  { x: 2.4, z: 20, side: 0, sx: 5, sz: 5 }, // meio da avenida, entre os grupos
];
const HIDE_FAR = ['Wolf3D_Teeth', 'EyeLeft', 'EyeRight']; // detalhes que não se veem de longe

export function createCrowd(scene, rng, avoid, count = CROWD.counts[0]) {
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
    // O modelo do Ready Player Me é leve (16 mil triângulos) e aceita tingir.
    // Só alguns figurantes usam os pesados.
    const c = createCharacter(kind === 'female' ? pick(MODELS.female) : 'rpm');
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
      c.outfit.skin.copy(skin);
      if (c.meshes.Wolf3D_Beard) c.meshes.Wolf3D_Beard.visible = rng() < 0.5;
      for (const name of HIDE_FAR) if (c.meshes[name]) c.meshes[name].visible = false;
    }
    if (c.outfit) { // camiseta nas cores do lado e bermuda
      c.outfit.top.set(rng() < 0.85 ? pick(SHIRT_BY_SIDE[side]) : pick(SHIRT_BY_SIDE[3]));
      c.outfit.bottom.set(pick(PANTS_COLORS));
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
      clips: c.clips, base: action, hitUntil: 0, hitAction: null, shove: null,
    });
  }

  // ---------- figurantes especiais ----------
  const faceTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az); // giro para a pessoa em A olhar para B
  function addNpc(role, x, z, {
    yaw = rng() * Math.PI * 2, female = false, walker = false, holder = null, cap = false, belt = false, cooler = false,
  }) {
    const def = NPC_ROLES[role];
    const c = createCharacter(female ? pick(MODELS.female) : 'rpm');
    const group = new THREE.Group();
    group.add(c.root);
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    scene.add(group);
    if (c.tintable) {
      const skin = new THREE.Color(pick(SKINS));
      const tint = new THREE.Color(skin.r / BASE_SKIN.r, skin.g / BASE_SKIN.g, skin.b / BASE_SKIN.b);
      c.mats.skinHead.color.copy(tint);
      c.mats.skinBody.color.copy(tint);
      c.outfit.skin.copy(skin);
      if (c.meshes.Wolf3D_Beard) c.meshes.Wolf3D_Beard.visible = !female && rng() < 0.4;
      for (const name of HIDE_FAR) if (c.meshes[name]) c.meshes[name].visible = false;
    }
    if (c.outfit) {
      c.outfit.top.set(pick(def.top));
      c.outfit.bottom.set(pick(def.bottom));
    }
    const hs = pick(HEIGHT_SCALE);
    c.bones.hips.scale.setScalar(hs);
    group.updateMatrixWorld(true);
    if (cap) { // quepe: mesma medida do boné do avatar
      const hd = c.head || { top: 0.23, radius: 0.1, cx: 0, cz: 0.01 };
      const capR = Math.max(0.105, hd.radius * hs + 0.015);
      const wrap = new THREE.Group();
      const hat = createPoliceCap();
      hat.scale.setScalar(capR / 0.115);
      wrap.add(hat);
      attachToBone(wrap, c.bones.head, group, [hd.cx * hs, hd.top * hs + 0.012 - capR, hd.cz * hs]);
    }
    if (belt) attachToBone(createBelt(), c.bones.hips, group, [-0.2, 0.0, 0.02]);
    if (cooler) attachToBone(createCooler(), c.bones.hips, group, [0.3, -0.12, 0.04]);
    c.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    if (holder) group.add(holder);

    const mixer = new THREE.AnimationMixer(c.root);
    const action = mixer.clipAction(walker ? c.clips.walk : c.clips.idle);
    action.timeScale = walker ? 0.8 : rr(0.9, 1.1);
    action.play();
    mixer.update(rr(0, 10));
    people.push({
      group, mixer, walker, x, z, yaw, speed: rr(0.35, 0.55), range: rr(5, 9), phase: rr(0, 6.28), holder, bones: c.bones, cane: null,
      clips: c.clips, base: action, hitUntil: 0, hitAction: null, shove: null, special: role,
    });
    return group;
  }

  // onde cada tipo aparece: perto dos grupos, mas fora dos obstáculos
  const near = (c, spread) => {
    for (let n = 0; n < 40; n++) {
      const x = c.x + (rng() - 0.5) * spread;
      const z = c.z + (rng() - 0.5) * spread;
      if (!blocked(x, z) && !blocked(x + 1.6, z) && !blocked(x - 1.6, z) && Math.abs(x) < WORLD.halfWidth - 0.6) return { x, z };
    }
    return null;
  };
  for (let i = 0; i < NPCS.water; i++) {
    const s = near(CLUSTERS[(i * 2) % CLUSTERS.length], 10);
    if (s) addNpc('water', s.x, s.z, { walker: true, holder: createWaterSign(), cooler: true });
  }
  for (let i = 0; i < NPCS.policePairs; i++) {
    const s = near(CLUSTERS[(i * 3 + 1) % CLUSTERS.length], 8);
    if (!s) continue;
    const yaw = rng() < 0.5 ? 0 : Math.PI;
    addNpc('police', s.x, s.z, { yaw, cap: true, belt: true });
    addNpc('police', s.x + 1.3, s.z + (rng() - 0.5) * 0.6, { yaw: yaw + rr(-0.4, 0.4), cap: true, belt: true, female: i % 2 === 1 });
  }
  for (let i = 0; i < NPCS.pressTeams; i++) {
    const s = near(CLUSTERS[(i * 2 + 3) % CLUSTERS.length], 12);
    if (!s) continue;
    const a = rng() * Math.PI * 2;
    const cx = s.x + Math.cos(a) * 1.7;
    const cz = s.z + Math.sin(a) * 1.7;
    if (blocked(cx, cz) || Math.abs(cx) > WORLD.halfWidth - 0.4) continue;
    addNpc('reporter', s.x, s.z, { yaw: faceTo(s.x, s.z, cx, cz), holder: createMic(), female: i % 2 === 0 });
    addNpc('camera', cx, cz, { yaw: faceTo(cx, cz, s.x, s.z), holder: createCamera() });
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

  /** Toca um clipe de reação uma vez por cima da animação do figurante; `update` o devolve ao que fazia. */
  function react(p, name, speed, time) {
    const clip = p.clips[name];
    if (!clip) return false;
    const a = p.mixer.clipAction(clip);
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = speed;
    p.base.fadeOut(0.08);
    a.fadeIn(0.05).play();
    p.hitAction = a;
    p.hitUntil = time + clip.duration / speed;
    return true;
  }

  // Como cada figurante reage a cada golpe (empurrão em metros e clipe de reação).
  const REACTIONS = {
    punch: { clip: 'hitHead', speed: 1, push: 0.45 },
    kick: { clip: 'hit', speed: 1, push: 1.1, fall: 0.35 }, // o chute às vezes derruba
    baton: { clip: 'knockback', speed: 1, push: 1.0 },
    tomato: { clip: 'hitHead', speed: 1.35, push: 0 },
  };

  /**
   * Um golpe de quem está em (x, z) virado para `ry`: o figurante mais próximo dentro do alcance e do arco
   * (mesma geometria do servidor, em `MELEE`) cambaleia. `spec` pode vir de fora (ex.: tomate: alcance = distância).
   * Retorna o figurante atingido ou null. Só visual: a multidão é local.
   */
  function hit(x, z, ry, kind, spec = MELEE[kind]) {
    const rule = REACTIONS[kind];
    if (!rule || !spec) return null;
    let target = null;
    let best = spec.reach;
    for (const p of people) {
      if (p.knocked || p.hitUntil || !p.group.visible) continue;
      const ox = p.group.position.x - x;
      const oz = p.group.position.z - z;
      const d = Math.hypot(ox, oz);
      if (d > best || d < 0.05) continue;
      const a = Math.atan2(ox, oz);
      if (Math.abs(Math.atan2(Math.sin(a - ry), Math.cos(a - ry))) > spec.arc) continue;
      best = d;
      target = p;
    }
    if (!target) return null;
    const dx = target.group.position.x - x;
    const dz = target.group.position.z - z;
    const len = Math.hypot(dx, dz) || 1;
    if (Math.random() < (rule.fall || 0)) knock(target, dx, dz, last);
    else {
      if (!target.walker) target.group.rotation.y = Math.atan2(-dx, -dz); // vira para quem bateu
      react(target, rule.clip, rule.speed, last) || knock(target, dx, dz, last);
      if (rule.push && !target.knocked) target.shove = { dx: (dx / len) * rule.push / 0.25, dz: (dz / len) * rule.push / 0.25, left: 0.25 };
    }
    return target;
  }

  /** Mostra só os `n` primeiros figurantes (qualidade adaptativa); os escondidos não animam nem apanham. */
  function setLimit(n) {
    let k = 0;
    for (const p of people) p.group.visible = !!p.special || k++ < n; // os especiais ficam sempre
  }

  /** `cars`: [{ x, z, vx, vz }] em movimento; quem for atingido cai. */
  function update(time, fx = 0, fz = 0, cars = []) {
    const dt = Math.min(0.1, time - last);
    last = time;
    frame += 1;
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      if (!p.group.visible) continue;
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
      if (p.shove) { // empurrão curto do golpe
        const step = Math.min(dt, p.shove.left);
        p.group.position.x += p.shove.dx * step;
        p.group.position.z += p.shove.dz * step;
        if (p.walker) p.z += p.shove.dz * step; // quem anda mantém o novo ponto de partida
        p.shove.left -= step;
        if (p.shove.left <= 0) p.shove = null;
      }
      if (p.hitUntil && time >= p.hitUntil) { // terminou a reação: volta ao que fazia
        p.hitUntil = 0;
        p.hitAction?.fadeOut(0.15);
        p.base.reset().fadeIn(0.15).play();
        if (!p.walker) p.group.rotation.y = p.yaw;
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

  return { update, people, hit, setLimit };
}
