import {
  SIDES, SHIRTS, SKINS, BODIES, AGES, MODELS, HEIGHTS, BEARDS, PANTS, RACE, SHOP_BY_ID, EMOTES, PREMIUM, SIGN_PRESETS,
} from '../shared/config.js';
import { CHARACTERS, modelId } from './models.js';

const $ = (sel) => document.querySelector(sel);

/** Contador ao vivo no topo: total de jogadores e quantos há em cada grupo (cápsula única, com nome só em telas largas). */
export function setOnline(counts) {
  const box = $('#online');
  if (!box.children.length) {
    const live = document.createElement('span');
    live.className = 'live';
    const pulse = document.createElement('i');
    pulse.setAttribute('aria-hidden', 'true');
    const total = document.createElement('b');
    const label = document.createElement('span');
    label.className = 'tx';
    label.textContent = ' online';
    live.append(pulse, total, label);
    box.append(live);
    SIDES.forEach((s) => {
      const chip = document.createElement('span');
      chip.className = 'sc';
      const dot = document.createElement('i');
      dot.className = 'dot';
      dot.style.background = s.color;
      const n = document.createElement('b');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = s.short;
      chip.append(dot, n, name);
      box.append(chip);
    });
  }
  const sum = SIDES.reduce((acc, _s, i) => acc + (counts[i] ?? 0), 0);
  box.querySelector('.live b').textContent = sum;
  box.querySelector('.live').title = `${sum} jogador${sum === 1 ? '' : 'es'} na avenida agora`;
  box.querySelectorAll('.sc').forEach((chip, i) => {
    const n = counts[i] ?? 0;
    chip.querySelector('b').textContent = n;
    chip.title = `${SIDES[i].name}: ${n} online`;
    chip.setAttribute('aria-label', `${SIDES[i].name}: ${n} online`);
  });
  for (const [i, el] of document.querySelectorAll('.side small').entries()) {
    el.textContent = `${counts[i] ?? 0} online`;
  }
}

const LOADING_TIPS = [
  'WASD ou setas para andar, Shift para correr.',
  'Enter abre o chat. Os outros jogadores veem o que você escrever.',
  'As teclas 1, 2 e 3 acenam, dançam e aplaudem.',
  'A tecla C chama o carro; C de novo para sair.',
  'No celular, use o joystick na tela para andar.',
  'Em "Só quero assistir" você passeia de câmera livre, sem avatar.',
];

/** Tela de carregamento: barra com porcentagem, etapa atual e dicas. */
export const loadingScreen = (() => {
  let shown = 0;
  let timer = 0;
  let tip = Math.floor(Math.random() * LOADING_TIPS.length);
  const showTip = () => { $('#loadtip').textContent = `Dica: ${LOADING_TIPS[tip]}`; tip = (tip + 1) % LOADING_TIPS.length; };
  return {
    start() {
      showTip();
      timer = setInterval(showTip, 4000);
      $('#loadretry').onclick = () => location.reload();
    },
    set(pct, text) {
      shown = Math.max(shown, Math.min(100, Math.round(pct)));
      $('#loadbar').firstElementChild.style.width = `${shown}%`;
      $('#loadbar').setAttribute('aria-valuenow', shown);
      $('#loadpct').textContent = `${shown}%`;
      if (text) $('#loadtext').textContent = text;
    },
    fail(msg) {
      clearInterval(timer);
      $('#loading').classList.add('failed');
      $('#loaderr').textContent = msg;
      $('#loaderr').hidden = false;
      $('#loadretry').hidden = false;
      $('#loadtip').hidden = true;
      $('#loadtext').textContent = 'Falha ao carregar';
    },
    done() {
      clearInterval(timer);
      this.set(100, 'Pronto');
      const el = $('#loading');
      el.classList.add('done');
      setTimeout(() => { el.hidden = true; }, 450);
    },
  };
})();

export function setStatus(text) {
  $('#status').textContent = text;
}

export function showError(text) {
  const el = $('#error');
  el.textContent = text;
  el.hidden = !text;
}

