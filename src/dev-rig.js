// Ferramenta de desenvolvimento (não vai para o build): converte as animações de assets-src para o padrão Mixamo.
//   /rig.html?make=ual1|ual2|zsky&save=1  gera o GLB em public/models
//   /rig.html?view=<arquivo>              só mostra um GLB de public/models (para conferir)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { PropertyBinding } from 'three';

const log = document.querySelector('#log');
const say = (...a) => { log.textContent += `${a.join(' ')}\n`; };
const params = new URLSearchParams(location.search);
const sources = import.meta.glob('../assets-src/*.glb', { query: '?url', import: 'default' });
const loader = new GLTFLoader();
const loadSrc = async (name) => loader.parseAsync(await (await fetch(await sources[`../assets-src/${name}`]())).arrayBuffer(), '');
const loadModel = (file) => loader.loadAsync(`/models/${file}?t=${Date.now()}`);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#556');
scene.add(new THREE.HemisphereLight('#fff', '#444', 2.5));
const dl = new THREE.DirectionalLight('#fff', 2);
dl.position.set(2, 4, 5);
scene.add(dl);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 100);
window.__look = (p, t) => { cam.position.set(...p); cam.lookAt(...t); };
window.__look([0, 1.0, 5], [0, 0.9, 0]);
const mixers = [];
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  mixers.forEach((m) => m.update(dt));
  renderer.render(scene, cam);
});
Object.assign(window, { __scene: scene, THREE });

const v3 = () => new THREE.Vector3();
async function exportGlb(root, outName) {
  root.updateMatrixWorld(true);
  const glb = await new Promise((resolve, reject) => {
    new GLTFExporter().parse(root, resolve, reject, { binary: true, onlyVisible: true, animations: root.userData.animations || [] });
  });
  say('GLB:', (glb.byteLength / 1e6).toFixed(2), 'MB');
  const res = await fetch(`http://localhost:9099/save?name=${encodeURIComponent(outName)}`, { method: 'POST', body: glb });
  say('salvo:', await res.text());
}

// ---------- Universal Animation Library (Quaternius, CC0): ossos renomeados para o padrão Mixamo ----------
// ual1 usa nomes do Rigify (DEF-upper_arm.L); ual2, os do manequim do Unreal (upperarm_l). Só ficam as
// faixas dos ossos mapeados; o manequim fica no arquivo (o corpo do Ready Player Me faz retarget por malha).

const UAL_MAPS = {
  ual1: {
    'DEF-hips': 'Hips', 'DEF-spine.001': 'Spine', 'DEF-spine.002': 'Spine1', 'DEF-spine.003': 'Spine2', 'DEF-neck': 'Neck', 'DEF-head': 'Head',
    'DEF-shoulder.L': 'LeftShoulder', 'DEF-upper_arm.L': 'LeftArm', 'DEF-forearm.L': 'LeftForeArm', 'DEF-hand.L': 'LeftHand',
    'DEF-shoulder.R': 'RightShoulder', 'DEF-upper_arm.R': 'RightArm', 'DEF-forearm.R': 'RightForeArm', 'DEF-hand.R': 'RightHand',
    'DEF-thigh.L': 'LeftUpLeg', 'DEF-shin.L': 'LeftLeg', 'DEF-foot.L': 'LeftFoot', 'DEF-toe.L': 'LeftToeBase',
    'DEF-thigh.R': 'RightUpLeg', 'DEF-shin.R': 'RightLeg', 'DEF-foot.R': 'RightFoot', 'DEF-toe.R': 'RightToeBase',
  },
  ual2: {
    pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', Head: 'Head',
    clavicle_l: 'LeftShoulder', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand',
    clavicle_r: 'RightShoulder', upperarm_r: 'RightArm', lowerarm_r: 'RightForeArm', hand_r: 'RightHand',
    thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot', ball_l: 'LeftToeBase',
    thigh_r: 'RightUpLeg', calf_r: 'RightLeg', foot_r: 'RightFoot', ball_r: 'RightToeBase',
  },
};
// dedos: f_index.01.L → LeftHandIndex1 (ual1); index_01_l → LeftHandIndex1 (ual2)
for (const [f, M] of [['index', 'Index'], ['middle', 'Middle'], ['ring', 'Ring'], ['pinky', 'Pinky'], ['thumb', 'Thumb']]) {
  for (let i = 1; i <= 3; i++) {
    for (const [sd, S] of [['L', 'Left'], ['R', 'Right']]) {
      UAL_MAPS.ual1[`DEF-${f === 'thumb' ? 'thumb' : `f_${f}`}.0${i}.${sd}`] = `${S}Hand${M}${i}`;
      UAL_MAPS.ual2[`${f}_0${i}_${sd.toLowerCase()}`] = `${S}Hand${M}${i}`;
    }
  }
}
const UAL_CLIPS = {
  ual1: {
    A_TPose: 'TPose', Idle_Loop: 'idle', Walk_Loop: 'walk', Jog_Fwd_Loop: 'jog', Sprint_Loop: 'run', Punch_Cross: 'punch', Punch_Jab: 'jab',
    Hit_Chest: 'hit', Hit_Head: 'hitHead', Sword_Attack: 'baton', Dance_Loop: 'dance2', Push_Loop: 'push', Driving_Loop: 'drive', Idle_Talking_Loop: 'talk',
  },
  ual2: {
    A_TPose: 'TPose', Melee_Hook: 'hook', Melee_Hook_Rec: 'hookRec', Hit_Knockback: 'knockback', OverhandThrow: 'throw', Sword_Regular_A: 'swing',
    Yes: 'yes', Idle_No_Loop: 'no', Idle_Rail_Call: 'call',
  },
};

