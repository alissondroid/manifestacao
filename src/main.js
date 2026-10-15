import * as THREE from 'three';
import {
  WORLD, SIDES, ANIMS, WALK_SPEED, RUN_SPEED, RACE, MELEE, VEHICLE, REACTIONS, STAMINA,
} from '../shared/config.js';
import { createWorld, carMesh } from './world.js';
import { Avatar } from './avatar.js';
import { pumpkinGeometry, picanhaSkewerGeometry, propMaterial } from './props.js';
import { Net } from './net.js';
import { Ambience } from './audio.js';
import { initAccount } from './account.js';
import { PRESETS, renderPortraits } from './portraits.js';
import { loadModels } from './models.js';
import {
  initLobby, initHud, initModes, createLabel, setOnline, setStatus, showError,
} from './ui.js';
import { toast } from './account.js';
import { initRadar } from './radar.js';

const $ = (s) => document.querySelector(s);

// ---------- Perfil (salvo no navegador) ----------

const STORAGE_KEY = 'avenida-online:perfil';
const defaultProfile = () => ({
  v: 2,
  nick: '',
  side: 0,
  preset: 'homem',
  look: {
    body: 0, age: 0, face: 1, height: 1, skin: 2, hairStyle: 0, hair: 1, beard: 0, shirt: 0, top: 0, pants: 0, flag: 0, sign: '',
  },
});

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.look) {
      const merged = { ...defaultProfile(), ...saved, look: { ...defaultProfile().look, ...saved.look } };
      if (saved.v !== 2) { merged.look.flag = 0; merged.v = 2; } // perfis antigos: sem bandeira por padrão
      return merged;
    }
  } catch { /* sem storage */ }
  return defaultProfile();
}

const profile = loadProfile();
const saveProfile = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch { /* ignore */ }
};

// ---------- Cena ----------

const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 900);

// Modelos humanos (glTF) precisam estar carregados antes de montar a multidão e o avatar.
try {
  await loadModels();
} catch (err) {
  console.error(err);
  document.querySelector('#loading').textContent = 'Não foi possível carregar os personagens. Recarregue a página.';
  throw err;
}
document.querySelector('#loading').hidden = true;

const world = createWorld(scene, renderer);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  applyViewOffset();
}

// No lobby (telas largas) desloca a imagem para a direita, saindo de trás do cartão.
function applyViewOffset() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (mode === 'lobby' && w > 760) camera.setViewOffset(w, h, w * 0.2, 0, w, h); // cartão à direita
  else if (mode === 'lobby') camera.setViewOffset(w, h, 0, h * 0.2, w, h); // celular: cartão fica embaixo
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- Estado ----------

let mode = 'lobby'; // 'lobby' | 'play'
let watching = false; // espectador: câmera livre, sem avatar
let lobbyAnim = 'idle'; // animação escolhida no preview do lobby
// modos extras
const race = { snap: { state: 'idle', n: 0 }, joined: false, mine: null, goAt: 0, countAt: 0 };
const pvp = { on: false, lastThrow: 0 };
// vida (PvP), nocaute e fôlego
const vit = { hp: 100, shieldUntil: 0, koUntil: 0, koBy: '', stamina: STAMINA.max, tired: false, next: 0 };
const lastAttackAt = {}; // por golpe, para o cooldown no cliente
const DRIVE = ANIMS.indexOf('drive');
// carro: física simples no cliente (o servidor só valida a velocidade)
const drive = { on: false, speed: 0, mesh: null };
const projectiles = [];
const TOMATO_GEO = new THREE.SphereGeometry(0.09, 10, 8);
const TOMATO_MAT = new THREE.MeshStandardMaterial({ color: '#d32f2f', roughness: 0.5 });
const SPLAT_MAT = new THREE.SpriteMaterial({ color: '#c62828', opacity: 0.9, transparent: true, depthTest: false });
let lobbyYaw = 0.4; // giro do personagem no lobby (orbita sozinho, ou pelo arrasto)
let lobbyDragUntil = 0;
const setMode = (m) => { mode = m; document.body.dataset.mode = m; };
resize();
let myId = null;
let acct = { user: null, equipped: {}, custom: {} }; // conta atual (preenchida por initAccount)
const lookOf = (look, side) => ({
  ...look, side, equip: acct.equipped, custom: acct.custom || {},
});

