import * as THREE from 'three';
import './votacao.css';
import { Avatar } from '../avatar.js';
import { loadModels } from '../models.js';
import { Net } from '../net.js';
import { loadingScreen, createLabel } from '../ui.js';
import { SHIRTS, SKINS, MODELS, BODIES } from '../../shared/config.js';
import {
  PLACES, SECOES, CARGOS, QUEUE, queueSpot, boundsFor, clampPos, near, mesaria, cabine, roomDoor,
} from '../../shared/votacao.js';
import { createVotacaoWorld } from './world.js';
import { openUrna } from './urna.js';
import { track, trackVisit } from '../track.js';

const $ = (s) => document.querySelector(s);
const toast = (text) => { const t = $('#toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 6000); };

// ---------- Cena ----------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 600);
const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
addEventListener('resize', resize);
resize();

// ---------- Perfil ----------
const KEY = 'avenida-online:votacao';
const profile = (() => {
  const base = { nick: '', look: { body: 0, age: 0, face: 1, height: 1, skin: 2, hairStyle: 0, hair: 1, beard: 0, shirt: 3, top: 0, pants: 0, flag: 0, sign: '' } };
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s?.look) return { ...base, ...s, look: { ...base.look, ...s.look } }; } catch { /* sem storage */ }
  return base;
})();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* ignore */ } };
const lookOf = (l) => ({ ...l, side: 3, equip: {}, custom: {} });
trackVisit();

// ---------- Carregamento ----------
loadingScreen.start();
try {
  await loadModels((stage, pct) => {
    if (stage === 'download') loadingScreen.set(8 + pct * 70, 'Baixando os personagens');
    else loadingScreen.set(80, 'Montando o bairro');
  });
} catch (err) {
  loadingScreen.fail('Não foi possível carregar os personagens. Verifique a conexão e tente de novo.');
  throw err;
}
loadingScreen.set(92, 'Montando a escola');
const world = createVotacaoWorld(scene, renderer);

// ---------- Estado ----------
const me = {
  id: 0, x: PLACES.spawn.x, z: PLACES.spawn.z, ry: 0, speed: 0, stage: 'casa', docs: {}, secao: null, sala: -1,
  avatar: new Avatar(lookOf(profile.look)), label: null, tx: null, tz: null,
};
me.avatar.group.position.set(me.x, 0, me.z);
scene.add(me.avatar.group);
let started = false;
let joined = false;
const remotes = new Map();
const npcs = new Map(); // id negativo -> { avatar, tx, tz, leaving }
let lineEntries = [];
const times = { start: 0, queueIn: 0, queueOut: 0 };
let camYaw = 0;
let camPitch = 0.35;
let camDist = 5.2;
let urnaClose = null;

const SIDE_NONE = 3;
const npcLook = (seed) => {
  const r = (n) => Math.abs(Math.sin(seed * 91.7 + n * 13.1));
  const body = r(1) < 0.5 ? 0 : 1;
  return lookOf({
    body, age: r(2) < 0.2 ? 1 : 0, face: Math.floor(r(3) * 3), height: Math.floor(r(4) * 3), skin: Math.floor(r(5) * SKINS.length), hairStyle: 0, hair: Math.floor(r(6) * 4), beard: 0, shirt: Math.floor(r(7) * SHIRTS.length), top: 0, pants: Math.floor(r(8) * 4), flag: 0, sign: '',
  });
};
function standing(look, x, z, ry) {
  const a = new Avatar(look);
  a.group.position.set(x, 0, z);
  a.group.rotation.y = ry;
  scene.add(a.group);
  return a;
}
const still = []; // figurantes parados (mesários, vizinhos, guardas)
function addStill(seed, x, z, ry, shirt) {
  const look = npcLook(seed);
  if (shirt != null) look.shirt = shirt;
  still.push(standing(look, x, z, ry));
}
// mesários (dois por sala) e vizinhos
PLACES.roomX.forEach((rx, i) => {
  const m = mesaria(i);
  addStill(100 + i * 2, m.x - 0.7, m.z + 0.95, Math.PI, 3);
  addStill(101 + i * 2, m.x + 0.7, m.z + 0.95, Math.PI, 3);
});
[[-6.4, 12, 1.2], [6.5, 26, -1.9], [-6.2, 38, 0.6], [6.3, 47, 3], [3.4, PLACES.panfleteiro.z, 2.4], [-5, 57, 0.4], [-8, 70, 2], [8, 78, -2.2]]
  .forEach(([x, z, ry], i) => addStill(200 + i, x, z, ry));