const FLAG_OPTIONS = [
  { icon: '✋', title: 'Nada', text: 'Mãos livres para acenar e dançar' },
  { icon: '🇧🇷', title: 'Bandeira do Brasil', text: 'Verde e amarela, para todo mundo' },
  { icon: '🚩', title: 'Bandeira do lado', text: '' }, // texto muda com o lado escolhido
  { icon: '🪧', title: 'Cartaz', text: 'Escolha uma frase ou escreva a sua (Pix)' },
  { icon: '🥩', title: 'Picanha no espeto', text: 'Direto da churrasqueira da calçada' },
  { icon: '🎃', title: 'Abóbora', text: 'Moranga fresquinha da feira' },
];
const STEPS = ['lado', 'personagem', 'visual', 'mao'];
const STEP_NAMES = ['Lado', 'Personagem', 'Visual', 'Na mão'];
const pickOf = (list) => list[Math.floor(Math.random() * list.length)];

/** Monta o menu "Monte seu personagem". `profile` é alterado no lugar. */
export function initLobby({
  profile, presets, onChange, onEnter, onWatch, onAnim, onShop,
}) {
  const look = profile.look;
  let editing = false; // editando o personagem já dentro do jogo (sem a etapa do lado)
  const firstStep = () => (editing ? 1 : 0);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  // ---------- etapas (abas) ----------
  const tabs = [...document.querySelectorAll('.steps [role=tab]')];
  const panels = Object.fromEntries(STEPS.map((id) => [id, $(`#tab-${id}`)]));
  const prevBtn = $('#prev');
  const nextBtn = $('#next');
  const nav = $('.stepnav');
  const visited = new Set();
  const syncMore = () => {
    const box = $('.panels');
    nav.classList.toggle('more', box.scrollTop + box.clientHeight < box.scrollHeight - 6);
  };
  const go = (id, focus = false) => {
    const at = STEPS.indexOf(id);
    visited.add(id);
    prevBtn.hidden = at <= firstStep();
    if (at > 0) prevBtn.textContent = `← ${STEP_NAMES[at - 1]}`;
    nextBtn.hidden = editing && at === STEPS.length - 1;
    nextBtn.textContent = at < STEPS.length - 1 ? `${STEP_NAMES[at + 1]} →` : 'Apelido →';
    tabs.forEach((t, ti) => {
      const on = t.dataset.tab === id;
      const seen = !on && visited.has(t.dataset.tab);
      t.classList.toggle('seen', seen);
      t.querySelector('i').textContent = seen ? '✓' : ti + 1;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      t.classList.toggle('on', on);
      if (on) { t.scrollIntoView({ block: 'nearest', inline: 'center' }); if (focus) t.focus(); }
    });
    STEPS.forEach((k) => { panels[k].hidden = k !== id; });
    $('.panels').scrollTop = 0;
    syncMore();
  };
  $('.panels').addEventListener('scroll', syncMore, { passive: true });
  window.addEventListener('resize', syncMore);
  prevBtn.onclick = () => go(STEPS[Math.max(firstStep(), STEPS.findIndex((k) => !panels[k].hidden) - 1)]);
  nextBtn.onclick = () => {
    const at = STEPS.findIndex((k) => !panels[k].hidden);
    if (at === STEPS.length - 1) { $('#nick').focus(); $('#nick').select(); } else go(STEPS[at + 1]);
  };
  tabs.forEach((t, i) => {
    t.onclick = () => go(t.dataset.tab);
    t.onkeydown = (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); go(tabs[(i + d + tabs.length) % tabs.length].dataset.tab, true); }
    };
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.legal')) document.querySelectorAll('.legal[open]').forEach((d) => { d.open = false; });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.legal[open]').forEach((d) => { d.open = false; });
  });
  document.querySelectorAll('.legal').forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) document.querySelectorAll('.legal').forEach((o) => { if (o !== d) o.open = false; });
  }));
  go('lado');

  // ---------- 1. lado ----------
  const sides = $('#sides');
  SIDES.forEach((side) => {
    const b = el('button', 'side', `<span class="num">${side.num}</span><span class="who"><b>${side.name}</b><small>0 online</small></span><span class="check" aria-hidden="true">✓</span>`);
    b.type = 'button';
    b.style.setProperty('--side', side.color);
    b.onclick = () => { profile.side = side.id; refresh(); onChange(); };
    sides.append(b);
  });

  // ---------- 2. personagens prontos (retratos renderizados do modelo 3D) ----------
  const presetsBox = $('#presets');
  presets.forEach((p, i) => {
    const b = el('button', 'preset');
    b.type = 'button';
    const canvas = el('canvas', 'portrait');
    canvas.dataset.preset = i;
    const name = el('b');
    name.textContent = p.name;
    b.append(canvas, name);
    b.onclick = () => { Object.assign(look, p.look); profile.preset = p.id; refresh(); onChange(); };
    presetsBox.append(b);
  });

  $('#random').onclick = () => {
    const body = Math.random() < 0.5 ? 0 : 1;
    Object.assign(look, {
      body,
      age: Math.random() < 0.15 ? 1 : 0,
      face: Math.floor(Math.random() * MODELS[body === 1 ? 'female' : 'male'].length),
      height: Math.floor(Math.random() * HEIGHTS.length),
      skin: Math.floor(Math.random() * SKINS.length),
      shirt: Math.floor(Math.random() * SHIRTS.length),
      pants: Math.floor(Math.random() * PANTS.length),
      beard: body === 0 && Math.random() < 0.4 ? pickOf([1, 2]) : 0,
    });
    profile.preset = null;
    refresh();
    onChange();
  };

  $('#anims').querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      $('#anims').querySelectorAll('button').forEach((o) => o.classList.toggle('on', o === b));
      onAnim(b.dataset.anim);
    };
  });

  // ---------- 3. visual ----------
  const swatchGroups = [['shirt', SHIRTS], ['skin', SKINS]];
  for (const [key, colors] of swatchGroups) {
    colors.forEach((c, i) => {
      const b = el('button', 'sw');
      b.type = 'button';
      b.style.background = c;
      b.setAttribute('aria-label', `${key === 'skin' ? 'Pele' : 'Camiseta'} ${i + 1}`);
      b.onclick = () => { look[key] = i; profile.preset = null; refresh(); onChange(); };
      $(`#sw-${key}`).append(b);
    });
  }

  const segGroups = [
    ['bodies', BODIES, 'body'],
    ['ages', AGES, 'age'],
    ['heights', HEIGHTS, 'height'],
    ['beards', BEARDS, 'beard'],
    ['pants', PANTS.map((p) => p.name), 'pants'],
  ];
  for (const [id, labels, key] of segGroups) {
    labels.forEach((name, i) => {
      const b = el('button', 'segbtn');
      b.type = 'button';
      b.textContent = name;
      b.onclick = () => {
        look[key] = i;
        profile.preset = null;
        if (key === 'body' && i === 1) look.beard = 0; // barba só no visual masculino
        refresh();
        onChange();
      };
      $(`#${id}`).append(b);
    });
  }
  const facesBox = $('#faces');
  const renderFaces = () => {
    facesBox.replaceChildren();
    MODELS[look.body === 1 ? 'female' : 'male'].forEach((_, i) => {
      const b = el('button', `segbtn${look.face === i ? ' on' : ''}`);
      b.type = 'button';
      b.textContent = `Rosto ${i + 1}`;
      b.onclick = () => { look.face = i; profile.preset = null; refresh(); onChange(); };
      facesBox.append(b);
    });
  };

  // ---------- 4. na mão ----------
  const flagsBox = $('#flags');
  FLAG_OPTIONS.forEach((o, i) => {
    const b = el('button', 'option', `<span class="ic">${o.icon}</span><span><b>${o.title}</b><small>${o.text}</small></span><span class="check" aria-hidden="true">✓</span>`);
    b.type = 'button';
    b.onclick = () => {
      look.flag = i;
      if (i === 3 && !SIGN_PRESETS.includes(look.sign)) look.sign = SIGN_PRESETS[0];
      refresh();
      onChange();
    };
    flagsBox.append(b);
  });
  const signBox = $('#sign-presets');
  SIGN_PRESETS.forEach((t) => {
    const b = el('button', 'segbtn');
    b.type = 'button';
    b.textContent = t;
    b.onclick = () => { look.sign = t; refresh(); onChange(); };
    signBox.append(b);
  });
  $('#sign-custom').onclick = () => onShop?.();

  // ---------- apelido (sempre visível, no rodapé) ----------
  const nick = $('#nick');
  nick.value = profile.nick;
  const syncNick = () => {
    $('#nickcount').textContent = `${nick.value.length}/${nick.maxLength}`;
    $('#nickhint').hidden = !nick.disabled;
    const who = nick.value.trim();
    if (!editing) $('#enter').textContent = who ? `Entrar como ${who}` : 'Entrar na manifestação';
  };
  nick.addEventListener('input', () => { profile.nick = nick.value; syncNick(); onChange(); });
  nick.addEventListener('keydown', (e) => { if (e.key === 'Enter') onEnter(); });

  // ---------- estado visual ----------
  function refresh() {
    $('#lobby').dataset.side = profile.side; // o tema do menu acompanha o lado
    document.querySelectorAll('.side').forEach((n, i) => n.classList.toggle('on', i === profile.side));
    for (const [key] of swatchGroups) {
      document.querySelectorAll(`#sw-${key} .sw`).forEach((n, i) => n.classList.toggle('on', i === look[key]));
    }
    for (const [id, , key] of segGroups) {
      document.querySelectorAll(`#${id} .segbtn`).forEach((n, i) => n.classList.toggle('on', i === look[key]));
    }
    if (look.face >= MODELS[look.body === 1 ? 'female' : 'male'].length) look.face = 0;
    renderFaces();

    // camiseta e bermuda em todos os personagens comuns; pele e barba só no Ready Player Me;
    // os políticos ficam com a roupa original
    const def = CHARACTERS[modelId(look.body, look.face)];
    $('#tint-group').hidden = !def.outfit;
    $('#visual-note').hidden = !!def.outfit;
    syncMore();
    $('#skin-field').hidden = !def.tintable;
    $('#beard-field').hidden = !def.tintable;

    const side = SIDES[profile.side];
    FLAG_OPTIONS[2].text = `${side.name}, nas cores do lado`;
    document.querySelectorAll('#flags .option').forEach((n, i) => {
      n.classList.toggle('on', i === look.flag);
      if (i === 2) n.querySelector('small').textContent = FLAG_OPTIONS[2].text;
    });
    $('#sign-field').hidden = look.flag !== 3;
    signBox.querySelectorAll('.segbtn').forEach((n, i) => n.classList.toggle('on', SIGN_PRESETS[i] === look.sign));
    document.querySelectorAll('.preset').forEach((n, i) => n.classList.toggle('on', presets[i].id === profile.preset));

    const preset = presets.find((p) => p.id === profile.preset);
    $('#summary').innerHTML = `<i style="background:${side.color}"></i><b>${side.name}</b><span>${preset ? preset.name : `Personalizado · ${BODIES[look.body]}`}${look.age ? ' · Idoso' : ''}</span>`;
    syncNick();
  }
  refresh();

  $('#enter').onclick = onEnter;
  $('#watch').onclick = onWatch;

  return {
    show() { $('#lobby').hidden = false; },
    hide() { $('#lobby').hidden = true; },
    /** Abre/fecha o menu como editor em jogo: sem lado, sem apelido, "Salvar" e "Cancelar". */
    setEditing(on) {
      editing = on;
      const lobbyEl = $('#lobby');
      if (on) lobbyEl.dataset.editing = ''; else delete lobbyEl.dataset.editing;
      $('#enter').textContent = on ? 'Salvar alterações' : 'Entrar na manifestação';
      $('#watch').textContent = on ? 'Cancelar' : 'Só quero assistir';
      $('.card-head h2').textContent = on ? 'Editar personagem' : 'Monte seu personagem';
      refresh();
      go(on ? 'personagem' : 'lado');
      if (!on) syncNick();
    },
    syncNick,
    go,
  };
}

