import crypto from 'node:crypto';
import { db, transaction } from './db.js';
import {
  SHOP_BY_ID, DESIGN, VIP_BADGE, REPEATABLE,
} from '../shared/config.js';

export function ownedIds(userId) {
  return db.prepare('SELECT item_id FROM owned WHERE user_id = ?').all(userId).map((r) => r.item_id).filter((id) => SHOP_BY_ID[id]);
}

export const vipUntil = (userId) => db.prepare('SELECT vip_until FROM users WHERE id = ?').get(userId)?.vip_until ?? 0;
export const isVip = (userId) => vipUntil(userId) > Date.now();

/** Itens equipados. VIP ativo acrescenta `vip` (nome dourado) e o selo ⭐ se nenhum selo estiver equipado. */
export function equippedMap(userId) {
  const map = {};
  for (const r of db.prepare('SELECT slot, item_id FROM equipped WHERE user_id = ?').all(userId)) {
    if (SHOP_BY_ID[r.item_id]) map[r.slot] = r.item_id; // item fora do catálogo (ex.: bandeira nas costas) não vale mais
  }
  if (isVip(userId)) {
    map.vip = 'vip-30';
    map.badge ??= VIP_BADGE;
  }
  return map;
}

/** Quantidades de consumíveis: { fogos, telao }. */
export function inventoryOf(userId) {
  const out = {};
  for (const r of db.prepare('SELECT item_id, qty FROM inventory WHERE user_id = ? AND qty > 0').all(userId)) out[r.item_id] = r.qty;
  return out;
}

/** Gasta 1 unidade, de forma atômica. Retorna false se não havia. */
export const spend = (userId, itemId) => db.prepare('UPDATE inventory SET qty = qty - 1 WHERE user_id = ? AND item_id = ? AND qty > 0').run(userId, itemId).changes > 0;

/** Gestos premium: pacote comprado ou VIP ativo. */
export const hasPremiumEmotes = (userId) => isVip(userId) || owns(userId, 'gestos-pack');

/** Pode comprar de novo? Só os repetíveis; pacote de itens só enquanto faltar algum. */
export function canBuy(userId, item) {
  if (item.hidden || item.price <= 0) return false;
  if (REPEATABLE.has(item.kind)) return true;
  if (item.kind === 'bundle') return item.contains.some((id) => !owns(userId, id));
  return !owns(userId, item.id);
}

export const owns = (userId, itemId) => !!db.prepare('SELECT 1 FROM owned WHERE user_id = ? AND item_id = ?').get(userId, itemId);

export function createOrder(userId, item, provider) {
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO orders (id, user_id, item_id, amount_cents, provider, status, created_at)
              VALUES (?, ?, ?, ?, ?, 'pending', ?)`).run(id, userId, item.id, item.price, provider, Date.now());
  return { id };
}

export const getOrder = (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
export const setOrderRef = (id, ref, url = null) => db.prepare('UPDATE orders SET provider_ref = ?, pay_url = ? WHERE id = ?').run(ref, url, id);

/** Pedido pendente recente do mesmo item: o usuário volta para o mesmo checkout em vez de abrir outro (evita cobrança dupla). */
export const pendingOrder = (userId, itemId, provider) => db.prepare(
  "SELECT * FROM orders WHERE user_id = ? AND item_id = ? AND provider = ? AND status = 'pending' AND pay_url IS NOT NULL AND created_at > ? ORDER BY created_at DESC LIMIT 1",
).get(userId, itemId, provider, Date.now() - 25 * 60_000);
export const setOrderStatus = (id, status) => db.prepare("UPDATE orders SET status = ? WHERE id = ? AND status = 'pending'").run(status, id);

/** Marca o pedido como pago e entrega o item. Idempotente (webhook e retorno podem chegar juntos). */
export function fulfill(orderId) {
  return transaction(() => {
    const order = getOrder(orderId);
    if (!order) return false;
    // pagamento confirmado pelo provedor vale mesmo se o pedido foi marcado como falho/expirado por engano
    const changed = db.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND status IN ('pending', 'failed', 'expired')")
      .run(Date.now(), orderId).changes;
    if (!changed) return order.status === 'paid';
    const item = SHOP_BY_ID[order.item_id];
    const own = (id) => db.prepare('INSERT OR IGNORE INTO owned (user_id, item_id, order_id) VALUES (?, ?, ?)').run(order.user_id, id, orderId);
    const give = (map) => {
      for (const [id, qty] of Object.entries(map || {})) {
        db.prepare('INSERT INTO inventory (user_id, item_id, qty) VALUES (?, ?, ?) ON CONFLICT(user_id, item_id) DO UPDATE SET qty = qty + excluded.qty')
          .run(order.user_id, id, qty);
      }
    };
    if (item?.kind === 'vip') {
      const base = Math.max(Date.now(), vipUntil(order.user_id));
      db.prepare('UPDATE users SET vip_until = ? WHERE id = ?').run(base + item.days * 86_400_000, order.user_id);
      give(item.give);
    } else if (item?.kind === 'consumable') give(item.give);
    else if (item?.kind === 'bundle') item.contains.forEach(own);
    else if (item?.kind === 'donation') own(item.grant);
    else own(order.item_id);
    return true;
  });
}

/** Desenhos personalizados do usuário: { sign, flag, shirt, plainshirt }. */
export function designsOf(userId) {
  const out = {};
  for (const r of db.prepare('SELECT kind, json FROM designs WHERE user_id = ?').all(userId)) {
    try { out[r.kind] = JSON.parse(r.json); } catch { /* ignora */ }
  }
  return out;
}

const HEX = /^#[0-9a-f]{6}$/i;
const cleanDesignText = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Valida e salva um desenho. Devolve o desenho limpo ou null se inválido. */
export function saveDesign(userId, kind, raw, filterText) {
  if (!Object.hasOwn(DESIGN.items, kind)) return null;
  const bg = DESIGN.colors.includes(raw?.bg) ? raw.bg : DESIGN.colors[0];
  if (!HEX.test(bg)) return null;
  let design;
  if (kind === 'plainshirt') { // camisa lisa: só a cor
    design = { bg };
  } else {
    const max = kind === 'sign' ? DESIGN.signMax : kind === 'shirt' ? DESIGN.shirtMax : DESIGN.flagMax;
    const text = filterText(cleanDesignText(raw?.text, max));
    const fg = DESIGN.colors.includes(raw?.fg) ? raw.fg : DESIGN.colors[1];
    const emblem = DESIGN.emblems.includes(raw?.emblem) ? raw.emblem : '';
    if (!HEX.test(fg)) return null;
    design = { text, bg, fg, emblem };
  }
  db.prepare('INSERT OR REPLACE INTO designs (user_id, kind, json) VALUES (?, ?, ?)').run(userId, kind, JSON.stringify(design));
  return design;
}

/** Equipa (ou, com itemId nulo, remove) um item. Retorna false se não for permitido. */
export function equip(userId, slot, itemId) {
  if (itemId === null) {
    db.prepare('DELETE FROM equipped WHERE user_id = ? AND slot = ?').run(userId, slot);
    return true;
  }
  const item = SHOP_BY_ID[itemId];
  if (!item || item.slot !== slot || !owns(userId, itemId)) return false;
  db.prepare('INSERT OR REPLACE INTO equipped (user_id, slot, item_id) VALUES (?, ?, ?)').run(userId, slot, itemId);
  return true;
}