const me = {
  avatar: new Avatar(lookOf(profile.look, profile.side)),
  label: null,
  x: 0, z: 0, ry: 0,
  manual: 0, // 0 nenhum, 2 acenar, 3 dançar, 4 aplaudir
  speed: 0,
  stunUntil: 0, // levou um golpe: não anda até aqui
  sent: { x: NaN, z: NaN, ry: NaN, a: -1, at: 0 },
};
scene.add(me.avatar.group);
me.avatar.group.rotation.order = 'YXZ';

const remotes = new Map();
let camYaw = 0;
let camPitch = 0.42;
let camDist = 6.5;

const keys = {};
window.addEventListener('keydown', (e) => {
  if (hud.isTyping() || e.target instanceof HTMLInputElement) return;
  keys[e.code] = true;
  if (mode === 'play' && !e.repeat) {
    if (e.code === 'Digit1') toggleEmote(2);
    if (e.code === 'Digit2') toggleEmote(3);
    if (e.code === 'Digit3') toggleEmote(4);
    if (e.code === 'Digit4') attack('punch');
    if (e.code === 'Digit5') attack('kick');
    if (e.code === 'Digit6') attack('baton');
    if (e.code === 'KeyC') toggleDrive();
    if (e.code === 'KeyF') throwTomato();
    const ri = ['Digit7', 'Digit8', 'Digit9', 'Digit0'].indexOf(e.code);
    if (ri >= 0) react(ri);
    if (e.code === 'Tab') { e.preventDefault(); hud.toggleWho(); }
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// arrastar para girar a câmera
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  if (mode === 'lobby') { // gira o personagem do preview
    lobbyYaw += (e.clientX - drag.x) * 0.01;
    lobbyDragUntil = performance.now() + 5000;
    drag.x = e.clientX;
    return;
  }
  camYaw -= (e.clientX - drag.x) * 0.006;
  camPitch = Math.min(1.1, Math.max(0.12, camPitch + (e.clientY - drag.y) * 0.004));
  drag.x = e.clientX;
  drag.y = e.clientY;
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

const knockedOut = () => performance.now() < vit.koUntil;
let lastReact = 0;
function react(i) {
  const now = performance.now();
  if (mode !== 'play' || watching || knockedOut() || now - lastReact < 800) return;
  lastReact = now;
  net.send({ t: 'react', e: i });
}

function toggleEmote(anim) {
  if (drive.on) return;
  me.manual = me.manual === anim ? 0 : anim;
  hud.setEmote(me.manual);
}

/** Golpe: anima na hora e avisa o servidor, que decide se acertou alguém (só com PvP ligado nos dois). */
function attack(kind) {
  if (mode !== 'play' || watching || drive.on || knockedOut() || hud.isTyping() || !MELEE[kind]) return;
  const now = performance.now();
  if (now - (lastAttackAt[kind] || 0) < MELEE[kind].cooldownMs) return;
  lastAttackAt[kind] = now;
  if (me.manual) { me.manual = 0; hud.setEmote(0); }
  me.avatar.strikeNow(kind);
  hud.flashAttack(kind);
  net.send({ t: 'attack', kind });
}

/** Entra no carro / sai dele. O carro aparece onde o jogador está, com a cor do lado. */
function toggleDrive() {
  if (mode !== 'play' || watching) return;
  drive.on = !drive.on;
  drive.speed = 0;
  if (drive.on) {
    if (me.manual) { me.manual = 0; hud.setEmote(0); }
    if (!drive.mesh) drive.mesh = carMesh(SIDES[profile.side].color);
    drive.mesh.position.set(me.x, 0, me.z);
    drive.mesh.rotation.y = me.ry;
    scene.add(drive.mesh);
    me.avatar.group.visible = false;
  } else {
    scene.remove(drive.mesh);
    me.avatar.group.visible = true;
  }
  camDist = drive.on ? 9.5 : 6.5;
  hud.setDriving(drive.on);
}

const HIT_NAMES = { punch: '👊 %s te deu um murro!', kick: '🦵 %s te deu um chute!', baton: '🏏 %s te acertou com o cassetete!', car: '🚗 %s te atropelou!' };

// ---------- Rede ----------

function addRemote(p) {
  if (remotes.has(p.id)) return;
  const avatar = new Avatar(lookOf(p.look, p.side));
  avatar.group.position.set(p.x, 0, p.z);
  avatar.group.rotation.y = p.ry;
  scene.add(avatar.group);
  remotes.set(p.id, {
    id: p.id,
    nick: p.nick,
    side: p.side,
    avatar,
    label: createLabel(p.nick, SIDES[p.side].color),
    x: p.x, z: p.z, ry: p.ry,
    tx: p.x, tz: p.z, tr: p.ry,
    anim: p.a || 0,
    speed: 0,
    hp: 100, shieldUntil: 0, koUntil: 0, shieldOn: false,
  });
  avatar.group.rotation.order = 'YXZ';
}

function removeRemote(id) {
  const r = remotes.get(id);
  if (r?.car) scene.remove(r.car);
  if (!r) return;
  r.avatar.dispose();
  r.label.remove();
  remotes.delete(id);
}

function clearRemotes() {
  for (const id of [...remotes.keys()]) removeRemote(id);
}

const net = new Net({
  open() {
    setStatus('conectado');
    showError('');
  },
  close() {
    setStatus('reconectando…');
    if (mode === 'play') hud.addChat('Sistema', 'Conexão perdida. Reconectando…', '#fca5a5');
  },
  message(m) {
    switch (m.t) {
      case 'online':
        setOnline(m.counts);
        world.ticker.setOnline(m.counts);
        break;
      case 'welcome':
        myId = m.id;
        me.x = m.x;
        me.z = m.z;
        clearRemotes();
        break;
      case 'sync':
        // o servidor só envia quem está na nossa área de interesse
        m.del.forEach(removeRemote);
        m.add.forEach(addRemote);
        for (const [id, x, z, ry, a] of m.s) {
          const r = remotes.get(id);
          if (r) { r.tx = x; r.tz = z; r.tr = ry; r.anim = a; }
        }
        break;
      case 'chat': {
        const mine = m.id === myId;
        if (mine) me.label?.say(m.text);
        else {
          remotes.get(m.id)?.label.say(m.text);
          sound.pop();
        }
        hud.addChat(mine ? profile.nick || 'Você' : m.nick, m.text, SIDES[m.side]?.color ?? '#94a3b8');
        break;
      }
      case 'fix':
        me.x = m.x;
        me.z = m.z;
        if (typeof m.ry === 'number') { me.ry = m.ry; camYaw = m.ry; }
        break;
      case 'race':
        onRaceMessage(m);
        break;
      case 'pvp':
        if (typeof m.on === 'boolean') { pvp.on = m.on; modes.setPvp(m.on); }
        if (m.locked) toast('Você não pode sair do PvP logo depois de apanhar.');
        if (m.scores) modes.setScores(m.scores, m.top);
        break;
      case 'throw':
        spawnTomato(m);
        break;
      case 'hp': {
        const now = performance.now();
        if (m.id === myId) {
          vit.hp = m.hp;
          vit.shieldUntil = now + m.sh;
          vit.koUntil = now + m.ko;
          me.label?.setHp(m.hp, m.sh > 0);
        } else {
          const r = remotes.get(m.id);
          if (r) { r.hp = m.hp; r.shieldUntil = now + m.sh; r.koUntil = now + m.ko; r.shieldOn = m.sh > 0; r.label.setHp(m.hp, r.shieldOn); }
        }
        break;
      }
      case 'ko':
        vit.koBy = m.by;
        vit.koUntil = performance.now() + m.ms;
        me.stunUntil = vit.koUntil;
        me.manual = 0;
        hud.setEmote(0);
        if (drive.on) toggleDrive();
        sound.ko();
        break;
      case 'react': {
        const who = m.id === myId ? me : remotes.get(m.id);
        who?.label?.react(REACTIONS[m.e] ?? '👍');
        break;
      }
      case 'who':
        hud.setWho(m.list, m.total);
        break;
      case 'zones':
        radar.setZones(m);
        break;
      case 'zonecap':
        hud.addChat('Domínio', `${SIDES[m.side].name} dominou ${radar.zoneName(m.zone)}!`, SIDES[m.side].color);
        sound.capture();
        break;
      case 'feed':
        hud.addChat('☠️', `${m.a} nocauteou ${m.v}`, SIDES[m.as]?.color ?? '#94a3b8');
        break;
      case 'hitby':
        sound.hit();
        if (m.kind && MELEE[m.kind]) {
          toast(HIT_NAMES[m.kind].replace('%s', m.nick), 'error');
          me.avatar.staggerNow(m.kind);
          me.stunUntil = performance.now() + MELEE[m.kind].stunMs;
          if (drive.on) drive.speed *= 0.3;
        } else {
          toast(`🍅 ${m.nick} te acertou!`, 'error');
          splat(me.avatar);
        }
        break;
      case 'attack': { // golpe de outro jogador (e quem ele acertou)
        const who = remotes.get(m.id);
        if (who && m.kind !== 'car') who.avatar.strikeNow(m.kind);
        const victim = m.hit != null && m.hit !== myId ? remotes.get(m.hit) : null;
        if (victim) victim.avatar.staggerNow(m.kind);
        break;
      }
      case 'look': {
        // itens equipados mudaram (loja)
        if (m.id === myId) me.avatar.setLook({ ...m.look, side: profile.side });
        else {
          const r = remotes.get(m.id);
          if (r) r.avatar.setLook({ ...m.look, side: r.side });
        }
        break;
      }
      case 'denied':
        leavePlay(m.reason);
        break;
      default:
    }
  },
});

// ---------- Lobby e HUD ----------

const sound = new Ambience();

// ---------- Corrida e PvP ----------

const modes = initModes({
  onRace() {
    if (mode !== 'play' || watching) return;
    net.send({ t: 'race', action: race.joined ? 'leave' : 'join' });
    race.joined = !race.joined;
    race.mine = null;
    modes.setRace(race.snap, race.joined, race.mine, 0);
  },
  onPvp() {
    if (mode !== 'play' || watching) return;
    net.send({ t: 'pvp', on: !pvp.on });
  },
  onThrow: () => throwTomato(),
  onDrive: toggleDrive,
});

function onRaceMessage(m) {
  if (m.state === 'finished') { // meu resultado
    race.mine = { time: m.time, place: m.place };
    modes.setRace(race.snap, race.joined, race.mine, 0);
    return;
  }
  if (m.late) { race.joined = false; toast('A corrida já começou. Espere a próxima.'); }
  race.snap = m;
  if (m.state === 'countdown') race.countAt = performance.now();
  if (m.state === 'running' && race.snap.state === 'running' && !race.goAt) race.goAt = performance.now();
  if (m.state === 'running') race.goAt ||= performance.now();
  if (m.state === 'results' || m.state === 'idle') { race.joined = false; race.goAt = 0; if (m.state === 'idle') race.mine = null; }
  if (m.state === 'waiting' && race.joined === false) race.mine = null;
  modes.setRace({ ...m, countLeft: RACE.countdownMs }, race.joined, race.mine, 0);
}

function throwTomato() {
  if (mode !== 'play' || watching || !pvp.on || drive.on || hud.isTyping()) return;
  const now = performance.now();
  if (now - pvp.lastThrow < 1200) return;
  pvp.lastThrow = now;
  net.send({ t: 'throw' });
}

/** Tomate voando do arremessador até o alvo (ou até o fim do alcance). */
function spawnTomato(m) {
  const target = m.hit === myId ? me : remotes.get(m.hit);
  const from = new THREE.Vector3(m.x, 1.3, m.z);
  const to = target
    ? new THREE.Vector3(target.x, 1.2, target.z)
    : new THREE.Vector3(m.x + Math.sin(m.ry) * m.dist, 0.1, m.z + Math.cos(m.ry) * m.dist);
  // arremessa o que estiver na mão: picanha, abóbora ou, se não, tomate
  const thrower = m.id === myId ? me : remotes.get(m.id);
  thrower?.avatar?.throwNow();
  const held = thrower?.avatar?.heldKind;
  let mesh;
  if (held === 4) {
    mesh = new THREE.Mesh(picanhaSkewerGeometry(), propMaterial);
    mesh.userData.spin = 14;
  } else if (held === 5) {
    mesh = new THREE.Mesh(pumpkinGeometry(1), propMaterial);
    mesh.scale.setScalar(0.12);
    mesh.userData.spin = 6;
  } else mesh = new THREE.Mesh(TOMATO_GEO, TOMATO_MAT);
  mesh.castShadow = true;
  scene.add(mesh);
  projectiles.push({ mesh, from, to, t: 0, dur: 0.18 + from.distanceTo(to) * 0.04, target });
  if (m.hit === myId) return; // o 'hitby' já cuida do meu
}

function splat(avatar) {
  const s = new THREE.Sprite(SPLAT_MAT.clone());
  s.scale.setScalar(0.5);
  s.position.set(0, 1.25, 0.2);
  avatar.group.add(s);
  setTimeout(() => { avatar.group.remove(s); s.material.dispose(); }, 3500);
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.t += dt / p.dur;
    const k = Math.min(1, p.t);
    p.mesh.position.lerpVectors(p.from, p.to, k);
    p.mesh.position.y += Math.sin(k * Math.PI) * 1.2; // arco
    if (p.mesh.userData.spin) p.mesh.rotation.x += dt * p.mesh.userData.spin;
    if (k >= 1) {
      scene.remove(p.mesh);
      if (p.target && p.target.avatar) splat(p.target.avatar);
      projectiles.splice(i, 1);
    }
  }
}

const radar = initRadar();

const hud = initHud({
  onChat: (text) => net.send({ t: 'chat', text }),
  onEmote: toggleEmote,
  onAttack: attack,
  onReact: react,
  onWho: () => net.send({ t: 'who' }),
  onLeave: () => window.location.reload(),
  onSound: (on) => sound.setEnabled(on),
  soundOn: sound.enabled,
});

const lobby = initLobby({
  profile,
  presets: PRESETS,
  onAnim: (a) => { lobbyAnim = a; },
  onChange() {
    saveProfile();
    me.avatar.setLook(lookOf(profile.look, profile.side));
  },
  onEnter() {
    if (!net.connected) {
      showError('Sem conexão com o servidor. Tentando novamente…');
      return;
    }
    profile.nick = profile.nick.trim();
    saveProfile();
    if (acct.user) profile.nick = acct.user.nick;
    setMode('play');
    applyViewOffset();
    lobby.hide();
    hud.show();
    sound.start();
    me.label = createLabel(profile.nick || 'Você', SIDES[profile.side].color);
    net.join({ nick: profile.nick, side: profile.side, look: profile.look });
  },
  onWatch() {
    if (!net.connected) {
      showError('Sem conexão com o servidor. Tentando novamente…');
      return;
    }
    setMode('play');
    watching = true;
    applyViewOffset();
    lobby.hide();
    hud.setWatch(true);
    hud.show();
    sound.start();
    me.avatar.group.visible = false;
    net.watch();
  },
});

net.connect();
renderPortraits(renderer, profile.side);

/** Volta do jogo para o lobby (ex.: servidor recusou a entrada). */
function leavePlay(reason) {
  setMode('lobby');
  race.joined = false;
  race.mine = null;
  pvp.on = false;
  modes.setPvp(false);
  Object.assign(vit, { hp: 100, shieldUntil: 0, koUntil: 0, stamina: STAMINA.max, tired: false });
  hud.setKo('');
  if (drive.on) toggleDrive();
  watching = false;
  myId = null;
  net.joinMsg = null;
  clearRemotes();
  me.label?.remove();
  me.label = null;
  me.avatar.group.visible = true;
  me.avatar.group.position.set(0, 0, 0);
  me.avatar.group.rotation.y = 0;
  $('#hud').hidden = true;
  lobby.show();
  applyViewOffset();
  showError(reason || '');
}

// Conta e loja. Trocar de conta exige uma nova conexão: o servidor identifica o
// jogador pelo cookie de sessão no momento em que o WebSocket abre.
const nickInput = $('#nick');
let lastUserNick = null;
initAccount({
  onChange(account, reason) {
    acct = account;
    const nick = account.user?.nick ?? null;
    nickInput.disabled = !!nick;
    nickInput.value = nick ?? profile.nick;
    lobby.syncNick();
    me.avatar.setLook(lookOf(profile.look, profile.side));
    if (reason !== 'items' && nick !== lastUserNick) net.reconnect();
    lastUserNick = nick;
  },
});

// ---------- Loop ----------

let lastFrame = performance.now();
let elapsed = 0;
const tmpV = new THREE.Vector3();
const lerpAngle = (a, b, k) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

function updateLocal(dt) {
  let ix = 0;
  let iy = 0;
  const stunned = performance.now() < me.stunUntil;
  const frozen = (race.joined && race.snap.state === 'countdown') || stunned;
  if (!hud.isTyping() && !frozen) {
    if (keys.KeyW || keys.ArrowUp) iy += 1;
    if (keys.KeyS || keys.ArrowDown) iy -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    if (keys.KeyQ) camYaw += dt * 1.8;
    if (keys.KeyE) camYaw -= dt * 1.8;
  }
  if (!frozen) { ix += hud.joy.x; iy += hud.joy.y; }

  if (drive.on && !watching) { // carro: W/S aceleram e freiam, A/D viram; a câmera segue atrás
    const throttle = Math.max(-1, Math.min(1, iy));
    const steer = Math.max(-1, Math.min(1, ix));
    const v = drive.speed;
    if (throttle > 0) drive.speed += (v < 0 ? VEHICLE.brake : VEHICLE.accel) * throttle * dt;
    else if (throttle < 0) drive.speed += (v > 0 ? VEHICLE.brake : VEHICLE.accel * 0.6) * throttle * dt;
    else drive.speed -= Math.sign(v) * Math.min(Math.abs(v), VEHICLE.drag * dt + Math.abs(v) * 0.6 * dt);
    drive.speed = Math.max(-VEHICLE.reverse, Math.min(VEHICLE.maxSpeed, drive.speed));
    const grip = Math.min(1, Math.abs(drive.speed) / 4);
    me.ry -= steer * VEHICLE.turnRate * grip * Math.sign(drive.speed || 1) * dt;
    me.x += Math.sin(me.ry) * drive.speed * dt;
    me.z += Math.cos(me.ry) * drive.speed * dt;
    me.speed = Math.abs(drive.speed);
    if (!drag) camYaw = lerpAngle(camYaw, me.ry, Math.min(1, dt * 3));
    me.x = Math.min(WORLD.halfWidth, Math.max(-WORLD.halfWidth, me.x));
    me.z = Math.min(WORLD.halfLength, Math.max(-WORLD.halfLength, me.z));
    if (Math.abs(me.x) >= WORLD.halfWidth || Math.abs(me.z) >= WORLD.halfLength) drive.speed *= 0.2; // bateu no limite
    if (collide(1.3)) drive.speed *= 0.45; // bateu em algo
    return;
  }
  const len = Math.hypot(ix, iy);
  if (len > 1) { ix /= len; iy /= len; }

  if (len > 0.08) {
    if (me.manual) { me.manual = 0; hud.setEmote(0); }
    const wantRun = keys.ShiftLeft || keys.ShiftRight || (len > 0.95 && hud.joy.x * hud.joy.x + hud.joy.y * hud.joy.y > 0.9);
    const run = watching ? wantRun : wantRun && !vit.tired && vit.stamina > 0;
    if (!watching) {
      vit.stamina = run ? Math.max(0, vit.stamina - STAMINA.drain * dt) : Math.min(STAMINA.max, vit.stamina + STAMINA.regen * dt);
      if (vit.stamina <= 0) vit.tired = true;
    }
    const base = watching ? (run ? 36 : 16) : (run ? RUN_SPEED : WALK_SPEED);
    me.speed = base * Math.min(1, len);
    // direção da câmera → mundo
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    const mx = fx * iy + -fz * ix;
    const mz = fz * iy + fx * ix;
    const ml = Math.hypot(mx, mz) || 1;
    me.x += (mx / ml) * me.speed * dt;
    me.z += (mz / ml) * me.speed * dt;
    me.ry = lerpAngle(me.ry, Math.atan2(mx, mz), Math.min(1, dt * 12));
  } else {
    me.speed = 0;
    if (!watching) vit.stamina = Math.min(STAMINA.max, vit.stamina + STAMINA.regen * 1.4 * dt);
  }
  if (vit.tired && vit.stamina >= STAMINA.resume) vit.tired = false;

  me.x = Math.min(WORLD.halfWidth, Math.max(-WORLD.halfWidth, me.x));
  me.z = Math.min(WORLD.halfLength, Math.max(-WORLD.halfLength, me.z));
  if (!watching) collide(0.4);
}

/** Empurra o jogador (círculo de raio r) para fora das caixas do cenário: barracas, carros, ônibus, postes e totens. */
function collide(r) {
  let hit = false;
  for (const o of world.obstacles) {
    const dx = me.x - o.x;
    const dz = me.z - o.z;
    const px = o.hx + r - Math.abs(dx);
    const pz = o.hz + r - Math.abs(dz);
    if (px <= 0 || pz <= 0) continue;
    hit = true;
    if (px < pz) me.x += px * Math.sign(dx || 1);
    else me.z += pz * Math.sign(dz || 1);
  }
  return hit;
}

/** Deita o avatar quando nocauteado (e levanta de volta). */
function lie(group, on, dt) {
  const k = group.userData.lie || 0;
  const next = on ? Math.min(1, k + dt * 5) : Math.max(0, k - dt * 3);
  if (next === k) return;
  group.userData.lie = next;
  group.rotation.x = -Math.PI / 2 * next;
  group.position.y = 0.14 * next;
}

function currentAnim() {
  if (drive.on) return DRIVE;
  if (me.speed > 0.1) return 1;
  return me.manual || 0;
}

function sendState(now) {
  const a = currentAnim();
  const s = me.sent;
  const changed = Math.abs(me.x - s.x) > 0.01 || Math.abs(me.z - s.z) > 0.01
    || Math.abs(me.ry - s.ry) > 0.02 || a !== s.a;
  if (watching || !changed || now - s.at < 66) return;
  net.send({ t: 'move', x: me.x, z: me.z, ry: me.ry, a });
  s.x = me.x; s.z = me.z; s.ry = me.ry; s.a = a; s.at = now;
}

function updateRemotes(dt) {
  const k = 1 - Math.exp(-dt * 12);
  for (const r of remotes.values()) {
    const px = r.x;
    const pz = r.z;
    r.x += (r.tx - r.x) * k;
    r.z += (r.tz - r.z) * k;
    r.ry = lerpAngle(r.ry, r.tr, k);
    const v = Math.hypot(r.x - px, r.z - pz) / Math.max(dt, 1e-3);
    r.speed += (v - r.speed) * Math.min(1, dt * 8);
    r.avatar.group.position.set(r.x, 0, r.z);
    r.avatar.group.rotation.y = r.ry;
    r.vx = (r.x - px) / Math.max(dt, 1e-3);
    r.vz = (r.z - pz) / Math.max(dt, 1e-3);
    const driving = r.anim === DRIVE;
    if (driving) {
      if (!r.car) { r.car = carMesh(SIDES[r.side].color); scene.add(r.car); }
      r.car.visible = true;
      r.car.position.set(r.x, 0, r.z);
      r.car.rotation.y = r.ry;
      r.avatar.group.visible = false;
      continue;
    }
    if (r.car) r.car.visible = false;
    r.avatar.group.visible = true;
    if (r.shieldOn && performance.now() > r.shieldUntil) { r.shieldOn = false; r.label.setHp(r.hp, false); }
    const down = performance.now() < r.koUntil;
    lie(r.avatar.group, down, dt);
    const anim = down || (r.anim === 1 && r.speed < 0.3) ? 'idle' : ANIMS[r.anim] ?? 'idle';
    r.avatar.update(dt, anim, r.speed);
  }
}

/** Carros em movimento (meu e dos outros), para a multidão cair quando atropelada. */
function movingCars() {
  const list = [];
  if (drive.on && Math.abs(drive.speed) > 2) {
    list.push({ x: me.x, z: me.z, vx: Math.sin(me.ry) * drive.speed, vz: Math.cos(me.ry) * drive.speed });
  }
  for (const r of remotes.values()) if (r.anim === DRIVE && r.speed > 2) list.push({ x: r.x, z: r.z, vx: r.vx, vz: r.vz });
  return list;
}

function placeLabel(label, x, z, height) {
  const dist = Math.hypot(camera.position.x - x, camera.position.z - z);
  tmpV.set(x, height, z).project(camera);
  const show = tmpV.z < 1 && tmpV.z > -1 && dist < (watching ? 90 : 45);
  label.place((tmpV.x * 0.5 + 0.5) * window.innerWidth, (-tmpV.y * 0.5 + 0.5) * window.innerHeight, show);
}

function updateCamera(dt, time) {
  if (mode === 'lobby') {
    // o personagem gira devagar (ou pelo arrasto) com a câmera fixa à frente
    if (performance.now() > lobbyDragUntil) lobbyYaw += dt * 0.25;
    me.avatar.group.rotation.y = lobbyYaw;
    const r = camera.aspect < 0.8 ? 6.2 : 4.1; // celular em pé: afasta para caber o avatar
    camera.position.set(0.6, 1.45, r);
    camera.lookAt(0, 0.95, 0);
    return;
  }
  const dist = watching ? 20 : camDist;
  const cp = Math.cos(camPitch);
  const wanted = tmpV.set(
    me.x - Math.sin(camYaw) * dist * cp,
    1.5 + Math.sin(camPitch) * dist,
    me.z - Math.cos(camYaw) * dist * cp,
  );
  camera.position.lerp(wanted, 1 - Math.exp(-dt * 10));
  camera.lookAt(me.x, watching ? 1 : 1.45, me.z);
}

function updateHud(now) {
  if (now >= vit.next) {
    vit.next = now + 100;
    const shield = now < vit.shieldUntil;
    hud.setVitals({
      hp: vit.hp, shield, pvp: pvp.on && !watching, stamina: vit.stamina, tired: vit.tired,
    });
    if (shield !== me.shieldOn) { me.shieldOn = shield; me.label?.setHp(vit.hp, shield); }
    const left = vit.koUntil - now;
    hud.setKo(left > 0 ? `💫 Nocauteado${vit.koBy ? ` por ${esc(vit.koBy)}` : ''}<small>volta em ${Math.ceil(left / 1000)} s</small>` : '');
  }
  radar.update(now, me, remotes, watching);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  elapsed += dt;
  const time = elapsed;

  if (mode === 'play') {
    updateLocal(dt);
    sendState(now);
    if (!watching) {
      me.avatar.group.position.set(me.x, 0, me.z);
      me.avatar.group.rotation.y = me.ry;
      if (drive.on) {
        drive.mesh.position.set(me.x, 0, me.z);
        drive.mesh.rotation.y = me.ry;
      } else {
        lie(me.avatar.group, now < vit.koUntil, dt);
        me.avatar.update(dt, now < vit.koUntil ? 'idle' : ANIMS[currentAnim()], me.speed);
      }
    }
  } else {
    const running = lobbyAnim === 'run';
    me.avatar.update(dt, running ? 'walk' : lobbyAnim, running ? 7.5 : lobbyAnim === 'walk' ? 3.2 : 0);
  }

  updateRemotes(dt);
  updateProjectiles(dt);
  if (race.joined && (race.snap.state === 'countdown' || race.snap.state === 'running') && !race.mine) {
    const countLeft = RACE.countdownMs - (now - race.countAt);
    modes.setRace({ ...race.snap, countLeft }, true, null, race.goAt ? now - race.goAt : 0);
  }
  if (mode === 'play') updateHud(now);
  world.update(time, mode === 'play' ? me.x : 0, mode === 'play' ? me.z : 0, mode === 'play' ? movingCars() : []);
  updateCamera(dt, time);

  if (mode === 'play') {
    camera.updateMatrixWorld();
    if (me.label) placeLabel(me.label, me.x, me.z, me.avatar.height + 0.3);
    for (const r of remotes.values()) placeLabel(r.label, r.x, r.z, r.avatar.height + 0.3);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Métricas de depuração (equivalente simples ao do site original).
window.__AVENIDA__ = {
  get players() { return remotes.size + (mode === 'play' && !watching ? 1 : 0); },
  get watching() { return watching; },
  get connected() { return net.connected; },
  get mode() { return mode; },
  get pos() { return { x: me.x, z: me.z }; },
  /** Só para depuração: posiciona a câmera livre (modo assistir). */
  setView(x, z, yaw = camYaw, pitch = camPitch) { me.x = x; me.z = z; camYaw = yaw; camPitch = pitch; },
  setLobbyYaw(y) { lobbyYaw = y; lobbyDragUntil = performance.now() + 60000; },
  info: renderer.info,
  movingCars,
  // só para depuração no console
  THREE, Avatar, renderer, scene, world,
};
