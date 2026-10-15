import * as THREE from 'three';
import {
  SKINS, SHIRTS, PANTS, SIDES, SHOP_BY_ID, DESIGN,
} from '../shared/config.js';
import {
  flagTexture, shirtDecalTexture, shirtPrintTexture, signTexture, designTexture,
} from './textures.js';
import { createCharacter, modelId } from './models.js';
import { MELEE } from '../shared/config.js';
import { pumpkinGeometry, picanhaSkewerGeometry, propMaterial } from './props.js';
import {
  ageCharacter, createReadingGlasses, createCane, poseElderly, updateCane,
} from './aging.js';

// Avatar com modelo humano de verdade (glTF com esqueleto, ver models.js), animado por
// AnimationMixer e com acessórios que seguem os ossos. O corpo masculino aceita tingir
// pele, camisa e calça; o feminino usa a textura original.

const BASE_SKIN = new THREE.Color('#f3d2b8'); // tom mais claro da lista = textura sem alteração
// Variação de rosto e corpo por escala de ossos: cabeça (largura, altura, profundidade) e quadril (tudo).
export const FACE_SCALE = [[1, 1, 1]];
export const HEIGHT_SCALE = [0.94, 1, 1.05];
const POLE_MAT = new THREE.MeshStandardMaterial({ color: '#d4d4d0', roughness: 0.5, metalness: 0.3 });
const POLE_GEO = new THREE.CylinderGeometry(0.014, 0.014, 1.9, 6).translate(0, 0.65, 0); // a mão segura em y = 0
const ACC_MAT = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6 });

const _p = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

// Versão em tons de cinza de uma textura, para a cor do material tingir sem "sujar".
const grayCache = new Map();
export function grayMap(tex) {
  if (!tex?.image) return tex;
  if (grayCache.has(tex.uuid)) return grayCache.get(tex.uuid);
  const { image } = tex;
  const w = image.width;
  const h = image.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(image, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = Math.min(255, (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * 0.55 + 115);
    d[i] = d[i + 1] = d[i + 2] = l;
  }
  ctx.putImageData(img, 0, 0);
  const out = new THREE.CanvasTexture(c);
  out.colorSpace = THREE.SRGBColorSpace;
  out.flipY = tex.flipY;
  out.wrapS = tex.wrapS;
  out.wrapT = tex.wrapT;
  out.anisotropy = 4;
  grayCache.set(tex.uuid, out);
  return out;
}

/** Gira `bone` para que a direção até `child` aponte para `dirWorld` (interpolando por `k`). */
export function aimBone(bone, child, dirWorld, k = 1) {
  if (!bone || !child) return;
  bone.getWorldPosition(_p);
  child.getWorldPosition(_c);
  _d.subVectors(_c, _p).normalize();
  _q.setFromUnitVectors(_d, dirWorld);
  bone.getWorldQuaternion(_qb);
  _q.multiply(_qb); // nova rotação no mundo
  bone.parent.getWorldQuaternion(_qp).invert();
  _qp.multiply(_q); // em local
  bone.quaternion.slerp(_qp, k);
  bone.updateMatrixWorld(true);
}

/**
 * Prende `obj` ao osso mantendo a pose desejada no mundo neste instante (posição = osso + offset,
 * rotação = só o yaw do personagem). Depois disso o objeto acompanha o osso rigidamente.
 */
/** Pulso 0 → 1 (em `peak`) → 0, para as poses de golpe. */
const pulse = (p, peak) => (p < peak ? p / peak : Math.max(0, 1 - (p - peak) / (1 - peak)));

const BATON_MAT = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.55 });
const BATON_GRIP = new THREE.MeshStandardMaterial({ color: '#3a2a1c', roughness: 0.9 });
/** Cassetete: cabo curto e corpo de 55 cm; a mão segura em y = 0, o corpo aponta para +y. */
function createBaton() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.55, 10).translate(0, 0.32, 0), BATON_MAT);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.14, 10).translate(0, 0.02, 0), BATON_GRIP);
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 12).rotateX(Math.PI / 2), BATON_MAT);
  guard.position.y = 0.09;
  body.castShadow = true;
  g.add(body, grip, guard);
  return g;
}