// ---------- Rede ----------
const net = new Net({
  open() { $('#von').textContent = ''; },
  close(code, fatal) { if (fatal) { $('#verror').textContent = fatal; $('#verror').hidden = false; } if (joined) toast('Conexão perdida. Reconectando…'); },
  message: onMessage,
}, '/ws');
net.connect();

function addRemote(p) {
  if (remotes.has(p.id)) return;
  const avatar = new Avatar(lookOf(p.look || {}));
  avatar.group.position.set(p.x, 0, p.z);
  avatar.group.rotation.y = p.ry;
  scene.add(avatar.group);
  remotes.set(p.id, {
    id: p.id, avatar, label: createLabel(p.nick, '#3a9b5c', {}), x: p.x, z: p.z, ry: p.ry, tx: p.x, tz: p.z, tr: p.ry, speed: 0,
  });
}
function removeRemote(id) {
  const r = remotes.get(id);
  if (!r) return;
  scene.remove(r.avatar.group);
  r.avatar.dispose();
  r.label.remove();
  remotes.delete(id);
}

const STEPS = [
  ['casa', 'Em casa', 'Pegue o documento com foto na mesa (o título e uma colinha ajudam) e saia pela porta.'],
  ['rua', 'A caminho da escola', 'Siga pela rua até o portão da Escola Municipal Esperança.'],
  ['patio', 'No pátio', 'Vá até a entrada da fila, em frente ao prédio, e entre nela.'],
  ['fila', 'Na fila', 'Aguarde: a fila anda sozinha. Quem sai da fila perde a vez.'],
  ['corredor', 'No corredor', 'Procure a placa da sua seção e entre na sala certa.'],
  ['secao', 'Na seção', 'Vá à mesa dos mesários, apresente o documento e coloque o dedo no leitor.'],
  ['habilitado', 'Habilitado', 'Vá até a cabine de votação.'],
  ['urna', 'Na urna', 'Digite o número do candidato e confirme. Seu voto é secreto.'],
  ['votou', 'Voto confirmado', 'Saia da escola pelo portão.'],
  ['fim', 'Você votou!', 'Missão cumprida.'],
];
const stepIdx = (s) => STEPS.findIndex((x) => x[0] === s);

function beaconTarget() {
  const P = PLACES;
  switch (me.stage) {
    case 'casa': return me.docs.doc ? P.porta : P.mesa;
    case 'rua': return me.docs.doc ? { x: 0, z: P.gateZ + 1 } : P.mesa;
    case 'patio': return P.filaEntrada;
    case 'corredor': return me.sala >= 0 ? roomDoor(me.sala) : null;
    case 'secao': return me.sala >= 0 ? mesaria(me.sala) : null;
    case 'habilitado': return me.sala >= 0 ? cabine(me.sala) : null;
    case 'votou': return P.saida;
    default: return null;
  }
}

function renderGoal(text) {
  const i = stepIdx(me.stage);
  $('#vstep').textContent = STEPS[i][1] + (me.secao && i >= 2 && i < 9 ? ` · Seção ${me.secao}` : '');
  $('#vtext').textContent = text || STEPS[i][2];
  $('#vsteps').replaceChildren(...STEPS.map((_, k) => { const li = document.createElement('li'); li.className = k < i ? 'done' : k === i ? 'on' : ''; return li; }));
}

