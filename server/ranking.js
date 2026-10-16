import { db } from './db.js';
import { SIDES } from '../shared/config.js';

// Ranking de apoio entre os grupos (lados): soma o que cada grupo comprou na loja. A semana vai de segunda
// 00:00 a segunda 00:00 no horário de Brasília (UTC-3, sem horário de verão desde 2019).
const BRT_MS = -3 * 3600_000;
const DAY = 86_400_000;
const TOP = 5;

export function weekStart(now = Date.now()) {
  const local = now + BRT_MS; // relógio de Brasília como se fosse UTC
  const dayStart = Math.floor(local / DAY) * DAY;
  const dow = new Date(dayStart).getUTCDay(); // 0 = domingo
  return dayStart - ((dow + 6) % 7) * DAY - BRT_MS;
}
export const weekEnd = (now = Date.now()) => weekStart(now) + 7 * DAY;

/**
 * `period`: 'week' (desta semana) ou 'all' (desde o começo). Devolve os grupos do maior para o menor,
 * os maiores apoiadores de cada um e, se `userId`, quanto esse usuário apoiou no período.
 */
export function rankingFor(period, now = Date.now(), userId = null) {
  const since = period === 'week' ? weekStart(now) : 0;
  const where = "status = 'paid' AND side BETWEEN 0 AND ? AND paid_at >= ?";
  const args = [SIDES.length - 1, since];

  const byId = new Map(SIDES.map((s) => [s.id, {
    side: s.id, name: s.name, color: s.color, total: 0, buyers: 0, orders: 0,
  }]));
  for (const r of db.prepare(`SELECT side, SUM(amount_cents) AS total, COUNT(DISTINCT user_id) AS buyers, COUNT(*) AS orders FROM orders WHERE ${where} GROUP BY side`).all(...args)) {
    Object.assign(byId.get(r.side), { total: r.total, buyers: r.buyers, orders: r.orders });
  }
  const sides = [...byId.values()].sort((a, b) => b.total - a.total || a.side - b.side).map((s, i) => ({ ...s, rank: i + 1 }));

  const top = Object.fromEntries(SIDES.map((s) => [s.id, []]));
  const rows = db.prepare(`
    SELECT side, nick, total FROM (
      SELECT o.side AS side, u.nick AS nick, SUM(o.amount_cents) AS total,
             ROW_NUMBER() OVER (PARTITION BY o.side ORDER BY SUM(o.amount_cents) DESC, MIN(o.paid_at)) AS n
      FROM orders o JOIN users u ON u.id = o.user_id
      WHERE o.status = 'paid' AND o.side BETWEEN 0 AND ? AND o.paid_at >= ? AND u.nick NOT LIKE 'Excluído%'
      GROUP BY o.side, o.user_id
    ) WHERE n <= ? ORDER BY side, total DESC`).all(...args, TOP);
  for (const r of rows) top[r.side].push({ nick: r.nick, total: r.total });

  const mine = userId
    ? db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS t FROM orders WHERE user_id = ? AND status = 'paid' AND side BETWEEN 0 AND ? AND paid_at >= ?").get(userId, ...args).t
    : 0;
  return {
    period, since, until: period === 'week' ? weekEnd(now) : null, sides, top, leader: sides[0].total > 0 ? sides[0].side : null, mine,
  };
}