const _qg = new THREE.Quaternion();
const _f = new THREE.Vector3();
/** O cassetete fica na mão direita, apontando na direção antebraço → mão (prolongamento do braço). */
function updateBaton(baton, foreArm, hand, group) {
  hand.getWorldPosition(_p);
  foreArm.getWorldPosition(_f);
  _d.subVectors(_p, _f).normalize();
  group.getWorldQuaternion(_qg).invert();
  baton.position.copy(group.worldToLocal(_p.clone()));
  baton.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _d).premultiply(_qg);
}

export function attachToBone(obj, bone, root, offset) {
  root.updateMatrixWorld(true);
  bone.getWorldPosition(_p);
  root.getWorldQuaternion(_qp);
  _d.set(...offset).applyQuaternion(_qp);
  _p.add(_d);
  _m.copy(bone.matrixWorld).invert();
  obj.position.copy(_p).applyMatrix4(_m);
  bone.getWorldQuaternion(_qb).invert();
  obj.quaternion.copy(_qb).multiply(_qp);
  bone.getWorldScale(_s);
  obj.scale.set(1 / _s.x, 1 / _s.y, 1 / _s.z);
  bone.add(obj);
}

export class Avatar {
  constructor(look) {
    this.group = new THREE.Group();
    this.t = Math.random() * 10;
    this.char = null;
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.holder = null;
    this.itemTextures = [];
    this.heldItem = false;
    this.accItems = []; // acessórios presos aos ossos
    this.cane = null;
    this.strike = null; // golpe procedural em andamento { kind, t, dur } (só o chute, sem clipe)
    this.once = null; // clipe de uma vez só em andamento (golpe, levar golpe, arremesso)
    this.onceUntil = 0;
    this.stun = 0; // segundos restantes cambaleando (levou um golpe)
    this.baton = null; // cassetete na mão direita (criado no primeiro uso)
    this.batonUntil = 0;
    this.elderly = false;
    this.setLook(look);
  }

  // ---------- corpo ----------

  buildBody(id) {
    if (this.char) {
      this.group.remove(this.char.root);
      this.mixer.stopAllAction();
      Object.values(this.char.mats).forEach((m) => m.dispose());
    }
    const c = createCharacter(id);
    this.char = c;
    this.height = c.height;
    this.group.add(c.root);

    this.mixer = new THREE.AnimationMixer(c.root); // os clipes usam caminhos de nó (ossos pelo nome)
    this.actions = {};
    for (const [name, clip] of Object.entries(c.clips)) {
      const a = this.mixer.clipAction(clip);
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      this.actions[name] = a;
    }
    this.current = 'idle';
    this.actions.idle.setEffectiveWeight(1);
    this.mixer.update(this.t % 1.5); // dessincroniza dos outros

    if (c.tintable) { // roupas em cinza para a cor tingir limpo
      for (const key of ['top', 'bottom']) {
        const m = c.mats[key];
        if (m?.map) m.map = grayMap(m.map);
      }
      c.meshes.Wolf3D_Teeth && (c.meshes.Wolf3D_Teeth.visible = true);
    }
  }

