import {
  SHOP, DESIGN, SLOTS, SLOT_NAMES, ACCOUNT,
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
 * Conta e itens de visual. `onChange(account, reason)` é chamado quando a conta ou os itens
 * equipados mudam (reason: 'load' | 'login' | 'logout' | 'items').
 */
export function initAccount({ onChange }) {
  let account = {
    user: null, equipped: {}, custom: {}, googleClientId: null,
  };
  const modal = $('#modal');
  const body = $('#modal-body');

  const apply = (data, reason) => {
    account = {
      ...account,
      user: data.user,
      equipped: data.equipped,
      custom: data.custom ?? {},
      googleClientId: data.googleClientId !== undefined ? data.googleClientId : account.googleClientId,
    };
    renderBar();
    onChange(account, reason);
  };

  let onModalClose = null; // limpeza da tela aberta
  const closeModal = () => { onModalClose?.(); onModalClose = null; modal.hidden = true; body.replaceChildren(); };
  const openModal = (...nodes) => { onModalClose?.(); onModalClose = null; body.replaceChildren(...nodes); modal.hidden = false; };
  $('#modal-close').onclick = closeModal;
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeModal(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  // ---------- Barra de conta no lobby ----------

  /** Botão do topo: ícone + rótulo (só o ícone em telas estreitas). */
  const tbtn = (icon, label, onclick, extra = '') => h(
    'button',
    {
      class: `tbtn${extra ? ` ${extra}` : ''}`, type: 'button', title: label, 'aria-label': label, onclick,
    },
    h('span', { class: 'ic', 'aria-hidden': 'true' }, icon),
    h('span', { class: 'tx' }, label),
  );

  let closeUserMenu = () => {};

  /** Menu da conta: nome, visual e, separadas, as ações de sair e excluir. */
  function userMenu() {
    const nick = account.user.nick;
    const trigger = h(
      'button',
      {
        class: 'userchip', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: `Sua conta · ${nick}`,
      },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, [...nick][0].toUpperCase()),
      h('span', { class: 'nick' }, nick),
      h('span', { class: 'caret', 'aria-hidden': 'true' }, '▾'),
    );
    const item = (icon, label, fn, cls = '') => h('button', {
      class: cls, type: 'button', role: 'menuitem', onclick: () => { closeUserMenu(); fn(); },
    }, h('span', { 'aria-hidden': 'true' }, icon), label);
    const menu = h(
      'div',
      { class: 'umenu', role: 'menu', 'aria-label': 'Conta', hidden: true },
      h('div', { class: 'uhead' }, h('b', {}, nick), h('small', {}, account.user.email)),
      item('👕', 'Meu visual', () => openItems()),
      h('hr'),
      item('↩', 'Sair da conta', logout),
      item('🗑️', 'Excluir conta…', deleteAccount, 'danger'),
    );
    const items = () => [...menu.querySelectorAll('[role="menuitem"]')];
    const onDocClick = (e) => { if (!menu.contains(e.target) && !trigger.contains(e.target)) closeUserMenu(); };
    const onKey = (e) => {
      if (e.key === 'Escape') { closeUserMenu(); trigger.focus(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = items();
        const i = list.indexOf(document.activeElement);
        list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
      }
    };
    closeUserMenu = () => {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', onDocClick, true);
      document.removeEventListener('keydown', onKey, true);
    };
    trigger.addEventListener('click', () => {
      if (!menu.hidden) { closeUserMenu(); return; }
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', onDocClick, true);
      document.addEventListener('keydown', onKey, true);
      items()[0]?.focus();
    });
    return h('div', { class: 'umenu-wrap' }, trigger, menu);
  }

  function renderBar() {
    closeUserMenu();
    const bar = $('#acctbar');
    if (!account.user) bar.replaceChildren(tbtn('👤', 'Entrar', () => openAuth('login'), 'cta'));
    else bar.replaceChildren(tbtn('👕', 'Visual', () => openItems()), userMenu());
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
      isRegister && h('ul', { class: 'perks' }, h('li', {}, 'Seu visual fica guardado'), h('li', {}, 'O apelido da conta é o seu na avenida')),
      h(
        'p',
        { class: 'switch' },
        isRegister ? 'Já tem conta? ' : 'Ainda não tem conta? ',
        h('button', { class: 'link', type: 'button', onclick: () => openAuth(isRegister ? 'login' : 'register') }, isRegister ? 'Entrar' : 'Criar conta'),
      ),
    ));
    (email.value && !isRegister ? pass : email).focus();
  }

  // ---------- Itens de visual ----------

  let visualSlot = 'all';

  async function openItems() {
    if (!account.user) { openAuth('login'); return; }
    try { apply(await api.me(), 'items'); } catch { /* usa o que já temos */ }
    const grid = h('div', { class: 'shopgrid' });
    const slotRow = h('div', { class: 'row slotrow' });

    const card = (item) => {
      const on = account.equipped[item.slot] === item.id;
      const action = h('button', {
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
      const edit = item.custom ? h('button', { class: 'chip', type: 'button', onclick: () => openDesigner(item.custom, openItems) }, '✏️ Editar') : null;
      return h(
        'div',
        { class: 'shopitem' },
        h('div', { class: 'icon', style: item.color ? `background:${item.color}33` : '' }, item.icon),
        h('b', {}, item.name),
        action,
        edit,
      );
    };

    const render = () => {
      const slots = SLOTS.filter((sl) => SHOP.some((i) => i.slot === sl));
      slotRow.replaceChildren(...[['all', 'Tudo'], ...slots.map((sl) => [sl, SLOT_NAMES[sl]])].map(([id, label]) => h('button', {
        class: `chip${visualSlot === id ? ' on' : ''}`, type: 'button', onclick: () => { visualSlot = id; render(); },
      }, label)));
      grid.replaceChildren(...SHOP.filter((i) => visualSlot === 'all' || i.slot === visualSlot).map(card));
    };
    render();

    openModal(
      h('h2', {}, 'Meu visual'),
      h('p', { class: 'note' }, 'Todos os itens são grátis e só mudam a aparência: nada aqui dá vantagem no PvP.'),
      slotRow,
      grid,
    );
  }

  $('#shopbtn').onclick = () => openItems();

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
          onBack ? onBack() : closeModal();
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
      h('button', { class: 'link', type: 'button', onclick: () => openItems() }, '← Voltar aos itens'),
    );
    if (!plain) text.focus();
  }

  renderBar();
  api.me().then((data) => apply(data, 'load')).catch(() => { /* servidor fora */ });

  return {
    get account() { return account; },
    openItems,
  };
}