async function makeUal(lib) {
  const g = await loadSrc(`${lib}.glb`);
  const map = new Map(Object.entries(UAL_MAPS[lib]).map(([k, v]) => [PropertyBinding.sanitizeNodeName(k), `mixamorig${v}`]));
  const renamed = new Map(); // nome antigo (sanitizado) -> novo
  g.scene.traverse((o) => {
    if (map.has(o.name)) { renamed.set(o.name, map.get(o.name)); o.name = map.get(o.name); }
    if (o.isMesh) { o.material = new THREE.MeshStandardMaterial({ color: '#9aa', roughness: 0.8 }); o.name = 'Mannequin'; }
  });
  const missing = [...map.keys()].filter((k) => !renamed.has(k));
  say(lib, 'ossos mapeados', renamed.size, '| sem correspondência:', missing.join(',') || '-');
  const clips = [];
  for (const c of g.animations) {
    const to = UAL_CLIPS[lib][c.name];
    if (!to) continue;
    const tracks = [];
    for (const t of c.tracks) {
      const m = t.name.match(/^([^.]+)\.(quaternion|position)$/);
      if (!m || !renamed.has(m[1])) continue;
      if (m[2] === 'position' && renamed.get(m[1]) !== 'mixamorigHips') continue; // só o quadril translada
      t.name = `${renamed.get(m[1])}.${m[2]}`;
      tracks.push(t);
    }
    clips.push(new THREE.AnimationClip(to, c.duration, tracks));
    say('  clipe', c.name, '→', to, c.duration.toFixed(2) + 's', tracks.length, 'faixas');
  }
  g.scene.userData.animations = clips;
  const mx = new THREE.AnimationMixer(g.scene);
  mx.clipAction(clips.find((c) => c.name === (params.get('clip') || 'idle')) || clips[0]).play();
  mixers.push(mx);
  g.scene.name = lib;
  return g.scene;
}

// ---------- Zsky (CC BY 4.0): chute, murro e aceno com o rig dele refeito no padrão Mixamo ----------
// O rig tem outros ossos (4 de barriga/peito, cotovelo + antebraço, pé IK solto na raiz), então não dá para só
// renomear. Aqui: monta um esqueleto novo com nomes Mixamo cuja orientação em repouso é a de um osso do original,
// amostra cada clipe a 30 quadros/s lendo a ROTAÇÃO NO MUNDO dos ossos de origem e grava a rotação local no novo
// esqueleto (mundo do pai⁻¹ · mundo do osso). Ossos compostos (Spine1, ForeArm) usam a orientação do último da dupla.

