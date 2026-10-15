import crypto from 'node:crypto';
import { db, transaction } from './db.js';
import { SHOP_BY_ID, DESIGN } from '../shared/config.js';

export function ownedIds(userId) {
  return db.prepare('SELECT item_id FROM owned WHERE user_id = ?').all(userId).map((r) => r.item_id).filter((id) => SHOP_BY_ID[id]);
}

export function equippedMap(userId) {
  const map = {};
  for (const r of db.prepare('SELECT slot, item_id FROM equipped WHERE user_id = ?').all(userId)) {
    if (SHOP_BY_ID[r.item_id]) map[r.slot] = r.item_id; // item fora do catálogo (ex.: bandeira nas costas) não vale mais
  }
  return map;
}

export const owns = (userId, itemId) => !!db.prepare('SELECT 1 FROM owned WHERE user_id = ? AND item_id = ?').get(userId, itemId);

export function createOrder(userId, item, provider) {
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO orders (id, user_id, item_id, amount_cents, provider, status, created_at)
              VALUES (?, ?, ?, ?, ?, 'pending', ?)`).run(id, userId, item.id, item.price, provider, Date.now());
  return { id };
}

export const getOrder = (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
export const setOrderRef = (id, ref) => db.prepare('UPDATE orders SET provider_ref = ? WHERE id = ?').run(ref, id);
export const setOrderStatus = (id, status) => db.prepare("UPDATE orders SET status = ? WHERE id = ? AND status = 'pending'").run(status, id);

/** Marca o pedido como pago e entrega o item. Idempotente (webhook e retorno podem chegar juntos). */
export function fulfill(orderId) {
  return transaction(() => {
    const order = getOrder(orderId);
    if (!order) return false;
    const changed = db.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending'")
      .run(Date.now(), orderId).changes;
    if (!changed) return order.status === 'paid';
    db.prepare('INSERT OR IGNORE INTO owned (user_id, item_id, order_id) VALUES (?, ?, ?)')
      .run(order.user_id, order.item_id, orderId);
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