/** HUD: chat, emotes e joystick virtual. */
export function initHud({
  onChat, onEmote, onAttack, onReact, onLockedReact, onWho, onFireworks, onBillboard, onRanking, onPhoto, onEdit, onLeave, onSound, soundOn,
}) {
  const hud = $('#hud');
  const log = $('#chatlog');
  const input = $('#chatinput');
  const joy = { x: 0, y: 0 };

  $('#chatform').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (text) onChat(text);
    input.value = '';
    input.blur();
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') input.blur(); });

  window.addEventListener('keydown', (e) => {
    if (hud.hidden || e.key !== 'Enter' || e.repeat) return;
    if (document.activeElement?.tagName === 'INPUT') return; // ex.: Enter do lobby
    e.preventDefault();
    input.focus();
  });

  document.querySelectorAll('[data-emote]').forEach((b) => {
    b.addEventListener('click', () => onEmote(Number(b.dataset.emote)));
  });
  document.querySelectorAll('[data-attack]').forEach((b) => {
    b.addEventListener('click', () => onAttack(b.dataset.attack));
  });
  $('#leave').onclick = onLeave;

  // menu de gestos (os premium aparecem com 🔒 para quem não tem)
  const menu = $('#emotemenu');
  let premium = false;
  const paintMenu = () => {
    menu.replaceChildren(...EMOTES.map((e) => {
      const b = document.createElement('button');
      b.dataset.emote = e.anim;
      b.title = `${e.name}${e.key ? ` (${e.key})` : ''}${e.premium && !premium ? ' · premium' : ''}`;
      b.textContent = e.icon;
      if (e.premium && !premium) b.classList.add('locked');
      b.addEventListener('click', () => { menu.hidden = true; onEmote(e.anim); });
      return b;
    }));
  };
  paintMenu();
  $('#emotebtn').onclick = () => { menu.hidden = !menu.hidden; $('#reacts').hidden = true; };
  $('#jumpbtn').onclick = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  $('#fogosbtn').onclick = onFireworks;
  $('#telaobtn').onclick = onBillboard;
  $('#rankbtn').onclick = onRanking;
  $('#photobtn').onclick = onPhoto;
  $('#editbtn').onclick = onEdit;

  // reações flutuantes (7 a 0 no teclado)
  const reacts = $('#reacts');
  $('#reactbtn').onclick = () => { reacts.hidden = !reacts.hidden; menu.hidden = true; };
  let isVip = false;
  const paintReactLocks = () => {
    document.querySelectorAll('[data-react]').forEach((b) => {
      const locked = PREMIUM.reactions.includes(Number(b.dataset.react)) && !isVip;
      b.classList.toggle('locked', locked);
      b.title = locked ? 'Reação exclusiva para Apoiadores VIP ⭐' : '';
    });
  };
  paintReactLocks();
  document.querySelectorAll('[data-react]').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.classList.contains('locked')) onLockedReact(); else onReact(Number(b.dataset.react));
      reacts.hidden = true;
    });
  });

  // lista de jogadores (Tab)
  const who = $('#who');
  let whoTimer = null;
  const toggleWho = (force) => {
    const open = force ?? who.hidden;
    who.hidden = !open;
    clearInterval(whoTimer);
    if (open) { onWho(); whoTimer = setInterval(onWho, 3000); }
  };
  $('#whobtn').onclick = () => toggleWho();

  const sound = $('#sound');
  let on = soundOn;
  const paintSound = () => {
    sound.textContent = on ? '🔊' : '🔇';
    sound.setAttribute('aria-pressed', String(on));
    sound.title = on ? 'Desligar o som' : 'Ligar o som';
  };
  paintSound();
  sound.onclick = () => { on = !on; paintSound(); onSound(on); };

  // joystick só em telas de toque
  const stick = $('#stick');
  const knob = $('#knob');
  if (matchMedia('(pointer: coarse)').matches) {
    stick.hidden = false;
    const R = 50;
    const move = (e) => {
      const r = stick.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      joy.x = dx / R;
      joy.y = -dy / R;
    };
    const end = () => { knob.style.transform = ''; joy.x = 0; joy.y = 0; };
    stick.addEventListener('pointerdown', (e) => { stick.setPointerCapture(e.pointerId); move(e); });
    stick.addEventListener('pointermove', (e) => { if (e.buttons || e.pressure) move(e); });
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
  }

  return {
    joy,
    show() { hud.hidden = false; },
    /** Espectador não tem emotes nem campo de chat. */
    setWatch(watching) {
      $('.emotes').hidden = watching;
      $('#chatform').hidden = watching;
      $('.hint').textContent = watching
        ? 'Modo assistir · WASD/setas mover a câmera · Shift mais rápido · arraste para girar'
        : 'WASD/setas mover · Shift correr · 1-3 gestos · 4-6 golpes · C carro · arraste para girar a câmera · Enter chat';
      $('#drivebtn').hidden = watching;
    },
    isTyping: () => document.activeElement === input,
    toggleWho,
    prefillChat(text) { input.value = text; input.focus(); },
    /** Itens da loja no HUD: só aparecem para quem tem unidades. */
    setInventory(inv, canUsePremium, vip = false) {
      if (isVip !== vip) { isVip = vip; paintReactLocks(); }
      $('#photobtn').classList.toggle('locked', !vip);
      const f = inv.fogos || 0;
      const t = inv.telao || 0;
      $('#fogosbtn').hidden = !f;
      $('#fogosbtn').textContent = `🎆 Fogos (${f})`;
      $('#telaobtn').hidden = !t;
      $('#telaobtn').textContent = `📺 Telão (${t})`;
      if (premium !== canUsePremium) { premium = canUsePremium; paintMenu(); }
    },
    /** Mensagem paga no topo da tela de todo mundo. */
    showBanner(nick, side, text) {
      const el = $('#banner');
      el.replaceChildren();
      const who = document.createElement('b');
      who.style.color = SIDES[side]?.color ?? '#fff';
      who.textContent = `📺 ${nick}`;
      el.append(who, document.createTextNode(` ${text}`));
      el.hidden = false;
      clearTimeout(el.timer);
      el.timer = setTimeout(() => { el.hidden = true; }, 9000);
    },
    setWho(list, total) {
      const rows = list.map(([nick, side, hits, kos, id]) => `<div class="row"${id && id !== myId ? ` data-id="${id}" data-nick="${esc(nick)}"` : ''}><i style="background:${SIDES[side]?.color}"></i><span>${esc(nick)}</span><small>👊 ${hits} · ☠️ ${kos}</small></div>`).join('');
      who.innerHTML = `<h4>Na avenida: ${total}</h4>${rows}`;
    },
    /** Barra de vida (só com PvP ligado) e de fôlego. */
    setVitals({ hp, shield, pvp, stamina, tired }) {
      const bar = $('#hpbar');
      bar.hidden = !pvp;
      bar.classList.toggle('shield', shield);
      bar.firstElementChild.style.width = `${hp}%`;
      bar.lastElementChild.textContent = shield ? `🛡 ${Math.round(hp)}` : Math.round(hp);
      const st = $('#stbar');
      st.firstElementChild.style.width = `${stamina}%`;
      st.classList.toggle('tired', tired);
      st.classList.toggle('full', stamina >= 99.5);
    },
    setKo(text) {
      const el = $('#ko');
      el.hidden = !text;
      if (text) el.innerHTML = text;
    },
    setEmote(anim) {
      document.querySelectorAll('[data-emote]').forEach((b) => b.classList.toggle('on', Number(b.dataset.emote) === anim));
    },
    /** Botão do golpe acende por um instante. */
    flashAttack(kind) {
      const b = document.querySelector(`[data-attack="${kind}"]`);
      if (!b) return;
      b.classList.add('on');
      setTimeout(() => b.classList.remove('on'), 350);
    },
    setDriving(on) {
      const b = $('#drivebtn');
      b.classList.toggle('on', on);
      b.textContent = on ? '🚶 Sair do carro (C)' : '🚗 Carro (C)';
      $('.emotes').classList.toggle('disabled', on);
      $('.hint').textContent = on
        ? 'W/S acelerar e frear · A/D virar · C sair do carro · arraste para girar a câmera'
        : 'WASD/setas mover · Shift correr · 1-3 gestos · 4-6 golpes · C carro · arraste para girar a câmera · Enter chat';
    },
    addChat(nick, text, color, id = 0, past = false) {
      const row = document.createElement('div');
      if (past) row.className = 'past';
      const name = document.createElement('b');
      name.style.color = color;
      name.textContent = `${nick}:`;
      if (id) { // toque no nome abre silenciar/denunciar
        name.dataset.id = id;
        name.dataset.nick = nick;
        name.title = 'Silenciar ou denunciar';
      }
      row.append(name, document.createTextNode(text));
      log.append(row);
      while (log.children.length > 30) log.firstChild.remove();
      setTimeout(() => row.remove(), past ? 40000 : 25000);
    },
  };
}

