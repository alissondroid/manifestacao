import {
  SHOP, DESIGN, SLOTS, SLOT_NAMES,
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
export function initAccount({ onChange }) {
  let account = {
    user: null, owned: [], equipped: {}, custom: {}, inventory: {}, vipUntil: 0, premium: false, shop: { items: SHOP.filter((i) => !i.hidden), provider: 'simulated' },
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
      shop: data.shop ?? account.shop,
    };
    renderBar();
    onChange(account, reason);
  };

  const closeModal = () => { modal.hidden = true; body.replaceChildren(); };
  const openModal = (...nodes) => { body.replaceChildren(...nodes); modal.hidden = false; };
  $('#modal-close').onclick = closeModal;
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeModal(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  // ---------- Barra de conta no lobby ----------

  function renderBar() {
    const bar = $('#acctbar');
    if (!account.user) {
      bar.replaceChildren(h('button', { class: 'chip', type: 'button', onclick: () => openAuth('login') }, '👤 Entrar ou criar conta'));
    } else {
      bar.replaceChildren(
        h('span', { class: 'who' }, `👤 ${account.user.nick}`),
        h('button', { class: 'chip', type: 'button', onclick: () => openShop() }, '🛍️ Loja'),
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
    const password = window.prompt('Digite sua senha para confirmar a exclusão:');
    if (!password) return;
    try {
      await api.deleteAccount(password);
      apply({ user: null, owned: [], equipped: {} }, 'logout');
      toast('Conta excluída. Seus dados pessoais foram apagados.', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------- Login / cadastro ----------

  function openAuth(mode = 'login') {
    const isRegister = mode === 'register';
    const error = h('p', { class: 'error', role: 'alert', hidden: true });
    const email = h('input', { type: 'email', autocomplete: 'email', required: true, maxlength: 120, placeholder: 'voce@exemplo.com' });
    const nick = h('input', { type: 'text', autocomplete: 'nickname', required: true, maxlength: 16, minlength: 3, placeholder: 'Como aparece na avenida' });
    const pass = h('input', {
      type: 'password', autocomplete: isRegister ? 'new-password' : 'current-password', required: true, minlength: 8, maxlength: 200, placeholder: 'Mínimo de 8 caracteres',
    });
    const terms = h('input', { type: 'checkbox', required: true });
    const submit = h('button', { class: 'primary', type: 'submit' }, isRegister ? 'Criar conta' : 'Entrar');

    const form = h(
      'form',
      {
        class: 'authform',
        async onsubmit(e) {
          e.preventDefault();
          error.hidden = true;
          submit.disabled = true;
          try {
            const data = isRegister
              ? await api.register(email.value, nick.value.trim(), pass.value, terms.checked)
              : await api.login(email.value, pass.value);
            closeModal();
            apply(data, 'login');
            toast(`Olá, ${data.user.nick}!`);
          } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
          } finally {
            submit.disabled = false;
          }
        },
      },
      h('label', { class: 'field' }, h('span', {}, 'E-mail'), email),
      isRegister && h('label', { class: 'field' }, h('span', {}, 'Apelido'), nick),
      h('label', { class: 'field' }, h('span', {}, 'Senha'), pass),
      isRegister && h(
        'label',
        { class: 'terms' },
        terms,
        h('span', {}, 'Li e aceito os ', h('a', { href: '/termos', target: '_blank', rel: 'noopener' }, 'Termos de uso'), ' e a ', h('a', { href: '/privacidade', target: '_blank', rel: 'noopener' }, 'Política de privacidade'), '.'),
      ),
      error,
      submit,
    );

    const tab = (m, label) => h('button', {
      class: `tab${m === mode ? ' on' : ''}`, type: 'button', onclick: () => openAuth(m),
    }, label);

    openModal(
      h('div', { class: 'tabs' }, tab('login', 'Entrar'), tab('register', 'Criar conta')),
      form,
      h('p', { class: 'note' }, 'Com a conta, seus itens da loja ficam guardados e o apelido dela passa a ser o seu na avenida.'),
    );
    (isRegister ? email : email).focus();
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
    const note = provider === 'stripe'
      ? 'Pagamento em modo de teste (Stripe): use os cartões e o Pix de teste. Nenhum dinheiro é cobrado.'
      : 'Modo de teste: o pagamento é simulado e nenhum dinheiro é cobrado.';
    const isVip = account.vipUntil > Date.now();
    const grid = h('div', { class: 'shopgrid' });
    const tabs = h('div', { class: 'tabs shoptabs' });

    const buy = (item) => h('button', {
      class: 'primary small',
      type: 'button',
      async onclick(e) {
        e.currentTarget.disabled = true;
        try {
          const { url } = await api.checkout(item.id);
          window.location.href = url;
        } catch (err) {
          toast(err.message, 'error');
          e.currentTarget.disabled = false;
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
            e.currentTarget.disabled = true;
            try {
              apply(await api.equip(item.slot, on ? null : item.id), 'items');
              render();
            } catch (err) {
              toast(err.message, 'error');
              e.currentTarget.disabled = false;
            }
          },
        }, on ? '✓ Equipado · Remover' : 'Equipar');
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
      h('p', { class: 'note test' }, note),
      h('p', { class: 'note' }, 'Tudo é cosmético ou de diversão: nada aqui dá vantagem no PvP. A Camisa simples e a Sua camisa só aparecem no Rosto 1 masculino.'),
      tabs,
      slotHolder,
      grid,
    );
  }

  $('#shopbtn').onclick = () => openShop();

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
  };
}
