import {
  SHOP, DESIGN, SLOTS, SLOT_NAMES, ACCOUNT, SIDES,
} from '../shared/config.js';
import { drawDesign } from './textures.js';
import { api } from './api.js';

const $ = (sel) => document.querySelector(sel);

/** Cria elementos sem innerHTML (nomes de usuário nunca viram HTML). */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

let toastTimer;
export function toast(text, kind = 'info') {
  const el = $('#toast');
  el.textContent = text;
  el.dataset.kind = kind;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 6000);
}

/**
 * Conta e loja. `onChange(account, reason)` é chamado quando a conta ou os itens
 * equipados mudam (reason: 'load' | 'login' | 'logout' | 'items').
 */
export function initAccount({ onChange, getSide }) {
  const mySide = () => { const v = getSide?.(); return Number.isInteger(v) ? v : null; };
  let account = {
    user: null, owned: [], equipped: {}, custom: {}, inventory: {}, vipUntil: 0, premium: false, vip: false, googleClientId: null, shop: { items: SHOP.filter((i) => !i.hidden), provider: 'simulated' },
  };
  const modal = $('#modal');
  const body = $('#modal-body');

  const apply = (data, reason) => {
    account = {
      ...account,
      user: data.user,
      owned: data.owned,
      equipped: data.equipped,
      custom: data.custom ?? {},
      inventory: data.inventory ?? {},
      vipUntil: data.vipUntil ?? 0,
      premium: !!data.premium,
      vip: !!data.vip,
      shop: data.shop ?? account.shop,
      googleClientId: data.googleClientId !== undefined ? data.googleClientId : account.googleClientId,
    };
    renderBar();
    onChange(account, reason);
  };

  let onModalClose = null; // limpeza da tela aberta (ex.: parar de consultar o Pix)
  const closeModal = () => { onModalClose?.(); onModalClose = null; modal.hidden = true; body.replaceChildren(); };
  const openModal = (...nodes) => { onModalClose?.(); onModalClose = null; body.replaceChildren(...nodes); modal.hidden = false; };
  $('#modal-close').onclick = closeModal;
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeModal(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  // ---------- Barra de conta no lobby ----------

  function renderBar() {
    const bar = $('#acctbar');
    const rank = h('button', { class: 'chip', type: 'button', onclick: () => openRanking() }, '🏆 Ranking');
    if (!account.user) {
      bar.replaceChildren(h('button', { class: 'chip', type: 'button', onclick: () => openAuth('login') }, '👤 Entrar ou criar conta'), rank);
    } else {
      bar.replaceChildren(
        h('span', { class: 'who' }, `👤 ${account.user.nick}`),
        h('button', { class: 'chip', type: 'button', onclick: () => openShop() }, '🛍️ Loja'),
        rank,
        h('button', { class: 'link', type: 'button', onclick: logout }, 'Sair da conta'),
        h('button', { class: 'link', type: 'button', onclick: deleteAccount }, 'Excluir conta'),
      );
    }
  }

  async function logout() {
    try { await api.logout(); } catch { /* segue mesmo assim */ }
    apply({ user: null, owned: [], equipped: {} }, 'logout');
    toast('Você saiu da conta.');
  }

  async function deleteAccount() {
    if (!window.confirm('Excluir a conta apaga seus itens, desenhos e dados pessoais e não pode ser desfeito. Continuar?')) return;
    const google = account.user?.google; // conta do Google não tem senha
    const answer = window.prompt(google ? 'Digite EXCLUIR para confirmar a exclusão:' : 'Digite sua senha para confirmar a exclusão:');
    if (!answer) return;
    try {
      await api.deleteAccount(google ? { confirm: answer } : { password: answer });
      apply({ user: null, owned: [], equipped: {} }, 'logout');
      toast('Conta excluída. Seus dados pessoais foram apagados.', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------- Login com Google ----------

  let gsiLoading;
  const loadGsi = () => {
    gsiLoading ??= new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) { resolve(); return; }
      const el = document.createElement('script');
      el.src = 'https://accounts.google.com/gsi/client';
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => { gsiLoading = null; reject(new Error('gsi')); };
      document.head.append(el);
    });
    return gsiLoading;
  };

  /** Botão oficial do Google; devolve o contêiner (vazio se o login com Google não estiver ativo). */
  function googleButton() {
    const box = h('div', { class: 'gbtn' });
    if (!account.googleClientId) return box;
    loadGsi().then(() => {
      window.google.accounts.id.initialize({
        client_id: account.googleClientId,
        callback: ({ credential }) => finishGoogle(credential),
      });
      window.google.accounts.id.renderButton(box, {
        type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', locale: 'pt-BR', width: 280,
      });
    }).catch(() => { box.append(h('p', { class: 'note' }, 'Não deu para carregar o login com o Google. Use e-mail e senha.')); });
    return box;
  }

  async function finishGoogle(credential, nick, terms) {
    try {
      const data = await api.google(credential, nick, terms);
      if (data.needsProfile) { openGoogleProfile(credential, data); return; }
      closeModal();
      apply(data, 'login');
      toast(data.linked
        ? `Conta vinculada ao Google. A senha antiga não vale mais: entre sempre pelo Google, ${data.user.nick}.`
        : `Olá, ${data.user.nick}!`, data.linked ? 'ok' : 'info');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------- Peças das telas de conta ----------

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const NICK_RE = /^[\p{L}\p{N}_.\- ]+$/u;
  const NICK_HELP = `${ACCOUNT.nickMin} a ${ACCOUNT.nickMax} caracteres: letras, números, espaço, _ . -`;
  const emailError = (v) => (EMAIL_RE.test(v) && v.length <= 120 ? '' : 'Digite um e-mail válido, como voce@exemplo.com.');
  const nickError = (v) => {
    if (v.length < ACCOUNT.nickMin) return `O apelido precisa ter pelo menos ${ACCOUNT.nickMin} caracteres.`;
    if (v.length > ACCOUNT.nickMax) return `O apelido pode ter no máximo ${ACCOUNT.nickMax} caracteres.`;
    return NICK_RE.test(v) ? '' : 'Use só letras, números, espaço, _ . -';
  };

  const remember = {
    get() { try { return localStorage.getItem('avenida.email') || ''; } catch { return ''; } },
    set(v) { try { localStorage.setItem('avenida.email', v); } catch { /* sem armazenamento: tudo bem */ } },
  };

  function passwordStrength(p) {
    if (p.length < ACCOUNT.passwordMin) return { level: 0, label: `Faltam ${ACCOUNT.passwordMin - p.length} caracteres` };
    const pts = (p.length >= 12) + (/[a-z]/.test(p) && /[A-Z]/.test(p)) + /\d/.test(p) + /[^\w\s]/.test(p);
    return pts <= 1 ? { level: 1, label: 'Senha fraca' } : pts <= 3 ? { level: 2, label: 'Senha boa' } : { level: 3, label: 'Senha forte' };
  }

  let fieldSeq = 0;
  /** Campo com rótulo, mensagem embaixo e estado (erro/ok). `extra` fica ao lado do campo (ex.: mostrar senha). */
  function field(label, input, extra) {
    fieldSeq += 1;
    input.id = `f${fieldSeq}`;
    const msg = h('small', { class: 'fmsg', id: `m${fieldSeq}` });
    input.setAttribute('aria-describedby', msg.id);
    const el = h('div', { class: 'field' }, h('label', { for: input.id }, label), h('div', { class: 'inwrap' }, input, extra), msg);
    const set = (text, kind = 'error') => {
      msg.textContent = text;
      el.dataset.state = text ? kind : '';
      input.setAttribute('aria-invalid', text && kind === 'error' ? 'true' : 'false');
    };
    return { el, set };
  }

  function passwordField(label, input) {
    const toggle = h('button', { class: 'reveal', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Mostrar senha' }, 'Mostrar');
    toggle.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Ocultar' : 'Mostrar';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
      input.focus();
    });
    input.classList.add('padr');
    return field(label, input, toggle);
  }

  const termsLine = () => h(
    'span',
    {},
    'Li e aceito os ',
    h('a', { href: '/termos', target: '_blank', rel: 'noopener' }, 'Termos de uso'),
    ' e a ',
    h('a', { href: '/privacidade', target: '_blank', rel: 'noopener' }, 'Política de privacidade'),
    '.',
  );

  /** Botão de envio com estado de carregamento. */
  function submitButton(label, busyLabel) {
    const el = h('button', { class: 'primary', type: 'submit' }, label);
    el.busy = (on) => {
      el.disabled = on;
      el.replaceChildren(...(on ? [h('i', { class: 'spin', 'aria-hidden': 'true' }), busyLabel] : [label]));
    };
    return el;
  }

  const shake = (el) => {
    el.classList.remove('shake');
    void el.offsetWidth; // reinicia a animação
    el.classList.add('shake');
  };

  /** Moldura comum das telas de conta: marca, título e subtítulo. */
  const authShell = (title, sub, ...children) => h(
    'div',
    { class: 'auth' },
    h(
      'header',
      { class: 'auth-head' },
      h('div', { class: 'auth-logo', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      h('h2', {}, title),
      sub && h('p', {}, sub),
    ),
    ...children,
  );

  /** Primeiro acesso com Google: escolher o apelido e aceitar os Termos. */
  function openGoogleProfile(credential, { email, suggestedNick }) {
    const error = h('p', { class: 'error', role: 'alert', hidden: true });
    const nick = h('input', {
      type: 'text', maxlength: ACCOUNT.nickMax, value: suggestedNick, autocomplete: 'nickname', autocapitalize: 'none', spellcheck: 'false',
    });
    const nickF = field('Apelido na avenida', nick);
    const terms = h('input', { type: 'checkbox' });
    const termsMsg = h('small', { class: 'fmsg' });
    const submit = submitButton('Criar conta', 'Criando…');
    const check = () => { const msg = nickError(nick.value.trim()); nickF.set(msg); return !msg; };
    nick.addEventListener('input', () => { if (nickF.el.dataset.state) check(); });
    nick.addEventListener('blur', check);
    const form = h(
      'form',
      {
        class: 'authform',
        novalidate: true,
        async onsubmit(e) {
          e.preventDefault();
          error.hidden = true;
          termsMsg.textContent = '';
          if (!check()) { nick.focus(); shake(form); return; }
          if (!terms.checked) { termsMsg.textContent = 'Aceite os Termos para criar a conta.'; shake(form); return; }
          submit.busy(true);
          try {
            const data = await api.google(credential, nick.value.trim(), true);
            closeModal();
            apply(data, 'login');
            toast(`Olá, ${data.user.nick}!`);
          } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
            shake(form);
            submit.busy(false);
          }
        },
      },
      nickF.el,
      h('label', { class: 'terms' }, terms, termsLine()),
      termsMsg,
      error,
      submit,
    );
    openModal(authShell('Quase lá', `Entrando com ${email}. Escolha como você aparece na avenida.`, form));
    nick.focus();
    nick.select();
  }

  // ---------- Login / cadastro ----------

  function openAuth(mode = 'login') {
    const isRegister = mode === 'register';
    const error = h('p', { class: 'error', role: 'alert', hidden: true });
    const email = h('input', {
      type: 'email', autocomplete: isRegister ? 'email' : 'username', maxlength: 120, placeholder: 'voce@exemplo.com', inputmode: 'email', autocapitalize: 'none', spellcheck: 'false', value: remember.get(),
    });
    const nick = h('input', {
      type: 'text', autocomplete: 'nickname', maxlength: ACCOUNT.nickMax, placeholder: 'Como aparece na avenida', autocapitalize: 'none', spellcheck: 'false',
    });
    const pass = h('input', {
      type: 'password', autocomplete: isRegister ? 'new-password' : 'current-password', maxlength: 200, placeholder: isRegister ? `Mínimo de ${ACCOUNT.passwordMin} caracteres` : 'Sua senha',
    });
    const terms = h('input', { type: 'checkbox' });
    const termsMsg = h('small', { class: 'fmsg' });
    const submit = submitButton(isRegister ? 'Criar conta' : 'Entrar', isRegister ? 'Criando…' : 'Entrando…');

    const emailF = field('E-mail', email);
    const nickF = field('Apelido', nick);
    const passF = passwordField('Senha', pass);
    const meterBar = h('i');
    const meterText = h('small', {}, '');
    const meter = h('div', { class: 'meter', 'aria-live': 'polite' }, h('span', { class: 'bar' }, meterBar), meterText);

    const rules = [
      [email, emailF, (v) => emailError(v.trim())],
      ...(isRegister ? [[nick, nickF, (v) => nickError(v.trim())]] : []),
      [pass, passF, (v) => (isRegister && v.length < ACCOUNT.passwordMin ? `A senha precisa ter pelo menos ${ACCOUNT.passwordMin} caracteres.` : !v ? 'Digite sua senha.' : '')],
    ];
    const validate = ([input, f, test]) => { const msg = test(input.value); f.set(msg); return !msg; };
    for (const rule of rules) {
      const [input, f] = rule;
      input.addEventListener('blur', () => { if (input.value || f.el.dataset.state) validate(rule); });
      input.addEventListener('input', () => { if (f.el.dataset.state === 'error') validate(rule); });
    }
    if (isRegister) {
      nick.addEventListener('input', () => { if (nick.value.trim() && !nickError(nick.value.trim())) nickF.set('Apelido disponível para usar.', 'ok'); });
      pass.addEventListener('input', () => {
        const st = passwordStrength(pass.value);
        meter.dataset.level = String(pass.value ? st.level : '');
        meterBar.style.width = pass.value ? `${[Math.min(30, (pass.value.length / ACCOUNT.passwordMin) * 30), 55, 80, 100][st.level]}%` : '0';
        meterText.textContent = pass.value ? st.label : '';
      });
    }

    const form = h(
      'form',
      {
        class: 'authform',
        novalidate: true,
        async onsubmit(e) {
          e.preventDefault();
          error.hidden = true;
          termsMsg.textContent = '';
          const bad = rules.filter((r) => !validate(r));
          if (bad.length) { bad[0][0].focus(); shake(form); return; }
          if (isRegister && !terms.checked) { termsMsg.textContent = 'Aceite os Termos para criar a conta.'; shake(form); return; }
          submit.busy(true);
          try {
            const data = isRegister
              ? await api.register(email.value.trim(), nick.value.trim(), pass.value, terms.checked)
              : await api.login(email.value.trim(), pass.value);
            remember.set(email.value.trim());
            closeModal();
            apply(data, 'login');
            toast(`Olá, ${data.user.nick}!`);
          } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
            shake(form);
            submit.busy(false);
            if (err.status === 401) { pass.focus(); pass.select(); }
          }
        },
      },
      emailF.el,
      isRegister && nickF.el,
      passF.el,
      isRegister && meter,
      isRegister && h('label', { class: 'terms' }, terms, termsLine()),
      isRegister && termsMsg,
      error,
      submit,
    );

    const tab = (m, label) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(m === mode), onclick: () => { if (m !== mode) openAuth(m); },
    }, label);

    openModal(authShell(
      isRegister ? 'Crie sua conta' : 'Bem-vindo de volta',
      isRegister ? 'Guarde seus itens e entre na avenida de qualquer aparelho.' : 'Entre para continuar de onde parou.',
      h('div', { class: 'authseg', role: 'tablist' }, tab('login', 'Entrar'), tab('register', 'Criar conta')),
      account.googleClientId && googleButton(),
      account.googleClientId && h('p', { class: 'or' }, 'ou com e-mail'),
      form,
      isRegister && h('ul', { class: 'perks' }, h('li', {}, 'Seus itens da loja ficam guardados'), h('li', {}, 'O apelido da conta é o seu na avenida')),
      h(
        'p',
        { class: 'switch' },
        isRegister ? 'Já tem conta? ' : 'Ainda não tem conta? ',
        h('button', { class: 'link', type: 'button', onclick: () => openAuth(isRegister ? 'login' : 'register') }, isRegister ? 'Entrar' : 'Criar conta'),
      ),
    ));
    (email.value && !isRegister ? pass : email).focus();
  }

  // ---------- Loja ----------

  const TABS = [
    ['vip', '⭐ VIP'], ['pacotes', '🎁 Pacotes'], ['visual', '👕 Visual'], ['consumiveis', '🎆 Itens'], ['apoio', '💛 Apoiar'],
  ];
  let shopTab = 'vip';
  let visualSlot = 'all';

  async function openShop(tab) {
    if (typeof tab === 'string') shopTab = tab;
    if (!account.user) { openAuth('login'); return; }
    try { apply(await api.me(), 'items'); } catch { /* usa o que já temos */ }
    const provider = account.shop.provider;
    const note = provider === 'abacatepay'
      ? 'Pagamento somente por Pix. O item é liberado assim que o pagamento cair, geralmente em segundos.'
      : provider === 'stripe'
      ? 'Pagamento em modo de teste (Stripe): use os cartões e o Pix de teste. Nenhum dinheiro é cobrado.'
      : 'Modo de teste: o pagamento é simulado e nenhum dinheiro é cobrado.';
    const isVip = account.vipUntil > Date.now();
    const grid = h('div', { class: 'shopgrid' });
    const tabs = h('div', { class: 'tabs shoptabs' });

    const buy = (item) => h('button', {
      class: 'primary small',
      type: 'button',
      async onclick(e) {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const data = await api.checkout(item.id, mySide());
          if (data.pix) openPix(item, data.order, data.pix);
          else window.location.href = data.url;
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
        }
      },
    }, `${item.kind === 'vip' && isVip ? 'Renovar' : item.kind === 'donation' ? 'Apoiar' : 'Comprar'} ${brl(item.price)}`);

    const card = (item) => {
      const owned = account.owned.includes(item.id);
      let sub = brl(item.price);
      let action;
      if (item.kind === 'vip') {
        sub = isVip ? `Ativo até ${new Date(account.vipUntil).toLocaleDateString('pt-BR')}` : brl(item.price);
        action = buy(item);
      } else if (item.kind === 'consumable') {
        const key = Object.keys(item.give)[0];
        sub = `Você tem ${account.inventory[key] || 0} · ${brl(item.price)}`;
        action = buy(item);
      } else if (item.kind === 'donation') action = buy(item);
      else if (item.kind === 'bundle') {
        const all = item.contains.every((id) => account.owned.includes(id));
        sub = all ? 'Você tem tudo' : brl(item.price);
        action = all ? h('button', { class: 'chip', type: 'button', disabled: true }, '✓ Completo') : buy(item);
      } else if (item.kind === 'unlock') {
        sub = owned ? 'Ativo' : brl(item.price);
        action = owned ? h('button', { class: 'chip on', type: 'button', disabled: true }, '✓ Liberado') : buy(item);
      } else if (!owned) action = buy(item);
      else {
        const on = account.equipped[item.slot] === item.id;
        sub = 'Você tem';
        action = h('button', {
          class: `chip${on ? ' on' : ''}`,
          type: 'button',
          async onclick(e) {
            const btn = e.currentTarget;
            btn.disabled = true;
            try {
              apply(await api.equip(item.slot, on ? null : item.id), 'items');
              render();
            } catch (err) {
              toast(err.message, 'error');
              btn.disabled = false;
            }
          },
        }, on ? '✓ Equipado · Remover' : 'Equipar');
      }
      const hasIt = item.kind === 'bundle' ? item.contains.every((id) => account.owned.includes(id)) : owned;
      if (item.vip && !account.vip && !hasIt) {
        sub = 'Exclusivo para Apoiador VIP ⭐';
        action = h('button', {
          class: 'chip lockvip', type: 'button', onclick: () => { shopTab = 'vip'; render(); },
        }, '🔒 Exclusivo VIP');
      }
      const edit = owned && item.custom ? h('button', { class: 'chip', type: 'button', onclick: () => openDesigner(item.custom, render) }, '✏️ Editar') : null;
      return h(
        'div',
        { class: `shopitem${item.kind === 'vip' ? ' vip' : ''}` },
        h('div', { class: 'icon', style: item.color ? `background:${item.color}33` : '' }, item.icon),
        h('b', {}, item.name),
        item.desc ? h('small', { class: 'desc' }, item.desc) : null,
        h('small', {}, sub),
        action,
        edit,
      );
    };

    const render = () => {
      tabs.replaceChildren(...TABS.map(([id, label]) => h('button', {
        class: `tab${id === shopTab ? ' on' : ''}`, type: 'button', onclick: () => { shopTab = id; render(); },
      }, label)));
      let items = account.shop.items.filter((i) => (i.cat ?? 'visual') === shopTab);
      const extra = [];
      if (shopTab === 'visual') {
        const slots = SLOTS.filter((sl) => items.some((i) => i.slot === sl));
        extra.push(h('div', { class: 'row slotrow' }, ...[['all', 'Tudo'], ...slots.map((sl) => [sl, SLOT_NAMES[sl]])].map(([id, label]) => h('button', {
          class: `chip${visualSlot === id ? ' on' : ''}`, type: 'button', onclick: () => { visualSlot = id; render(); },
        }, label))));
        if (visualSlot !== 'all') items = items.filter((i) => i.slot === visualSlot);
      }
      grid.replaceChildren(...items.map(card));
      slotHolder.replaceChildren(...extra);
    };
    const slotHolder = h('div');
    render();

    openModal(
      h('h2', {}, 'Loja'),
      h('p', { class: provider === 'abacatepay' ? 'note' : 'note test' }, note),
      mySide() !== null && h('p', { class: 'note rknote' }, `🏆 Suas compras contam para o grupo ${SIDES[mySide()].name} no ranking. `, h('button', { class: 'link', type: 'button', onclick: () => openRanking() }, 'Ver ranking')),
      h('p', { class: 'note' }, 'Tudo é cosmético ou de diversão: nada aqui dá vantagem no PvP. A Camisa simples e a Sua camisa só aparecem no Rosto 1 masculino.'),
      tabs,
      slotHolder,
      grid,
    );
  }

  $('#shopbtn').onclick = () => openShop();

  // ---------- Ranking de apoio entre os grupos ----------

  const MEDAL = ['🥇', '🥈', '🥉', '🏅'];
  const fmtBrl = (cents) => brl(cents).replace(',00', '');
  const timeLeft = (until) => {
    const ms = Math.max(0, until - Date.now());
    const d = Math.floor(ms / 86_400_000);
    const hh = Math.floor((ms % 86_400_000) / 3_600_000);
    return d > 0 ? `${d}d ${hh}h` : `${hh}h ${Math.floor((ms % 3_600_000) / 60_000)}min`;
  };

  async function openRanking(period = 'week', focus = null) {
    let data;
    try { data = await api.ranking(period); } catch (err) { toast(err.message, 'error'); return; }
    const side = mySide();
    const max = Math.max(1, ...data.sides.map((x) => x.total));
    const empty = data.sides.every((x) => x.total === 0);
    const view = focus ?? side ?? data.leader ?? data.sides[0].side;

    const tab = (p, label) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(p === period), onclick: () => { if (p !== period) openRanking(p, view); },
    }, label);

    const rows = data.sides.map((x) => h(
      'button',
      {
        class: `rkrow${x.side === side ? ' mine' : ''}${x.side === view ? ' sel' : ''}`,
        type: 'button',
        style: `--c:${x.color}`,
        'aria-label': `${x.name}: ${fmtBrl(x.total)}`,
        onclick: () => openRanking(period, x.side),
      },
      h('span', { class: 'rkpos' }, x.total > 0 ? MEDAL[Math.min(x.rank - 1, 3)] : '·'),
      h('span', { class: 'rkname' }, x.name, x.side === side && h('em', {}, ' · seu grupo')),
      h('span', { class: 'rkbar' }, h('i', { style: `width:${x.total > 0 ? Math.max(4, Math.round((x.total / max) * 100)) : 0}%` })),
      h('span', { class: 'rktotal' }, fmtBrl(x.total), x.buyers > 0 && h('small', {}, `${x.buyers} apoiador${x.buyers > 1 ? 'es' : ''}`)),
    ));

    const top = data.top[view] ?? [];
    const group = SIDES[view];
    const list = top.length
      ? h('ol', { class: 'rktop' }, ...top.map((t) => h('li', {}, h('span', {}, t.nick), h('b', {}, fmtBrl(t.total)))))
      : h('p', { class: 'note' }, `Ninguém do grupo ${group.name} apoiou ${period === 'week' ? 'nesta semana' : 'ainda'}. Seja o primeiro!`);

    openModal(h(
      'div',
      { class: 'auth rank' },
      h('header', { class: 'auth-head' }, h('div', { class: 'auth-logo', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('h2', {}, 'Ranking dos grupos'), h('p', {}, 'Cada compra na loja vira apoio ao grupo que você escolheu no menu. Quem apoia mais lidera a avenida.')),
      h('div', { class: 'authseg', role: 'tablist' }, tab('week', 'Esta semana'), tab('all', 'Geral')),
      period === 'week' && h('p', { class: 'note center' }, `A semana termina em ${timeLeft(data.until)}. Segunda-feira o placar zera.`),
      empty ? h('p', { class: 'note center' }, 'Ainda ninguém comprou. O primeiro apoio coloca o grupo na frente!') : null,
      h('div', { class: 'rkrows' }, ...rows),
      h('h3', { class: 'rkh' }, `Maiores apoiadores · ${group.name}`),
      list,
      account.user && data.mine > 0 ? h('p', { class: 'note center' }, `Você apoiou ${fmtBrl(data.mine)} ${period === 'week' ? 'nesta semana' : 'no total'}.`) : null,
      h('button', { class: 'primary', type: 'button', onclick: () => openShop() }, side !== null ? `🛍️ Apoiar o grupo ${SIDES[side].name}` : '🛍️ Ir para a loja'),
    ));
  }


  // ---------- Pix (AbacatePay) ----------

  /** Modal do Pix: QR Code, copia e cola e consulta o pagamento até cair (ou vencer). */
  function openPix(item, orderId, pix) {
    const status = h('p', { class: 'pixstatus', role: 'status' }, 'Aguardando o pagamento…');
    const copy = h('button', { class: 'primary', type: 'button' }, 'Copiar código Pix');
    const code = h('textarea', { class: 'pixcode', readonly: true, rows: 3, 'aria-label': 'Pix copia e cola' }, pix.brCode);
    let timer = 0;
    let stopped = false;
    const stop = () => { stopped = true; clearTimeout(timer); };

    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(pix.brCode); } catch { code.select(); document.execCommand('copy'); }
      copy.textContent = 'Copiado!';
      setTimeout(() => { copy.textContent = 'Copiar código Pix'; }, 2000);
    });

    const say = (text, kind = '') => { status.textContent = text; status.dataset.kind = kind; };
    const retry = () => h('button', { class: 'primary', type: 'button', onclick: () => { stop(); openShop(); } }, 'Voltar à loja');

    async function poll() {
      if (stopped) return;
      try {
        const res = await api.confirm(orderId);
        if (stopped) return;
        if (res.status === 'paid') {
          stop();
          closeModal();
          apply(res, 'items');
          toast(`Pagamento confirmado! ${item.name} já é seu.`, 'ok');
          return;
        }
        if (res.status !== 'pending') {
          stop();
          say('Esse Pix expirou ou foi cancelado. Gere outro na loja.', 'bad');
          body.querySelector('.pixactions')?.replaceChildren(retry());
          return;
        }
      } catch { /* sem rede por um instante: tenta de novo */ }
      const left = Math.max(0, Math.round((Date.parse(pix.expiresAt) - Date.now()) / 1000));
      say(`Aguardando o pagamento… expira em ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
      timer = setTimeout(poll, 3000);
    }

    const sim = pix.devMode ? h('button', {
      class: 'chip',
      type: 'button',
      async onclick(e) {
        const btn = e.currentTarget;
        btn.disabled = true;
        try { await api.simulatePix(orderId); clearTimeout(timer); poll(); } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
      },
    }, 'Simular pagamento (teste)') : null;

    openModal(
      h(
        'div',
        { class: 'auth pix' },
        h('header', { class: 'auth-head' }, h('div', { class: 'auth-logo', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('h2', {}, 'Pague com Pix'), h('p', {}, `${item.name} · ${brl(item.price)}`)),
        pix.devMode && h('p', { class: 'note test' }, 'Modo de teste: nenhum dinheiro é cobrado.'),
        pix.qr && h('div', { class: 'pixqr' }, h('img', { src: pix.qr, alt: 'QR Code do Pix' })),
        h('p', { class: 'note' }, 'Abra o app do seu banco, escolha Pix e leia o QR Code, ou use o copia e cola.'),
        code,
        h('div', { class: 'pixactions' }, copy, sim),
        status,
        h('button', { class: 'link', type: 'button', onclick: () => { closeModal(); } }, 'Fechar (o Pix continua válido por 30 minutos)'),
      ),
    );
    onModalClose = stop;
    poll();
  }

  // ---------- Editor de cartaz / bandeira ----------

  function openDesigner(kind, onBack) {
    const sign = kind === 'sign';
    const plain = kind === 'plainshirt'; // camisa lisa: só a cor
    const shirt = kind === 'shirt' || plain;
    const max = sign ? DESIGN.signMax : shirt ? DESIGN.shirtMax : DESIGN.flagMax;
    const design = { text: '', bg: DESIGN.colors[0], fg: DESIGN.colors[1], emblem: '', ...(account.custom[kind] || {}) };
    const canvas = h('canvas', shirt ? { width: 200, height: 200 } : { width: sign ? 256 : 240, height: sign ? 170 : 160 });
    const paint = () => drawDesign(canvas.getContext('2d'), canvas.width, canvas.height, kind, design);
    const text = h('input', { type: 'text', maxlength: max, placeholder: sign ? 'O que está escrito no cartaz' : shirt ? 'Texto da estampa' : 'Texto da bandeira', value: design.text });
    text.addEventListener('input', () => { design.text = text.value; paint(); });
    const swatches = (key) => h('div', { class: 'row' }, h('span', {}, key === 'bg' ? (shirt ? 'Camisa' : 'Fundo') : (shirt ? 'Estampa' : 'Texto')), ...DESIGN.colors.map((c) => h('button', {
      class: `sw${design[key] === c ? ' on' : ''}`, type: 'button', style: `background:${c}`, 'aria-label': c,
      onclick(e) { design[key] = c; [...e.currentTarget.parentNode.querySelectorAll('.sw')].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); paint(); },
    })));
    const emblems = h('div', { class: 'row' }, h('span', {}, 'Símbolo'), ...DESIGN.emblems.map((em) => h('button', {
      class: `chip emb${design.emblem === em ? ' on' : ''}`, type: 'button',
      onclick(e) { design.emblem = em; [...e.currentTarget.parentNode.querySelectorAll('.chip')].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); paint(); },
    }, em || '∅')));
    const error = h('p', { class: 'error', hidden: true });
    const save = h('button', {
      class: 'primary',
      type: 'button',
      async onclick() {
        save.disabled = true;
        error.hidden = true;
        try {
          let data = await api.design(kind, design);
          const itemId = DESIGN.items[kind];
          const slot = SHOP.find((i) => i.id === itemId).slot;
          if (data.equipped[slot] !== itemId) data = await api.equip(slot, itemId);
          apply(data, 'items');
          toast(sign ? 'Cartaz salvo e equipado. Escolha "Cartaz" em "Na mão".'
            : shirt ? 'Camisa salva e equipada. Ela só aparece no Rosto 1 masculino.'
              : 'Bandeira salva e equipada. Escolha "Bandeira do candidato" em "Na mão".', 'ok');
          onBack ? openShop() : closeModal();
        } catch (err) {
          error.textContent = err.message;
          error.hidden = false;
          save.disabled = false;
        }
      },
    }, 'Salvar e equipar');
    paint();
    openModal(
      h('h2', {}, sign ? 'Seu cartaz' : plain ? 'Camisa simples' : shirt ? 'Sua camisa' : 'Sua bandeira'),
      plain
        ? h('div', { class: 'designer' }, canvas, swatches('bg'), error, save)
        : h('div', { class: 'designer' }, canvas, h('label', { class: 'field' }, h('span', {}, `Texto (até ${max} caracteres)`), text), swatches('bg'), swatches('fg'), emblems, error, save),
      h('button', { class: 'link', type: 'button', onclick: () => openShop() }, '← Voltar à loja'),
    );
    if (!plain) text.focus();
  }

  // ---------- Retorno do checkout ----------

  async function handleReturn() {
    const params = new URLSearchParams(window.location.search);
    const order = params.get('pago');
    const cancelled = params.get('pago_cancelado');
    if (!order && !cancelled) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (cancelled) { toast('Pagamento cancelado. Nada foi cobrado.'); return; }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const res = await api.confirm(order);
        if (res.status === 'paid') {
          apply(res, 'items');
          toast('Compra confirmada. Abra a loja para equipar ou usar o item.', 'ok');
          return;
        }
        if (res.status !== 'pending') { toast('O pagamento não foi concluído.', 'error'); return; }
      } catch (err) {
        toast(err.status === 401 ? 'Entre na sua conta para ver o pedido.' : err.message, 'error');
        return;
      }
      if (attempt === 0) toast('Aguardando a confirmação do pagamento… (Pix pode levar alguns instantes)');
      await new Promise((r) => { setTimeout(r, 4000); });
    }
    toast('Ainda não recebemos a confirmação. Ela aparece aqui assim que chegar.');
  }

  renderBar();
  api.me().then((data) => { apply(data, 'load'); return handleReturn(); }).catch(() => { /* servidor fora */ });

  return {
    get account() { return account; },
    openShop,
    openRanking,
  };
}