/** Modos extras no HUD: corrida e PvP. */
export function initModes({ onRace, onPvp, onThrow, onDrive }) {
  const raceBtn = $('#racebtn');
  const pvpBtn = $('#pvpbtn');
  const throwBtn = $('#throwbtn');
  const racePanel = $('#racepanel');
  const pvpPanel = $('#pvppanel');
  raceBtn.onclick = onRace;
  pvpBtn.onclick = onPvp;
  throwBtn.onclick = onThrow;
  $('#drivebtn').onclick = onDrive;
  let hideTimer;
  const fmt = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  const sideName = (i) => SIDES[i]?.short ?? '?';

  return {
    /** snapshot do servidor + se eu estou inscrito + meu resultado. */
    setRace(snap, joined, mine, runningMs) {
      clearTimeout(hideTimer);
      raceBtn.textContent = joined && snap.state !== 'results' ? '🏁 Sair da corrida' : '🏁 Corrida';
      raceBtn.classList.toggle('on', joined);
      let html = '';
      if (snap.state === 'waiting') html = `<b>Corrida</b> começa em ${Math.ceil(snap.startsIn / 1000)} s · ${snap.n} inscrito${snap.n === 1 ? '' : 's'}`;
      else if (snap.state === 'countdown') html = joined ? `<b class="big">${Math.max(1, Math.ceil(snap.countLeft / 1000))}</b> prepare-se…` : '<b>Corrida</b> na largada';
      else if (snap.state === 'running') html = mine ? `<b>${mine.place}º lugar</b> · ${fmt(mine.time)}` : joined ? `<b>JÁ!</b> ${fmt(runningMs)}` : `<b>Corrida</b> em andamento (${snap.n})`;
      else if (snap.state === 'results') {
        const rows = snap.results.slice(0, 5).map((r, i) => `<li>${i + 1}º <b>${esc(r.nick)}</b> <small>${sideName(r.side)}</small> ${fmt(r.time)}</li>`).join('');
        const best = (snap.top || []).slice(0, 3).map((r, i) => `<li>${i + 1}º ${esc(r.nick)} ${fmt(r.time_ms)}</li>`).join('');
        html = `<b>Resultado</b><ol>${rows || '<li>ninguém chegou</li>'}</ol>${best ? `<small>Melhores tempos</small><ol class="best">${best}</ol>` : ''}`;
        hideTimer = setTimeout(() => { racePanel.hidden = true; }, 15000);
      }
      racePanel.innerHTML = html;
      racePanel.hidden = !html;
    },
    setPvp(on) {
      pvpBtn.classList.toggle('on', on);
      pvpBtn.textContent = on ? '🍅 PvP ligado' : '🍅 PvP';
      throwBtn.hidden = !on;
      pvpPanel.hidden = !on;
    },
    setScores(scores, top) {
      const parts = SIDES.map((s, i) => `<span><i style="background:${s.color}"></i>${scores[i] ?? 0}</span>`).join('');
      const best = (top || []).slice(0, 3).map((t) => `<li>${esc(t.nick)} · ${t.hits}</li>`).join('');
      pvpPanel.innerHTML = `<div class="scores">${parts}</div>${best ? `<ol>${best}</ol>` : ''}`;
    },
  };
}