function setStage(m) {
  const prev = me.stage;
  me.stage = m.stage;
  if (m.docs) me.docs = m.docs;
  me.secao = m.secao;
  me.sala = m.sala ?? me.sala;
  if (m.stage === 'fila' && prev !== 'fila') times.queueIn = performance.now();
  if (prev === 'fila' && m.stage !== 'fila') times.queueOut = performance.now();
  renderGoal(m.text);
  if (m.text) toast(m.text);
  $('#vqueue').hidden = m.stage !== 'fila';
  if (m.stage === 'urna') startUrna();
  if (m.stage === 'fim') showComprovante();
  if (m.stage === 'rua' && prev === 'secao') closeModal();
  $('#vcola').hidden = !me.docs.colinha;
}

function onMessage(m) {
  switch (m.t) {
    case 'welcome':
      joined = true;
      me.id = m.id;
      me.x = m.x; me.z = m.z;
      me.avatar.group.position.set(m.x, 0, m.z);
      me.stage = m.stage;
      me.docs = m.docs || {};
      if (m.nick) { me.label?.remove(); me.label = createLabel(m.nick, '#ffd23f', {}); }
      renderGoal();
      break;
    case 'sync':
      for (const p of m.add) addRemote(p);
      for (const id of m.del) removeRemote(id);
      for (const [id, x, z, ry, a] of m.s) {
        const r = remotes.get(id);
        if (r) { r.tx = x; r.tz = z; r.tr = ry; r.moving = a > 0; }
      }
      break;
    case 'stage': setStage(m); break;
    case 'docs': me.docs = m.docs; $('#vcola').hidden = !me.docs.colinha; refreshMesa(); break;
    case 'tp':
      if (m.soft) { me.tx = m.x; me.tz = m.z; } else { me.x = m.x; me.z = m.z; me.ry = m.ry ?? me.ry; me.tx = null; }
      break;
    case 'line': lineEntries = m.entries; syncNpcs(); break;
    case 'mesario': startBiometria(m.ms); break;
    case 'notice': toast(m.text); break;
    case 'vonline': $('#von').textContent = `${m.n} eleitor${m.n === 1 ? '' : 'es'} na escola`; break;
    case 'chat': logChat(m); break;
    case 'denied': $('#verror').textContent = m.reason; $('#verror').hidden = false; $('#vlobby').hidden = false; $('#vhud').hidden = true; started = false; joined = false; net.joinMsg = null; break;
    default:
  }
}

// ---------- Fila: NPCs andando de verdade ----------
function syncNpcs() {
  const ids = new Set(lineEntries.filter((e) => e < 0));
  lineEntries.forEach((e, idx) => {
    if (e >= 0) return;
    const s = queueSpot(idx);
    let n = npcs.get(e);
    if (!n) {
      n = { avatar: standing(npcLook(-e), s.x, PLACES.yard.z0 + 3, 0), tx: s.x, tz: s.z, leaving: false };
      npcs.set(e, n);
    }
    n.tx = s.x; n.tz = s.z;
  });
  for (const [id, n] of npcs) {
    if (!ids.has(id) && !n.leaving) { n.leaving = true; n.tx = PLACES.corridorSpawn.x; n.tz = PLACES.buildingDoor.z1 + 0.5; }
  }
}
function stepToward(av, st, tx, tz, dt, speed = 1.6) {
  const dx = tx - st.x; const dz = tz - st.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return 0;
  const step = Math.min(d, speed * dt);
  st.x += (dx / d) * step; st.z += (dz / d) * step;
  av.group.position.set(st.x, 0, st.z);
  av.group.rotation.y = Math.atan2(dx, dz);
  return step / dt;
}