  setLook(look) {
    this.look = look;
    const kind = look.body === 1 ? 'female' : 'male';
    const elderly = look.age === 1;
    const id = modelId(look.body, look.face);
    if (!this.char || this.char.id !== id || this.elderly !== elderly) this.buildBody(id);
    this.elderly = elderly;
    const c = this.char;
    const side = SIDES[look.side] ?? SIDES[0];
    const equip = look.equip || {};

    if (c.tintable) {
      const skin = new THREE.Color(SKINS[look.skin] ?? SKINS[0]);
      const tint = new THREE.Color(skin.r / BASE_SKIN.r, skin.g / BASE_SKIN.g, skin.b / BASE_SKIN.b);
      c.mats.skinHead?.color.copy(tint);
      c.mats.skinBody?.color.copy(tint);
      const item = SHOP_BY_ID[equip.shirt];
      let shirt = SHIRTS[look.shirt] ?? SHIRTS[0];
      if (equip.shirt === 'camisa-numero') shirt = side.color;
      else if (item?.color) shirt = item.color;
      else if (equip.shirt === 'camisa-simples') shirt = look.custom?.plainshirt?.bg ?? DESIGN.colors[0];
      else if (equip.shirt === 'camisa-custom') shirt = look.custom?.shirt?.bg ?? DESIGN.colors[0];
      c.mats.top?.color.set(shirt);
      c.mats.bottom?.color.set((PANTS[look.pants] ?? PANTS[0]).color);
      if (c.meshes.Wolf3D_Beard) c.meshes.Wolf3D_Beard.visible = look.beard > 0 || elderly;
      if (c.meshes.Mesh) c.meshes.Mesh.visible = look.hairStyle !== 2 && !equip.head && !elderly; // gorro
    }

    if (elderly) ageCharacter(c); // depois das cores, para a pele pálida não ser sobrescrita
    const hs = HEIGHT_SCALE[look.height] ?? 1;
    c.bones.hips.scale.setScalar(hs);
    this.height = c.height * hs;
    this.buildAccessories(equip, side);
    this.buildHeld(look, equip, side);
    this.buildDecals(equip, side, look.custom?.shirt, c.tintable);
    if (elderly) {
      if (equip.face !== 'oculos') this.attach(createReadingGlasses(), c.bones.head, [0, 0.075, 0.1]);
      this.cane = createCane();
      this.group.add(this.cane);
      this.accItems.push(this.cane);
    }
  }

  // ---------- acessórios ----------

  clearAcc() {
    for (const obj of this.accItems) {
      obj.parent?.remove(obj);
      obj.traverse((o) => {
        if (!o.isMesh) return;
        if (o.geometry !== POLE_GEO) o.geometry.dispose();
        if (o.material !== POLE_MAT) o.material.dispose();
      });
    }
    this.accItems = [];
    this.itemTextures.forEach((t) => t.dispose());
    this.itemTextures = [];
    this.holder = this.cane = null;
  }

  /** Prende o objeto ao osso com um deslocamento (no referencial do personagem). */
  attach(obj, bone, offset) {
    if (!bone) return obj;
    attachToBone(obj, bone, this.group, offset);
    this.accItems.push(obj);
    return obj;
  }

  buildAccessories(equip, side) {
    this.clearAcc();
    const g = (parts) => {
      const grp = new THREE.Group();
      for (const { geo, color, pos } of parts) {
        const m = new THREE.Mesh(geo, ACC_MAT(color));
        m.position.set(...pos);
        m.castShadow = true;
        grp.add(m);
      }
      return grp;
    };
    const b = this.char.bones;
    // topo e largura da cabeça (com cabelo), medidos na malha: mudam entre os corpos (Lula, Bolsonaro, mulheres…)
    const hs = this.char.bones.hips.scale.x || 1;
    const hd = this.char.head || { top: 0.23, radius: 0.1, cx: 0, cz: 0.01 };
    const headTop = hd.top * hs;
    const headR = hd.radius * hs;
    const hx = hd.cx * hs; // centro da cabeça em relação ao osso (que fica na nuca)
    const hz = hd.cz * hs;
    // boné: a aba fica ~10 cm abaixo do topo; o raio é o meio-comprimento da cabeça nessa altura, com 1,5 cm de folga
    const capR = Math.max(0.105, headR + 0.015);
    const hk = capR / 0.115;
    const sized = (obj) => { obj.scale.set(hk, hk, hk); return obj; };
    if (equip.head === 'bone') {
      this.attach(sized(g([
        { geo: new THREE.SphereGeometry(0.115, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), color: side.color, pos: [0, 0, 0] },
        { geo: new THREE.BoxGeometry(0.2, 0.014, 0.15), color: side.color, pos: [0, 0.01, 0.15] },
        { geo: new THREE.SphereGeometry(0.014, 8, 6), color: '#ffffff', pos: [0, 0.112, 0] },
      ])), b.head, [hx, headTop + 0.012 - capR, hz]);
    } else if (equip.head === 'chapeu-palha') {
      this.attach(sized(g([
        { geo: new THREE.CylinderGeometry(0.09, 0.105, 0.1, 18), color: '#d6b56a', pos: [0, 0.07, 0] },
        { geo: new THREE.CylinderGeometry(0.26, 0.26, 0.012, 24), color: '#cfa95a', pos: [0, 0.02, 0] },
        { geo: new THREE.CylinderGeometry(0.106, 0.106, 0.03, 18), color: side.color, pos: [0, 0.036, 0] },
      ])), b.head, [hx, headTop - 0.065, hz]); // aba ~4,5 cm abaixo do topo, copa cobre a cabeça
    }
    if (equip.face === 'oculos') {
      this.attach(g([
        { geo: new THREE.BoxGeometry(0.058, 0.036, 0.01), color: '#0a0a0a', pos: [0.04, 0, 0] },
        { geo: new THREE.BoxGeometry(0.058, 0.036, 0.01), color: '#0a0a0a', pos: [-0.04, 0, 0] },
        { geo: new THREE.BoxGeometry(0.03, 0.008, 0.01), color: '#0a0a0a', pos: [0, 0.008, 0] },
        { geo: new THREE.BoxGeometry(0.006, 0.008, 0.11), color: '#0a0a0a', pos: [0.075, 0.008, -0.055] },
        { geo: new THREE.BoxGeometry(0.006, 0.008, 0.11), color: '#0a0a0a', pos: [-0.075, 0.008, -0.055] },
      ]), b.head, [0, 0.075, 0.1]);
    }
  }