let myId = 0;
export const setMyId = (id) => { myId = id; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Rótulo flutuante com nome e balão de fala. */
export function createLabel(nick, color, equip = {}) {
  const el = document.createElement('div');
  el.className = 'label';
  const name = document.createElement('div');
  name.className = 'name';
  const dot = document.createElement('i');
  dot.style.background = color;
  const badge = document.createElement('span');
  const text = document.createTextNode(nick);
  name.append(dot, badge, text);
  const style = (eq = {}) => {
    const icon = SHOP_BY_ID[eq.badge]?.icon ?? '';
    badge.textContent = icon ? `${icon} ` : '';
    name.classList.toggle('vip', !!eq.vip);
  };
  style(equip);
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.hidden = true;
  const hpbar = document.createElement('div');
  hpbar.className = 'hpbar';
  hpbar.hidden = true;
  hpbar.append(document.createElement('i'));
  const status = document.createElement('div');
  status.className = 'status';
  status.hidden = true;
  el.append(bubble, name, hpbar, status);
  $('#labels').append(el);

  let timer;
  let visible = true;
  return {
    say(text) {
      bubble.textContent = text;
      bubble.hidden = false;
      clearTimeout(timer);
      timer = setTimeout(() => { bubble.hidden = true; }, 6000);
    },
    setStyle: style,
    /** Barra de vida sobre a cabeça: só aparece ferido ou protegido. */
    setHp(hp, shield) {
      hpbar.hidden = hp >= 100 && !shield;
      hpbar.classList.toggle('shield', shield);
      hpbar.firstChild.style.width = `${Math.max(0, hp)}%`;
    },
    /** Emoji girando sobre a cabeça (ex.: 💫 no nocaute). Vazio remove. */
    setStatus(emoji) {
      status.textContent = emoji || '';
      status.hidden = !emoji;
    },
    /** Número flutuante (dano). */
    pop(text, color = '#ff5a5a') {
      const r = document.createElement('span');
      r.className = 'dmg';
      r.textContent = text;
      r.style.color = color;
      r.addEventListener('animationend', () => r.remove());
      el.append(r);
    },
    react(emoji) {
      const r = document.createElement('span');
      r.className = 'react';
      r.textContent = emoji;
      r.addEventListener('animationend', () => r.remove());
      el.append(r);
    },
    place(x, y, show) {
      if (show !== visible) { el.style.display = show ? '' : 'none'; visible = show; }
      if (show) el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    },
    remove() { clearTimeout(timer); el.remove(); },
  };
}

/** Menu de um jogador (tocar no nome no chat ou na lista): silenciar e denunciar. */
export function initUserMenu({ isMuted, onMute, onUnmute, onReport }) {
  const menu = $('#usermenu');
  const close = () => { menu.hidden = true; };
  const item = (label, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.textContent = label;
    b.onclick = () => { close(); fn(); };
    return b;
  };
  const open = (nick, id, x, y) => {
    const head = document.createElement('b');
    head.textContent = nick;
    const muted = isMuted(nick);
    menu.replaceChildren(
      head,
      muted ? item('🔊 Reativar', () => onUnmute(nick)) : item('🔇 Silenciar', () => onMute(nick)),
      item('🚩 Denunciar', () => onReport(id, nick)),
    );
    menu.hidden = false;
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - h - 8))}px`;
    menu.querySelector('button').focus();
  };
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  // delegação: nomes no chat e linhas da lista "Na avenida"
  const pick = (e) => {
    const el = e.target.closest('[data-id][data-nick]');
    if (!el) return;
    e.stopPropagation();
    open(el.dataset.nick, Number(el.dataset.id), e.clientX, e.clientY);
  };
  $('#chatlog').addEventListener('click', pick);
  $('#who').addEventListener('click', pick);
  return { close };
}
