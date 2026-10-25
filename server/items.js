import { db } from './db.js';
import { SHOP_BY_ID, DESIGN } from '../shared/config.js';

/** Itens equipados: { slot: itemId }. Item fora do catálogo (retirado depois) não vale mais. */
export function equippedMap(userId) {
  const map = {};
  for (const r of db.prepare('SELECT slot, item_id FROM equipped WHERE user_id = ?').all(userId)) {
    if (SHOP_BY_ID[r.item_id]) map[r.slot] = r.item_id;
  }
  return map;
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
// eslint-disable-next-line no-control-regex
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

/** Equipa (ou, com itemId nulo, remove) um item. Retorna false se o item não existir ou não for do slot. */
export function equip(userId, slot, itemId) {
  if (itemId === null) {
    db.prepare('DELETE FROM equipped WHERE user_id = ? AND slot = ?').run(userId, slot);
    return true;
  }
  const item = SHOP_BY_ID[itemId];
  if (!item || item.slot !== slot) return false;
  db.prepare('INSERT OR REPLACE INTO equipped (user_id, slot, item_id) VALUES (?, ?, ?)').run(userId, slot, itemId);
  return true;
}