  buildDecals(equip, side, shirtDesign, tintable) {
    let map;
    if (equip.shirt === 'camisa-numero') map = shirtDecalTexture(side.id);
    else if (equip.shirt === 'camisa-custom' && tintable && shirtDesign && (shirtDesign.text || shirtDesign.emblem)) map = shirtPrintTexture(shirtDesign);
    if (!map) return;
    const mat = new THREE.MeshStandardMaterial({
      map, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const grp = new THREE.Group();
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), mat);
    front.position.set(0, 0.02, 0.135);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), mat);
    back.position.set(0, 0.04, -0.125);
    back.rotation.y = Math.PI;
    grp.add(front, back);
    this.attach(grp, this.char.bones.spine2, [0, 0.06, 0]);
  }

  buildHeld(look, equip, side) {
    const kind = look.flag; // 0 nada, 1 Brasil, 2 lado, 3 cartaz, 4 picanha, 5 abóbora
    this.heldKind = kind;
    if (kind === 4 || kind === 5) { // comida na mão, segura à frente do peito
      this.heldItem = true;
      const holder = new THREE.Group();
      const food = kind === 4
        ? new THREE.Mesh(picanhaSkewerGeometry(), propMaterial)
        : new THREE.Mesh(pumpkinGeometry(1), propMaterial);
      if (kind === 4) { food.position.y = -0.07; food.scale.setScalar(1.15); } else { food.scale.setScalar(0.15); food.position.set(-0.02, -0.02, 0.06); }
      food.castShadow = true;
      holder.add(food);
      this.group.add(holder);
      this.accItems.push(holder);
      this.holder = holder;
      return;
    }
    const custom = look.custom || {};
    const customSign = equip.sign === 'cartaz-custom' && custom.sign;
    const customFlag = equip.flag === 'bandeira-custom' && custom.flag;
    this.heldItem = kind === 1 || kind === 2 || (kind === 3 && (!!look.sign || !!customSign));
    if (!this.heldItem) return;
    const holder = new THREE.Group();
    const pole = new THREE.Mesh(POLE_GEO, POLE_MAT);
    pole.castShadow = true;
    holder.add(pole);
    let map;
    if (kind === 1) map = flagTexture('brasil');
    else if (kind === 2) map = customFlag ? designTexture('flag', custom.flag) : flagTexture('candidato', side.id);
    else if (customSign) map = designTexture('sign', custom.sign);
    else { map = signTexture(look.sign); this.itemTextures.push(map); }
    const big = equip.flag === 'bandeira-gigante' && kind !== 3 ? 1.55 : 1;
    const y = 1.05 - (big - 1) * 0.15;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9 * big, 0.6 * big),
      new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: 0.85 }),
    );
    board.position.set(-0.46 * big, y, 0);
    board.castShadow = true;
    holder.add(board);
    if (big > 1) {
      const edge = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9 * big + 0.04, 0.04),
        new THREE.MeshStandardMaterial({ color: '#d4a017', side: THREE.DoubleSide, metalness: 0.4, roughness: 0.4 }),
      );
      edge.position.set(-0.46 * big, y + 0.3 * big, 0.002);
      holder.add(edge);
    }
    // A haste não é presa ao osso: a cada quadro ela segue a posição da mão e fica sempre
    // vertical, sem herdar o giro do pulso que vem da animação.
    this.group.add(holder);
    this.accItems.push(holder);
    this.holder = holder;
  }

  // ---------- animação ----------

  play(name, fade = 0.25) {
    if (this.current === name || !this.actions[name]) return;
    if (this.once) { this.current = name; return; } // volta para este quando o clipe de uma vez acabar
    const from = this.actions[this.current];
    const to = this.actions[name];
    to.reset().setEffectiveWeight(1).fadeIn(fade);
    from.fadeOut(fade);
    this.current = name;
  }

  /** Toca um clipe uma vez (golpe, levar golpe, arremesso) por cima do atual e volta sozinho. */
  playOnce(name, fade = 0.1, speed = 1) {
    const a = this.actions[name];
    if (!a) return false;
    if (this.once && this.once !== name) this.actions[this.once].fadeOut(0.08);
    const cur = this.actions[this.current];
    if (cur && cur !== a) cur.fadeOut(fade);
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = speed;
    a.setEffectiveWeight(1).fadeIn(fade).play();
    this.once = name;
    this.onceUntil = this.t + a.getClip().duration / speed - 0.12;
    return true;
  }

  /** Ergue o braço esquerdo para segurar a haste à frente do peito. */
  aimHoldingArm(k = 1) {
    const b = this.char.bones;
    this.group.updateMatrixWorld(true);
    this.group.getWorldQuaternion(_qp);
    const world = (x, y, z) => _d.set(x, y, z).normalize().applyQuaternion(_qp).clone();
    aimBone(b.leftArm, b.leftForeArm, world(0.25, -0.55, 0.75), k);
    aimBone(b.leftForeArm, b.leftHand, world(0, 0.45, 0.85), k);
  }

  /** anim: 'idle' | 'walk' | 'wave' | 'dance'. speed em m/s. */
  update(dt, anim, speed = 0) {
    this.t += dt;
    const t = this.t;
    if (anim === 'walk') {
      const run = speed > 6;
      this.play(run ? 'run' : 'walk');
      this.actions.walk.timeScale = THREE.MathUtils.clamp(speed / 2.2, 0.6, 2.4) * (this.elderly ? 0.75 : 1);
      this.actions.run.timeScale = THREE.MathUtils.clamp(speed / 5.5, 0.8, 1.6);
    } else if (anim === 'dance') this.play('dance');
    else if (anim === 'clap' && this.actions.clap) this.play('clap');
    else if (anim === 'wave' && this.actions.wave) this.play('wave');
    else this.play('idle');
    if (this.once && this.t >= this.onceUntil) { // fim do clipe de uma vez: volta ao clipe atual
      const a = this.actions[this.once];
      a.fadeOut(0.15);
      this.once = null;
      const back = this.actions[this.current];
      back.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).fadeIn(0.15).play();
    }
    this.mixer.update(dt);
    this.group.updateMatrixWorld(true);

    const b = this.char.bones;
    const yaw = this.group.getWorldQuaternion(_qp);
    const world = (x, y, z) => _d.set(x, y, z).normalize().applyQuaternion(yaw).clone();
    // O mixer repõe a pose do clipe a cada quadro, então a mira é aplicada por inteiro (k = 1).
    if (this.elderly) poseElderly(b, this.group, { cane: anim !== 'wave' && anim !== 'dance' });
    if (this.heldItem && anim !== 'dance' && anim !== 'clap') this.aimHoldingArm(1); // braço esquerdo segura a haste
    if (anim === 'wave' && !this.actions.wave) { // sem clipe: braço direito levantado, antebraço balançando
      aimBone(b.rightArm, b.rightForeArm, world(-0.45, 0.85, 0.15), 1);
      aimBone(b.rightForeArm, b.rightHand, world(Math.sin(t * 9) * 0.55 - 0.1, 1, 0.1), 1);
    }

    // ---- golpes e cambaleio (poses procedurais por cima do clipe) ----
    if (this.strike) {
      const st = this.strike;
      st.t += dt;
      const p = Math.min(1, st.t / st.dur);
      const f = pulse(p, 0.42); // 0 → 1 (impacto) → 0
      const mix = (ax, ay, az, bx, by, bz) => world(ax + (bx - ax) * f, ay + (by - ay) * f, az + (bz - az) * f);
      if (st.kind === 'kick') { // perna direita chuta à frente, tronco inclina para trás
        aimBone(b.spine1, b.spine2, world(0.05, 1, -0.45 * f), 1);
        aimBone(b.rightUpLeg, b.rightLeg, mix(0.08, -1, -0.3, -0.12, 0.25, 1), 1);
        aimBone(b.rightLeg, b.rightFoot, mix(0.05, -1, -0.55, -0.1, -0.1, 1), 1);
        aimBone(b.leftArm, b.leftForeArm, mix(0.3, -0.9, 0.1, 0.5, -0.2, 0.7), 1);
        aimBone(b.rightArm, b.rightForeArm, mix(-0.3, -0.9, 0.1, -0.7, 0.1, -0.3), 1);
      }
      if (p >= 1) this.strike = null;
    }
    if (this.stun > 0 && !this.actions.hit) { // sem clipe: tronco e cabeça para trás, braços erguidos
      this.stun -= dt;
      const k = pulse(1 - Math.max(0, this.stun) / 0.7, 0.3);
      aimBone(b.spine1, b.spine2, world(0, 1, -0.75 * k), 1);
      aimBone(b.neck, b.head, world(0, 1, -0.6 * k), 1);
      aimBone(b.leftArm, b.leftForeArm, world(0.75, 0.3 + 0.5 * k, -0.2), k);
      aimBone(b.rightArm, b.rightForeArm, world(-0.75, 0.3 + 0.5 * k, -0.2), k);
    }
    if (this.baton) {
      if (t > this.batonUntil) this.baton.visible = false;
      else updateBaton(this.baton, b.rightForeArm, b.rightHand, this.group);
    }

    if (this.cane) updateCane(this.cane, b.rightHand, this.group);
    if (this.holder) { // haste segue a mão
      b.leftHand.getWorldPosition(_p);
      this.holder.position.copy(this.group.worldToLocal(_p));
    }
  }

  /** Golpe procedural: 'punch' | 'kick' | 'baton'. Dura MELEE[kind].durMs. */
  strikeNow(kind) {
    if (!this.char || !MELEE[kind]) return;
    // clipes da Universal Animation Library (murro, cassetete) e do pacote Zsky (chute, murro direto)
    if (kind === 'punch' && this.actions.punch) this.playOnce(['punch', 'punchR', 'hook'][Math.floor(Math.random() * 3)], 0.08, 1.15);
    else if (kind === 'kick' && this.actions.kick) this.playOnce('kick', 0.08, 1.1);
    else if (kind === 'baton' && this.actions.baton) this.playOnce('baton', 0.08, 1.25);
    else this.strike = { kind, t: 0, dur: MELEE[kind].durMs / 1000 };
    if (kind === 'baton') {
      if (!this.baton) {
        this.baton = createBaton();
        this.group.add(this.baton);
      }
      this.baton.visible = true;
      this.batonUntil = this.t + 2.5; // some da mão um pouco depois do golpe
    }
  }

  /** Levou um golpe: cambaleia (clipe de reação; atropelamento usa o de ser jogado para trás). */
  staggerNow(kind = 'punch') {
    if (this.actions.hit) this.playOnce(kind === 'car' && this.actions.knockback ? 'knockback' : (Math.random() < 0.5 ? 'hit' : 'hitHead'), 0.06);
    else this.stun = 0.7;
  }

  /** Arremesso (tomate, picanha, abóbora). */
  throwNow() {
    if (this.actions.throw) this.playOnce('throw', 0.08, 1.3);
  }

  setShadows(on) {
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = on; });
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.clearAcc();
    if (this.char) {
      this.mixer.stopAllAction();
      Object.values(this.char.mats).forEach((m) => m.dispose());
    }
  }
}
