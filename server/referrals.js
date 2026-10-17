import crypto from 'node:crypto';
import { db } from './db.js';
import { REFERRAL } from '../shared/config.js';
import { validNick } from './auth.js';

const ipHash = (ip) => crypto.createHash('sha256').update(`avenida-convite:${ip}`).digest('hex').slice(0, 32);

export function referralCount(userId) {
  return db.prepare('SELECT COUNT(*) c FROM referrals WHERE referrer_id = ?').get(userId).c;
}

/**
 * Conta nova criada (e-mail ou Google): guarda o hash do IP e, se veio por um convite (`ref` = apelido de
 * quem convidou), registra o convidado. Cada IP vale uma vez por anfitrião e o IP do anfitrião não vale.
 * A cada `REFERRAL.every` convidados o anfitrião ganha o prêmio, até `REFERRAL.maxRewards` vezes.
 * Devolve { referrerId, count, rewarded } quando o convite contou, senão null.
 */
export function afterSignup(userId, ip, ref) {
  const hash = ipHash(ip);
  db.prepare('UPDATE users SET reg_ip_hash = ? WHERE id = ?').run(hash, userId);
  const nick = typeof ref === 'string' ? ref.trim() : '';
  if (!nick || !validNick(nick)) return null;
  const host = db.prepare('SELECT id, reg_ip_hash FROM users WHERE nick = ? COLLATE NOCASE').get(nick);
  if (!host || host.id === userId || host.reg_ip_hash === hash) return null;
  db.exec('BEGIN IMMEDIATE');
  try {
    const added = db.prepare('INSERT OR IGNORE INTO referrals (referred_id, referrer_id, ip_hash, at) VALUES (?, ?, ?, ?)')
      .run(userId, host.id, hash, Date.now()).changes;
    if (!added) { db.exec('ROLLBACK'); return null; }
    const count = referralCount(host.id);
    const prizes = count / REFERRAL.every;
    const rewarded = Number.isInteger(prizes) && prizes <= REFERRAL.maxRewards;
    if (rewarded) {
      for (const [item, qty] of Object.entries(REFERRAL.reward)) {
        db.prepare('INSERT INTO inventory (user_id, item_id, qty) VALUES (?, ?, ?) ON CONFLICT(user_id, item_id) DO UPDATE SET qty = qty + excluded.qty')
          .run(host.id, item, qty);
      }
    }
    db.exec('COMMIT');
    return { referrerId: host.id, count, rewarded };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