const ZSKY_BONES = [
  // [nome Mixamo, pai Mixamo, osso do original que dá a POSIÇÃO, osso do original que dá a ORIENTAÇÃO]
  ['Hips', null, 'Pelvis', 'Pelvis'],
  ['Spine', 'Hips', 'LowerBelly', 'LowerBelly'],
  ['Spine1', 'Spine', 'UpperBelly', 'LowerChest'],
  ['Spine2', 'Spine1', 'UpperChest', 'UpperChest'],
  ['Neck', 'Spine2', 'Neck', 'Neck'],
  ['Head', 'Neck', 'Head', 'Head'],
  ['LeftShoulder', 'Spine2', 'ShoulderL', 'ShoulderL'],
  ['LeftArm', 'LeftShoulder', 'UpperArmL', 'UpperArmL'],
  ['LeftForeArm', 'LeftArm', 'ElbowL', 'LowerArmL'],
  ['LeftHand', 'LeftForeArm', 'PawL', 'PawL'],
  ['RightShoulder', 'Spine2', 'ShoulderR', 'ShoulderR'],
  ['RightArm', 'RightShoulder', 'UpperArmR', 'UpperArmR'],
  ['RightForeArm', 'RightArm', 'ElbowR', 'LowerArmR'],
  ['RightHand', 'RightForeArm', 'PawR', 'PawR'],
  ['LeftUpLeg', 'Hips', 'UpperLegL', 'UpperLegL'],
  ['LeftLeg', 'LeftUpLeg', 'LowerLegL', 'LowerLegL'],
  ['LeftFoot', 'LeftLeg', '@ankleL', 'FootL'],
  ['RightUpLeg', 'Hips', 'UpperLegR', 'UpperLegR'],
  ['RightLeg', 'RightUpLeg', 'LowerLegR', 'LowerLegR'],
  ['RightFoot', 'RightLeg', '@ankleR', 'FootR'],
  // raízes dos dedos médios, só para o alinhamento das mãos
  ['LeftHandMiddle1', 'LeftHand', 'LowerMiddleFinger1L', null],
  ['RightHandMiddle1', 'RightHand', 'LowerMiddleFinger1R', null],
];
const ZSKY_CLIPS = { Kick_R: 'kick', Punch_R: 'punchR', Wave: 'wave', Iddle: 'idleZ' };

async function makeZsky() {
  const g = await loadSrc('zsky.glb');
  const src = g.scene;
  src.updateMatrixWorld(true);
  const node = (n) => src.getObjectByName(n);
  const wq = (n) => node(n).getWorldQuaternion(new THREE.Quaternion());
  const wp = (n) => node(n).getWorldPosition(v3());
  for (const [, , posN, oriN] of ZSKY_BONES) {
    if (posN.startsWith('@')) continue;
    if (!node(posN)) say('FALTA osso', posN);
    if (oriN && !node(oriN)) say('FALTA osso', oriN);
  }
  // tornozelo: joelho + eixo do osso da perna × comprimento da coxa
  const ankle = (sd) => {
    const knee = wp(`LowerLeg${sd}`);
    const hip = wp(`UpperLeg${sd}`);
    const axis = v3().set(0, 1, 0).applyQuaternion(wq(`LowerLeg${sd}`));
    return knee.clone().addScaledVector(axis, knee.distanceTo(hip));
  };
  const ankles = { '@ankleL': ankle('L'), '@ankleR': ankle('R') };
  const posOf = (n) => (n.startsWith('@') ? ankles[n].clone() : wp(n));
  const hipsRest = wp('Pelvis');
  const headRest = wp('Head');

  // escala: a distância quadril→cabeça vira a do esqueleto da UAL (já em padrão Mixamo, em metros)
  const ual = await loadSrc('ual1.glb');
  ual.scene.updateMatrixWorld(true);
  const uHips = ual.scene.getObjectByName(PropertyBinding.sanitizeNodeName('DEF-hips'));
  const uHead = ual.scene.getObjectByName(PropertyBinding.sanitizeNodeName('DEF-head'));
  const dUal = uHead.getWorldPosition(v3()).y - uHips.getWorldPosition(v3()).y;
  const k = dUal / (headRest.y - hipsRest.y);
  say('quadril→cabeça: zsky', (headRest.y - hipsRest.y).toFixed(3), 'ual', dUal.toFixed(3), '→ escala', k.toFixed(4));

  // esqueleto novo
  const root = new THREE.Group();
  root.name = 'Rig';
  const made = new Map();
  const worldQ = new Map();
  const worldP = new Map();
  for (const [name, parent, posN, oriN] of ZSKY_BONES) {
    const bone = new THREE.Bone();
    bone.name = `mixamorig${name}`;
    const P = posOf(posN).multiplyScalar(k);
    // orientação: a do osso de origem; sem ela (dedos), a do pai
    const Q = oriN ? wq(oriN) : worldQ.get(parent).clone();
    worldQ.set(name, Q);
    worldP.set(name, P);
    if (parent) {
      const pq = worldQ.get(parent);
      bone.position.copy(P.clone().sub(worldP.get(parent)).applyQuaternion(pq.clone().invert()));
      bone.quaternion.copy(pq.clone().invert().multiply(Q));
      made.get(parent).add(bone);
    } else {
      bone.position.copy(P);
      bone.quaternion.copy(Q);
      root.add(bone);
    }
    made.set(name, bone);
  }
  root.updateMatrixWorld(true);

  // clipes
  const fps = 30;
  const mixer = new THREE.AnimationMixer(src);
  const clips = [];
  for (const c of g.animations) {
    const to = ZSKY_CLIPS[c.name];
    if (!to) continue;
    const action = mixer.clipAction(c);
    action.play();
    const n = Math.max(2, Math.round(c.duration * fps) + 1);
    const times = new Float32Array(n);
    const q = {};
    for (const [name] of ZSKY_BONES) q[name] = new Float32Array(n * 4);
    const hips = new Float32Array(n * 3);
    const prev = {};
    for (let i = 0; i < n; i++) {
      const t = Math.min(c.duration, i / fps);
      times[i] = t;
      mixer.setTime(t);
      src.updateMatrixWorld(true);
      const W = {};
      for (const [name, , , oriN] of ZSKY_BONES) W[name] = oriN ? wq(oriN) : null;
      for (const [name, parent, , oriN] of ZSKY_BONES) {
        let local;
        if (!oriN) local = made.get(name).quaternion.clone(); // dedos: repouso
        else if (!parent) local = W[name];
        else {
          const pw = W[parent] || worldQ.get(parent); // pai sem origem: usa o repouso
          local = pw.clone().invert().multiply(W[name]);
        }
        // continuidade: mesmo hemisfério do quadro anterior
        if (prev[name] && prev[name].dot(local) < 0) local.set(-local.x, -local.y, -local.z, -local.w);
        prev[name] = local.clone();
        local.toArray(q[name], i * 4);
      }
      const hp = wp('Pelvis').multiplyScalar(k);
      hp.toArray(hips, i * 3);
    }
    const tracks = [];
    for (const [name, , , oriN] of ZSKY_BONES) {
      if (!oriN) continue;
      tracks.push(new THREE.QuaternionKeyframeTrack(`mixamorig${name}.quaternion`, times, q[name]));
    }
    tracks.push(new THREE.VectorKeyframeTrack('mixamorigHips.position', times, hips));
    clips.push(new THREE.AnimationClip(to, c.duration, tracks));
    action.stop();
    say('clipe', c.name, '→', to, c.duration.toFixed(2) + 's', n, 'quadros');
  }
  root.userData.animations = clips;
  // pré-visualização: o esqueleto novo (SkeletonHelper) e o primeiro clipe pedido
  const skel = new THREE.SkeletonHelper(root);
  scene.add(skel);
  const mx = new THREE.AnimationMixer(root);
  const want = params.get('clip') || 'kick';
  mx.clipAction(clips.find((c) => c.name === want) || clips[0]).play();
  mixers.push(mx);
  window.__zroot = root;
  return root;
}