// ---------- Modais ----------
const modal = $('#vmodal');
const mbody = $('#vmodal-body');
function openModal(html) { mbody.innerHTML = html; modal.hidden = false; }
function closeModal() { modal.hidden = true; mbody.replaceChildren(); refreshMesa.fn = null; }
const act = (id) => net.send({ t: 'act', id });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function colinhaHtml() {
  return `<div class="vcolinha"><h4>Candidatos desta simulação (fictícios)</h4>${CARGOS.map((c) => `<div><b>${esc(c.nome)}</b> · ${c.digitos} dígitos<ul>${c.candidatos.map((k) => `<li><b>${k.numero}</b> ${esc(k.nome)}</li>`).join('')}</ul></div>`).join('')}</div>`;
}
function refreshMesa() { refreshMesa.fn?.(); }
function openMesa() {
  const draw = () => {
    const d = me.docs;
    mbody.innerHTML = `<h3>Mesa da sala</h3><p>O que você leva para votar? Sem documento com foto você não vota.</p>
      <button class="vitem" data-k="doc" aria-pressed="${!!d.doc}">🪪 <span><b>Documento com foto</b><small>Obrigatório (RG, CNH, passaporte…)</small></span></button>
      <button class="vitem" data-k="titulo" aria-pressed="${!!d.titulo}">🗳️ <span><b>Título de eleitor / e-Título</b><small>Ajuda a achar o local, mas o documento com foto basta</small></span></button>
      <button class="vitem" data-k="colinha" aria-pressed="${!!d.colinha}">📝 <span><b>Colinha com os números</b><small>Permitido levar anotações em papel</small></span></button>
      ${d.colinha ? colinhaHtml() : ''}
      <button class="primary" data-close type="button">Fechar</button>`;
    mbody.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => act(b.dataset.k); });
    mbody.querySelector('[data-close]').onclick = closeModal;
  };
  refreshMesa.fn = draw;
  draw();
  modal.hidden = false;
}
$('#vcola').onclick = () => { openModal(`<h3>Sua colinha</h3>${colinhaHtml()}<button class="primary" data-close type="button">Fechar</button>`); mbody.querySelector('[data-close]').onclick = closeModal; };

function openMesario() {
  openModal(`<h3>Mesa dos mesários</h3><p>"Bom dia! Documento com foto, por favor." Apresente o documento e depois mantenha o dedo no leitor de digital até terminar.</p>
    <button class="primary" id="vdoc" type="button">Entregar o documento</button>
    <button class="primary vhold" id="vhold" type="button" hidden><i></i><span>Segure para a biometria</span></button>
    <button class="link" data-close type="button">Cancelar</button>`);
  $('#vdoc').onclick = () => act('mesario');
  mbody.querySelector('[data-close]').onclick = closeModal;
}
function startBiometria(ms) {
  if (modal.hidden) return;
  const doc = $('#vdoc'); const hold = $('#vhold');
  if (!hold) return;
  doc.hidden = true; hold.hidden = false;
  const bar = hold.querySelector('i');
  let t0 = 0; let raf = 0;
  const total = (ms || 1500) + 150;
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / total);
    bar.style.width = `${k * 100}%`;
    if (k >= 1) { release(); act('biometria'); closeModal(); beep(); return; }
    raf = requestAnimationFrame(tick);
  };
  const press = (e) => { e.preventDefault(); t0 = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); };
  function release() { cancelAnimationFrame(raf); bar.style.width = '0'; }
  hold.onpointerdown = press;
  hold.onpointerup = release; hold.onpointerleave = release; hold.onpointercancel = release;
}
function beep() { try { const c = new (window.AudioContext || window.webkitAudioContext)(); const o = c.createOscillator(); const g = c.createGain(); o.frequency.value = 1000; g.gain.value = 0.1; o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.15); } catch { /* sem áudio */ } }

function startUrna() {
  closeModal();
  me.avatar.group.visible = false;
  urnaClose = openUrna($('#urna'), {
    onDone() {
      me.avatar.group.visible = true;
      urnaClose = null;
      let tries = 0;
      const send = () => { if (me.stage === 'votou' || me.stage === 'fim' || tries++ > 20) return; act('votou'); setTimeout(send, 1000); };
      send();
    },
  });
}