async function main() {
  const make = params.get('make');
  const view = params.get('view');
  let obj;
  if (make === 'ual1' || make === 'ual2') obj = await makeUal(make);
  else if (make === 'zsky') obj = await makeZsky();
  if (obj) {
    scene.add(obj);
    if (params.get('save')) await exportGlb(obj, `${make}.glb`);
    if (params.get('tpose') && obj.userData.animations) { const mx = new THREE.AnimationMixer(obj); mx.clipAction(obj.userData.animations[0]).play(); mx.update(0); }
  }
  const anim = params.get('anim'); // ex.: anim=wave&faces=3,4 — usa o mesmo Avatar do jogo
  if (anim) {
    const { loadModels, models } = await import('./models.js');
    const { Avatar } = await import('./avatar.js');
    window.__DEBUG_UNIT = !!params.get('dbg');
    await loadModels();
    window.__models = models;
    const faces = (params.get('faces') || '3,4').split(',').map(Number);
    const avatars = faces.map((face, i) => {
      const a = new Avatar({
        body: Number(params.get('body') || 0), age: 0, face, height: 1, skin: 1, hairStyle: 0, hair: 1, beard: 0, shirt: 0, top: 0, pants: 0, flag: Number(params.get('flag') || 0), sign: '', side: 1, equip: { head: params.get('hat') || undefined }, custom: {}, // &hat=bone|chapeu-palha
      });
      a.group.position.x = (i - (faces.length - 1) / 2) * 1.1;
      scene.add(a.group);
      return a;
    });
    window.__avatars = avatars;
    const strike = params.get('strike'); // ex.: &strike=baton — repete o golpe a cada 1,6 s
    let nextStrike = 0.5;
    renderer.setAnimationLoop(() => {
      const dt = clock.getDelta();
      if (strike && clock.elapsedTime > nextStrike) { avatars.forEach((a) => a.strikeNow(strike)); nextStrike = clock.elapsedTime + 1.6; }
      avatars.forEach((a) => a.update(dt, anim, anim === 'walk' ? 2.2 : 0));
      renderer.render(scene, cam);
    });
    window.__look([0, 1.2, 3.4], [0, 1.0, 0]);
  }
  if (view) {
    const g = await loadModel(view);
    g.scene.position.x = Number(params.get('x') || 0);
    scene.add(g.scene);
  }
  window.__done = true;
}
main().catch((e) => { say('ERRO', e.stack); window.__done = true; });