// ---------- Comprovante ----------
function showComprovante() {
  const now = new Date();
  const mins = (ms) => `${Math.max(1, Math.round(ms / 60000))} min`;
  const fila = times.queueOut && times.queueIn ? Math.round((times.queueOut - times.queueIn) / 1000) : 0;
  const total = times.start ? mins(performance.now() - times.start) : '—';
  const c = document.createElement('canvas');
  c.width = 720; c.height = 440;
  const g = c.getContext('2d');
  g.fillStyle = '#f5f1e3'; g.fillRect(0, 0, 720, 440);
  g.strokeStyle = '#138a36'; g.lineWidth = 8; g.strokeRect(14, 14, 692, 412);
  g.fillStyle = '#10261b'; g.textAlign = 'center';
  g.font = '800 40px system-ui, sans-serif'; g.fillText('EU VOTEI! (simulado)', 360, 90);
  g.font = '600 24px system-ui, sans-serif';
  g.fillText(`Seção ${me.secao ?? ''} · Escola Municipal Esperança`, 360, 150);
  g.fillText(`${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 360, 190);
  g.fillText(`Tempo na fila: ${fila} s · Jornada: ${total}`, 360, 240);
  g.font = '500 18px system-ui, sans-serif'; g.fillStyle = '#3d5a49';
  g.fillText('Comprovante de brincadeira: simulador educativo, não oficial.', 360, 320);
  g.fillText('Candidatos e partidos fictícios. Nenhum voto foi guardado.', 360, 350);
  g.fillText('avenidaonline.com/votacao', 360, 400);
  const url = c.toDataURL('image/png');
  openModal(`<h3>🎉 Você votou!</h3><p>Na eleição de verdade: leve documento com foto, confira o local no e-Título/site do TSE e não leve o celular para a cabine.</p>
    <img class="vcomp" alt="Comprovante simulado" src="${url}" />
    <a class="primary" href="${url}" download="comprovante-simulado.png" style="text-align:center;text-decoration:none">Baixar comprovante</a>
    <button class="primary" id="vshare" type="button">Compartilhar</button>
    <button class="link" data-close type="button">Fechar</button>`);
  mbody.querySelector('[data-close]').onclick = closeModal;
  $('#vshare').onclick = async () => {
    track('share');
    const text = 'Votei no simulador de votação (educativo, com candidatos fictícios). Do portão à urna: ';
    const link = `${location.origin}/votacao?src=comprovante`;
    if (navigator.share) { try { await navigator.share({ title: 'Simulador de Votação', text, url: link }); return; } catch { /* cancelado */ } }
    try { await navigator.clipboard.writeText(`${text}${link}`); toast('Link copiado!'); } catch { toast(link); }
  };
}

// ---------- Chat ----------
function logChat(m) {
  const line = document.createElement('div');
  line.textContent = `${m.nick}: ${m.text}`;
  $('#vlog').append(line);
  while ($('#vlog').children.length > 6) $('#vlog').firstChild.remove();
  (m.id === me.id ? me : remotes.get(m.id))?.label?.say(m.text);
}
$('#vchatform').addEventListener('submit', (e) => { e.preventDefault(); const i = $('#vchat'); const t = i.value.trim(); if (t) net.send({ t: 'chat', text: t }); i.value = ''; i.blur(); });
addEventListener('keydown', (e) => { if (e.key === 'Enter' && started && document.activeElement?.tagName !== 'INPUT' && modal.hidden && !urnaClose) { e.preventDefault(); $('#vchat').focus(); } });

// ---------- Lobby do eleitor ----------
$('#vnick').value = profile.nick;
const swatch = (list, key, root) => list.forEach((c, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'sw'; b.style.background = c; b.setAttribute('aria-label', `${key} ${i + 1}`);
  b.onclick = () => { profile.look[key] = i; paint(); };
  root.append(b);
});
function paint() {
  document.querySelectorAll('#vbodies .segbtn').forEach((n, i) => n.classList.toggle('on', i === profile.look.body));
  const faces = $('#vfaces'); faces.replaceChildren();
  MODELS[profile.look.body === 1 ? 'female' : 'male'].forEach((_, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = `segbtn${profile.look.face === i ? ' on' : ''}`; b.textContent = `Rosto ${i + 1}`;
    b.onclick = () => { profile.look.face = i; paint(); }; faces.append(b);
  });
  document.querySelectorAll('#vshirts .sw').forEach((n, i) => n.classList.toggle('on', i === profile.look.shirt));
  document.querySelectorAll('#vskins .sw').forEach((n, i) => n.classList.toggle('on', i === profile.look.skin));
  me.avatar.setLook(lookOf(profile.look));
  save();
}
BODIES.forEach((name, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'segbtn'; b.textContent = name;
  b.onclick = () => { profile.look.body = i; if (profile.look.face >= MODELS[i === 1 ? 'female' : 'male'].length) profile.look.face = 0; paint(); };
  $('#vbodies').append(b);
});
swatch(SHIRTS, 'shirt', $('#vshirts'));
swatch(SKINS, 'skin', $('#vskins'));
paint();

$('#vstart').onclick = () => {
  if (!net.connected) { $('#verror').textContent = 'Sem conexão com o servidor. Tentando novamente…'; $('#verror').hidden = false; return; }
  profile.nick = $('#vnick').value.trim(); save();
  started = true; times.start = performance.now();
  $('#vlobby').hidden = true; $('#vhud').hidden = false;
  net.join({ nick: profile.nick, look: profile.look });
  net.joinMsg = { t: 'vjoin', nick: profile.nick, look: profile.look };
  track('enter');
};
$('#vhud').hidden = true;
net.join = function join(payload) { this.enter({ t: 'vjoin', ...payload }); };

// ---------- Controles ----------
const keys = {};
addEventListener('keydown', (e) => { if (e.target instanceof HTMLInputElement) return; keys[e.code] = true; if (e.code === 'KeyE') interact(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
const joy = { x: 0, y: 0 };
{
  const el = $('#vjoy'); const knob = el.firstElementChild;
  const set = (e) => { const r = el.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2); const dy = e.clientY - (r.top + r.height / 2); const m = Math.min(1, Math.hypot(dx, dy) / 45); const a = Math.atan2(dy, dx); joy.x = Math.cos(a) * m; joy.y = -Math.sin(a) * m; knob.style.transform = `translate(${joy.x * 30}px, ${-joy.y * 30}px)`; };
  el.onpointerdown = (e) => { el.setPointerCapture(e.pointerId); set(e); };
  el.onpointermove = (e) => { if (e.buttons || e.pressure) set(e); };
  const end = () => { joy.x = 0; joy.y = 0; knob.style.transform = ''; };
  el.onpointerup = end; el.onpointercancel = end;
}
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  camYaw -= (e.clientX - drag.x) * 0.006; camPitch = Math.min(1.2, Math.max(0.1, camPitch + (e.clientY - drag.y) * 0.004));
  drag.x = e.clientX; drag.y = e.clientY;
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => { camDist = Math.min(9, Math.max(3, camDist + Math.sign(e.deltaY) * 0.5)); }, { passive: true });

// ---------- Interação ----------
function currentAction() {
  if (!started || !joined || !modal.hidden || urnaClose) return null;
  const P = PLACES; const s = me.stage; const p = { x: me.x, z: me.z };
  if ((s === 'casa' || s === 'rua') && near(p, P.mesa)) return { label: '🗂️ Mesa: pegar documentos', run: openMesa };
  if (s === 'casa' && near(p, P.porta)) return { label: '🚪 Sair de casa', run: () => act('sair_casa') };
  if (s === 'rua' && near(p, P.panfleteiro)) return { label: '✋ Recusar o santinho', run: () => act('panfleto') };
  if (s === 'patio' && near(p, P.filaEntrada)) return { label: '🧍 Entrar na fila', run: () => act('fila') };
  if (s === 'secao' && me.sala >= 0 && near(p, mesaria(me.sala))) return { label: '🪪 Apresentar documento', run: openMesario };
  if (s === 'habilitado' && me.sala >= 0 && near(p, cabine(me.sala))) return { label: '🗳️ Entrar na cabine e votar', run: () => act('cabine') };
  if (s === 'votou' && near(p, P.saida)) return { label: '🚪 Sair da escola', run: () => act('sair_escola') };
  return null;
}
function interact() { currentAction()?.run(); }
$('#vinteract').onclick = interact;
$('#vqleave').onclick = () => act('sair_fila');

// ---------- Laço ----------
const _tmp = new THREE.Vector3();
let last = performance.now();
let sentAt = 0;
let sent = { x: 0, z: 0, ry: 0 };
let elapsed = 0;

function updateMe(dt) {
  const typing = document.activeElement?.tagName === 'INPUT';
  const locked = !started || !joined || me.stage === 'fila' || me.stage === 'urna' || !modal.hidden || typing;
  let ix = 0; let iy = 0;
  if (!locked) {
    if (keys.KeyW || keys.ArrowUp) iy += 1;
    if (keys.KeyS || keys.ArrowDown) iy -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    ix += joy.x; iy += joy.y;
  }
  if (!typing && keys.KeyQ) camYaw += dt * 1.8;
  const len = Math.hypot(ix, iy);
  if (me.tx != null) { // o servidor reposiciona (fila, corredor…): vai suave até lá
    const k = 1 - Math.exp(-dt * 6);
    me.x += (me.tx - me.x) * k; me.z += (me.tz - me.z) * k;
    if (Math.hypot(me.tx - me.x, me.tz - me.z) < 0.03) me.tx = null;
    me.speed = 0;
  } else if (len > 0.05) {
    const run = keys.ShiftLeft || keys.ShiftRight;
    const v = (run ? 5.2 : 2.9) * Math.min(1, len);
    const fx = Math.sin(camYaw); const fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw); const rz = Math.sin(camYaw);
    const dx = (fx * iy + rx * ix) / len; const dz = (fz * iy + rz * ix) / len;
    const c = clampPos(boundsFor(me.stage, Math.max(0, me.sala)), me.x + dx * v * dt, me.z + dz * v * dt);
    me.x = c.x; me.z = c.z;
    me.ry = Math.atan2(dx, dz);
    me.speed = v;
  } else me.speed = 0;
  if (me.stage === 'fila') { me.ry = 0; me.speed = 0; }
  if (started) {
    me.avatar.group.position.set(me.x, 0, me.z);
    me.avatar.group.rotation.y = me.stage === 'fila' ? 0 : me.ry;
  }
  me.avatar.update(dt, me.speed > 0.1 ? 'walk' : 'idle', me.speed);
  const now = performance.now();
  if (joined && me.stage !== 'fila' && now - sentAt > 66 && (Math.abs(me.x - sent.x) > 0.01 || Math.abs(me.z - sent.z) > 0.01 || Math.abs(me.ry - sent.ry) > 0.02)) {
    net.send({ t: 'move', x: me.x, z: me.z, ry: me.ry, a: me.speed > 5 ? 2 : me.speed > 0.1 ? 1 : 0 });
    sent = { x: me.x, z: me.z, ry: me.ry }; sentAt = now;
  }
}

function updateCamera(dt) {
  if (!started) { // tela do eleitor: câmera gira em volta do personagem, dentro de casa
    const a = elapsed * 0.25;
    camera.position.set(me.x + Math.sin(a + 0.6) * 2.6, 1.5, me.z + Math.cos(a + 0.6) * 2.6 + 0.4);
    camera.lookAt(me.x - 0.9, 1.0, me.z);
    me.avatar.group.rotation.y = 0.3;
    return;
  }
  const cp = Math.cos(camPitch);
  const want = _tmp.set(me.x - Math.sin(camYaw) * camDist * cp, 1.5 + Math.sin(camPitch) * camDist, me.z - Math.cos(camYaw) * camDist * cp);
  camera.position.lerp(want, 1 - Math.exp(-dt * 10));
  camera.lookAt(me.x, 1.45, me.z);
}

function labelAt(label, x, z, h) {
  tmpProject.set(x, h, z).project(camera);
  const dist = Math.hypot(camera.position.x - x, camera.position.z - z);
  label.place((tmpProject.x * 0.5 + 0.5) * innerWidth, (-tmpProject.y * 0.5 + 0.5) * innerHeight, tmpProject.z < 1 && tmpProject.z > -1 && dist < 40);
}
const tmpProject = new THREE.Vector3();

function updateHud() {
  const a = currentAction();
  const btn = $('#vinteract');
  btn.hidden = !a;
  if (a) btn.textContent = `${a.label} (E)`;
  const tgt = beaconTarget();
  world.setBeacon(started && joined ? tgt : null);
  $('#vdist').textContent = tgt && started ? `Próximo ponto: ${Math.round(Math.hypot(tgt.x - me.x, tgt.z - me.z))} m` : '';
  if (me.stage === 'fila') {
    const pos = lineEntries.indexOf(me.id);
    if (pos >= 0) {
      $('#vqpos').textContent = pos === 0 ? 'Você é o próximo!' : `${pos} pessoa${pos === 1 ? '' : 's'} na sua frente`;
      $('#vqtime').textContent = `~${Math.round((pos + 1) * (QUEUE.advanceMs / 1000))} s`;
    }
  }
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now; elapsed += dt;
  updateMe(dt);
  for (const r of remotes.values()) {
    const k = 1 - Math.exp(-dt * 10);
    const px = r.x; const pz = r.z;
    r.x += (r.tx - r.x) * k; r.z += (r.tz - r.z) * k;
    let dr = r.tr - r.ry; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); r.ry += dr * k;
    r.speed = Math.hypot(r.x - px, r.z - pz) / Math.max(dt, 0.001);
    r.avatar.group.position.set(r.x, 0, r.z); r.avatar.group.rotation.y = r.ry;
    r.avatar.update(dt, r.speed > 0.3 ? 'walk' : 'idle', r.speed);
  }
  for (const [id, n] of npcs) {
    n.x ??= n.avatar.group.position.x; n.z ??= n.avatar.group.position.z;
    const sp = stepToward(n.avatar, n, n.tx, n.tz, dt);
    n.avatar.update(dt, sp > 0.2 ? 'walk' : 'idle', sp);
    if (n.leaving && sp === 0) { scene.remove(n.avatar.group); n.avatar.dispose(); npcs.delete(id); }
  }
  for (const a of still) a.update(dt, 'idle', 0);
  world.update(elapsed, me.x, me.z);
  updateCamera(dt);
  if (started) {
    camera.updateMatrixWorld();
    if (me.label) labelAt(me.label, me.x, me.z, me.avatar.height + 0.3);
    for (const r of remotes.values()) labelAt(r.label, r.x, r.z, r.avatar.height + 0.3);
    updateHud();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
requestAnimationFrame(() => loadingScreen.done());

// Depuração e testes (só leitura/atalhos de câmera)
window.__VOTO__ = {
  get stage() { return me.stage; },
  get pos() { return { x: me.x, z: me.z }; },
  get npcs() { return npcs.size; },
  get remotes() { return remotes.size; },
  get connected() { return net.connected; },
  /** Só para testes: leva o personagem até lá (o servidor ainda confere o limite de cada etapa). */
  warp(x, z) { me.x = x; me.z = z; me.tx = null; },
  get sala() { return me.sala; },
};
addEventListener('pagehide', () => net.leave());
